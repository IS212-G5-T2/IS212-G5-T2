import { createElement, forwardRef, useImperativeHandle, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { sgtDayKey, sgtLocalDateTimeToDate } from "@/utils/sgtDate";
import { getVenueScheduleEntries, isValidVenueSelection, VenueScheduleCalendar } from "./VenueScheduleCalendar";
import type { VenueRecord } from "../venue-records";

const calendarSpies = vi.hoisted(() => ({
  gotoDate: vi.fn(),
  lastProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@fullcalendar/react", () => ({
  default: forwardRef(function FullCalendarMock(props: Record<string, unknown>, ref) {
    calendarSpies.lastProps = props;
    useImperativeHandle(ref, () => ({ getApi: () => ({ gotoDate: calendarSpies.gotoDate }) }));
    const [allowed, setAllowed] = useState("");
    const start = sgtLocalDateTimeToDate("2030-01-07T10:00");
    const end = sgtLocalDateTimeToDate("2030-01-07T11:00");
    const otherDayStart = sgtLocalDateTimeToDate("2030-01-09T10:00");
    const otherDayEnd = sgtLocalDateTimeToDate("2030-01-09T11:00");
    const overnightStart = sgtLocalDateTimeToDate("2030-01-07T17:00");
    const overnightEnd = sgtLocalDateTimeToDate("2030-01-08T10:00");
    const tuesdayMorning = sgtLocalDateTimeToDate("2030-01-08T09:00");
    const mondayEvening = sgtLocalDateTimeToDate("2030-01-07T18:00");
    const laterDayEnd = sgtLocalDateTimeToDate("2030-01-09T10:00");
    const followingWeekEnd = sgtLocalDateTimeToDate("2030-01-14T10:00");
    const earlyStart = sgtLocalDateTimeToDate("2030-01-07T08:30");
    const lateEnd = sgtLocalDateTimeToDate("2030-01-08T18:30");
    const allow = (start: Date, end: Date) => setAllowed(String((props.selectAllow as (range: { start: Date; end: Date }) => boolean)({ start, end })));
    return createElement("div", null,
      createElement("button", { onClick: () => setAllowed(String((props.selectAllow as (range: { start: Date; end: Date }) => boolean)({ start, end }))) }, "Select operating time"),
      createElement("button", { onClick: () => setAllowed(String((props.selectAllow as (range: { start: Date; end: Date }) => boolean)({ start: otherDayStart, end: otherDayEnd }))) }, "Select another weekday"),
      createElement("button", { onClick: () => allow(overnightStart, overnightEnd) }, "Select valid overnight range"),
      createElement("button", { onClick: () => allow(overnightStart, tuesdayMorning) }, "Select another multi-day range"),
      createElement("button", { onClick: () => allow(mondayEvening, overnightEnd) }, "Select evening to next day"),
      createElement("button", { onClick: () => allow(overnightStart, laterDayEnd) }, "Select range crossing another weekday"),
      createElement("button", { onClick: () => allow(overnightStart, followingWeekEnd) }, "Select range crossing a week"),
      createElement("button", { onClick: () => allow(earlyStart, overnightEnd) }, "Select early range"),
      createElement("button", { onClick: () => allow(overnightStart, lateEnd) }, "Select late range"),
      createElement("output", null, allowed),
      createElement("output", { "aria-label": "Calendar scroll time" }, String(props.scrollTime)),
      createElement("output", { "aria-label": "Calendar minimum time" }, String(props.slotMinTime)),
      createElement("output", { "aria-label": "Calendar maximum time" }, String(props.slotMaxTime)),
      createElement("output", { "aria-label": "Calendar selectable" }, String(props.selectable)),
      createElement("button", { disabled: !props.select, onClick: () => (props.select as (range: { start: Date; end: Date }) => void)?.({ start, end }) }, "Emit selection"),
      createElement("button", { onClick: () => (props.eventClick as (click: { event: { id: string } }) => void)({ event: { id: "selected-event-time" } }) }, "Click selected time"),
      createElement("button", { onClick: () => (props.eventClick as (click: { event: { id: string } }) => void)({ event: { id: "booking-1" } }) }, "Click booking"),
    );
  }),
}));

const venue: VenueRecord = {
  id: "venue-1",
  name: "Room One",
  location: "North Wing",
  capacity: 40,
  facilities: [],
  accessibility: [],
  layouts: [],
  operatingInformation: "Weekdays",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 30,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [],
};

function range(start: string, end: string): [Date, Date] {
  return [sgtLocalDateTimeToDate(start), sgtLocalDateTimeToDate(end)];
}

describe("isValidVenueSelection", () => {
  /** VEN-AVL-01-A: positive ranges are valid on any date or time because venues have no operating-hours schedule. */
  it("allows daytime, weekend, overnight, and after-hours selections", () => {
    const [dayStart, dayEnd] = range("2030-01-07T09:00", "2030-01-07T18:00");
    const [weekendStart, weekendEnd] = range("2030-01-12T02:00", "2030-01-12T03:00");
    const [overnightStart, overnightEnd] = range("2030-01-07T17:00", "2030-01-08T10:00");
    const [afterHoursStart, afterHoursEnd] = range("2030-01-07T23:30", "2030-01-08T00:30");

    expect(isValidVenueSelection(dayStart, dayEnd)).toBe(true);
    expect(isValidVenueSelection(weekendStart, weekendEnd)).toBe(true);
    expect(isValidVenueSelection(overnightStart, overnightEnd)).toBe(true);
    expect(isValidVenueSelection(afterHoursStart, afterHoursEnd)).toBe(true);
  });

  /** VEN-AVL-01-B: calendar selection still requires a finite, positive-duration range. Kills: FE-B06. */
  it("rejects zero-length, reversed, and invalid ranges", () => {
    const [zeroLengthStart, zeroLengthEnd] = range("2030-01-07T12:00", "2030-01-07T12:00");
    const [laterStart, earlierEnd] = range("2030-01-07T12:00", "2030-01-07T11:00");

    expect(isValidVenueSelection(zeroLengthStart, zeroLengthEnd)).toBe(false);
    expect(isValidVenueSelection(laterStart, earlierEnd)).toBe(false);
    expect(isValidVenueSelection(new Date(Number.NaN), earlierEnd)).toBe(false);
  });
});

describe("venue schedule occupancy", () => {
  /** VEN-AVL-02-B: clear shading covers the entire SGT date without declaring the venue open 24 hours. */
  it("shades clear periods over a full SGT day without an operating-hours label", () => {
    const entries = getVenueScheduleEntries(
      venue,
      sgtLocalDateTimeToDate("2030-01-07T00:00"),
      sgtLocalDateTimeToDate("2030-01-08T00:00"),
    );
    const free = entries.filter((entry) => entry.extendedProps.category === "free");

    expect(free.map(({ start, end }) => [start, end])).toEqual([
      ["2030-01-06T16:00:00.000Z", "2030-01-07T16:00:00.000Z"],
    ]);
    expect(free[0].extendedProps.detail).not.toMatch(/operating hours|24 hours/i);
  });

  /** VEN-AVL-02-A: confirmed event occupancy is excluded from available calendar shading. */
  it("does not shade a confirmed booking or its setup and turnaround as free", () => {
    const bookedVenue: VenueRecord = {
      ...venue,
      reservations: [{
        id: "booked-slot",
        eventName: "Confirmed meeting",
        start: "2030-01-07T02:00:00.000Z",
        end: "2030-01-07T03:00:00.000Z",
        status: "booked",
        affectedByUnavailablePeriod: false,
      }],
    };
    const entries = getVenueScheduleEntries(
      bookedVenue,
      sgtLocalDateTimeToDate("2030-01-07T00:00"),
      sgtLocalDateTimeToDate("2030-01-08T00:00"),
    );
    const free = entries.filter((entry) => entry.extendedProps.category === "free");

    expect(free.map(({ start, end }) => [start, end])).toEqual([
      ["2030-01-06T16:00:00.000Z", "2030-01-07T01:30:00.000Z"],
      ["2030-01-07T03:30:00.000Z", "2030-01-07T16:00:00.000Z"],
    ]);
    expect(free.some((entry) => Date.parse(entry.start) < Date.parse("2030-01-07T03:30:00.000Z") && Date.parse(entry.end) > Date.parse("2030-01-07T01:30:00.000Z"))).toBe(false);
  });

  /** VEN-AVL-04-A: unavailable periods and active tentative holds both split green free intervals. A second equal case is the active tentative hold, which is tentative rather than confirmed. */
  it("excludes a closure and an active hold with setup and turnaround from free shading", () => {
    const blockedVenue: VenueRecord = {
      ...venue,
      unavailablePeriods: [{
        id: "maintenance-window",
        start: "2030-01-07T03:00:00.000Z",
        end: "2030-01-07T04:00:00.000Z",
        reason: "Maintenance",
      }],
      reservations: [{
        id: "active-hold",
        eventName: "Held workshop",
        start: "2030-01-07T05:00:00.000Z",
        end: "2030-01-07T06:00:00.000Z",
        status: "tentative",
        holdExpiresAt: "2090-01-01T00:00:00.000Z",
        affectedByUnavailablePeriod: false,
      }],
    };
    const entries = getVenueScheduleEntries(
      blockedVenue,
      sgtLocalDateTimeToDate("2030-01-07T00:00"),
      sgtLocalDateTimeToDate("2030-01-08T00:00"),
    );
    const free = entries.filter((entry) => entry.extendedProps.category === "free");

    expect(free.map(({ start, end }) => [start, end])).toEqual([
      ["2030-01-06T16:00:00.000Z", "2030-01-07T03:00:00.000Z"],
      ["2030-01-07T04:00:00.000Z", "2030-01-07T04:30:00.000Z"],
      ["2030-01-07T06:30:00.000Z", "2030-01-07T16:00:00.000Z"],
    ]);
  });

  /** VEN-AVL-08-A: setup ends at the event start and turnaround begins at the event end across SGT midnight. The turnaround-start edge of the same buffer rule is the second AC8 case. */
  it("places exact setup and turnaround intervals on their SGT calendar days", () => {
    const crossMidnightVenue: VenueRecord = {
      ...venue,
      setupTimeMinutes: 60,
      turnaroundTimeMinutes: 60,
      reservations: [{
        id: "midnight-event",
        eventName: "Midnight event",
        start: "2030-01-06T16:30:00.000Z",
        end: "2030-01-06T17:00:00.000Z",
        status: "booked",
        affectedByUnavailablePeriod: false,
      }],
    };
    const entries = getVenueScheduleEntries(
      crossMidnightVenue,
      sgtLocalDateTimeToDate("2030-01-06T00:00"),
      sgtLocalDateTimeToDate("2030-01-08T00:00"),
    );
    const setup = entries.find((entry) => entry.id === "midnight-event-setup-buffer");
    const turnaround = entries.find((entry) => entry.id === "midnight-event-turnaround-buffer");
    const event = entries.find((entry) => entry.id === "midnight-event");

    expect(setup).toMatchObject({ start: "2030-01-06T15:30:00.000Z", end: "2030-01-06T16:30:00.000Z" });
    expect(turnaround).toMatchObject({ start: "2030-01-06T17:00:00.000Z", end: "2030-01-06T18:00:00.000Z" });
    expect(setup && sgtDayKey(new Date(setup.start))).toBe("2030-01-06");
    expect(setup && sgtDayKey(new Date(setup.end))).toBe("2030-01-07");
    expect(event && sgtDayKey(new Date(event.start))).toBe("2030-01-07");
    expect(turnaround && sgtDayKey(new Date(turnaround.start))).toBe("2030-01-07");
    expect(turnaround && sgtDayKey(new Date(turnaround.end))).toBe("2030-01-07");
  });
});

describe("VenueScheduleCalendar interactions", () => {
  /** VEN-AVL-01-A (SPM-51): calendar selection accepts ranges without applying retired operating-hours rules. */
  it("allows selections on any weekday through FullCalendar's selectAllow prop", () => {
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" />);

    fireEvent.click(screen.getByRole("button", { name: "Select operating time" }));
    expect(screen.getByText("true")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select another weekday" }));
    expect(screen.getByText("true")).toBeInTheDocument();
  });

  /** VEN-AVL-01-A (SPM-51): keeps selection independent of days and times previously treated as closed. */
  it("allows cross-day, closed-day, and formerly out-of-hour ranges through selectAllow", () => {
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" />);

    for (const label of ["Select valid overnight range", "Select another multi-day range", "Select evening to next day", "Select range crossing another weekday", "Select range crossing a week", "Select early range", "Select late range"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByText("true")).toBeInTheDocument();
    }
  });

  /** VEN-AVL-06-A (SPM-51): calendar selection forwards a drag range to the page callback that starts the booking request review. */
  it("connects the FullCalendar select callback to the selected range handler", () => {
    const onSelectRange = vi.fn();
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" onSelectRange={onSelectRange} />);

    fireEvent.click(screen.getByRole("button", { name: "Emit selection" }));

    expect(onSelectRange).toHaveBeenCalledOnce();
    expect(onSelectRange.mock.calls[0][0].toISOString()).toBe("2030-01-07T02:00:00.000Z");
    expect(onSelectRange.mock.calls[0][1].toISOString()).toBe("2030-01-07T03:00:00.000Z");
  });

  /** VEN-AVL-SUP-01: SPM-51 does not enable drag updates when the parent has no selection handler.
   * Kills: a calendar that passes selectable as true with no range-selection handler (selectable={true} regardless of onSelectRange). */
  it("does not invoke a missing range callback", () => {
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" />);

    expect(screen.getByLabelText("Calendar selectable")).toHaveTextContent("false");
    expect(screen.getByRole("button", { name: "Emit selection" })).toBeDisabled();
  });

  /** VEN-AVL-SUP-02: SPM-51 only clears a selected range when its own calendar block is clicked. */
  it("clears selection from the selected event and ignores booking clicks", () => {
    const onClearSelection = vi.fn();
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" selectedRange={{ start: "2030-01-07T10:00", end: "2030-01-07T11:00" }} onClearSelection={onClearSelection} />);

    fireEvent.click(screen.getByRole("button", { name: "Click booking" }));
    expect(onClearSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Click selected time" }));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  /** VEN-AVL-SUP-03: SPM-51 shows the whole day for availability inspection without calling the venue 24-hour. */
  it("shows a full-day time grid with a neutral default scroll position", () => {
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" />);

    expect(screen.getByLabelText("Calendar scroll time")).toHaveTextContent("08:00:00");
    expect(screen.getByLabelText("Calendar minimum time")).toHaveTextContent("00:00:00");
    expect(screen.getByLabelText("Calendar maximum time")).toHaveTextContent("24:00:00");
  });

  /** VEN-AVL-SUP-04 (SPM-54 AC3): an empty initialDate leaves FullCalendar on its own default date and never calls gotoDate with an empty string. The control render proves the gotoDate spy is wired.
   * Kills: initialDate forwarded raw as "" (the `initialDate || undefined` fallback at line 263 removed) and gotoDate("") called on mount (the `if (initialDate)` guard at line 223 removed). */
  it("keeps the default calendar date when initialDate is empty", () => {
    calendarSpies.gotoDate.mockClear();
    const { unmount } = render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" />);
    expect(calendarSpies.gotoDate).toHaveBeenCalledWith("2030-01-07");
    unmount();

    calendarSpies.gotoDate.mockClear();
    render(<VenueScheduleCalendar venue={venue} initialDate="" />);
    // The fallback `initialDate || undefined` yields undefined, so FullCalendar uses its default (today, Asia/Singapore).
    expect(calendarSpies.lastProps?.initialDate).toBeUndefined();
    expect(calendarSpies.gotoDate).not.toHaveBeenCalled();
  });

  /** Defensive SGT formatting defaults to midnight when a host formatter omits time parts. */
  it("handles formatter results without hour or minute parts", () => {
    const originalFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockImplementation(function (this: Intl.DateTimeFormat, instant) {
      return originalFormatToParts.call(this, instant).filter((part) => part.type !== "hour" && part.type !== "minute");
    });
    const venueWithBooking = {
      ...venue,
      reservations: [{
        id: "booking-1",
        eventName: "Formatted booking",
        start: "2030-01-07T02:00:00.000Z",
        end: "2030-01-07T03:00:00.000Z",
        status: "booked" as const,
        affectedByUnavailablePeriod: false,
      }],
    };

    expect(() => render(<VenueScheduleCalendar venue={venueWithBooking} initialDate="2030-01-07" />)).not.toThrow();
    vi.restoreAllMocks();
  });
});
