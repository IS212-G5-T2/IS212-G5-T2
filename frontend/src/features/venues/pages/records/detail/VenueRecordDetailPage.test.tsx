// frontend/src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx
// SPM-124: AC4/6/7; VEN-VIEW-06-A/B, 07-A/B and detail error coverage.
// SPM-124-REG-* IDs are local regression cases; VEN-VIEW-* IDs refer to published cases.
// Active venue holds require an explicit future expiry; ordinary pending requests are not reservations.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
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
afterEach(() => {
  cleanup();
  useAppStore.setState({ currentUser: originalUser });
});

function renderPage(initialEntry = `/venue-records/${id}`) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/venue-records/:id" element={<VenueRecordDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
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
    startDateTime: eventId === "event-52" ? "2030-01-13T04:00:00.000Z" : eventId === "event-53" ? "2030-01-14T04:00:00.000Z" : "2030-01-12T04:00:00.000Z",
    endDateTime: eventId === "event-52" ? "2030-01-13T05:00:00.000Z" : eventId === "event-53" ? "2030-01-14T05:00:00.000Z" : "2030-01-12T05:00:00.000Z",
    expectedAttendance: 20,
    venueRequirements: {
      minCapacity: 10,
      accessibility: [],
      facilities: [],
      layout: "",
    },
    equipmentNeeds: "",
    registrationEnabled: false,
    changeRequests: [],
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
  return <>
    <button onClick={() => navigate(`/venue-records/${id}?eventId=event-52`)}>Switch event</button>
    <button onClick={() => navigate(`/venue-records/${id}?eventId=event-53`)}>Switch again</button>
  </>;
}

describe("VenueRecordDetailPage (SPM-124)", () => {
  /** SPM-51 sends the selected event's time range to the availability check in Singapore local time. */
  it("prefills event and time range from a Search Venues link", async () => {
    setCoordinator(["event-1"]);
    apiMock.mockResolvedValue(venue);
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("heading", { name: "Conference Room" });
    expect(screen.getByLabelText("Event starts")).toHaveValue("2030-01-12T12:00");
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T13:00");
    expect(screen.getByRole("link", { name: "Back to Search Venues" })).toHaveAttribute(
      "href",
      "/venues?eventId=event-1",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh schedule" }));
    expect(await screen.findByLabelText("Event for booking request")).toHaveValue("event-1");
  });

  /** SPM-51 refresh regression: a cold store fetches the linked event and prefills its range and request selection. */
  it("loads URL event context and prefills availability after refresh", async () => {
    setCoordinator();
    const requestedEvent = coordinatorEvent("event-1");
    apiMock.mockImplementation(async (path) => {
      if (path === `/venues/${id}`) return venue as never;
      if (path === "/events/event-1") return requestedEvent as never;
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("heading", { name: "Conference Room" });
    await waitFor(() => expect(screen.getByLabelText("Event starts")).toHaveValue("2030-01-12T12:00"));
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T13:00");
    expect(screen.getByLabelText("Event for booking request")).toHaveValue("event-1");
    expect(apiMock).toHaveBeenCalledWith("/events/event-1");
    expect(useAppStore.getState().events).toContainEqual(requestedEvent);
  });

  /** SPM-51 event-load failure is visible and retry restores the selected event range. */
  it("shows a retryable event-load error on availability details", async () => {
    setCoordinator();
    const requestedEvent = coordinatorEvent("event-1");
    let eventAttempts = 0;
    apiMock.mockImplementation(async (path) => {
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

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the selected event");
    await user.click(screen.getByRole("button", { name: "Retry event" }));
    await waitFor(() => expect(screen.getByLabelText("Event starts")).toHaveValue("2030-01-12T12:00"));
    expect(screen.getByLabelText("Event for booking request")).toHaveValue("event-1");
  });

  /** SPM-51 unavailable linked events receive a specific not-found message instead of an empty booking selector. */
  it("explains when the event linked in the URL no longer exists", async () => {
    setCoordinator();
    apiMock.mockImplementation(async (path) => {
      if (path === `/venues/${id}`) return venue as never;
      if (path === "/events/event-missing") throw new ApiError("Not found", undefined, undefined, 404);
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage(`/venue-records/${id}?eventId=event-missing`);

    expect(await screen.findByRole("alert")).toHaveTextContent("The selected event could not be found");
    expect(screen.queryByRole("region", { name: "Review booking request" })).not.toBeInTheDocument();
  });

  /** SPM-51 route changes discard an older event response so only the current query controls the selected range. */
  it("ignores stale event success and failure after the availability URL changes", async () => {
    setCoordinator(["event-99"]);
    const user = userEvent.setup();
    const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
    apiMock.mockImplementation((path) => {
      if (path === `/venues/${id}`) return Promise.resolve(venue) as never;
      return new Promise((resolve, reject) => pending.set(path, { resolve, reject })) as never;
    });
    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}?eventId=event-51`]}>
        <SwitchDetailEvent />
        <Routes>
          <Route path="/venue-records/:id" element={<VenueRecordDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Conference Room" });
    await user.click(screen.getByRole("button", { name: "Switch event" }));

    await waitFor(() => expect(pending.has("/events/event-52")).toBe(true));
    await user.click(screen.getByRole("button", { name: "Switch again" }));
    await waitFor(() => expect(pending.has("/events/event-53")).toBe(true));
    pending.get("/events/event-53")!.resolve(coordinatorEvent("event-53"));
    await waitFor(() => expect(screen.getByLabelText("Event starts")).toHaveValue("2030-01-14T12:00"));
    pending.get("/events/event-52")!.resolve(coordinatorEvent("event-52"));
    pending.get("/events/event-51")!.reject(new Error("late failure"));
    await waitFor(() => expect(useAppStore.getState().events.map((event) => event.id)).toEqual(["event-53", "event-99"]));
    expect(screen.getByLabelText("Event starts")).toHaveValue("2030-01-14T12:00");
  });

  /** Clicking the selected time clears the requested range and returns the coordinator to an unselected state. */
  it("clears the selected event range when its calendar block is clicked", async () => {
    setCoordinator(["event-1"]);
    const user = userEvent.setup();
    apiMock.mockResolvedValue(venue);
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("heading", { name: "Conference Room" });
    const schedule = screen.getByRole("region", { name: "Venue schedule" });
    const selectedEvent = schedule.querySelector(".venue-schedule-selected");
    expect(selectedEvent).toBeInTheDocument();
    expect(selectedEvent).toHaveTextContent(/\d/);
    expect(selectedEvent).not.toHaveTextContent("Selected event time");
    expect(selectedEvent).not.toHaveTextContent("Requested event time");
    expect(selectedEvent?.querySelector(".venue-schedule-event-time")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));
    await screen.findByText("This time is available for this venue.");
    expect(screen.getByRole("button", { name: "Refresh schedule" })).toBeInTheDocument();
    expect(screen.getByText(/availability reflects the displayed schedule/i)).toHaveTextContent("submitting also checks again on the server");
    await user.click(screen.getByRole("button", { name: "Continue to booking request" }));
    expect(screen.getByRole("region", { name: "Review booking request" })).toBeInTheDocument();

    await user.click(schedule.querySelector(".venue-schedule-selected")!);

    expect(screen.getByLabelText("Event starts")).toHaveValue("");
    expect(screen.getByLabelText("Event ends")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Review booking request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue to booking request" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh schedule" })).toBeDisabled();
  });

  /** VEN-AVL-01-A / AC1: equal start and end instants are invalid and cannot enter the booking-request review. */
  it("does not check availability or continue with a zero-duration event", async () => {
    setCoordinator(["event-1"]);
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(venue).mockResolvedValueOnce(venue);
    renderPage(`/venue-records/${id}?eventId=event-1`);
    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2030-01-12T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Event ends"), {
      target: { value: "2030-01-12T12:00" },
    });

    const checkButton = screen.getByRole("button", {
      name: "Refresh schedule",
    });
    expect(checkButton).toBeDisabled();
    await user.click(checkButton);

    expect(apiMock).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Continue to booking request" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Review booking request" }),
    ).not.toBeInTheDocument();
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

  /** VEN-AVL-07-A / VEN-AVL-08-A: a conflict blocks request submission after the coordinator checks a venue. */
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
          changeRequests: [],
          createdAt: "2030-01-01T00:00:00.000Z",
          updatedAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(venue).mockResolvedValueOnce(venue);

    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2026-10-05T20:00" },
    });
    fireEvent.change(screen.getByLabelText("Event ends"), {
      target: { value: "2026-10-05T21:00" },
    });
    await user.click(
      screen.getByRole("button", { name: "Refresh schedule" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Confirmed booking");
    expect(screen.getByRole("alert")).toHaveTextContent("Welcome Evening");
    expect(
      screen.queryByRole("button", { name: "Submit booking request" }),
    ).not.toBeInTheDocument();
    expect(useAppStore.getState().bookings).toEqual([]);
  });

  /** VEN-AVL-06-A: a schedule-derived available range continues into a booking request. */
  it("SPM-51: submits a request for a schedule-derived available range", async () => {
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
          changeRequests: [],
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
      .mockResolvedValueOnce(venue)
      .mockResolvedValueOnce({ bookingReference: "VB-00000000" });

    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2030-01-12T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Event ends"), {
      target: { value: "2030-01-12T13:00" },
    });
    await user.click(
      screen.getByRole("button", { name: "Refresh schedule" }),
    );
    expect(apiMock).toHaveBeenCalledTimes(2);
    await user.selectOptions(
      screen.getByLabelText("Event for booking request"),
      "event-2",
    );
    await user.click(
      screen.getByRole("button", { name: "Continue to booking request" }),
    );

    const review = screen.getByRole("region", {
      name: "Review booking request",
    });
    expect(review).toHaveTextContent("Conference Room");
    expect(review).toHaveTextContent("Second event");
    expect(review).toHaveTextContent("Expected attendance20");
    expect(review).toHaveTextContent("12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 (SGT)");
    expect(apiMock).toHaveBeenCalledTimes(2);
    await user.click(
      within(review).getByRole("button", { name: "Back to availability" }),
    );
    expect(
      screen.queryByRole("region", { name: "Review booking request" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Continue to booking request" }),
    );

    const confirmedReview = screen.getByRole("region", {
      name: "Review booking request",
    });
    await user.click(
      within(confirmedReview).getByRole("button", {
        name: "Submit booking request",
      }),
    );

    expect(apiMock).toHaveBeenNthCalledWith(
      3,
      `/venues/${id}/booking-requests`,
      {
        method: "POST",
        body: JSON.stringify({
          eventId: "event-2",
          start: "2030-01-12T04:00:00.000Z",
          end: "2030-01-12T05:00:00.000Z",
        }),
      },
    );
    expect(useAppStore.getState().bookings).toEqual([]);
    expect(screen.getByText(/Reference: VB-00000000/)).toBeInTheDocument();
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
          changeRequests: [],
          createdAt: "2030-01-01T00:00:00.000Z",
          updatedAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce(venue)
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
    await user.click(
      screen.getByRole("button", { name: "Refresh schedule" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Continue to booking request" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Submit booking request" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("new booking");
    expect(
      screen.queryByText(/Booking request submitted/),
    ).not.toBeInTheDocument();
    expect(useAppStore.getState().bookings).toEqual([]);
    expect(apiMock).toHaveBeenCalledTimes(3);
  });

  /** API and transport failures while refreshing availability show an actionable error. */
  it.each([
    { failure: new ApiError("Schedule service unavailable.", undefined, undefined, 503), message: "Schedule service unavailable.", label: "HTTP 503" },
    { failure: new Error("offline"), message: "Unable to refresh venue availability. Try again.", label: "network error" },
  ])("shows the expected refresh message after $label", async ({ failure, message }) => {
    setCoordinator(["event-1"]);
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(venue).mockRejectedValueOnce(failure);
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
  });

  /** A transport failure during submission reports no success and keeps the request retryable. */
  it("shows a generic submission error when the API transport fails", async () => {
    setCoordinator(["event-1"]);
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce(venue)
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
    await user.click(
      screen.getByRole("button", { name: "Refresh schedule" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Continue to booking request" }),
    );
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

  /** SPM-54 AC5: a pending request without a Venue Staff hold is absent from the tentative schedule. */
  it("does not display pending requests without a hold expiry as tentative reservations", async () => {
    setCoordinator();
    const user = userEvent.setup();
    const emptyVenue = { ...venue, reservations: [], unavailablePeriods: [] };
    apiMock.mockResolvedValueOnce(emptyVenue).mockResolvedValueOnce(emptyVenue);
    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });
    expect(
      screen.getByText("No bookings, active holds or unavailable periods."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(
      screen.getByText("No bookings, active holds or unavailable periods."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2030-01-15T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Event ends"), {
      target: { value: "2030-01-15T13:00" },
    });
    await user.click(
      screen.getByRole("button", { name: "Refresh schedule" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "available for this venue",
    );
    expect(
      screen.getByText(/Choose an event in the venue catalogue/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit booking request" }),
    ).not.toBeInTheDocument();
  });

  /** VEN-AVL-02-A/B/C/05-A/B and VEN-AVL-03-A/B: calendar/list both show the schedule, free slot, reasons, hold expiry and preserve selection. */
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
      .mockResolvedValueOnce(scheduledVenue);

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
    expect(screen.getByRole("region", { name: "Venue schedule" })).toHaveTextContent("Available");
    const expectedGaps = [
      "12 Jan 2030, 12:00 – 12 Jan 2030, 12:30 (SGT)",
      "12 Jan 2030, 16:45 – 12 Jan 2030, 17:00 (SGT)",
      "12 Jan 2030, 17:30 – 12 Jan 2030, 18:00 (SGT)",
    ];
    const calendar = screen.getByRole("region", { name: "Venue schedule" });
    expect(calendar.querySelector("[role='grid'][aria-colcount='7']")).toBeInTheDocument();
    expect(calendar.querySelectorAll("[role='gridcell'][data-date]").length).toBeGreaterThan(1);
    expect(calendar).toHaveTextContent("Setup buffer");
    expect(calendar).toHaveTextContent("Turnaround buffer");
    const selectedBlock = calendar.querySelector(".venue-schedule-selected");
    expect(selectedBlock).toBeInTheDocument();
    expect(selectedBlock).toHaveTextContent(/\d/);
    expect(selectedBlock).not.toHaveTextContent("Selected event time");
    expect(selectedBlock).not.toHaveTextContent("Requested event time");
    const bookingEvent = calendar.querySelector(".venue-schedule-booking");
    expect(bookingEvent).toHaveTextContent("Confirmed booking");
    expect(bookingEvent?.closest("[role='gridcell']")).toHaveAttribute("data-date", "2030-01-12");
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
    expect(list).toHaveTextContent("12 Jan 2030, 12:00 – 12 Jan 2030, 18:00 (SGT)");
    for (const gap of expectedGaps) expect(list).toHaveTextContent(gap);
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
    expect(apiMock).toHaveBeenCalledTimes(2);
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
      path === `/venues/${id}` ? venue as never : secondVenue as never,
    );

    render(
      <MemoryRouter initialEntries={[`/venue-records/${id}`]}>
        <Link to={`/venue-records/${secondId}`}>Select second venue</Link>
        <Routes>
          <Route path="/venue-records/:id" element={<VenueRecordDetailPage />} />
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

  /** VEN-AVL-02 / SPM-51 AC5: moving the time-grid week changes the visible dates and recomputes free periods for that week. */
  it("navigates the real time grid and shows availability in the newly visible week", async () => {
    const originalNow = Date.now();
    vi.setSystemTime(new Date("2030-01-12T04:00:00.000Z"));
    setCoordinator(["event-1"]);
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...venue, reservations: [], unavailablePeriods: [] });
    renderPage("/venue-records/00000000-0000-4000-8000-000000000124?eventId=event-1");

    try {
      await screen.findByRole("heading", { name: "Conference Room" });
      const calendar = screen.getByRole("region", { name: "Venue schedule" });
      expect(calendar.querySelector("[role='grid'][aria-colcount='7']")).toBeInTheDocument();
      expect(calendar.querySelectorAll("[role='gridcell'][data-date]")).toHaveLength(7);
      expect(calendar.querySelector("[role='gridcell'][data-date='2030-01-06']")).toBeInTheDocument();
      await user.click(within(calendar).getByRole("tab", { name: "Day view" }));
      expect(calendar.querySelector("[role='grid'][aria-colcount='1']")).toBeInTheDocument();
      expect(within(calendar).getByRole("heading")).toHaveTextContent("January 12, 2030");
      await user.click(within(calendar).getByRole("tab", { name: "Week view" }));

      await user.click(within(calendar).getByRole("button", { name: "Next Week" }));
      await within(calendar).findByRole("columnheader", { name: "January 13, 2030" });
      expect(calendar.querySelector("[role='gridcell'][data-date='2030-01-13']")).toBeInTheDocument();
      expect(calendar.querySelector("[role='gridcell'][data-date='2030-01-14']")).toHaveTextContent("Available");

      await user.click(within(calendar).getByRole("button", { name: "Previous Week" }));
      await within(calendar).findByRole("columnheader", { name: "January 6, 2030" });
      expect(calendar.querySelector("[role='gridcell'][data-date='2030-01-06']")).toBeInTheDocument();

      await user.click(within(calendar).getByRole("tab", { name: "Day view" }));
      expect(calendar.querySelector("[role='grid'][aria-colcount='1']")).toBeInTheDocument();
      expect(within(calendar).getByRole("heading")).toHaveTextContent("January 6, 2030");
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.setSystemTime(originalNow);
    }
  });

  /** SPM-51 AC1: changing the selected event period clears the prior availability result. */
  it("recomputes availability when the selected event changes the requested dates", async () => {
    setCoordinator(["event-1", "event-2"]);
    useAppStore.setState((state) => ({
      events: state.events.map((event) => event.id === "event-2"
        ? { ...event, startDateTime: "2030-01-13T06:00:00.000Z", endDateTime: "2030-01-13T07:00:00.000Z" }
        : event),
    }));
    const user = userEvent.setup();
    apiMock.mockResolvedValue(venue);
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("heading", { name: "Conference Room" });
    await user.click(screen.getByRole("button", { name: "Refresh schedule" }));
    expect(screen.getByRole("status")).toHaveTextContent("available");
    await user.selectOptions(screen.getByLabelText("Event for booking request"), "event-2");
    expect(screen.getByLabelText("Event starts")).toHaveValue("2030-01-13T14:00");
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-13T15:00");
    expect(screen.getByRole("status")).toHaveTextContent("available");
    expect(screen.getByRole("button", { name: "Continue to booking request" })).toBeInTheDocument();
  });

  /** SPM-51 AC8: zero setup and turnaround values show the booking without zero-length buffer rows. */
  it("renders a booking without buffer entries when both venue buffers are zero", async () => {
    setCoordinator(["event-1"]);
    apiMock.mockResolvedValue({
      ...venue,
      setupTimeMinutes: 0,
      turnaroundTimeMinutes: 0,
      reservations: [{ id: "booking-no-buffer", eventName: "No Buffer Booking", start: "2030-01-12T04:00:00Z", end: "2030-01-12T05:00:00Z", status: "booked", affectedByUnavailablePeriod: false }],
    });
    renderPage(`/venue-records/${id}?eventId=event-1`);

    await screen.findByRole("heading", { name: "Conference Room" });
    const calendar = screen.getByRole("region", { name: "Venue schedule" });
    expect(calendar).toHaveTextContent("No Buffer Booking");
    expect(calendar).not.toHaveTextContent("Setup buffer");
    expect(calendar).not.toHaveTextContent("Turnaround buffer");
  });

  /** VEN-AVL-10-A/B: the backend-clock-filtered schedule displays and blocks only the active hold. */
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

  /** VEN-AVL-09-A/B: a booking affected by a setup-overlapping blockout remains recorded and visibly flagged. */
  it("retains and flags an existing booking affected only through its setup buffer", async () => {
    apiMock.mockResolvedValueOnce({
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
    });

    renderPage();
    await screen.findByRole("heading", { name: "Conference Room" });

    expect(screen.getByText("Kept Workshop")).toBeInTheDocument();
    expect(
      screen.getByText("Affected by an unavailable period"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Setup access restriction/)).toBeInTheDocument();
  });

  // VEN-VIEW-06-A (AC6): the selected venue shows its upcoming confirmed booking.
  it("VEN-VIEW-06-A: shows BKG-1001 as a booking for Orchid Hall only", async () => {
    // Arrange: the API returns the specified booking on Orchid Hall.
    apiMock.mockResolvedValue({
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
    expect(screen.getByText("BKG-1001")).toBeInTheDocument();
    expect(screen.getByText(/Booked/)).toBeInTheDocument();
    expect(screen.queryByText(/Tentative hold/)).not.toBeInTheDocument();
  });

  // VEN-VIEW-06-B (AC6): the view renders active holds returned by the API; expiry is checked in the backend HTTP suite.
  it("VEN-VIEW-06-B: renders the API-provided HOLD-A as tentative", async () => {
    // Arrange: the API excludes expired HOLD-X at the specified fixed-time state.
    apiMock.mockResolvedValue({
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
    expect(screen.getByText(/Tentative hold/)).toBeInTheDocument();
    expect(screen.queryByText("HOLD-X")).not.toBeInTheDocument();
  });

  // AC4/6/7: staff can inspect details, schedule reasons and affected bookings.
  it("VEN-VIEW-07-A: shows the selected venue's accessibility, setup and turnaround", async () => {
    // Arrange: the detail API returns one persisted venue with both reservation types.
    apiMock.mockResolvedValue({ ...venue, name: "Orchid Hall Test" });

    // Act: open the venue detail route.
    renderPage();

    // Assert: detailed fields, period reason and booking impact are visible.
    expect(
      await screen.findByRole("heading", { name: "Orchid Hall Test" }),
    ).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(`/venues/${id}`);
    expect(screen.getByText("Wheelchair access")).toBeInTheDocument();
    expect(screen.queryByText(/Operating hours|Hours:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Open 24 hours$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^24\/7$/i)).not.toBeInTheDocument();
    expect(screen.getByText('Weekdays only')).toBeInTheDocument();
    expect(screen.getByText("30 minutes before an event")).toBeInTheDocument();
    expect(screen.getByText("45 minutes after an event")).toBeInTheDocument();
    expect(screen.getByText(/Maintenance/)).toBeInTheDocument();
    expect(
      within(screen.getByText("Welcome Evening").closest("li")!).getByText(
        "Affected by an unavailable period",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Workshop").closest("li")!).queryByText(
        "Affected by an unavailable period",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Tentative hold/)).toBeInTheDocument();
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
      .mockResolvedValueOnce(venue);
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load venue details.",
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { name: "Conference Room" }),
    ).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
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
    apiMock.mockResolvedValueOnce({
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
    });
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
    apiMock.mockResolvedValue({
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
    await user.type(screen.getByLabelText(/Unavailable start/), "2030-01-12T12:15");
    await user.type(screen.getByLabelText(/Unavailable end/), "2030-01-12T12:45");
    await user.type(screen.getByLabelText(/Reason/), "Maintenance");
    await user.click(
      screen.getByRole("button", { name: "Review unavailability" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm unavailability" }),
    );

    // Assert both the refreshed period and the affected event are present together.
    expect(await screen.findByText(/Affected Workshop/)).toBeInTheDocument();
    expect(await screen.findByText(/Maintenance/)).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(3);
  });
});
