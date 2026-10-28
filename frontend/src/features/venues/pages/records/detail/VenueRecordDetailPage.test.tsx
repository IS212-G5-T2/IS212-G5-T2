// frontend/src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx
// SPM-124: AC4/6/7; VEN-VIEW-06-A/B, 07-A/B and detail error coverage.
// SPM-124-REG-* IDs are local regression cases; VEN-VIEW-* IDs refer to published cases.
// Active venue holds require an explicit future expiry; ordinary pending requests are not reservations.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { ApiError, api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import {
  getVenueDetailErrorMessage,
  VenueRecordDetailPage,
} from "./VenueRecordDetailPage";
import type { VenueRecord } from "../venue-records";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const id = "00000000-0000-4000-8000-000000000124";
const venue: VenueRecord = {
  id,
  name: "Conference Room",
  location: "North Wing",
  capacity: 80,
  facilities: ["Projector"],
  layouts: ["Boardroom"],
  accessibility: ["Wheelchair access"],
  operatingInformation: "Weekdays only",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
  availabilityStatus: "unavailable",
  unavailablePeriods: [
    {
      id: "period-1",
      start: "2026-10-05T11:45:00Z",
      end: "2026-10-05T11:50:00Z",
      reason: "Maintenance",
    },
  ],
  reservations: [
    {
      id: "booking-1",
      eventName: "Welcome Evening",
      start: "2026-10-05T12:00:00Z",
      end: "2026-10-05T14:00:00Z",
      status: "booked",
      affectedByUnavailablePeriod: true,
    },
    {
      id: "hold-1",
      eventName: "Workshop",
      start: "2026-10-08T12:00:00Z",
      end: "2026-10-08T14:00:00Z",
      status: "tentative",
      holdExpiresAt: "2030-01-11T23:30:00Z",
      affectedByUnavailablePeriod: false,
    },
  ],
};

beforeEach(() => vi.resetAllMocks());
const originalUser = useAppStore.getState().currentUser;
const originalEvents = useAppStore.getState().events;
afterEach(() => {
  cleanup();
  useAppStore.setState({ currentUser: originalUser, events: originalEvents });
});

function renderPage(initialEntry?: string) {
  const state = useAppStore.getState();
  const isVenueStaffOnly =
    state.currentUser.role === "venue_staff" &&
    !(state.currentUser.roles ?? []).includes("coordinator");
  if (
    !initialEntry &&
    !isVenueStaffOnly &&
    state.currentUser.role !== "coordinator"
  ) {
    useAppStore.setState({
      currentUser: { ...state.currentUser, role: "coordinator" },
      events: state.events.length
        ? state.events
        : [coordinatorEvent("event-1")],
    });
  } else if (
    !initialEntry &&
    !isVenueStaffOnly &&
    state.currentUser.role === "coordinator" &&
    state.events.length === 0
  ) {
    useAppStore.setState({ events: [coordinatorEvent("event-1")] });
  }
  const linkedEvent = useAppStore.getState().events[0];
  const entry =
    initialEntry ??
    `/venue-records/${id}${linkedEvent ? `?eventId=${encodeURIComponent(linkedEvent.id)}` : ""}`;
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/venue-records/:id" element={<VenueRecordDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockVenueApi(record: VenueRecord = venue) {
  apiMock.mockImplementation(async (path) => {
    if (path === "/venues/bookings/mine") return [] as never;
    return record as never;
  });
}

function coordinatorEvent(eventId: string) {
  return {
    id: eventId,
    name: `Event ${eventId}`,
    purpose: "",
    description: "",
    organiserId: "org-1",
    organiserName: "Organiser",
    status: "submitted" as const,
    startDateTime:
      eventId === "event-52"
        ? "2030-01-13T04:00:00.000Z"
        : eventId === "event-53"
          ? "2030-01-14T04:00:00.000Z"
          : "2030-01-12T04:00:00.000Z",
    endDateTime:
      eventId === "event-52"
        ? "2030-01-13T05:00:00.000Z"
        : eventId === "event-53"
          ? "2030-01-14T05:00:00.000Z"
          : "2030-01-12T05:00:00.000Z",
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
  };
}

function setCoordinator(eventIds: string[] = []) {
  useAppStore.setState({
    currentUser: {
      id: "coordinator",
      name: "Coordinator",
      email: "coordinator@example.test",
      role: "coordinator",
    },
    events: eventIds.map(coordinatorEvent),
  });
}

function SwitchDetailEvent() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(`/venue-records/${id}?eventId=event-52`)}>
        Switch event
      </button>
      <button onClick={() => navigate(`/venue-records/${id}?eventId=event-53`)}>
        Switch again
      </button>
    </>
  );
}

describe("VenueRecordDetailPage (SPM-124)", () => {
  /** VEN-BKG-01-C: the suitability assessment reports every mismatch together and blocks submission. */
  it("VEN-BKG-01-C SPM-54 shows persisted suitability warnings without disabling submission", async () => {
    useAppStore.setState({
      currentUser: {
        id: "coordinator",
        name: "Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
      events: [
        {
          ...coordinatorEvent("event-1"),
          expectedAttendance: 90,
          venueRequirements: {
            minCapacity: 90,
            facilities: ["Projector", "Sound system"],
            accessibility: ["Wheelchair access", "Step-free access"],
            layout: "Banquet",
          },
        },
      ],
    });
    const user = userEvent.setup();
    mockVenueApi();
    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2030-01-12T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Event ends"), {
      target: { value: "2030-01-12T13:00" },
    });
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));
    await screen.findByText("This time is available for this venue.");
    const assessment = screen.getByRole("alert", { name: "Venue suitability" });
    expect(assessment).not.toHaveTextContent("below attendance");
    expect(assessment).toHaveTextContent("Missing facility: Sound system");
    expect(assessment).toHaveTextContent(
      "Missing accessibility feature: Step-free access",
    );
    expect(assessment).toHaveTextContent(
      "Required layout unavailable: Banquet",
    );
    const mismatchRows = within(assessment).getAllByRole("listitem");
    expect(mismatchRows).toHaveLength(3);
    for (const row of mismatchRows) {
      expect(row.querySelector('span[aria-hidden="true"]')).toHaveTextContent(
        "⚠",
      );
    }
    expect(
      screen.getByRole("button", { name: "Submit booking request" }),
    ).toBeInTheDocument();
  });

  /** VEN-BKG-01-A: a venue meeting all event requirements is shown as suitable without a false warning. */
  it("VEN-BKG-01-A SPM-54 marks a venue suitable when every event requirement is met", async () => {
    setCoordinator(["event-1"]);
    mockVenueApi({
      ...venue,
      availabilityStatus: "available",
      reservations: [],
      unavailablePeriods: [],
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));

    const assessment = await screen.findByLabelText("Venue suitability");
    expect(assessment).toHaveTextContent("Suitable for this event");
    expect(assessment).not.toHaveTextContent("⚠");
  });

  /** VEN-BKG-01-B: each single requirement mismatch is identified without falsely flagging satisfied requirements. */
  it("VEN-BKG-01-B SPM-54 identifies requirement mismatches by category", async () => {
    const cases = [
      {
        kind: "capacity",
        attendance: 81,
        requirements: {
          facilities: ["Projector"],
          accessibility: ["Wheelchair access"],
          layout: "Boardroom",
        },
        venueChanges: {},
        expected: "Capacity 80 is below attendance 81",
      },
      {
        kind: "facility",
        attendance: 20,
        requirements: {
          facilities: ["Projector", "Microphones"],
          accessibility: ["Wheelchair access"],
          layout: "Boardroom",
        },
        venueChanges: {},
        expected: "Missing facility: Microphones",
      },
      {
        kind: "accessibility",
        attendance: 20,
        requirements: {
          facilities: ["Projector"],
          accessibility: ["Wheelchair access", "Step-free access"],
          layout: "Boardroom",
        },
        venueChanges: {},
        expected: "Missing accessibility feature: Step-free access",
      },
      {
        kind: "layout",
        attendance: 20,
        requirements: {
          facilities: ["Projector"],
          accessibility: ["Wheelchair access"],
          layout: "Classroom",
        },
        venueChanges: {},
        expected: "Required layout unavailable: Classroom",
      },
    ];
    for (const {
      kind,
      attendance,
      requirements,
      venueChanges,
      expected,
    } of cases) {
      useAppStore.setState({
        currentUser: {
          id: "coordinator",
          name: "Coordinator",
          email: "coordinator@example.test",
          role: "coordinator",
        },
        events: [
          {
            ...coordinatorEvent("event-1"),
            expectedAttendance: attendance,
            venueRequirements: {
              minCapacity: attendance,
              facilities: requirements.facilities,
              accessibility: requirements.accessibility,
              layout: requirements.layout,
            },
          },
        ],
      });
      const user = userEvent.setup();
      mockVenueApi({
        ...venue,
        ...venueChanges,
        availabilityStatus: "available",
        reservations: [],
        unavailablePeriods: [],
      });
      renderPage();
      await screen.findByRole("heading", { name: "Conference Room" });
      await user.click(
        screen.getByRole("button", { name: "Refresh schedule" }),
      );

      const assessment = await screen.findByLabelText("Venue suitability");
      if (kind === "capacity") {
        expect(assessment).toHaveTextContent("Suitable for this event");
        expect(assessment).not.toHaveTextContent("below attendance");
      } else {
        expect(assessment).toHaveTextContent(expected);
        expect(within(assessment).getAllByRole("listitem")).toHaveLength(1);
      }
      cleanup();
    }
  });

  /** VEN-BKG-01-BND-1: capacity equal to the event attendance is suitable, not an insufficient-capacity mismatch. */
  it("VEN-BKG-01-BND-1 SPM-54 accepts capacity exactly equal to attendance", async () => {
    useAppStore.setState({
      currentUser: {
        id: "coordinator",
        name: "Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
      events: [
        { ...coordinatorEvent("event-1"), expectedAttendance: venue.capacity },
      ],
    });
    const user = userEvent.setup();
    mockVenueApi({
      ...venue,
      availabilityStatus: "available",
      reservations: [],
      unavailablePeriods: [],
    });
    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));

    const assessment = await screen.findByLabelText("Venue suitability");
    expect(assessment).toHaveTextContent("Suitable for this event");
    expect(assessment).not.toHaveTextContent("Capacity 80 is below attendance");
  });

  /** SPM54-UI-MODE-01 (user-confirmed): without eventId, venue readers may inspect the schedule but cannot select or request a booking. */
  it("SPM-54 SPM54-UI-MODE-01 keeps an unlinked venue schedule browse-only while calendar and list navigation remain usable", async () => {
    setCoordinator(["event-1", "event-2"]);
    mockVenueApi();
    const user = userEvent.setup();
    renderPage(`/venue-records/${id}`);

    const schedule = await screen.findByRole("region", {
      name: "Venue schedule",
    });
    expect(schedule).toBeInTheDocument();
    expect(screen.queryByLabelText("Event starts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Event ends")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Event for booking request"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /booking request/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Venue suitability"),
    ).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("list", { name: "Venue schedule" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    expect(schedule).toBeVisible();
  });

  /** SPM54-UI-MODE-01 (user-confirmed): an event-linked Coordinator page uses only the URL event and keeps its name fixed. */
  it("SPM-54 SPM54-UI-MODE-01 locks booking context to the eventId even when other assigned events are cached", async () => {
    setCoordinator(["event-1", "event-2"]);
    mockVenueApi();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByLabelText("Event starts");
    expect(screen.getByLabelText("Booking event context")).toHaveTextContent(
      "Event event-1",
    );
    expect(screen.queryByText("Event event-2")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Event for booking request"),
    ).not.toBeInTheDocument();
  });

  /** SPM54-UI-MODE-01 (user-confirmed): venue-staff-only users retain a read-only schedule even with an eventId. */
  it("SPM-54 SPM54-UI-MODE-01 keeps a Venue Staff-only event-linked schedule read-only", async () => {
    useAppStore.setState({
      currentUser: {
        id: "staff",
        name: "Venue Staff",
        email: "staff@example.test",
        role: "venue_staff",
        roles: ["venue_staff"],
      },
      events: [coordinatorEvent("event-1")],
    });
    mockVenueApi();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("region", { name: "Venue schedule" });
    expect(screen.queryByLabelText("Event starts")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Booking event context"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /booking request/i }),
    ).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  /** SPM54-UI-MODE-01 (user-confirmed): Coordinator capability remains usable for a dual-role staff member. */
  it("SPM-54 SPM54-UI-MODE-01 allows an assigned dual-role Coordinator to book from a fixed event context", async () => {
    useAppStore.setState({
      currentUser: {
        id: "dual",
        name: "Dual role",
        email: "dual@example.test",
        role: "venue_staff",
        roles: ["venue_staff", "coordinator"],
      },
      events: [coordinatorEvent("event-1")],
    });
    mockVenueApi();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByLabelText("Event starts");
    expect(screen.getByLabelText("Booking event context")).toHaveTextContent(
      "Event event-1",
    );
    expect(
      screen.getByRole("button", { name: "Refresh schedule" }),
    ).toBeInTheDocument();
  });

  /** VEN-BKG-08-A: an active request for this event and venue is shown in context and prevents duplicate submission. */
  it("VEN-BKG-08-A SPM-54 shows the active event venue request and blocks a duplicate", async () => {
    setCoordinator(["event-1"]);
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine")
        return [
          {
            id: "booking-1",
            eventId: "event-1",
            eventName: "Event event-1",
            venueId: id,
            venueName: "Conference Room",
            start: "2030-01-12T04:00:00.000Z",
            end: "2030-01-12T05:00:00.000Z",
            status: "pending",
            bookingReference: "VB-BOOKING1",
            specialRequest: "Please provide microphones.",
          },
        ] as never;
      return venue as never;
    });

    renderPage(`/venue-records/${id}?eventId=event-1`);

    const summary = await screen.findByRole("region", {
      name: "Existing venue booking request",
    });
    expect(summary).toHaveTextContent("Event event-1");
    expect(summary).toHaveTextContent("Conference Room");
    expect(summary).toHaveTextContent("VB-BOOKING1");
    expect(summary).toHaveTextContent("Please provide microphones.");
    expect(
      screen.queryByRole("button", { name: "Submit booking request" }),
    ).not.toBeInTheDocument();
  });

  /** VEN-BKG-08-A: if existing-request lookup fails, the page fails closed and asks the Coordinator to retry. */
  it("SPM-54 blocks submission when existing-request verification fails", async () => {
    setCoordinator(["event-1"]);
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") throw new Error("offline");
      return venue as never;
    });

    renderPage(`/venue-records/${id}?eventId=event-1`);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to verify an existing request for this event and venue",
    );
    expect(
      screen.queryByRole("button", { name: "Submit booking request" }),
    ).not.toBeInTheDocument();
  });

  /** SPM54-UI-MODE-01: an invalid booking-history response is treated as an unverifiable duplicate state. */
  it("SPM-54 blocks submission when booking history has an invalid shape", async () => {
    setCoordinator(["event-1"]);
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return { bookings: [] } as never;
      return venue as never;
    });

    renderPage(`/venue-records/${id}?eventId=event-1`);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to verify an existing request for this event and venue",
    );
    expect(
      screen.queryByRole("button", { name: "Submit booking request" }),
    ).not.toBeInTheDocument();
  });

  /** VEN-BKG-08-A: a delayed booking-history response for an old event cannot replace the new event's request summary. */
  it("VEN-BKG-08-A SPM-54 ignores a stale booking summary after switching events", async () => {
    setCoordinator(["event-1", "event-52"]);
    let resolveOld: (rows: unknown) => void = () => undefined;
    let historyCalls = 0;
    const booking = (eventId: string) => ({
      id: `booking-${eventId}`,
      eventId,
      eventName: `Event ${eventId}`,
      venueId: id,
      venueName: "Conference Room",
      start: "2030-01-12T04:00:00.000Z",
      end: "2030-01-12T05:00:00.000Z",
      status: "pending",
      bookingReference: `VB-${eventId}`,
    });
    apiMock.mockImplementation((path) => {
      if (path === "/venues/bookings/mine") {
        historyCalls += 1;
        if (historyCalls === 1)
          return new Promise((resolve) => {
            resolveOld = resolve;
          }) as never;
        return Promise.resolve([booking("event-52")] as never);
      }
      return Promise.resolve(venue as never);
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}?eventId=event-1`]}>
        <SwitchDetailEvent />
        <Routes>
          <Route
            path="/venue-records/:id"
            element={<VenueRecordDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(historyCalls).toBe(1));
    await user.click(screen.getByRole("button", { name: "Switch event" }));
    const activeSummary = await screen.findByRole("region", {
      name: "Existing venue booking request",
    });
    expect(activeSummary).toHaveTextContent("Event event-52");

    await act(async () => resolveOld([booking("event-1")]));

    expect(
      screen.getByRole("region", { name: "Existing venue booking request" }),
    ).toHaveTextContent("Event event-52");
    expect(screen.queryByText("VB-event-1")).not.toBeInTheDocument();
  });

  /** VEN-BKG-08-A: a delayed error for a former event does not hide a successfully loaded current booking summary. */
  it("VEN-BKG-08-A SPM-54 ignores a stale booking-history failure after switching events", async () => {
    setCoordinator(["event-1", "event-52"]);
    let rejectOld: (reason: unknown) => void = () => undefined;
    let historyCalls = 0;
    const booking = {
      id: "booking-event-52",
      eventId: "event-52",
      eventName: "Event event-52",
      venueId: id,
      venueName: "Conference Room",
      start: "2030-01-13T04:00:00.000Z",
      end: "2030-01-13T05:00:00.000Z",
      status: "pending",
      bookingReference: "VB-event-52",
    };
    apiMock.mockImplementation((path) => {
      if (path === "/venues/bookings/mine") {
        historyCalls += 1;
        if (historyCalls === 1)
          return new Promise((_, reject) => {
            rejectOld = reject;
          }) as never;
        return Promise.resolve([booking] as never);
      }
      return Promise.resolve(venue as never);
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}?eventId=event-1`]}>
        <SwitchDetailEvent />
        <Routes>
          <Route
            path="/venue-records/:id"
            element={<VenueRecordDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(historyCalls).toBe(1));
    await user.click(screen.getByRole("button", { name: "Switch event" }));
    const activeSummary = await screen.findByRole("region", {
      name: "Existing venue booking request",
    });
    expect(activeSummary).toHaveTextContent("Event event-52");

    await act(async () => rejectOld(new Error("stale transport failure")));

    expect(
      screen.queryByText(
        /unable to verify an existing request for this event and venue/i,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Existing venue booking request" }),
    ).toHaveTextContent("Event event-52");
  });

  /** VEN-BKG-10-A: cancelling an event-linked request always requires the user to confirm before the API call. */
  it("VEN-BKG-10-A VEN-BKG-10-SEC-1 SPM-54 confirms cancellation and removes only the active summary", async () => {
    setCoordinator(["event-1"]);
    let status = "pending";
    const booking = {
      id: "booking-1",
      eventId: "event-1",
      eventName: "Event event-1",
      venueId: id,
      venueName: "Conference Room",
      start: "2030-01-12T04:00:00.000Z",
      end: "2030-01-12T05:00:00.000Z",
      status,
      bookingReference: "VB-BOOKING1",
    };
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine")
        return [{ ...booking, status }] as never;
      if (path === `/venues/bookings/${booking.id}/cancel`) {
        status = "cancelled";
        return { id: booking.id, status } as never;
      }
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("region", {
      name: "Existing venue booking request",
    });
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Cancel the request for Conference Room?");
    await user.click(
      within(dialog).getByRole("button", { name: "Keep booking" }),
    );
    expect(
      screen.getByRole("region", { name: "Existing venue booking request" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    const confirmedDialog = screen.getByRole("alertdialog");
    await user.click(
      within(confirmedDialog).getByRole("button", {
        name: "Confirm cancellation",
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Existing venue booking request",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(apiMock).toHaveBeenCalledWith(
      `/venues/bookings/${booking.id}/cancel`,
      { method: "POST", body: JSON.stringify({ confirmed: false }) },
    );
    expect(
      await screen.findByRole("button", { name: "Submit booking request" }),
    ).toBeInTheDocument();
  });

  /**
   * VEN-BKG-10-A SPM-54: after a submitted request is cancelled, the review section stays and its notice reads as cancelled.
   * Product owner decision, 28 Oct 2026 (spec-conflicts.md SC-SPM54-05): the notice stays visible and says the request is cancelled.
   * Kills: a page that hides the review section, keeps the "submitted" wording after cancellation, or clears the notice when the new request is cancelled.
   */
  it("VEN-BKG-10-A SPM-54 keeps the submitted notice in the review after the new request is cancelled", async () => {
    setCoordinator(["event-1"]);
    let bookings: unknown[] = [];
    const booking = {
      id: "booking-cancel-1",
      eventId: "event-1",
      eventName: "Event event-1",
      venueId: id,
      venueName: "Conference Room",
      start: "2030-01-12T04:00:00.000Z",
      end: "2030-01-12T05:00:00.000Z",
      status: "pending",
      bookingReference: "VB-CANCEL01",
    };
    apiMock.mockImplementation(async (path: string) => {
      if (path === "/venues/bookings/mine") return bookings as never;
      if (path === `/venues/${id}/booking-requests`) {
        bookings = [booking];
        return { ...booking, bookingReference: "VB-CANCEL01" } as never;
      }
      if (path === `/venues/bookings/${booking.id}/cancel`) {
        bookings = [];
        return { id: booking.id, status: "cancelled" } as never;
      }
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    const review = screen.getByRole("region", {
      name: "Review booking request",
    });
    await user.click(
      within(review).getByRole("button", { name: "Submit booking request" }),
    );
    await screen.findByRole("region", {
      name: "Existing venue booking request",
    });
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Confirm cancellation",
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Existing venue booking request",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("region", { name: "Review booking request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Booking request VB-CANCEL01 is cancelled."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Booking request submitted\. Reference/),
    ).not.toBeInTheDocument();
  });

  /** VEN-BKG-09-A: a server cancellation failure leaves the active event-linked request visible and reports the reason. */
  it("VEN-BKG-09-A SPM-54 preserves the event venue summary when cancellation fails", async () => {
    setCoordinator(["event-1"]);
    const booking = {
      id: "booking-1",
      eventId: "event-1",
      eventName: "Event event-1",
      venueId: id,
      venueName: "Conference Room",
      start: "2030-01-12T04:00:00.000Z",
      end: "2030-01-12T05:00:00.000Z",
      status: "pending",
      bookingReference: "VB-BOOKING1",
    };
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [booking] as never;
      if (path === `/venues/bookings/${booking.id}/cancel`)
        throw new Error("Cancellation failed");
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("region", {
      name: "Existing venue booking request",
    });
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Confirm cancellation",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cancellation failed",
    );
    expect(
      screen.getByRole("region", { name: "Existing venue booking request" }),
    ).toBeInTheDocument();
  });

  /** VEN-BKG-09-A: a non-Error cancellation rejection uses a safe message and leaves the active request unchanged. */
  it("VEN-BKG-09-A SPM-54 handles an unstructured event booking cancellation failure", async () => {
    setCoordinator(["event-1"]);
    const booking = {
      id: "booking-1",
      eventId: "event-1",
      eventName: "Event event-1",
      venueId: id,
      venueName: "Conference Room",
      start: "2030-01-12T04:00:00.000Z",
      end: "2030-01-12T05:00:00.000Z",
      status: "pending",
      bookingReference: "VB-BOOKING1",
    };
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [booking] as never;
      if (path === `/venues/bookings/${booking.id}/cancel`) throw "offline";
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("region", {
      name: "Existing venue booking request",
    });
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Confirm cancellation",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to cancel this booking.",
    );
    expect(
      screen.getByRole("region", { name: "Existing venue booking request" }),
    ).toBeInTheDocument();
  });

  /** VEN-BKG-10-A/10-B: a last-active response asks for a second explicit confirmation and preserves the request if it fails. */
  it("VEN-BKG-10-A VEN-BKG-10-B VEN-BKG-10-SEC-1 SPM-54 asks before cancelling the last active event venue", async () => {
    setCoordinator(["event-1"]);
    const booking = {
      id: "booking-1",
      eventId: "event-1",
      eventName: "Event event-1",
      venueId: id,
      venueName: "Conference Room",
      start: "2030-01-12T04:00:00.000Z",
      end: "2030-01-12T05:00:00.000Z",
      status: "pending",
      bookingReference: "VB-BOOKING1",
    };
    let cancelled = false;
    apiMock.mockImplementation(async (path, init) => {
      if (path === "/venues/bookings/mine")
        return (cancelled ? [] : [booking]) as never;
      if (path === `/venues/bookings/${booking.id}/cancel`) {
        const confirmed = JSON.parse(String(init?.body)).confirmed;
        if (!confirmed)
          throw new ApiError(
            "This event will have no pending or approved venue booking.",
            undefined,
            "LAST_ACTIVE_VENUE_BOOKING",
            409,
          );
        cancelled = true;
        return { id: booking.id, status: "cancelled" } as never;
      }
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("region", {
      name: "Existing venue booking request",
    });
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Confirm cancellation",
      }),
    );
    const lastBookingDialog = await screen.findByRole("alertdialog");
    expect(lastBookingDialog).toHaveTextContent(
      "Cancel the last active venue booking?",
    );
    expect(lastBookingDialog).toHaveTextContent(
      "You can search for a replacement afterwards.",
    );
    expect(
      screen.getByRole("region", { name: "Existing venue booking request" }),
    ).toBeInTheDocument();
    await user.click(
      within(lastBookingDialog).getByRole("button", {
        name: "Confirm cancellation",
      }),
    );
    await waitFor(() => expect(cancelled).toBe(true));
    expect(apiMock).toHaveBeenNthCalledWith(
      3,
      `/venues/bookings/${booking.id}/cancel`,
      { method: "POST", body: JSON.stringify({ confirmed: false }) },
    );
    expect(apiMock).toHaveBeenNthCalledWith(
      4,
      `/venues/bookings/${booking.id}/cancel`,
      { method: "POST", body: JSON.stringify({ confirmed: true }) },
    );
  });
  /** SPM-51 sends the selected event's time range to the availability check in Singapore local time. */
  it("prefills event and time range from a Search Venues link", async () => {
    setCoordinator(["event-1"]);
    mockVenueApi();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("heading", { name: "Conference Room" });
    expect(screen.getByLabelText("Event starts")).toHaveValue(
      "2030-01-12T12:00",
    );
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T13:00");
    expect(screen.getByLabelText("Event starts")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Event ends")).toHaveAttribute("readonly");
    expect(
      screen.getByRole("link", { name: "Back to Search Venues" }),
    ).toHaveAttribute("href", "/venues?eventId=event-1");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Refresh schedule" }));
    expect(
      await screen.findByLabelText("Booking event context"),
    ).toHaveTextContent("Event event-1");
    expect(
      screen.queryByLabelText("Event for booking request"),
    ).not.toBeInTheDocument();
  });

  /** SPM-51 refresh regression: a cold store fetches the linked event and prefills its range and request selection. */
  it("loads URL event context and prefills availability after refresh", async () => {
    setCoordinator();
    const requestedEvent = coordinatorEvent("event-1");
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path === `/venues/${id}`) return venue as never;
      if (path === "/events/event-1") return requestedEvent as never;
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("heading", { name: "Conference Room" });
    await waitFor(() =>
      expect(screen.getByLabelText("Event starts")).toHaveValue(
        "2030-01-12T12:00",
      ),
    );
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T13:00");
    expect(screen.getByLabelText("Booking event context")).toHaveTextContent(
      "Event event-1",
    );
    expect(
      screen.queryByLabelText("Event for booking request"),
    ).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/events/event-1");
    expect(useAppStore.getState().events).toContainEqual(requestedEvent);
  });

  /** SPM-51 event-load failure is visible and retry restores the selected event range. */
  it("shows a retryable event-load error on availability details", async () => {
    setCoordinator();
    const requestedEvent = coordinatorEvent("event-1");
    let eventAttempts = 0;
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path === `/venues/${id}`) return venue as never;
      if (path === "/events/event-1") {
        eventAttempts += 1;
        if (eventAttempts === 1) throw new Error("offline");
        return requestedEvent as never;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load this event for your Coordinator account",
    );
    await user.click(screen.getByRole("button", { name: "Retry event" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Event starts")).toHaveValue(
        "2030-01-12T12:00",
      ),
    );
    expect(screen.getByLabelText("Booking event context")).toHaveTextContent(
      "Event event-1",
    );
  });

  /** SPM-51 unavailable linked events receive a specific not-found message instead of an empty booking selector. */
  it("explains when the event linked in the URL no longer exists", async () => {
    setCoordinator();
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path === `/venues/${id}`) return venue as never;
      if (path === "/events/event-missing")
        throw new ApiError("Not found", undefined, undefined, 404);
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage(`/venue-records/${id}?eventId=event-missing`);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This event is not available to your Coordinator account",
    );
    expect(
      screen.queryByRole("region", { name: "Review booking request" }),
    ).not.toBeInTheDocument();
  });

  /** SPM-51 route changes discard an older event response so only the current query controls the selected range. */
  it("ignores stale event success and failure after the availability URL changes", async () => {
    setCoordinator(["event-99"]);
    const user = userEvent.setup();
    const pending = new Map<
      string,
      { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
    >();
    apiMock.mockImplementation((path) => {
      if (path === "/venues/bookings/mine") return Promise.resolve([]) as never;
      if (path === `/venues/${id}`) return Promise.resolve(venue) as never;
      return new Promise((resolve, reject) =>
        pending.set(path, { resolve, reject }),
      ) as never;
    });
    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}?eventId=event-51`]}>
        <SwitchDetailEvent />
        <Routes>
          <Route
            path="/venue-records/:id"
            element={<VenueRecordDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Conference Room" });
    await user.click(screen.getByRole("button", { name: "Switch event" }));

    await waitFor(() => expect(pending.has("/events/event-52")).toBe(true));
    await user.click(screen.getByRole("button", { name: "Switch again" }));
    await waitFor(() => expect(pending.has("/events/event-53")).toBe(true));
    pending.get("/events/event-53")!.resolve(coordinatorEvent("event-53"));
    await waitFor(() =>
      expect(screen.getByLabelText("Event starts")).toHaveValue(
        "2030-01-14T12:00",
      ),
    );
    pending.get("/events/event-52")!.resolve(coordinatorEvent("event-52"));
    pending.get("/events/event-51")!.reject(new Error("late failure"));
    await waitFor(() =>
      expect(useAppStore.getState().events.map((event) => event.id)).toEqual([
        "event-53",
        "event-99",
      ]),
    );
    expect(screen.getByLabelText("Event starts")).toHaveValue(
      "2030-01-14T12:00",
    );
  });

  /** Clicking the selected time clears the requested range and returns the coordinator to an unselected state. */
  it("clears the selected event range when its calendar block is clicked", async () => {
    setCoordinator(["event-1"]);
    const user = userEvent.setup();
    mockVenueApi();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("heading", { name: "Conference Room" });
    const schedule = screen.getByRole("region", { name: "Venue schedule" });
    const selectedEvent = schedule.querySelector(".venue-schedule-selected");
    expect(selectedEvent).toBeInTheDocument();
    expect(selectedEvent).toHaveTextContent(/\d/);
    expect(selectedEvent).not.toHaveTextContent("Selected event time");
    expect(selectedEvent).not.toHaveTextContent("Requested event time");
    expect(
      selectedEvent?.querySelector(".venue-schedule-event-time"),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));
    await screen.findByText("This time is available for this venue.");
    expect(
      screen.getByRole("button", { name: "Refresh schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/schedule availability may change/i),
    ).toHaveTextContent("we also verify again when you submit");
    const bookingRequest = screen.getByRole("region", {
      name: "Review booking request",
    });
    expect(bookingRequest).toBeInTheDocument();

    const orderedContent = [
      screen.getByLabelText("Event starts"),
      screen.getByRole("button", { name: "Refresh schedule" }),
      screen.getByLabelText("Venue suitability"),
      screen.getByText("This time is available for this venue."),
      bookingRequest,
      screen.getByRole("group", { name: "Availability view" }),
      schedule,
    ];
    for (let index = 0; index < orderedContent.length - 1; index += 1) {
      expect(
        orderedContent[index].compareDocumentPosition(
          orderedContent[index + 1],
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    await user.click(schedule.querySelector(".venue-schedule-selected")!);

    expect(screen.getByLabelText("Event starts")).toHaveValue(
      "2030-01-12T12:00",
    );
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T13:00");
    expect(
      screen.getByRole("region", { name: "Review booking request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh schedule" }),
    ).toBeEnabled();
  });

  /** VEN-BKG-SUP-03 SPM-54 AC3: assigned event time fields cannot be edited to create a zero-duration request. */
  it("keeps the assigned event times read-only", async () => {
    setCoordinator(["event-1"]);
    apiMock.mockResolvedValueOnce(venue).mockResolvedValueOnce([] as never);
    renderPage(`/venue-records/${id}?eventId=event-1`);
    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2030-01-12T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Event ends"), {
      target: { value: "2030-01-12T12:00" },
    });

    expect(screen.getByLabelText("Event starts")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Event ends")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Event starts")).toHaveValue(
      "2030-01-12T12:00",
    );
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T13:00");
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });

  /** Missing detail data uses a not-found fallback while real API errors keep their message. */
  it("chooses a detail error for a missing record and preserves an API message", () => {
    expect(getVenueDetailErrorMessage("", undefined)).toBe("Venue not found.");
    expect(getVenueDetailErrorMessage("Service offline", undefined)).toBe(
      "Service offline",
    );
    expect(getVenueDetailErrorMessage("", venue)).toBe("");
  });

  /** A route without a venue ID reports not found without requesting an undefined URL. */
  it("shows the fallback not-found message when the route has no venue ID", async () => {
    render(
      <MemoryRouter initialEntries={["/venue-records"]}>
        <Routes>
          <Route path="/venue-records" element={<VenueRecordDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Venue not found.",
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  /** VEN-AVL-07-A: a conflict blocks request submission after the coordinator checks a venue. The buffer overlap that causes the conflict is also an AC8 case. */
  it("SPM-51: blocks booking submission for a time that conflicts with a confirmed booking", async () => {
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
          name: "New Workshop",
          purpose: "",
          description: "",
          organiserId: "org-1",
          organiserName: "Organiser",
          status: "submitted",
          startDateTime: "2026-10-05T12:00:00.000Z",
          endDateTime: "2026-10-05T13:00:00.000Z",
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
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce(venue)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(venue);

    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    await screen.findByLabelText("Event starts");
    expect(screen.getByLabelText("Event starts")).toHaveValue(
      "2026-10-05T20:00",
    );
    expect(screen.getByLabelText("Event ends")).toHaveValue("2026-10-05T21:00");
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Confirmed booking");
    expect(screen.getByRole("alert")).toHaveTextContent("Welcome Evening");
    expect(
      screen.queryByRole("button", { name: "Submit booking request" }),
    ).not.toBeInTheDocument();
    expect(useAppStore.getState().bookings).toEqual([]);
  });

  /** VEN-BKG-03-A: an event-linked request uses the assigned event and includes its optional special request. */
  it("VEN-BKG-03-A SPM-54 submits the assigned event details and optional request text", async () => {
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
          name: "New Workshop",
          purpose: "",
          description: "",
          organiserId: "org-1",
          organiserName: "Organiser",
          status: "submitted",
          startDateTime: "2030-01-12T04:00:00.000Z",
          endDateTime: "2030-01-12T05:00:00.000Z",
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
    useAppStore.setState((state) => ({
      events: [
        ...state.events,
        { ...state.events[0], id: "event-2", name: "Second event" },
      ],
    }));
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce(venue)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(venue)
      .mockResolvedValueOnce({
        bookingReference: "VB-00000000",
        statusChanged: true,
      });

    renderPage(`/venue-records/${id}?eventId=event-2`);
    await screen.findByRole("heading", { name: "Conference Room" });
    await screen.findByLabelText("Event starts");
    expect(screen.getByLabelText("Event starts")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Event ends")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Event starts")).toHaveValue(
      "2030-01-12T12:00",
    );
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T13:00");
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));
    expect(apiMock).toHaveBeenCalledTimes(3);
    const review = screen.getByRole("region", {
      name: "Review booking request",
    });
    expect(review).toHaveTextContent("Conference Room");
    expect(review).toHaveTextContent("Second event");
    expect(review).toHaveTextContent("Expected attendance20");
    expect(review).toHaveTextContent(
      "12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 (SGT)",
    );
    expect(
      within(review).getByLabelText("Special requests (optional)"),
    ).toBeInTheDocument();
    fireEvent.change(
      within(review).getByLabelText("Special requests (optional)"),
      { target: { value: "  Two microphones, please.  " } },
    );
    expect(
      within(review).queryByRole("button", {
        name: "Continue to booking request",
      }),
    ).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(3);
    await user.click(
      within(review).getByRole("button", {
        name: "Submit booking request",
      }),
    );

    expect(apiMock).toHaveBeenNthCalledWith(
      4,
      `/venues/${id}/booking-requests`,
      {
        method: "POST",
        body: JSON.stringify({
          eventId: "event-2",
          start: "2030-01-12T04:00:00.000Z",
          end: "2030-01-12T05:00:00.000Z",
          specialRequest: "Two microphones, please.",
        }),
      },
    );
    expect(useAppStore.getState().bookings).toEqual([]);
    expect(screen.getByText(/Reference: VB-00000000/)).toBeInTheDocument();
    expect(
      useAppStore.getState().events.find((item) => item.id === "event-2")
        ?.status,
    ).toBe("planning");
    expect(screen.getByText(/now in Planning/i)).toBeInTheDocument();
  });

  /**
   * VEN-AVL-07-SEC-1-UI: a fresh conflict prevents submission after the schedule response.
   */
  it("SPM-51: shows the fresh server conflict and does not report a submitted request", async () => {
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
          name: "New Workshop",
          purpose: "",
          description: "",
          organiserId: "org-1",
          organiserName: "Organiser",
          status: "submitted",
          startDateTime: "2030-01-12T04:00:00.000Z",
          endDateTime: "2030-01-12T05:00:00.000Z",
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
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce(venue)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(venue)
      .mockRejectedValueOnce(
        new ApiError(
          "Venue is no longer available because of a new booking.",
          undefined,
          undefined,
          409,
        ),
      );

    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2030-01-12T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Event ends"), {
      target: { value: "2030-01-12T13:00" },
    });
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));
    await user.click(
      screen.getByRole("button", { name: "Submit booking request" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("new booking");
    expect(
      screen.queryByText(/Booking request submitted/),
    ).not.toBeInTheDocument();
    expect(useAppStore.getState().bookings).toEqual([]);
    expect(apiMock).toHaveBeenCalledTimes(4);
  });

  /** API and transport failures while refreshing availability show an actionable error. */
  it.each([
    {
      failure: new ApiError(
        "Schedule service unavailable.",
        undefined,
        undefined,
        503,
      ),
      message: "Schedule service unavailable.",
      label: "HTTP 503",
    },
    {
      failure: new Error("offline"),
      message: "Unable to refresh venue availability. Try again.",
      label: "network error",
    },
  ])(
    "shows the expected refresh message after $label",
    async ({ failure, message }) => {
      setCoordinator(["event-1"]);
      const user = userEvent.setup();
      apiMock
        .mockResolvedValueOnce(venue)
        .mockResolvedValueOnce([] as never)
        .mockRejectedValueOnce(failure);
      renderPage();
      await screen.findByRole("heading", { name: "Conference Room" });
      fireEvent.change(screen.getByLabelText("Event starts"), {
        target: { value: "2030-01-15T12:00" },
      });
      fireEvent.change(screen.getByLabelText("Event ends"), {
        target: { value: "2030-01-15T13:00" },
      });

      await user.click(
        screen.getByRole("button", { name: "Refresh schedule" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
    },
  );

  /** VEN-BKG-04-B: a transport failure during submission reports no success and keeps the request retryable. */
  it("VEN-BKG-04-B SPM-54 shows a generic submission error without phantom confirmation", async () => {
    setCoordinator(["event-1"]);
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce(venue)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(venue)
      .mockRejectedValueOnce(new Error("offline"));
    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2030-01-15T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Event ends"), {
      target: { value: "2030-01-15T13:00" },
    });
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));
    await user.click(
      screen.getByRole("button", { name: "Submit booking request" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to submit the booking request. Try again.",
    );
    expect(
      screen.queryByText(/Booking request submitted/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh schedule" }),
    ).toBeEnabled();
  });

  /** VEN-BKG-03-B: leaving the optional special-request field blank does not prevent a valid request. */
  it("VEN-BKG-03-B SPM-54 submits with a blank optional special request", async () => {
    setCoordinator(["event-1"]);
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce(venue)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(venue)
      .mockResolvedValueOnce({ bookingReference: "VB-00000000" });
    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));
    const review = screen.getByRole("region", {
      name: "Review booking request",
    });
    expect(
      within(review).getByLabelText("Special requests (optional)"),
    ).toHaveValue("");
    await user.click(
      within(review).getByRole("button", { name: "Submit booking request" }),
    );

    expect(apiMock).toHaveBeenLastCalledWith(`/venues/${id}/booking-requests`, {
      method: "POST",
      body: JSON.stringify({
        eventId: "event-1",
        start: "2030-01-12T04:00:00.000Z",
        end: "2030-01-12T05:00:00.000Z",
      }),
    });
    expect(
      await screen.findByText(/Reference: VB-00000000/),
    ).toBeInTheDocument();
  });

  /** VEN-BKG-SUP-04 SPM-54 AC2: a pending request without a Venue Staff hold is absent from the tentative schedule. */
  it("does not display pending requests without a hold expiry as tentative reservations", async () => {
    setCoordinator();
    const user = userEvent.setup();
    const emptyVenue = { ...venue, reservations: [], unavailablePeriods: [] };
    apiMock
      .mockResolvedValueOnce(emptyVenue)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(emptyVenue);
    renderPage(`/venue-records/${id}`);
    await screen.findByRole("heading", { name: "Conference Room" });
    expect(
      screen.getByText("No bookings, active holds or unavailable periods."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(
      screen.getByText("No bookings, active holds or unavailable periods."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.queryByLabelText("Event starts")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit booking request" }),
    ).not.toBeInTheDocument();
  });

  /**
   * VEN-AVL-03-B: an active tentative hold shows the stored expiry instant, 12 Jan 2030 15:00 SGT, in both the calendar and the list views.
   * Kills: a view that shows the hold end (14:00 SGT) or no expiry for a live hold instead of the stored expiry.
   */
  it("shows the active tentative hold and its expiry instant in calendar and list views", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-12T04:00:00.000Z"));
    useAppStore.setState({
      currentUser: {
        id: "coordinator",
        name: "Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
    });
    const user = userEvent.setup();
    const holdSchedule: VenueRecord = {
      ...venue,
      unavailablePeriods: [],
      reservations: [
        {
          id: "live-hold",
          eventName: "Held seminar",
          start: "2030-01-12T05:00:00Z",
          end: "2030-01-12T06:00:00Z",
          status: "tentative",
          holdExpiresAt: "2030-01-12T07:00:00Z",
          affectedByUnavailablePeriod: false,
        },
      ],
    };
    apiMock
      .mockResolvedValueOnce(holdSchedule)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(holdSchedule);

    try {
      renderPage();
      await screen.findByRole("heading", { name: "Conference Room" });
      fireEvent.change(screen.getByLabelText("Event starts"), {
        target: { value: "2030-01-12T12:00" },
      });
      fireEvent.change(screen.getByLabelText("Event ends"), {
        target: { value: "2030-01-12T18:00" },
      });
      await user.click(
        screen.getByRole("button", { name: "Refresh schedule" }),
      );

      const calendar = screen.getByRole("region", { name: "Venue schedule" });
      expect(calendar).toHaveTextContent("Tentative hold");
      expect(calendar).toHaveTextContent("Hold expires 12 Jan 2030, 15:00 SGT");

      await user.click(screen.getByRole("button", { name: "List" }));
      const list = screen.getByRole("list", { name: "Venue schedule" });
      expect(list).toHaveTextContent("Tentative hold");
      expect(list).toHaveTextContent("hold expires 12 Jan 2030, 15:00 SGT");
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  /** VEN-AVL-03-A: calendar/list both show the schedule, free slot, reasons, hold expiry and preserve selection. The hold-expiry display in both views is the second AC3 case. */
  it("shows the same schedule facts in calendar and list views without changing the selected range", async () => {
    useAppStore.setState({
      currentUser: {
        id: "coordinator",
        name: "Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
    });
    const user = userEvent.setup();
    const scheduledVenue: VenueRecord = {
      ...venue,
      reservations: [
        {
          id: "confirmed",
          eventName: "Confirmed workshop",
          start: "2030-01-12T05:00:00Z",
          end: "2030-01-12T06:00:00Z",
          status: "booked",
          affectedByUnavailablePeriod: true,
        },
        {
          id: "active-hold",
          eventName: "Held seminar",
          start: "2030-01-12T07:00:00Z",
          end: "2030-01-12T08:00:00Z",
          status: "tentative",
          holdExpiresAt: "2030-01-11T23:30:00Z",
          affectedByUnavailablePeriod: false,
        },
      ],
      unavailablePeriods: [
        {
          id: "maintenance",
          start: "2030-01-12T09:00:00Z",
          end: "2030-01-12T09:30:00Z",
          reason: "Maintenance",
        },
      ],
    };
    apiMock
      .mockResolvedValueOnce(scheduledVenue)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(scheduledVenue);

    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2030-01-12T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Event ends"), {
      target: { value: "2030-01-12T18:00" },
    });
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));

    const startsBeforeToggle = (
      screen.getByLabelText("Event starts") as HTMLInputElement
    ).value;
    const endsBeforeToggle = (
      screen.getByLabelText("Event ends") as HTMLInputElement
    ).value;
    expect(
      screen.getByRole("region", { name: "Venue schedule" }),
    ).toHaveTextContent("Confirmed booking");
    expect(
      screen.getByRole("region", { name: "Venue schedule" }),
    ).toHaveTextContent("Tentative hold");
    expect(
      screen.getByRole("region", { name: "Venue schedule" }),
    ).toHaveTextContent("Unavailable");
    expect(
      screen.getByRole("region", { name: "Venue schedule" }),
    ).toHaveTextContent("Maintenance");
    expect(
      screen.getByRole("region", { name: "Venue schedule" }),
    ).toHaveTextContent("Hold expires 12 Jan 2030, 07:30 SGT");
    expect(
      screen.getByRole("region", { name: "Venue schedule" }),
    ).toHaveTextContent("Available");
    const calendar = screen.getByRole("region", { name: "Venue schedule" });
    expect(
      calendar.querySelector("[role='grid'][aria-colcount='7']"),
    ).toBeInTheDocument();
    expect(
      calendar.querySelectorAll("[role='gridcell'][data-date]").length,
    ).toBeGreaterThan(1);
    expect(calendar).toHaveTextContent("Setup buffer");
    expect(calendar).toHaveTextContent("Turnaround buffer");
    const selectedBlock = calendar.querySelector(".venue-schedule-selected");
    expect(selectedBlock).toBeInTheDocument();
    expect(selectedBlock).toHaveTextContent(/\d/);
    expect(selectedBlock).not.toHaveTextContent("Selected event time");
    expect(selectedBlock).not.toHaveTextContent("Requested event time");
    const bookingEvent = calendar.querySelector(".venue-schedule-booking");
    expect(bookingEvent).toHaveTextContent("Confirmed booking");
    expect(bookingEvent?.closest("[role='gridcell']")).toHaveAttribute(
      "data-date",
      "2030-01-12",
    );
    expect(calendar).toHaveTextContent("9am");

    await user.click(screen.getByRole("button", { name: "List" }));
    const list = screen.getByRole("list", { name: "Venue schedule" });
    expect(list).toHaveTextContent("Confirmed booking");
    expect(list).toHaveTextContent("Tentative hold");
    expect(list).toHaveTextContent("Unavailable");
    expect(list).toHaveTextContent("Maintenance");
    expect(list).toHaveTextContent("hold expires 12 Jan 2030, 07:30 SGT");
    expect(list).toHaveTextContent("Available slot");
    expect(list).toHaveTextContent("Selected event time");
    expect(list).toHaveTextContent(
      "12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 (SGT)",
    );
    expect(list).toHaveTextContent(
      "12 Jan 2030, 12:00 – 12 Jan 2030, 12:30 (SGT)",
    );
    expect(
      (screen.getByLabelText("Event starts") as HTMLInputElement).value,
    ).toBe(startsBeforeToggle);
    expect(
      (screen.getByLabelText("Event ends") as HTMLInputElement).value,
    ).toBe(endsBeforeToggle);

    await user.click(screen.getByRole("button", { name: "Calendar" }));
    expect(
      screen.getByRole("region", { name: "Venue schedule" }),
    ).toHaveTextContent("Held seminar");
    expect(apiMock).toHaveBeenCalledTimes(3);
  });

  /** VEN-AVL-05-B: changing venues replaces schedule entries instead of retaining the previous venue's bookings. */
  it("loads only the newly selected venue's schedule", async () => {
    setCoordinator();
    const user = userEvent.setup();
    const secondId = "00000000-0000-4000-8000-000000000225";
    const secondVenue: VenueRecord = {
      ...venue,
      id: secondId,
      name: "Second Schedule Venue",
      unavailablePeriods: [],
      reservations: [
        {
          id: "second-venue-booking",
          eventName: "Second venue booking",
          start: "2026-10-05T12:00:00.000Z",
          end: "2026-10-05T13:00:00.000Z",
          status: "booked",
          affectedByUnavailablePeriod: false,
        },
      ],
    };
    apiMock.mockImplementation(async (path) =>
      path === `/venues/${id}` ? (venue as never) : (secondVenue as never),
    );

    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}`]}>
        <Link to={`/venue-records/${secondId}`}>Select second venue</Link>
        <Routes>
          <Route
            path="/venue-records/:id"
            element={<VenueRecordDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Conference Room" });

    await user.click(screen.getByRole("link", { name: "Select second venue" }));
    await screen.findByRole("heading", { name: "Second Schedule Venue" });
    await user.click(screen.getByRole("button", { name: "List" }));

    const schedule = screen.getByRole("list", { name: "Venue schedule" });
    expect(schedule).toHaveTextContent("Second venue booking");
    expect(schedule).not.toHaveTextContent("Welcome Evening");
    expect(schedule).not.toHaveTextContent("Workshop");
    expect(schedule).not.toHaveTextContent("Maintenance");
  });

  /** VEN-AVL-02-B / SPM-51 AC2: moving the time-grid week changes the visible dates and recomputes free periods for that week. */
  it("navigates the real time grid and shows availability in the newly visible week", async () => {
    const originalNow = Date.now();
    vi.setSystemTime(new Date("2030-01-12T04:00:00.000Z"));
    setCoordinator(["event-1"]);
    const user = userEvent.setup();
    mockVenueApi({
      ...venue,
      reservations: [],
      unavailablePeriods: [],
    });
    renderPage("/venue-records/00000000-0000-4000-8000-000000000124");

    try {
      await screen.findByRole("heading", { name: "Conference Room" });
      const calendar = screen.getByRole("region", { name: "Venue schedule" });
      expect(
        calendar.querySelector("[role='grid'][aria-colcount='7']"),
      ).toBeInTheDocument();
      expect(
        calendar.querySelectorAll("[role='gridcell'][data-date]"),
      ).toHaveLength(7);
      expect(
        calendar.querySelector("[role='gridcell'][data-date='2030-01-06']"),
      ).toBeInTheDocument();
      await user.click(
        within(calendar).getByRole("button", { name: "Next Week" }),
      );
      await within(calendar).findByRole("columnheader", {
        name: "January 13, 2030",
      });
      expect(
        calendar.querySelector("[role='gridcell'][data-date='2030-01-13']"),
      ).toBeInTheDocument();
      expect(
        calendar.querySelector("[role='gridcell'][data-date='2030-01-14']"),
      ).toHaveTextContent("Available");

      await user.click(
        within(calendar).getByRole("button", { name: "Previous Week" }),
      );
      await within(calendar).findByRole("columnheader", {
        name: "January 6, 2030",
      });
      expect(
        calendar.querySelector("[role='gridcell'][data-date='2030-01-06']"),
      ).toBeInTheDocument();

      expect(
        calendar.querySelector("[role='grid'][aria-colcount='7']"),
      ).toBeInTheDocument();
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.setSystemTime(originalNow);
    }
  });

  /** SPM54-UI-MODE-01 (user-confirmed): the booking request remains locked to the route event when others are assigned. */
  it("SPM-54 SPM54-UI-MODE-01 keeps the selected event period fixed when other assigned events are cached", async () => {
    setCoordinator(["event-1", "event-2"]);
    useAppStore.setState((state) => ({
      events: state.events.map((event) =>
        event.id === "event-2"
          ? {
              ...event,
              startDateTime: "2030-01-13T06:00:00.000Z",
              endDateTime: "2030-01-13T07:00:00.000Z",
            }
          : event,
      ),
    }));
    mockVenueApi();
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByLabelText("Event starts");
    expect(screen.getByLabelText("Booking event context")).toHaveTextContent(
      "Event event-1",
    );
    expect(screen.getByLabelText("Event starts")).toHaveValue(
      "2030-01-12T12:00",
    );
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T13:00");
    expect(screen.getByLabelText("Event starts")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Event ends")).toHaveAttribute("readonly");
    expect(screen.queryByText("Event event-2")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Event for booking request"),
    ).not.toBeInTheDocument();
  });

  /** SPM-51 AC8: zero setup and turnaround values show the booking without zero-length buffer rows. */
  it("renders a booking without buffer entries when both venue buffers are zero", async () => {
    setCoordinator(["event-1"]);
    mockVenueApi({
      ...venue,
      setupTimeMinutes: 0,
      turnaroundTimeMinutes: 0,
      reservations: [
        {
          id: "booking-no-buffer",
          eventName: "No Buffer Booking",
          start: "2030-01-12T04:00:00Z",
          end: "2030-01-12T05:00:00Z",
          status: "booked",
          affectedByUnavailablePeriod: false,
        },
      ],
    });
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("heading", { name: "Conference Room" });
    const calendar = screen.getByRole("region", { name: "Venue schedule" });
    expect(calendar).toHaveTextContent("No Buffer Booking");
    expect(calendar).not.toHaveTextContent("Setup buffer");
    expect(calendar).not.toHaveTextContent("Turnaround buffer");
  });

  /** VEN-AVL-10-B: the backend-clock-filtered schedule displays and blocks only the active hold. The only-active-hold assertion also excludes the expired hold, which is the first AC10 case. */
  it("renders and blocks the live hold returned by the server at a fixed check time", async () => {
    const realNow = Date.now();
    const fixedNow = new Date("2030-01-01T12:00:00.000Z");
    vi.setSystemTime(fixedNow);
    useAppStore.setState({
      currentUser: {
        id: "coordinator",
        name: "Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
    });
    const user = userEvent.setup();
    const activeSchedule = {
      ...venue,
      unavailablePeriods: [],
      reservations: [
        {
          id: "active",
          eventName: "Active Hold",
          start: "2030-01-12T04:00:00Z",
          end: "2030-01-12T05:00:00Z",
          status: "tentative",
          holdExpiresAt: "2030-01-01T13:00:00.000Z",
          affectedByUnavailablePeriod: false,
        },
      ],
    };
    apiMock
      .mockResolvedValueOnce(activeSchedule)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(activeSchedule);

    try {
      renderPage();
      await screen.findByRole("heading", { name: "Conference Room" });
      const schedule = screen.getByRole("region", { name: "Venue schedule" });
      expect(schedule).toHaveTextContent("Active Hold");
      fireEvent.change(screen.getByLabelText("Event starts"), {
        target: { value: "2030-01-12T12:00" },
      });
      fireEvent.change(screen.getByLabelText("Event ends"), {
        target: { value: "2030-01-12T13:00" },
      });
      await user.click(
        screen.getByRole("button", { name: "Refresh schedule" }),
      );

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Active Hold");
      expect(Date.now()).toBe(fixedNow.getTime());
    } finally {
      cleanup();
      vi.setSystemTime(realNow);
    }
  });

  /**
   * VEN-AVL-10-BND-1: at the exact expiry instant, 12 Jan 2030 09:00 SGT, the hold is inactive and a range that only overlaps it is not blocked.
   * Kills: a page that keeps a hold active at its expiry instant (a >= comparison), which would list it as a conflict and block the time.
   */
  it("does not block a range that overlaps a hold at its exact expiry instant", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-12T01:00:00.000Z"));
    useAppStore.setState({
      currentUser: {
        id: "coordinator",
        name: "Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
    });
    const user = userEvent.setup();
    const boundarySchedule: VenueRecord = {
      ...venue,
      unavailablePeriods: [],
      reservations: [
        {
          id: "expiring-hold",
          eventName: "Expiring Hold",
          start: "2030-01-12T05:00:00Z",
          end: "2030-01-12T06:00:00Z",
          status: "tentative",
          holdExpiresAt: "2030-01-12T01:00:00.000Z",
          affectedByUnavailablePeriod: false,
        },
      ],
    };
    apiMock
      .mockResolvedValueOnce(boundarySchedule)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(boundarySchedule);

    try {
      renderPage();
      await screen.findByRole("heading", { name: "Conference Room" });
      fireEvent.change(screen.getByLabelText("Event starts"), {
        target: { value: "2030-01-12T13:00" },
      });
      fireEvent.change(screen.getByLabelText("Event ends"), {
        target: { value: "2030-01-12T14:00" },
      });
      await user.click(
        screen.getByRole("button", { name: "Refresh schedule" }),
      );

      expect(
        await screen.findByText("This time is available for this venue."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "Venue schedule" }),
      ).not.toHaveTextContent("Expiring Hold");
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  /** VEN-AVL-09-B: a booking affected by a setup-overlapping blockout remains recorded and visibly flagged. The retained-and-visible check is the first AC9 case. */
  it("retains and flags an existing booking affected only through its setup buffer", async () => {
    apiMock
      .mockResolvedValueOnce({
        ...venue,
        unavailablePeriods: [
          {
            id: "setup-block",
            start: "2026-10-05T11:45:00Z",
            end: "2026-10-05T11:50:00Z",
            reason: "Setup access restriction",
          },
        ],
        reservations: [
          {
            id: "kept-booking",
            eventName: "Kept Workshop",
            start: "2026-10-05T12:00:00Z",
            end: "2026-10-05T14:00:00Z",
            status: "booked",
            affectedByUnavailablePeriod: true,
          },
        ],
      })
      .mockResolvedValueOnce([] as never);

    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });

    expect(screen.getAllByText("Kept Workshop").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Affected by an unavailable period"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Setup access restriction/).length,
    ).toBeGreaterThan(0);
  });

  // VEN-VIEW-06-A (AC6): the selected venue shows its upcoming confirmed booking.
  it("VEN-VIEW-06-A: shows BKG-1001 as a booking for Orchid Hall only", async () => {
    // Arrange: the API returns the specified booking on Orchid Hall.
    mockVenueApi({
      ...venue,
      name: "Orchid Hall Test",
      reservations: [
        {
          id: "booking-1001",
          eventName: "BKG-1001",
          start: "2026-10-09T02:00:00Z",
          end: "2026-10-09T03:00:00Z",
          status: "booked",
          affectedByUnavailablePeriod: false,
        },
      ],
    });

    // Act: open the selected venue's details.
    renderPage();
    await screen.findByRole("heading", { name: "Orchid Hall Test" });

    // Assert: BKG-1001 appears as a booking under the selected venue.
    expect(screen.getAllByText("BKG-1001").length).toBeGreaterThan(0);
    expect(screen.getByText(/Booked/)).toBeInTheDocument();
  });

  // VEN-VIEW-06-B (AC6): the view renders active holds returned by the API; expiry is checked in the backend HTTP suite.
  it("VEN-VIEW-06-B: renders the API-provided HOLD-A as tentative", async () => {
    // Arrange: the API excludes expired HOLD-X at the specified fixed-time state.
    mockVenueApi({
      ...venue,
      name: "Marina Auditorium Test",
      reservations: [
        {
          id: "hold-a",
          eventName: "HOLD-A",
          start: "2030-10-10T01:00:00Z",
          end: "2030-10-10T02:00:00Z",
          status: "tentative",
          holdExpiresAt: "2030-10-10T00:30:00Z",
          affectedByUnavailablePeriod: false,
        },
      ],
    });

    // Act: open the selected venue's details.
    renderPage();
    await screen.findByRole("heading", { name: "Marina Auditorium Test" });

    // Assert: only the active tentative hold is displayed.
    expect(screen.getByText("HOLD-A")).toBeInTheDocument();
    expect(screen.getAllByText(/Tentative hold/).length).toBeGreaterThan(0);
    expect(screen.queryByText("HOLD-X")).not.toBeInTheDocument();
  });

  // AC4/6/7: staff can inspect details, schedule reasons and affected bookings.
  it("VEN-VIEW-07-A: shows the selected venue's accessibility, setup and turnaround", async () => {
    // Arrange: the detail API returns one persisted venue with both reservation types.
    mockVenueApi({ ...venue, name: "Orchid Hall Test" });

    // Act: open the venue detail route.
    renderPage();

    // Assert: detailed fields, period reason and booking impact are visible.
    expect(
      await screen.findByRole("heading", { name: "Orchid Hall Test" }),
    ).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(`/venues/${id}`);
    expect(screen.getByText("Wheelchair access")).toBeInTheDocument();
    expect(
      screen.queryByText(/Operating hours|Hours:/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("30 minutes before an event")).toBeInTheDocument();
    expect(screen.getByText("45 minutes after an event")).toBeInTheDocument();
    expect(screen.getAllByText(/Maintenance/).length).toBeGreaterThan(0);
    const affectedWelcomeRow = screen
      .getAllByText("Welcome Evening")
      .map((element) => element.closest("li"))
      .find((row) =>
        row?.textContent?.includes("Affected by an unavailable period"),
      );
    expect(affectedWelcomeRow).toBeInTheDocument();
    expect(
      within(affectedWelcomeRow!).getByText(
        "Affected by an unavailable period",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Workshop").closest("li")!).queryByText(
        "Affected by an unavailable period",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/Tentative hold/).length).toBeGreaterThan(0);
  });

  // VEN-VIEW-07-B (AC7): changing venue replaces all venue-specific detail values.
  it("VEN-VIEW-07-B: refreshes details when another venue is selected", async () => {
    // Arrange: two venues have different accessibility and timing requirements.
    const user = userEvent.setup();
    const secondId = "00000000-0000-4000-8000-000000000125";
    const secondVenue: VenueRecord = {
      ...venue,
      id: secondId,
      name: "Seminar Room 2 Test",
      accessibility: ["Step-free access"],
      setupTimeMinutes: 15,
      turnaroundTimeMinutes: 20,
    };
    let resolveSecond!: (record: VenueRecord) => void;
    const secondRequest = new Promise<VenueRecord>((resolve) => {
      resolveSecond = resolve;
    });
    apiMock.mockImplementation((path) =>
      path === `/venues/${id}` ? Promise.resolve(venue) : secondRequest,
    );
    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}`]}>
        <Link to={`/venue-records/${secondId}`}>
          Select Seminar Room 2 Test
        </Link>
        <Routes>
          <Route
            path="/venue-records/:id"
            element={<VenueRecordDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Conference Room" });

    // Act: select the other venue while the detail component stays mounted.
    await user.click(
      screen.getByRole("link", { name: "Select Seminar Room 2 Test" }),
    );

    // Assert: loading replaces the first venue immediately while the second request is pending.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading venue details…",
    );
    expect(
      screen.queryByRole("heading", { name: "Conference Room" }),
    ).not.toBeInTheDocument();
    resolveSecond(secondVenue);

    // Assert: only the selected venue's accessibility and time values remain.
    expect(
      await screen.findByRole("heading", { name: "Seminar Room 2 Test" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Step-free access")).toBeInTheDocument();
    expect(screen.getByText("15 minutes before an event")).toBeInTheDocument();
    expect(screen.getByText("20 minutes after an event")).toBeInTheDocument();
    expect(screen.queryByText("Wheelchair access")).not.toBeInTheDocument();
    expect(
      screen.queryByText("30 minutes before an event"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("45 minutes after an event"),
    ).not.toBeInTheDocument();
  });

  // Route changes must clear the prior venue while the next record is loading.
  it("SPM-124-REG-AC7-D: does not show stale details while another venue loads", async () => {
    // Arrange: delay the second response so the transient UI state is observable.
    const user = userEvent.setup();
    const secondId = "00000000-0000-4000-8000-000000000125";
    let resolveSecond!: (record: VenueRecord) => void;
    apiMock.mockResolvedValueOnce(venue).mockImplementationOnce(
      () =>
        new Promise<VenueRecord>((resolve) => {
          resolveSecond = resolve;
        }),
    );
    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}`]}>
        <Link to={`/venue-records/${secondId}`}>Select another venue</Link>
        <Routes>
          <Route
            path="/venue-records/:id"
            element={<VenueRecordDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Conference Room" });

    // Act: select the new detail route before its API request completes.
    await user.click(
      screen.getByRole("link", { name: "Select another venue" }),
    );

    // Assert: the old venue is not presented under the new URL.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading venue details…",
    );
    expect(
      screen.queryByRole("heading", { name: "Conference Room" }),
    ).not.toBeInTheDocument();

    resolveSecond({ ...venue, id: secondId, name: "Seminar Room 2 Test" });
    expect(
      await screen.findByRole("heading", { name: "Seminar Room 2 Test" }),
    ).toBeInTheDocument();
  });

  /** A late success from the previous route cannot replace the currently selected venue. */
  it("ignores a venue response after its detail route has been left", async () => {
    const user = userEvent.setup();
    const secondId = "00000000-0000-4000-8000-000000000125";
    let resolveFirst!: (record: VenueRecord) => void;
    const firstRequest = new Promise<VenueRecord>((resolve) => {
      resolveFirst = resolve;
    });
    apiMock.mockImplementation((path) =>
      path === `/venues/${id}`
        ? firstRequest
        : Promise.resolve({ ...venue, id: secondId, name: "Second Room" }),
    );
    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}`]}>
        <Link to={`/venue-records/${secondId}`}>Select second room</Link>
        <Routes>
          <Route
            path="/venue-records/:id"
            element={<VenueRecordDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("link", { name: "Select second room" }));
    expect(
      await screen.findByRole("heading", { name: "Second Room" }),
    ).toBeInTheDocument();

    resolveFirst(venue);

    expect(
      screen.getByRole("heading", { name: "Second Room" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Conference Room" }),
    ).not.toBeInTheDocument();
  });

  /** A late failure from the previous route cannot replace the currently selected venue details. */
  it("ignores a rejected venue response after its detail route has been left", async () => {
    const user = userEvent.setup();
    const secondId = "00000000-0000-4000-8000-000000000125";
    let rejectFirst!: (failure: Error) => void;
    const firstRequest = new Promise<VenueRecord>((_resolve, reject) => {
      rejectFirst = reject;
    });
    apiMock.mockImplementation((path) =>
      path === `/venues/${id}`
        ? firstRequest
        : Promise.resolve({ ...venue, id: secondId, name: "Second Room" }),
    );
    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}`]}>
        <Link to={`/venue-records/${secondId}`}>Select second room</Link>
        <Routes>
          <Route
            path="/venue-records/:id"
            element={<VenueRecordDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("link", { name: "Select second room" }));
    expect(
      await screen.findByRole("heading", { name: "Second Room" }),
    ).toBeInTheDocument();

    rejectFirst(new Error("old request failed"));

    expect(
      screen.getByRole("heading", { name: "Second Room" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // AC7: a missing record has a clear not-found state.
  it("SPM-124-REG-AC7-B: shows not found for an unknown venue", async () => {
    // Arrange: the API responds 404 for the selected identifier.
    apiMock.mockRejectedValue(
      new ApiError("Venue not found.", undefined, undefined, 404),
    );

    // Act: open its detail route.
    renderPage();

    // Assert: no stale venue details are presented.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Venue not found.",
    );
    expect(
      screen.queryByRole("heading", { name: "Conference Room" }),
    ).not.toBeInTheDocument();
  });

  // Non-404 failures must be actionable without being presented as a missing venue.
  it("SPM-124-REG-AC7-C: shows a retryable generic error for a failed detail request", async () => {
    // Arrange: a transport failure has no HTTP 404 status.
    apiMock.mockRejectedValue(new Error("offline"));

    // Act: open the detail route.
    renderPage();

    // Assert: the generic failure and retry control replace all venue details.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load venue details.",
    );
    expect(
      screen.getByRole("button", { name: "Try Again" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Conference Room" }),
    ).not.toBeInTheDocument();
  });

  /** Retrying a failed initial venue read loads the selected record. */
  it("retries the initial venue read after a temporary transport error", async () => {
    const user = userEvent.setup();
    apiMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(venue)
      .mockResolvedValueOnce([] as never);
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load venue details.",
    );

    await user.click(screen.getByRole("button", { name: "Try Again" }));

    expect(
      await screen.findByRole("heading", { name: "Conference Room" }),
    ).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(3);
  });

  /** Legacy venue details retain optional image and empty catalogue values. */
  it("renders an optional venue image and empty facility fields", async () => {
    useAppStore.setState({
      currentUser: {
        id: "staff",
        name: "Venue Staff",
        email: "staff@example.test",
        role: "venue_staff",
      },
    });
    apiMock
      .mockResolvedValueOnce({
        ...venue,
        facilities: [],
        layouts: [],
        accessibility: [],
        image: {
          name: "room.png",
          type: "image/png",
          size: 4,
          dataUrl: "data:image/png;base64,dGVzdA==",
        },
      })
      .mockResolvedValueOnce([] as never);
    renderPage();

    expect(
      await screen.findByRole("img", { name: "Conference Room venue" }),
    ).toHaveAttribute("src", "data:image/png;base64,dGVzdA==");
    expect(screen.getAllByText("None")).toHaveLength(3);
    expect(
      screen.queryByRole("heading", { name: "Check venue availability" }),
    ).not.toBeInTheDocument();
  });

  // Empty schedule collections have explicit states instead of blank cards.
  it("SPM-124-REG-AC4-A: shows empty unavailable-period and reservation states", async () => {
    // Arrange: the selected venue has no future schedule records.
    mockVenueApi({
      ...venue,
      unavailablePeriods: [],
      reservations: [],
    });

    // Act: load the detail page.
    renderPage();

    // Assert: both schedule sections explain their independently empty state.
    expect(
      await screen.findByText("No current or scheduled unavailable periods."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No upcoming bookings or active tentative holds."),
    ).toBeInTheDocument();
  });

  // SPM-122 / VEN-UNAVAIL-04-A/07-A: affected bookings remain visible after the detail reload.
  it("keeps the saved affected-booking list visible while refreshing the venue", async () => {
    // Arrange a staff session and a save response with one impacted event.
    useAppStore.setState({
      currentUser: {
        id: "staff",
        name: "Venue Staff",
        email: "",
        role: "venue_staff",
      },
    });
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce({ ...venue, unavailablePeriods: [] })
      .mockResolvedValueOnce({
        period: {
          id: "new",
          start: "2030-01-12T04:15:00.000Z",
          end: "2030-01-12T04:45:00.000Z",
          reason: "Maintenance",
        },
        affectedBookings: [
          {
            id: "b1",
            eventName: "Affected Workshop",
            start: "2030-01-12T05:00:00.000Z",
            end: "2030-01-12T06:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        ...venue,
        unavailablePeriods: [
          {
            id: "new",
            start: "2030-01-12T04:15:00.000Z",
            end: "2030-01-12T04:45:00.000Z",
            reason: "Maintenance",
          },
        ],
      });
    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });

    // Act: create and confirm one unavailable period through the actual detail page.
    await user.click(screen.getByRole("button", { name: "Mark Unavailable" }));
    await user.type(
      screen.getByLabelText(/Unavailable start/),
      "2030-01-12T12:15",
    );
    await user.type(
      screen.getByLabelText(/Unavailable end/),
      "2030-01-12T12:45",
    );
    await user.type(screen.getByLabelText(/Reason/), "Maintenance");
    await user.click(
      screen.getByRole("button", { name: "Review unavailability" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm unavailability" }),
    );

    // Assert both the refreshed period and the affected event are present together.
    expect(await screen.findByText(/Affected Workshop/)).toBeInTheDocument();
    expect((await screen.findAllByText(/Maintenance/)).length).toBeGreaterThan(
      0,
    );
    expect(apiMock).toHaveBeenCalledTimes(3);
  });
});
