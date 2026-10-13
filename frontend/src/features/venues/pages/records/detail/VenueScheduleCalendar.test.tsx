import { createElement, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { sgtDayKey, sgtLocalDateTimeToDate } from "@/utils/sgtDate";
import { getVenueScheduleEntries, isVenueOperatingSelection, VenueScheduleCalendar } from "./VenueScheduleCalendar";
import type { VenueRecord } from "../venue-records";

vi.mock("@fullcalendar/react", () => ({
  default: function FullCalendarMock(props: Record<string, unknown>) {
    const [allowed, setAllowed] = useState("");
    const start = sgtLocalDateTimeToDate("2030-01-07T10:00");
    const end = sgtLocalDateTimeToDate("2030-01-07T11:00");
    const closedStart = sgtLocalDateTimeToDate("2030-01-09T10:00");
    const closedEnd = sgtLocalDateTimeToDate("2030-01-09T11:00");
    const overnightStart = sgtLocalDateTimeToDate("2030-01-07T17:00");
    const overnightEnd = sgtLocalDateTimeToDate("2030-01-08T10:00");
    const nextOpening = sgtLocalDateTimeToDate("2030-01-08T09:00");
    const previousClosing = sgtLocalDateTimeToDate("2030-01-07T18:00");
    const closedSpanEnd = sgtLocalDateTimeToDate("2030-01-09T10:00");
    const closedInteriorEnd = sgtLocalDateTimeToDate("2030-01-14T10:00");
    const earlyStart = sgtLocalDateTimeToDate("2030-01-07T08:30");
    const lateEnd = sgtLocalDateTimeToDate("2030-01-08T18:30");
    const allow = (start: Date, end: Date) => setAllowed(String((props.selectAllow as (range: { start: Date; end: Date }) => boolean)({ start, end })));
    return createElement("div", null,
      createElement("button", { onClick: () => setAllowed(String((props.selectAllow as (range: { start: Date; end: Date }) => boolean)({ start, end }))) }, "Select operating time"),
      createElement("button", { onClick: () => setAllowed(String((props.selectAllow as (range: { start: Date; end: Date }) => boolean)({ start: closedStart, end: closedEnd }))) }, "Select closed time"),
      createElement("button", { onClick: () => allow(overnightStart, overnightEnd) }, "Select valid overnight range"),
      createElement("button", { onClick: () => allow(overnightStart, nextOpening) }, "Select ending at next opening"),
      createElement("button", { onClick: () => allow(previousClosing, overnightEnd) }, "Select starting at prior closing"),
      createElement("button", { onClick: () => allow(overnightStart, closedSpanEnd) }, "Select range touching a closed day"),
      createElement("button", { onClick: () => allow(overnightStart, closedInteriorEnd) }, "Select range with closed interior days"),
      createElement("button", { onClick: () => allow(earlyStart, overnightEnd) }, "Select range starting before opening"),
      createElement("button", { onClick: () => allow(overnightStart, lateEnd) }, "Select range ending after closing"),
      createElement("output", null, allowed),
      createElement("output", { "aria-label": "Calendar scroll time" }, String(props.scrollTime)),
      createElement("button", { disabled: !props.select, onClick: () => (props.select as (range: { start: Date; end: Date }) => void)?.({ start, end }) }, "Emit selection"),
      createElement("button", { onClick: () => (props.eventClick as (click: { event: { id: string } }) => void)({ event: { id: "selected-event-time" } }) }, "Click selected time"),
      createElement("button", { onClick: () => (props.eventClick as (click: { event: { id: string } }) => void)({ event: { id: "booking-1" } }) }, "Click booking"),
    );
  },
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
  operatingDays: ["Monday", "Tuesday"],
  operatingStartTime: "09:00",
  operatingEndTime: "18:00",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 30,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [],
};

function range(start: string, end: string): [Date, Date] {
  return [sgtLocalDateTimeToDate(start), sgtLocalDateTimeToDate(end)];
}

describe("isVenueOperatingSelection", () => {
  /** A drag range that starts at opening and ends at closing is allowed on an operating day. */
  it("allows a same-day selection that exactly spans venue hours", () => {
    const [start, end] = range("2030-01-07T09:00", "2030-01-07T18:00");

    expect(isVenueOperatingSelection(venue, start, end)).toBe(true);
  });

  /** Closed weekdays and times outside the configured hours cannot be selected from the calendar. */
  it("rejects a closed day and selections outside opening or closing time", () => {
    const [closedStart, closedEnd] = range("2030-01-09T10:00", "2030-01-09T11:00");
    const [earlyStart, earlyEnd] = range("2030-01-07T08:30", "2030-01-07T10:00");
    const [lateStart, lateEnd] = range("2030-01-07T17:00", "2030-01-07T18:30");
    const [expandedGridStart, expandedGridEnd] = range("2030-01-07T07:00", "2030-01-07T08:00");
    const venueWithOffHoursBooking = {
      ...venue,
      reservations: [{
        id: "early-booking",
        eventName: "Early setup",
        start: "2030-01-07T23:00:00.000Z",
        end: "2030-01-08T00:00:00.000Z",
        status: "booked" as const,
        affectedByUnavailablePeriod: false,
      }],
    };

    expect(isVenueOperatingSelection(venue, closedStart, closedEnd)).toBe(false);
    expect(isVenueOperatingSelection(venue, earlyStart, earlyEnd)).toBe(false);
    expect(isVenueOperatingSelection(venue, lateStart, lateEnd)).toBe(false);
    expect(isVenueOperatingSelection(venueWithOffHoursBooking, expandedGridStart, expandedGridEnd)).toBe(false);
  });

  /** Calendar drag selections reject a closed weekday and non-positive ranges. Kills B06 (zero duration) and B07 (closed day in the span). */
  it("rejects closed weekdays and non-positive ranges", () => {
    const [crossDayStart, crossDayEnd] = range("2030-01-07T17:00", "2030-01-08T10:00");
    const [closedSpanStart, closedSpanEnd] = range("2030-01-07T17:00", "2030-01-09T10:00");
    const [closedInteriorStart, closedInteriorEnd] = range("2030-01-07T17:00", "2030-01-14T10:00");
    const [zeroLengthStart, zeroLengthEnd] = range("2030-01-07T12:00", "2030-01-07T12:00");
    const [laterStart, earlierEnd] = range("2030-01-07T12:00", "2030-01-07T11:00");

    expect(isVenueOperatingSelection(venue, crossDayStart, crossDayEnd)).toBe(true);
    expect(isVenueOperatingSelection(venue, closedSpanStart, closedSpanEnd)).toBe(false);
    expect(isVenueOperatingSelection(venue, closedInteriorStart, closedInteriorEnd)).toBe(false);
    expect(isVenueOperatingSelection(venue, zeroLengthStart, zeroLengthEnd)).toBe(false);
    expect(isVenueOperatingSelection(venue, laterStart, earlierEnd)).toBe(false);
  });
});

describe("venue schedule occupancy", () => {
  /** VEN-AVL-02-A/B and VEN-AVL-05-A: confirmed event occupancy is excluded from available calendar shading. */
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
      ["2030-01-07T01:00:00.000Z", "2030-01-07T01:30:00.000Z"],
      ["2030-01-07T03:30:00.000Z", "2030-01-07T10:00:00.000Z"],
    ]);
    expect(free.some((entry) => Date.parse(entry.start) < Date.parse("2030-01-07T03:30:00.000Z") && Date.parse(entry.end) > Date.parse("2030-01-07T01:30:00.000Z"))).toBe(false);
  });

  /** VEN-AVL-02-A/B/C and VEN-AVL-05-A/B: unavailable periods and active tentative holds both split green free intervals. */
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
      ["2030-01-07T01:00:00.000Z", "2030-01-07T03:00:00.000Z"],
      ["2030-01-07T04:00:00.000Z", "2030-01-07T04:30:00.000Z"],
      ["2030-01-07T06:30:00.000Z", "2030-01-07T10:00:00.000Z"],
    ]);
  });

  /** VEN-AVL-08-A/B/VAR-1: setup ends at the event start and turnaround begins at the event end across SGT midnight. */
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
  /** SPM-51 calendar selection accepts an operating slot and rejects a closed day through FullCalendar's selectAllow prop. */
  it("passes the operating-hours guard to calendar selections", () => {
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" />);

    fireEvent.click(screen.getByRole("button", { name: "Select operating time" }));
    expect(screen.getByText("true")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select closed time" }));
    expect(screen.getByText("false")).toBeInTheDocument();
  });

  /** SPM-51 allows overnight selection across open days and enforces closed-day and operating-hour boundaries. Kills B07, B08 (start at closing), and B09 (end at next opening). */
  it("passes valid cross-day ranges and rejects closed-day or out-of-hour ranges through selectAllow", () => {
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" />);

    for (const label of ["Select valid overnight range", "Select ending at next opening", "Select starting at prior closing"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByText("true")).toBeInTheDocument();
    }
    for (const label of ["Select range touching a closed day", "Select range with closed interior days", "Select range starting before opening", "Select range ending after closing"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByText("false")).toBeInTheDocument();
    }
  });

  /** SPM-51 calendar selection forwards a drag range to the page callback. */
  it("connects the FullCalendar select callback to the selected range handler", () => {
    const onSelectRange = vi.fn();
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" onSelectRange={onSelectRange} />);

    fireEvent.click(screen.getByRole("button", { name: "Emit selection" }));

    expect(onSelectRange).toHaveBeenCalledOnce();
    expect(onSelectRange.mock.calls[0][0].toISOString()).toBe("2030-01-07T02:00:00.000Z");
    expect(onSelectRange.mock.calls[0][1].toISOString()).toBe("2030-01-07T03:00:00.000Z");
  });

  /** SPM-51 does not enable drag updates when the parent has no selection handler. */
  it("does not invoke a missing range callback", () => {
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" />);

    expect(screen.getByRole("button", { name: "Emit selection" })).toBeDisabled();
  });

  /** SPM-51 only clears a selected range when its own calendar block is clicked. */
  it("clears selection from the selected event and ignores booking clicks", () => {
    const onClearSelection = vi.fn();
    render(<VenueScheduleCalendar venue={venue} initialDate="2030-01-07" selectedRange={{ start: "2030-01-07T10:00", end: "2030-01-07T11:00" }} onClearSelection={onClearSelection} />);

    fireEvent.click(screen.getByRole("button", { name: "Click booking" }));
    expect(onClearSelection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Click selected time" }));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  /** SPM-51 gives calendars with time-formatted hours an 08:00 fallback scroll position. */
  it("uses the default scroll position for operating times with seconds", () => {
    render(<VenueScheduleCalendar venue={{ ...venue, operatingStartTime: "09:00:00" }} initialDate="2030-01-07" />);

    expect(screen.getByLabelText("Calendar scroll time")).toHaveTextContent("08:00:00");
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
