import { createElement, forwardRef, useImperativeHandle } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import { VenueRecordDetailPage } from "./VenueRecordDetailPage";
import { VenueScheduleCalendar } from "./VenueScheduleCalendar";
import type { VenueRecord } from "../venue-records";

// ASSUMPTION INDEX
// A1: AC10 defines expired holds as available but gives no grace interval; this test treats the expiry instant as the boundary.
// A2: AC4 requires available slots to be distinguishable but does not prescribe a label; the current UI label is "Available slot".

const mockCalendarApi = vi.hoisted(() => ({
  changeView: vi.fn(),
  gotoDate: vi.fn(),
  latestProps: null as Record<string, unknown> | null,
}));

vi.mock("@fullcalendar/react", () => ({
  default: forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    mockCalendarApi.latestProps = props;
    useImperativeHandle(ref, () => ({
      getApi: () => ({
        changeView: mockCalendarApi.changeView,
        gotoDate: mockCalendarApi.gotoDate,
      }),
    }));
    return createElement(
      "button",
      {
        type: "button",
        onClick: () =>
          (props.select as (selection: { start: Date; end: Date }) => void)?.({
            start: new Date("2030-01-12T08:00:00.000Z"),
            end: new Date("2030-01-12T09:00:00.000Z"),
          }),
      },
      "Drag event range",
    );
  }),
}));

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const venueId = "00000000-0000-4000-8000-000000000124";
const venue: VenueRecord = {
  id: venueId,
  name: "Conference Room",
  location: "North Wing",
  capacity: 80,
  facilities: [],
  layouts: [],
  accessibility: [],
  operatingInformation: "Public holiday closures",
  setupTimeMinutes: 0,
  turnaroundTimeMinutes: 0,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [
    {
      id: "booking-1",
      eventName: "Existing event",
      start: "2030-01-12T04:00:00.000Z",
      end: "2030-01-12T05:00:00.000Z",
      status: "booked",
      affectedByUnavailablePeriod: false,
    },
  ],
};
const originalUser = useAppStore.getState().currentUser;

beforeEach(() => {
  vi.resetAllMocks();
  useAppStore.setState({
    currentUser: {
      id: "coordinator",
      name: "Coordinator",
      email: "coordinator@example.test",
      role: "coordinator",
    },
    events: [
      {
        id: "event-1",
        name: "New workshop",
        purpose: "",
        description: "",
        organiserId: "org-1",
        organiserName: "Organiser",
        status: "submitted",
        startDateTime: "2030-01-12T06:00:00.000Z",
        endDateTime: "2030-01-12T07:00:00.000Z",
        expectedAttendance: 20,
        venueRequirements: {
          minCapacity: 10,
          accessibility: [],
          facilities: [],
          layout: "",
        },
        equipmentNeeds: "",
        registrationEnabled: false,
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z",
      },
    ],
  });
});
afterEach(() => {
  cleanup();
  useAppStore.setState({ currentUser: originalUser });
});

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[`/venue-records/${venueId}?eventId=event-1`]}
    >
      <Routes>
        <Route path="/venue-records/:id" element={<VenueRecordDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockVenueApi() {
  apiMock.mockImplementation(async (path) => {
    if (path === "/venues/bookings/mine") return [] as never;
    return venue as never;
  });
}

describe("VenueRecordDetailPage calendar range handoff", () => {
  /** SPM54-UI-MODE-01: the venue page starts in the compact List view on phones but preserves explicit mode switching. */
  it("starts in List mode at phone width and keeps the user's Calendar choice", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) =>
        query === "(max-width: 639px)"
          ? ({
              matches: true,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            } as unknown as MediaQueryList)
          : ({
              matches: false,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            } as unknown as MediaQueryList),
      ),
    );

    try {
      mockVenueApi();
      renderPage();
      await screen.findByRole("heading", { name: "Conference Room" });

      expect(screen.getByRole("button", { name: "List" })).toHaveClass(
        "bg-primary-600",
      );
      expect(screen.getByRole("button", { name: "Calendar" })).toHaveClass(
        "bg-white",
      );

      fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
      expect(screen.getByRole("button", { name: "Calendar" })).toHaveClass(
        "bg-primary-600",
      );
      expect(screen.getByRole("region", { name: "Venue schedule calendar" })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** Phone calendars open in day view, switch to week view at the breakpoint, and remove their resize listener on unmount. */
  it("SPM54-UI-MODE-01 adapts calendar view across phone and tablet widths and cleans up its listener", () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    let isPhoneWidth = true;
    const mediaQuery = {
      get matches() {
        return isPhoneWidth;
      },
      addEventListener: vi.fn(
        (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.add(listener);
        },
      ),
      removeEventListener: vi.fn(
        (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.delete(listener);
        },
      ),
    } as unknown as MediaQueryList;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) =>
        query === "(max-width: 639px)"
          ? mediaQuery
          : ({
              matches: false,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            } as unknown as MediaQueryList),
      ),
    );

    try {
      const { unmount } = render(
        <VenueScheduleCalendar venue={venue} initialDate="2030-01-12" />,
      );

      expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 639px)");
      expect(mockCalendarApi.changeView).toHaveBeenLastCalledWith("timeGridDay");
      expect(mediaQuery.addEventListener).toHaveBeenCalledTimes(1);
      const [registeredListener] = [...listeners];
      expect(registeredListener).toBeTypeOf("function");

      isPhoneWidth = false;
      act(() => {
        registeredListener?.({ matches: false } as MediaQueryListEvent);
      });
      expect(mockCalendarApi.changeView).toHaveBeenLastCalledWith("timeGridWeek");

      isPhoneWidth = true;
      act(() => {
        registeredListener?.({ matches: true } as MediaQueryListEvent);
      });
      expect(mockCalendarApi.changeView).toHaveBeenLastCalledWith("timeGridDay");

      unmount();
      expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
        "change",
        registeredListener,
      );
      expect(listeners.size).toBe(0);

      isPhoneWidth = false;
      mockCalendarApi.changeView.mockClear();
      const tabletCalendar = render(
        <VenueScheduleCalendar venue={venue} initialDate="2030-01-12" />,
      );
      expect(mockCalendarApi.changeView).toHaveBeenLastCalledWith("timeGridWeek");
      tabletCalendar.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** SPM54-UI-MODE-01: assigned event times are read-only, calendar range selection cannot alter them, and the inline request remains available. */
  it("SPM54-UI-MODE-01 shows the inline request form for the fixed event period", async () => {
    mockVenueApi();
    renderPage();

    await screen.findByRole("heading", { name: "Conference Room" });
    const eventStart = screen.getByLabelText("Event starts");
    const eventEnd = screen.getByLabelText("Event ends");
    expect(eventStart).toHaveAttribute("readonly");
    expect(eventEnd).toHaveAttribute("readonly");
    expect(eventStart).toHaveValue("2030-01-12T14:00");
    expect(eventEnd).toHaveValue("2030-01-12T15:00");
    fireEvent.click(screen.getByRole("button", { name: "Drag event range" }));
    expect(eventStart).toHaveValue("2030-01-12T14:00");
    expect(eventEnd).toHaveValue("2030-01-12T15:00");

    expect(
      screen
        .getAllByRole("status")
        .some((status) =>
          status.textContent?.includes("available for this venue"),
        ),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Submit booking request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh schedule" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });

  /** SPM-51 ignores stale event IDs and empty start values without creating a valid range. */
  it("SPM54-UI-MODE-01 fails closed when the eventId is not assigned to the Coordinator", async () => {
    useAppStore.setState({
      currentUser: {
        id: "coordinator",
        name: "Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
      events: [
        {
          id: "event-1",
          name: "New workshop",
          purpose: "",
          description: "",
          organiserId: "org-1",
          organiserName: "Organiser",
          status: "submitted",
          startDateTime: "2030-01-12T06:00:00.000Z",
          endDateTime: "2030-01-12T07:00:00.000Z",
          expectedAttendance: 20,
          venueRequirements: {
            minCapacity: 10,
            accessibility: [],
            facilities: [],
            layout: "",
          },
          equipmentNeeds: "",
          registrationEnabled: false,
          createdAt: "2030-01-01T00:00:00.000Z",
          updatedAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    mockVenueApi();
    render(
      <MemoryRouter
        initialEntries={[`/venue-records/${venueId}?eventId=missing-event`]}
      >
        <Routes>
          <Route
            path="/venue-records/:id"
            element={<VenueRecordDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Conference Room" });
    expect(screen.queryByLabelText("Event starts")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Event for booking request"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Refresh schedule" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue to booking request" }),
    ).not.toBeInTheDocument();
  });

  /** SPM-51 date formatting safely supplies an empty part if a host formatter omits a requested field. */
  it("tolerates missing date parts from the host formatter", async () => {
    const originalFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;
    let omitYear = true;
    const formatterSpy = vi
      .spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
      .mockImplementation(function (this: Intl.DateTimeFormat, instant) {
        const parts = originalFormatToParts.call(this, instant);
        if (!omitYear) return parts;
        omitYear = false;
        return parts.filter((part) => part.type !== "year");
      });
    mockVenueApi();

    try {
      renderPage();
      await screen.findByRole("heading", { name: "Conference Room" });
      expect(formatterSpy).toHaveBeenCalled();
    } finally {
      formatterSpy.mockRestore();
    }
  });

  /** SPM-54 assigned event time cannot be changed by calendar selection. */
  it("SPM54-UI-MODE-01 keeps the assigned event period when calendar range selection is attempted", async () => {
    mockVenueApi();
    renderPage();

    await screen.findByRole("heading", { name: "Conference Room" });
    expect(mockCalendarApi.latestProps?.selectable).toBe(false);
    expect(mockCalendarApi.latestProps?.select).toBeUndefined();
    expect(
      screen.getByLabelText("Event starts"),
    ).toHaveValue("2030-01-12T14:00");

    fireEvent.click(screen.getByRole("button", { name: "Drag event range" }));

    expect(screen.getByLabelText("Event starts")).toHaveValue("2030-01-12T14:00");
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T15:00");
    expect(
      screen.getByRole("button", { name: "Submit booking request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Review booking request" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });

  /** VEN-AVL-10-BND-1 / ASSUMPTION A1: a hold becomes available at its expiry instant. */
  it("removes an expired hold from the displayed schedule when its expiry timer fires", async () => {
    const realNow = Date.now();
    const fixedNow = new Date("2030-01-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    apiMock.mockImplementation(async (path) =>
      path === "/venues/bookings/mine"
        ? ([] as never)
        : ({
            ...venue,
            reservations: [
              {
                id: "short-hold",
                eventName: "Expiring hold",
                start: "2030-01-12T04:00:00.000Z",
                end: "2030-01-12T05:00:00.000Z",
                status: "tentative",
                holdExpiresAt: "2030-01-01T12:00:01.000Z",
                affectedByUnavailablePeriod: false,
              },
              {
                id: "later-hold",
                eventName: "Later hold",
                start: "2030-01-12T08:00:00.000Z",
                end: "2030-01-12T09:00:00.000Z",
                status: "tentative",
                holdExpiresAt: "2030-01-01T12:00:02.000Z",
                affectedByUnavailablePeriod: false,
              },
            ],
          } as never),
    );

    try {
      renderPage();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(
        screen.getByRole("heading", { name: "Conference Room" }),
      ).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Event starts"), {
        target: { value: "2030-01-12T12:00" },
      });
      fireEvent.change(screen.getByLabelText("Event ends"), {
        target: { value: "2030-01-12T13:00" },
      });
      fireEvent.click(screen.getByRole("button", { name: "List" }));
      expect(
        screen.getByRole("list", { name: "Venue schedule" }),
      ).toHaveTextContent("Expiring hold");
      expect(
        screen.getByRole("list", { name: "Venue schedule" }),
      ).toHaveTextContent("Later hold");
      expect(
        screen.getByRole("list", { name: "Venue schedule" }),
      ).toHaveTextContent("Available slot");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(
        screen.getByRole("list", { name: "Venue schedule" }),
      ).not.toHaveTextContent("Expiring hold");
      expect(
        screen.getByRole("list", { name: "Venue schedule" }),
      ).toHaveTextContent("Later hold");
      expect(
        screen
          .getAllByRole("status")
          .some((status) => status.textContent?.includes("available")),
      ).toBe(true);
      // ASSUMPTION A2: the product requires distinct available slots; it does not prescribe this exact visible label.
      expect(
        screen.getByRole("list", { name: "Venue schedule" }),
      ).toHaveTextContent("Available slot");
      expect(
        screen.getByRole("list", { name: "Venue schedule" }),
      ).toHaveTextContent("12 Jan 2030, 16:00 – 12 Jan 2030, 17:00 (SGT)");
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.setSystemTime(realNow);
    }
  });
});
