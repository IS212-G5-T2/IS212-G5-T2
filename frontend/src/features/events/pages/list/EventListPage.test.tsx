import { StrictMode } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventCreatePage } from "@/features/events/pages/create/EventCreatePage";
import { EventListPage } from "@/features/events/pages/list/EventListPage";
import { api } from "@/utils/api";
import { fetchMyChangeRequests, fetchNewChangeRequestEventIds } from "@/features/events/api/change-requests-api";
import { useAppStore } from "@/store/useAppStore";
import { deferred } from "@/test/deferred";
import type { EventRecord } from "@/types";
import type { DraftRecord } from "@/features/events/types/draft";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

// SPM-64: the organiser's pending change requests load separately from the event list.
vi.mock("@/features/events/api/change-requests-api", () => ({
  fetchMyChangeRequests: vi.fn(),
  markChangeRequestNoticesRead: vi.fn(() => Promise.resolve()),
  fetchNewChangeRequestEventIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));

// SPM-155 D13b: the organiser's cancellation request indicator loads separately too. These SPM-36 and SPM-94 tests
// count and queue /events loads through api(), so the indicator's own request is kept out of that queue.
vi.mock("@/features/events/api/cancellation-requests-api", () => ({
  fetchMyCancellationRequests: vi.fn(() => Promise.resolve([])),
}));

const apiMock = vi.mocked(api);
const pendingRequestsMock = vi.mocked(fetchMyChangeRequests);

// SPM-94: the organiser list also reads /requests for drafts. These helpers serve /requests with no drafts and
// count only event-list loads, so the SPM-36 load-sequence tests below keep their meaning.
function serveEvents(...loads: Array<() => Promise<EventRecord[]>>) {
  apiMock.mockImplementation(((path: string) =>
    path === "/requests" ? Promise.resolve([]) : loads.shift()!()) as typeof api);
}
function eventLoads() {
  return apiMock.mock.calls.filter(([path]) => path === "/events").length;
}

function submittedEvent(): EventRecord {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setHours(21, 0, 0, 0);

  return {
    id: "00000000-0000-4000-8000-000000000036",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "current-user",
    organiserName: "Demo Organiser",
    status: "submitted",
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    expectedAttendance: 80,
    venueRequirements: {
      minCapacity: 80,
      layout: "Banquet",
      facilities: ["Catering"],
      accessibility: ["Wheelchair ramps"],
    },
    attachments: [],
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Fixed clock for the suite: relative fixtures ("7 days from now") are computed from T0, so they never depend on the run date.
const T0 = new Date("2026-10-20T10:00:00+08:00");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  // Only Date is faked: a fully faked clock stalls userEvent and waitFor in this suite (the run hung), so timers stay real.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  useAppStore.setState({ eventListFilters: { attendee: "upcoming", status: null } });
  vi.clearAllMocks();
  // clearAllMocks keeps queued *Once values; reset them so one test's leftovers can't reach the next.
  apiMock.mockReset();
  apiMock.mockResolvedValue([]);
  pendingRequestsMock.mockReset();
  pendingRequestsMock.mockResolvedValue([]);
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: true,
    currentUser: {
      id: "current-user",
      name: "Demo Organiser",
      email: "organiser@example.test",
      role: "organiser",
    },
    events: [],
  });
});

describe("EventListPage", () => {
  // SPM-36 Test Case EVE-CRE-01-A
  // Kills: the create-event link not opening the Event Request form from Event Planning.
  it("EVE-CRE-01-A opens the Event Request form from Event Planning", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/planning"]}>
        <Routes>
          <Route path="/planning" element={<EventListPage />} />
          <Route path="/events/create" element={<EventCreatePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Event Planning" })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /create event/i }));

    expect(screen.getByRole("heading", { name: /create new event request/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /event name/i })).toBeTruthy();
  });

  // SPM-36 Test Case EVE-CRE-07-B
  // Kills: a submitted event missing from My Events, or its badge reading something other than Submitted.
  it("EVE-CRE-07-B shows a submitted event under My Events", async () => {
    const event = submittedEvent();
    apiMock.mockResolvedValue([event]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "My Events" })).toBeTruthy();
    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    expect(screen.getByText("Community building")).toBeTruthy();
    // The status filter's "Submitted" checkbox is also a span, so the badge is read from the card itself.
    expect(within(screen.getByText("Welcome Evening").closest("a")!).getByText("Submitted", { selector: "span" })).toBeTruthy();
  });

  // Kills: a pending change request marked on the wrong card (both or neither), or the pending fetch not called with 'Pending'.
  /** REQ-CHANGE-05-A: an event with a change request awaiting review is marked on My Events; others are not. */
  it("REQ-CHANGE-05-A marks events with a pending change request on My Events", async () => {
    const pendingEvent = submittedEvent();
    const otherEvent = { ...submittedEvent(), id: "00000000-0000-4000-8000-000000000037", name: "Other Evening" };
    apiMock.mockResolvedValue([pendingEvent, otherEvent]);
    pendingRequestsMock.mockResolvedValue([
      { id: "cr-1", eventId: pendingEvent.id, eventName: pendingEvent.name, status: "Pending", changes: [], requiresSafetyCheck: false, recheck: [], safetyCheckReset: false, requestedBy: "Demo Organiser", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const pendingCard = (await screen.findByText("Welcome Evening")).closest("a")!;
    expect(await within(pendingCard).findByText("Change requested: Pending")).toBeTruthy();
    expect(within(screen.getByText("Other Evening").closest("a")!).queryByText("Change requested: Pending")).toBeNull();
    expect(pendingRequestsMock).toHaveBeenCalledWith("Pending");
  });

  // Kills: no notice when pending requests fail, Retry not re-fetching them, or the notice left showing after recovery.
  /** REQ-CHANGE-05-F: if pending change requests cannot load, the events still show with a visible notice and Retry. */
  it("REQ-CHANGE-05-F shows a notice with Retry when pending change requests cannot load", async () => {
    const event = submittedEvent();
    apiMock.mockResolvedValue([event]);
    pendingRequestsMock
      .mockRejectedValueOnce(new Error("The service is temporarily unavailable."))
      .mockResolvedValueOnce([
        { id: "cr-1", eventId: event.id, eventName: event.name, status: "Pending", changes: [], requiresSafetyCheck: false, recheck: [], safetyCheckReset: false, requestedBy: "Demo Organiser", createdAt: "2026-10-01T00:00:00.000Z" },
      ]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Could not check your events for pending change requests. The service is temporarily unavailable.",
    );
    expect(screen.queryByText("Change requested: Pending")).toBeNull();
    await userEvent.setup().click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Change requested: Pending")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Kills: the pending section missing the event name, the 'Demo Organiser · Room layout' summary, or the review link target.
  /** REVIEW-CHANGE-01-A (SPM-65 AC1): a coordinator sees their pending change requests and the badge. */
  it("REVIEW-CHANGE-01-A lists the coordinator's pending change requests and marks the event", async () => {
    const event = { ...submittedEvent(), coordinatorId: "coordinator-1" };
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator One", email: "coordinator@example.test", role: "coordinator" },
    });
    apiMock.mockResolvedValue([event]);
    pendingRequestsMock.mockResolvedValue([
      { id: "cr-1", eventId: event.id, eventName: event.name, status: "Pending", changes: [{ field: "layout", originalValue: "Banquet", proposedValue: "Theatre" }], requiresSafetyCheck: false, recheck: [], safetyCheckReset: false, requestedBy: "Demo Organiser", organiserName: "Demo Organiser", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const section = await screen.findByRole("region", { name: "Pending change requests" });
    expect(section).toHaveTextContent("Welcome Evening");
    expect(section).toHaveTextContent("Demo Organiser · Room layout");
    expect(within(section).getByRole("link", { name: "Review Change Request" })).toHaveAttribute("href", `/events/${event.id}`);
    expect(await screen.findByText("Change requested: Pending")).toBeTruthy();
  });

  // Kills: the pending section placed below Assignment updates, or the New tag missing from unopened requests.
  /** REVIEW-CHANGE-01-F: the pending list is at the top, above Assignment Updates, and tags unopened requests New. */
  it("REVIEW-CHANGE-01-F puts pending change requests first and tags unopened ones New", async () => {
    const event = { ...submittedEvent(), coordinatorId: "coordinator-1" };
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator One", email: "coordinator@example.test", role: "coordinator" },
    });
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/notifications"
          ? [{ id: "n1", audienceRole: "coordinator", type: "coordinator_assignment", message: "Assigned to you.", relatedEventId: event.id, read: false, createdAt: "2026-10-01T00:00:00.000Z" }]
          : [event],
      ),
    );
    vi.mocked(fetchNewChangeRequestEventIds).mockResolvedValue(new Set([event.id]));
    pendingRequestsMock.mockResolvedValue([
      { id: "cr-1", eventId: event.id, eventName: event.name, status: "Pending", changes: [], requiresSafetyCheck: false, recheck: [], safetyCheckReset: false, requestedBy: "Demo Organiser", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const pendingSection = await screen.findByRole("region", { name: "Pending change requests" });
    expect(within(pendingSection).getByText("New")).toBeTruthy();
    const updates = await screen.findByRole("region", { name: "Assignment updates" });
    expect(pendingSection.compareDocumentPosition(updates) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Kills: the pending list hidden when the New-tag lookup fails, or a notice shown for it.
  it("REVIEW-CHANGE-01-F still lists pending requests when the New tags cannot load", async () => {
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator One", email: "coordinator@example.test", role: "coordinator" },
    });
    vi.mocked(fetchNewChangeRequestEventIds).mockRejectedValueOnce(new Error("offline"));
    pendingRequestsMock.mockResolvedValue([
      { id: "cr-1", eventId: "e-1", eventName: "Welcome Evening", status: "Pending", changes: [], requiresSafetyCheck: false, recheck: [], safetyCheckReset: false, requestedBy: "Demo Organiser", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
    const view = render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const section = await screen.findByRole("region", { name: "Pending change requests" });
    expect(within(section).queryByText("New")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    // A result that arrives after leaving the page changes nothing: no console error is raised by the late result.
    let resolve!: (ids: Set<string>) => void;
    vi.mocked(fetchNewChangeRequestEventIds).mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    view.unmount();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    ).unmount();
    await act(async () => {
      resolve(new Set(["e-1"]));
    });
    try {
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  // Kills: the 'No pending change requests.' empty state missing for a coordinator with nothing pending.
  /** REVIEW-CHANGE-01-D: with nothing pending the coordinator sees the empty state; attendees see neither. */
  it("REVIEW-CHANGE-01-D shows the coordinator's empty state", async () => {
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator One", email: "coordinator@example.test", role: "coordinator" },
    });
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("No pending change requests.")).toBeTruthy();
  });

  /** REQ-CHANGE-05-F: a failure that arrives after leaving My Events shows nothing. */
  it("REQ-CHANGE-05-F ignores a pending change request failure after unmounting", async () => {
    apiMock.mockResolvedValue([submittedEvent()]);
    let reject!: (error: unknown) => void;
    pendingRequestsMock.mockImplementation(() => new Promise((_, r) => (reject = r)));
    const view = render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(pendingRequestsMock).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      reject(new Error("late"));
    });
    // After unmount the DOM is gone, so only the pending-request mock is observable: the late failure must not refetch.
    expect(pendingRequestsMock).toHaveBeenCalledTimes(1);
  });

  // Kills: a pending-request failure without a message not showing the notice.
  /** REQ-CHANGE-05-F: a failure without a message still shows the notice. */
  it("REQ-CHANGE-05-F shows the notice for a failure without a message", async () => {
    apiMock.mockResolvedValue([submittedEvent()]);
    pendingRequestsMock.mockRejectedValue("offline");
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not check your events for pending change requests.",
    );
  });

  // Coordinators can view rejected requests via the "Rejected" status filter.
  // Kills: the Rejected status option missing for coordinators, or rejected events shown in the default Submitted view.
  it("lets coordinators view rejected requests through the Rejected status filter", async () => {
    const user = userEvent.setup();
    const rejected: EventRecord = {
      ...submittedEvent(),
      id: "00000000-0000-4000-8000-0000000000ff",
      name: "Rejected Gala",
      status: "rejected",
      rejectionReason: "Venue Unavailable for the requested date.",
    };
    apiMock.mockResolvedValue([submittedEvent(), rejected]);

    useAppStore.setState({
      currentUser: {
        id: "coordinator-1",
        name: "Coordinator One",
        email: "coordinator@example.test",
        role: "coordinator",
      },
      events: [],
    });

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // The Rejected option is available in the coordinator's status filter.
    expect(await screen.findByRole("option", { name: "Rejected" })).toBeTruthy();

    // SPM-48 AC1: the default is All statuses, so both requests show; switching to
    // Rejected leaves only the rejected request.
    expect(screen.getByText("Welcome Evening")).toBeTruthy();
    expect(screen.getByText("Rejected Gala")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Filter by status"), "rejected");

    expect(screen.getByText("Rejected Gala")).toBeTruthy();
    expect(screen.queryByText("Welcome Evening")).toBeNull();
  });

  // SPM-123 AC9: the coordinator sees new assignments on the events page itself, not just in the standalone panel.
  // Kills: the Assignment updates panel missing from the events page, or not showing the assignment message.
  it("LEAD-ASN-09-M shows the coordinator's new-assignment panel on the events page", async () => {
    // Arrange: a coordinator whose notifications feed has one unread assignment; the events list is empty.
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/notifications"
          ? [
              {
                id: "notif-1",
                audienceRole: "coordinator",
                audienceUserId: "coordinator-1",
                type: "coordinator_assignment",
                message: 'New event request "Welcome Evening" is awaiting your review.',
                relatedEventId: "event-1",
                read: false,
                createdAt: "2026-10-06T09:00:00.000Z",
              },
            ]
          : [],
      ) as ReturnType<typeof api>,
    );
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator One", email: "coordinator@example.test", role: "coordinator" },
      events: [],
    });

    // Act: open the events page.
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Assert: the page includes the "Assignment Updates" panel with the assignment.
    const panel = await screen.findByRole("region", { name: "Assignment updates" });
    expect(panel).toHaveTextContent('New event request "Welcome Evening" is awaiting your review.');
  });

  // VIEW-REG-DET-02-A (status badge beside the event status)
  // SPM-61: attendees get Upcoming/Registered/Past/Cancelled filters, see
  // "Confirmed" for Approved events, and a Registered badge beside the status.
  // Kills: BADGE-M2, BADGE-M4
  it("gives attendees personal filters and a Registered badge", async () => {
    const user = userEvent.setup();
    const future = new Date(T0.getTime() + 7 * 86_400_000);
    const futureEnd = new Date(future.getTime() + 3 * 3_600_000);
    const base = { ...submittedEvent(), registrationEnabled: true, startDateTime: future.toISOString(), endDateTime: futureEnd.toISOString() };
    const events: EventRecord[] = [
      { ...base, id: "e-open", name: "Open Approved Event", status: "approved" },
      { ...base, id: "e-mine", name: "My Registered Event", status: "confirmed", myRegistrationStatus: "registered" },
      { ...base, id: "e-past", name: "My Past Event", status: "completed", myRegistrationStatus: "registered",
        startDateTime: "2020-01-01T00:00:00.000Z", endDateTime: "2020-01-01T03:00:00.000Z" },
      { ...base, id: "e-cancel", name: "My Cancelled Event", status: "cancelled", myRegistrationStatus: "registered" },
    ];
    apiMock.mockResolvedValue(events);
    useAppStore.setState({
      currentUser: { id: "attendee-1", name: "Alice", email: "alice@example.com", role: "attendee" },
    });
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Default Upcoming view: both published future events. An unregistered attendee sees no badge on an Approved event.
    expect(await screen.findByText("Open Approved Event")).toBeInTheDocument();
    expect(screen.getByText("My Registered Event")).toBeInTheDocument();
    expect(screen.queryByText("My Past Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
    expect(within(screen.getByText("Open Approved Event").closest("a")!).queryByText("Confirmed")).not.toBeInTheDocument();
    // No "Confirmed" label is shown to attendees, even on an event they are registered for.
    expect(within(screen.getByText("My Registered Event").closest("a")!).queryByText("Confirmed")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by status")).not.toBeInTheDocument();

    // Registered Events: my future registration with its one Confirmed badge, and my cancelled registration with one red
    // Cancelled badge and no Confirmed badge.
    await user.selectOptions(screen.getByLabelText("Show"), "registered");
    expect(screen.getByText("My Registered Event")).toBeInTheDocument();
    expect(screen.queryByText("Open Approved Event")).not.toBeInTheDocument();
    expect(within(screen.getByText("My Registered Event").closest("a")!).queryByText("Confirmed")).not.toBeInTheDocument();
    expect(screen.getByText("My Cancelled Event")).toBeInTheDocument();
    expect(within(screen.getByText("My Cancelled Event").closest("a")!).getAllByText("Cancelled")).toHaveLength(1);
    expect(within(screen.getByText("My Cancelled Event").closest("a")!).queryByText("Confirmed")).not.toBeInTheDocument();

    // Past Events keeps the Completed tag and adds Confirmed (the registration badge; the event status Confirmed is hidden).
    await user.selectOptions(screen.getByLabelText("Show"), "past");
    expect(screen.getByText("My Past Event")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(within(screen.getByText("My Past Event").closest("a")!).queryByText("Confirmed")).not.toBeInTheDocument();

    // The Cancelled filter is removed: the Show dropdown lists only the three attendee filters.
    expect(within(screen.getByLabelText("Show")).queryByRole("option", { name: "Cancelled" })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Show")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Select…",
      "Upcoming events",
      "Registered Events",
      "Past Events",
    ]);
  });

  // Parent AC (SUPPORTING): SPM-36 AC7
  // SPM-36 Test Case EVE-CRE-07-F: when the event list cannot be loaded, the
  // user sees the error with a Retry button; Retry loads the list again.
  // Kills: a load error not shown as an alert, Retry not reloading the events, or the store filled on error.
  it("EVE-CRE-07-F shows a load error with Retry and loads the events again when Retry is clicked", async () => {
    const user = userEvent.setup();
    // Arrange: the first load fails and the second load succeeds.
    serveEvents(
      () => Promise.reject(new Error("Could not load events.")),
      () => Promise.resolve([submittedEvent()]),
    );

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Assert: the error is shown in an alert, no events are listed, and the store holds none.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load events.");
    expect(screen.queryByText("Welcome Evening")).toBeNull();
    expect(useAppStore.getState().events).toEqual([]);

    // Act: click Retry.
    await user.click(screen.getByRole("button", { name: "Retry" }));

    // Assert: the list is requested again, the event appears, and the alert is gone.
    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    expect(eventLoads()).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Parent AC (SUPPORTING): SPM-36 AC7
  // SPM-36 Test Case EVE-CRE-07-G: StrictMode runs the load effect twice, so the
  // first load is superseded. If that stale load succeeds late, it must not
  // replace the list the user is waiting for.
  // Kills: a superseded list response reaching the screen or the store after a newer load has been requested.
  it("EVE-CRE-07-G ignores a superseded event list load that succeeds after a newer load", async () => {
    // Arrange: two pending loads; the first one is superseded by the second.
    const stale = deferred<EventRecord[]>();
    const current = deferred<EventRecord[]>();
    serveEvents(() => stale.promise, () => current.promise);

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/events"]}>
          <Routes>
            <Route path="/events" element={<EventListPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(eventLoads()).toBe(2);

    // Act: settle only the superseded load with a different event.
    await act(async () => {
      stale.resolve([{ ...submittedEvent(), name: "Superseded Gala" }]);
      await stale.promise;
    });

    // Assert: the page is still loading and the stale event never reached the store or the screen.
    expect(screen.getByText("Loading events…")).toBeTruthy();
    expect(useAppStore.getState().events).toEqual([]);
    expect(screen.queryByText("Superseded Gala")).toBeNull();

    // Act: settle the current load.
    await act(async () => {
      current.resolve([submittedEvent()]);
      await current.promise;
    });

    // Assert: only the current load's event is shown.
    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    expect(screen.queryByText("Superseded Gala")).toBeNull();
  });

  // Parent AC (SUPPORTING): SPM-36 AC7
  // SPM-36 Test Case EVE-CRE-07-H: if a superseded event list load fails late,
  // its error must not be shown while the current load is still in progress.
  // Kills: a superseded load's failure shown as an alert while the current load is still pending.
  it("EVE-CRE-07-H does not show an error from a superseded event list load that fails late", async () => {
    // Arrange: two pending loads; the first one is superseded by the second.
    const stale = deferred<EventRecord[]>();
    const current = deferred<EventRecord[]>();
    serveEvents(() => stale.promise, () => current.promise);

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/events"]}>
          <Routes>
            <Route path="/events" element={<EventListPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(eventLoads()).toBe(2);

    // Act: settle only the superseded load with a failure.
    await act(async () => {
      stale.reject(new Error("Network offline."));
      await stale.promise.catch(() => undefined);
    });

    // Assert: the page is still loading and no error alert is shown.
    expect(screen.getByText("Loading events…")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    // Act: settle the current load successfully.
    await act(async () => {
      current.resolve([submittedEvent()]);
      await current.promise;
    });

    // Assert: the list is shown and the stale failure never surfaces as an alert.
    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/**
 * JOIN-WAITLIST-03-A-FE-LIST: an attendee's waiting entry on the Upcoming dashboard shows the Waitlisted badge
 * inside that event's card. Kills F15 (the dashboard stops passing the waiting status to the card).
 */
describe("EventListPage: the chosen filter survives leaving and returning to the list", () => {
  // Kills: FILTER-M1 (the filter kept in local state and reset when the list unmounts, as on opening an event)
  it("FILTER-KEEP-01-A: an attendee's Registered filter is still selected after the list is shown again", async () => {
    const user = userEvent.setup();
    const future = new Date(T0.getTime() + 7 * 86_400_000);
    const base = { ...submittedEvent(), registrationEnabled: true, startDateTime: future.toISOString(), endDateTime: new Date(future.getTime() + 3_600_000).toISOString() };
    apiMock.mockResolvedValue([{ ...base, id: "e-mine", name: "My Registered Event", status: "confirmed", myRegistrationStatus: "registered" }]);
    useAppStore.setState({ currentUser: { id: "attendee-1", name: "Alice", email: "alice@example.com", role: "attendee" } });
    const { unmount } = render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.selectOptions(await screen.findByLabelText("Show"), "registered");

    // Act: leave the list (as opening an event does), then show the list again
    unmount();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Assert: the Registered filter is still applied
    expect(await screen.findByLabelText("Show")).toHaveValue("registered");
    useAppStore.setState({ eventListFilters: { attendee: "upcoming", status: null } });
  });
});

describe("JOIN-WAITLIST-03-A-FE-LIST: the dashboard card for a waiting entry reads Waitlisted (AC3)", () => {
  // Kills: BADGE-M4, F12, F15
  it("JOIN-WAITLIST-03-A-FE-LIST: the Waitlisted badge appears in the waiting event's card and not in the others", async () => {
    const future = new Date(T0.getTime() + 7 * 86_400_000);
    const futureEnd = new Date(future.getTime() + 3 * 3_600_000);
    const base = { ...submittedEvent(), registrationEnabled: true, startDateTime: future.toISOString(), endDateTime: futureEnd.toISOString() };
    const events: EventRecord[] = [
      { ...base, id: "e-wait", name: "My Waitlisted Event", status: "confirmed", myRegistrationStatus: "waitlisted" },
      { ...base, id: "e-other", name: "Other Open Event", status: "approved" },
    ];
    apiMock.mockResolvedValue(events);
    useAppStore.setState({
      currentUser: { id: "attendee-1", name: "Alice", email: "alice@example.com", role: "attendee" },
    });
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const card = (await screen.findByText("My Waitlisted Event")).closest("a")!;
    expect(within(card).getByText("Waitlisted")).toBeInTheDocument();
    // The event's own status is Confirmed, but an attendee's card never shows that: only the registration badge counts.
    expect(within(card).queryByText("Confirmed")).not.toBeInTheDocument();
    expect(within(screen.getByText("Other Open Event").closest("a")!).queryByText("Waitlisted")).not.toBeInTheDocument();
  });
});

/**
 * CARD-BADGE-05-A-STATE: an attendee's withdrawn registration on the list reads Withdrawn beside the event, with no
 * Confirmed badge. Kills CARD-M5 (the list stops passing the withdrawn status to the card).
 */
describe("CARD-BADGE-05-A-STATE: the list shows a withdrawn registration as Withdrawn", () => {
  // Kills: BADGE-M4, LIST-M5
  it("CARD-BADGE-05-A-STATE: a withdrawn event card reads Withdrawn and no Confirmed", async () => {
    const future = new Date(T0.getTime() + 7 * 86_400_000);
    const futureEnd = new Date(future.getTime() + 3 * 3_600_000);
    const base = { ...submittedEvent(), registrationEnabled: true, startDateTime: future.toISOString(), endDateTime: futureEnd.toISOString() };
    apiMock.mockResolvedValue([{ ...base, id: "e-gone", name: "My Withdrawn Event", status: "confirmed", myRegistrationStatus: "withdrawn" }]);
    useAppStore.setState({
      currentUser: { id: "attendee-1", name: "Alice", email: "alice@example.com", role: "attendee" },
    });
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const card = (await screen.findByText("My Withdrawn Event")).closest("a")!;
    expect(within(card).getByText("Withdrawn")).toBeInTheDocument();
    expect(within(card).queryByText("Confirmed")).not.toBeInTheDocument();
  });
});

// SPM-94 AC1 / R1: the organiser's Draft requests show in My Events; Submitted ones do not come from this list.
describe("SPM-94 AC1: organiser drafts in My Events", () => {
  // Kills: the Draft requests section missing, a draft link pointing elsewhere, or a Submitted request listed as a draft.
  it("TRACK-EVENT-STATUS-01-A: lists the organiser's Draft requests and links each to its draft", async () => {
    // Arrange: one Draft and one Submitted request from /requests; the events list is empty.
    apiMock.mockImplementation(((path: string) =>
      path === "/requests"
        ? Promise.resolve([
            { id: "00000000-0000-4000-8000-000000000508", fields: { name: "Draft Concert" }, status: "Draft", version: 1, eventId: null, updatedAt: "2026-10-12T04:00:00.000Z" },
            { id: "00000000-0000-4000-8000-000000000509", fields: { name: "Sent Request" }, status: "Submitted", version: 1, eventId: null, updatedAt: "2026-10-12T04:00:00.000Z" },
          ])
        : Promise.resolve([])) as typeof api);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Assert: the Draft is listed with a link to its request; the Submitted request is not in the drafts section.
    const drafts = await screen.findByRole("region", { name: "Draft requests" });
    expect(within(drafts).getByText("Draft Concert").closest("a")).toHaveAttribute(
      "href",
      "/requests/00000000-0000-4000-8000-000000000508",
    );
    expect(within(drafts).queryByText("Sent Request")).toBeNull();
  });
});

// SPM-94 AC4 / 04-B A and B: each visit (Back, or a new tab) refetches the list and shows the server's latest status.
describe("SPM-94 AC4: each visit shows the latest status", () => {
  // Kills: a revisit showing the earlier status (no refetch on remount), or the list request count wrong.
  it("TRACK-EVENT-STATUS-04-B: a remount requests the list again and shows the newer status", async () => {
    // Arrange: the first visit sees Submitted; by the next visit the server holds Approved.
    apiMock.mockImplementation(((path: string) =>
      path === "/requests" ? Promise.resolve([]) : Promise.resolve([submittedEvent()])) as typeof api);
    const first = render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    expect(eventLoads()).toBe(1);
    first.unmount();

    // Act: revisit (Back or a new tab mounts the page again) after the server changed the status.
    apiMock.mockImplementation(((path: string) =>
      path === "/requests" ? Promise.resolve([]) : Promise.resolve([{ ...submittedEvent(), status: "approved" }])) as typeof api);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Assert: the list was requested again and the card shows Approved, not the stale Submitted.
    const card = (await screen.findByText("Welcome Evening")).closest("a")!;
    expect(eventLoads()).toBe(2);
    expect(within(card).getByText("Approved")).toBeInTheDocument();
    expect(within(card).queryByText("Submitted")).not.toBeInTheDocument();
  });
});

// SPM-94 drafts section: a superseded drafts request that answers late must not replace the current drafts.
describe("SPM-94 drafts: a superseded drafts load cannot replace the current one", () => {
  // Kills: a superseded drafts response (Draft A) replacing the current drafts (Draft B).
  it("TRACK-EVENT-STATUS-01-A: a late stale drafts response is ignored after Retry reloads the page", async () => {
    // Arrange: the first events load fails so the page offers Retry; the first drafts request is held open.
    const staleDrafts = deferred<DraftRecord[]>();
    const currentDrafts = deferred<DraftRecord[]>();
    const draftRequests = [staleDrafts, currentDrafts];
    const eventLoads = [
      () => Promise.reject(new Error("Could not load events.")),
      () => Promise.resolve([] as EventRecord[]),
    ];
    apiMock.mockImplementation(((path: string) =>
      path === "/requests" ? draftRequests.shift()!.promise : eventLoads.shift()!()) as typeof api);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("alert");

    // Act: Retry starts a second drafts request; it answers first with Draft B.
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await act(async () => {
      currentDrafts.resolve([draftRecord("00000000-0000-4000-8000-000000000602", "Draft B")]);
      await currentDrafts.promise;
    });
    expect(await screen.findByText("Draft B")).toBeTruthy();

    // Then the superseded request answers late with Draft A.
    await act(async () => {
      staleDrafts.resolve([draftRecord("00000000-0000-4000-8000-000000000601", "Draft A")]);
      await staleDrafts.promise;
    });

    // Assert: the current drafts stay; the stale answer never reaches the screen.
    expect(screen.getByText("Draft B")).toBeTruthy();
    expect(screen.queryByText("Draft A")).toBeNull();
  });
});

function draftRecord(id: string, name: string): DraftRecord {
  return { id, fields: { name }, status: "Draft", version: 1, eventId: null, updatedAt: "2026-10-12T04:00:00.000Z" } as DraftRecord;
}

// SPM-94 drafts are the organiser's own: other roles never request them, and a failed drafts request leaves the events list intact.
describe("SPM-94 drafts: role guard and failure path", () => {
  // Kills: a coordinator requesting /requests, or a Draft requests section rendered for a coordinator.
  it("TRACK-EVENT-STATUS-01-A: a coordinator never requests drafts or sees a Draft requests section", async () => {
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator One", email: "coordinator@example.test", role: "coordinator" },
    });
    apiMock.mockImplementation(((path: string) =>
      path === "/requests" ? Promise.resolve([draftRecord("00000000-0000-4000-8000-000000000603", "Leaked Draft")]) : Promise.resolve([submittedEvent()])) as typeof api);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    expect(apiMock.mock.calls.some(([path]) => path === "/requests")).toBe(false);
    expect(screen.queryByRole("region", { name: "Draft requests" })).toBeNull();
    expect(screen.queryByText("Leaked Draft")).toBeNull();
  });

  // Kills: a failed drafts request hiding the events, or raising an alert for the drafts failure.
  it("TRACK-EVENT-STATUS-01-A: when the drafts request fails, the events still list and no error is shown", async () => {
    apiMock.mockImplementation(((path: string) =>
      path === "/requests" ? Promise.reject(new Error("drafts unavailable")) : Promise.resolve([submittedEvent()])) as typeof api);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Draft requests" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Kills: a nameless draft rendered blank instead of the 'Untitled draft' label.
  it("TRACK-EVENT-STATUS-01-A: a draft with no name shows the Untitled draft label", async () => {
    apiMock.mockImplementation(((path: string) =>
      path === "/requests" ? Promise.resolve([draftRecord("00000000-0000-4000-8000-000000000604", "")]) : Promise.resolve([])) as typeof api);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const drafts = await screen.findByRole("region", { name: "Draft requests" });
    expect(within(drafts).getByText("Untitled draft")).toBeInTheDocument();
  });
});

// SPM-94 AC2/AC3: the organiser list page hands each card the server's indicator fields.
describe("SPM-94 AC2/AC3 on the organiser list page", () => {
  // Kills: the list page dropping the indicator fields before they reach the card.
  it("TRACK-EVENT-STATUS-01-A: the organiser list shows both indicators on a card", async () => {
    serveEvents(() => Promise.resolve([{ ...submittedEvent(), status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"], safetyIndicator: "AWAITING_CHECK" }]));

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Awaiting Safety Officer Check")).toBeInTheDocument();
  });
});

// SPM-94 ordering: every view lists events from the earliest start date to the latest, so a grid row reads left (earlier) to right (later).
describe("SPM-94 ordering: events read from the earliest start date", () => {
  // Kills: cards shown in server order instead of ascending start date.
  it("TRACK-EVENT-STATUS-01-A ORDER: the cards follow the start date, whatever order the server sends", async () => {
    const base = submittedEvent();
    const at = (day: number, name: string) => {
      const start = new Date(Date.UTC(2026, 9, day, 10));
      return { ...base, id: `00000000-0000-4000-8000-0000000007${day}`, name, startDateTime: start.toISOString(), endDateTime: new Date(start.getTime() + 7_200_000).toISOString() };
    };
    serveEvents(() => Promise.resolve([at(30, "Day 30"), at(25, "Day 25"), at(28, "Day 28"), at(27, "Day 27")]));

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Day 25");
    const names = screen.getAllByRole("link").map((a) => a.textContent ?? "").filter((t) => t.startsWith("Day "));
    expect(names.map((t) => t.match(/Day \d+/)?.[0])).toEqual(["Day 25", "Day 27", "Day 28", "Day 30"]);
  });
});

// SPM-95: My Events status filter. Confluence matrix: FILTER-EVT-01-B through FILTER-EVT-07-A (records/SPM-95.csv).
describe("SPM-95: the organiser's status filter on My Events", () => {
  const ID = (n: number) => `00000000-0000-4000-8000-0000000009${String(n).padStart(2, "0")}`;
  function sample(n: number, name: string, overrides: Partial<EventRecord>): EventRecord {
    return { ...submittedEvent(), id: ID(n), name, ...overrides };
  }
  /** One event per filterable state, so each test can show which events a filter keeps. */
  function sampleEvents(): EventRecord[] {
    return [
      sample(1, "Submitted Talk", { status: "submitted" }),
      sample(2, "Approved Gala", { status: "approved" }),
      sample(3, "Confirmed Fair", { status: "confirmed" }),
      sample(4, "Safety Pending", { status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"], safetyIndicator: "AWAITING_CHECK" }),
    ];
  }
  function renderOrganiserList() {
    return render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }
  const statusGroup = () => screen.getByRole("group", { name: "Filter by status" });
  const shownNames = () =>
    ["Submitted Talk", "Approved Gala", "Confirmed Fair", "Safety Pending"].filter((name) =>
      screen.queryByText(name),
    );

  // Kills: the default view hiding some of my events, or a status checkbox pre-checked with no filter chosen.
  /** SPM-95 AC1: with no filter selected, I see all of my events. */
  it("FILTER-EVT-01-B: with no filter selected, every one of my events is listed and no filter is checked", async () => {
    apiMock.mockResolvedValue(sampleEvents());
    renderOrganiserList();

    await screen.findByText("Submitted Talk");

    expect(shownNames()).toHaveLength(4);
    for (const box of within(statusGroup()).getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
  });

  // Kills: a multi-status filter combined with AND (only events in both statuses kept), or a non-selected status still shown.
  /** SPM-95 AC2: selecting several statuses shows only my events that match any of them. */
  it("FILTER-EVT-02-C: selecting Submitted and Approved shows events in either status and hides the rest", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(sampleEvents());
    renderOrganiserList();
    await screen.findByText("Submitted Talk");

    await user.click(within(statusGroup()).getByRole("checkbox", { name: "Submitted" }));
    await user.click(within(statusGroup()).getByRole("checkbox", { name: "Approved" }));

    expect(shownNames()).toEqual(["Submitted Talk", "Approved Gala"]);
    expect(screen.queryByText("Confirmed Fair")).toBeNull();
    expect(screen.queryByText("Safety Pending")).toBeNull();
  });

  // Kills: the 'Active filters' summary wrong, or Clear all filters not restoring the unfiltered list.
  /** SPM-95 AC3: the active filters are visible, and one action clears them all. */
  it("FILTER-EVT-03-A: the active filters are named, and Clear all filters restores the unfiltered list", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(sampleEvents());
    renderOrganiserList();
    await screen.findByText("Submitted Talk");

    await user.click(within(statusGroup()).getByRole("checkbox", { name: "Approved" }));
    await user.click(within(statusGroup()).getByRole("checkbox", { name: "Confirmed" }));

    expect(screen.getByText("Active filters: Approved, Confirmed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(shownNames()).toHaveLength(4);
    for (const box of within(statusGroup()).getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
    expect(screen.queryByText(/Active filters/)).toBeNull();
  });

  // Kills: the 'No matching events found' message missing when the selected filter matches nothing.
  /** SPM-95 AC4: when no event matches the selected filters, the list says "No matching events found". */
  it("FILTER-EVT-04-A: a filter with no matching event shows the No matching events found message", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(sampleEvents());
    renderOrganiserList();
    await screen.findByText("Submitted Talk");

    await user.click(within(statusGroup()).getByRole("checkbox", { name: "Cancelled" }));

    expect(screen.getByText("No matching events found")).toBeInTheDocument();
    expect(screen.queryByText("Submitted Talk")).toBeNull();
  });

  // Kills: Awaiting Safety Check keeping events without a pending safety indicator, or keeping other statuses.
  /** SPM-95 AC5: Awaiting Safety Check keeps only events whose safety check is awaited. */
  it("FILTER-EVT-05-G: Awaiting Safety Check shows only the event awaiting its safety check", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(sampleEvents());
    renderOrganiserList();
    await screen.findByText("Submitted Talk");

    await user.click(within(statusGroup()).getByRole("checkbox", { name: "Awaiting Safety Check" }));

    expect(shownNames()).toEqual(["Safety Pending"]);
  });

  // Kills: filtering triggering a new events load instead of narrowing the list already returned (event load count not 1).
  /** SPM-95 AC6: filtering narrows the organiser's own list from the server and fetches no other events. */
  it("FILTER-EVT-06-A: filtering narrows the list the server returned for me without loading events again", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(sampleEvents());
    renderOrganiserList();
    await screen.findByText("Submitted Talk");

    await user.click(within(statusGroup()).getByRole("checkbox", { name: "Confirmed" }));

    expect(shownNames()).toEqual(["Confirmed Fair"]);
    expect(eventLoads()).toBe(1);
  });

  // Kills: the status filter kept in the store after the list unmounts, so a revisit is not unfiltered.
  /** SPM-95 AC7: leaving the list for an event's details and returning shows the unfiltered list, and nothing is stored globally. */
  it("FILTER-EVT-07-A: returning to the list after leaving it resets the filters to unfiltered", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(sampleEvents());
    const first = renderOrganiserList();
    await screen.findByText("Submitted Talk");
    await user.click(within(statusGroup()).getByRole("checkbox", { name: "Approved" }));
    expect(shownNames()).toEqual(["Approved Gala"]);

    // Leaving the list for an event's details unmounts it.
    first.unmount();
    renderOrganiserList();

    await screen.findByText("Submitted Talk");
    expect(shownNames()).toHaveLength(4);
    for (const box of within(statusGroup()).getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
    expect(useAppStore.getState().eventListFilters.status).toBeNull();
  });
});

// SPM-95 keeps other roles' status filter as it was; these tests cover the branches the organiser change left on shared code.
describe("SPM-95: the other roles' status filter and the drafts loader", () => {
  // Kills: the organiser status filter applied to coordinators, hiding non-submitted events under the All statuses value.
  /** SPM-95 AC1 (other roles): a coordinator whose status filter is the All statuses value sees every event. */
  it("FILTER-EVT-01-C: a coordinator with the All statuses value sees every event, not only Submitted", async () => {
    apiMock.mockResolvedValue([submittedEvent(), { ...submittedEvent(), id: "00000000-0000-4000-8000-0000000009a1", name: "Approved Party", status: "approved" }]);
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator One", email: "coordinator@example.test", role: "coordinator" },
      eventListFilters: { attendee: "upcoming", status: "" },
    });

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Approved Party")).toBeTruthy();
    expect(screen.getByText("Welcome Evening")).toBeTruthy();
  });

  // Kills: a drafts answer that is not a list rendering a Draft requests section.
  /** TRACK-EVENT-STATUS-01-A (drafts loader): a drafts answer that is not a list shows no Drafts section and leaves the events. */
  it("TRACK-EVENT-STATUS-01-A: a drafts response that is not a list shows no Drafts section and the events still list", async () => {
    apiMock.mockImplementation(((path: string) =>
      path === "/requests" ? Promise.resolve({ unexpected: true }) : Promise.resolve([submittedEvent()])) as typeof api);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Draft requests" })).toBeNull();
  });

  /** TRACK-EVENT-STATUS-01-A (drafts loader): a drafts failure that arrives after the page was left is ignored. */
  it("TRACK-EVENT-STATUS-01-A: a drafts failure that arrives after the page was left shows nothing", async () => {
    const drafts = deferred<DraftRecord[]>();
    apiMock.mockImplementation(((path: string) =>
      path === "/requests" ? drafts.promise : Promise.resolve([] as EventRecord[])) as typeof api);

    const view = render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("No matching events found");
    const draftRequests = () => apiMock.mock.calls.filter(([path]) => path === "/requests").length;
    expect(draftRequests()).toBe(1);
    view.unmount();

    await act(async () => {
      drafts.reject(new Error("Drafts unavailable."));
      await drafts.promise.catch(() => undefined);
    });

    // After unmount the DOM is gone, so only the request mock is observable: the late failure must not trigger a reload.
    expect(draftRequests()).toBe(1);
  });
});

describe("EventListPage: coordinator pending requests after a decision (SPM-40, SPM-83)", () => {
  const FIRST_ID = "00000000-0000-4000-8000-0000000000a1";
  const SECOND_ID = "00000000-0000-4000-8000-0000000000a2";

  // Renders the real list page for the coordinator, with two requests Submitted and awaiting a decision.
  // SPM-48 AC1 made All statuses the coordinator default, so the pending view is selected explicitly with the Submitted filter.
  function renderCoordinatorPending() {
    const first = { ...submittedEvent(), id: FIRST_ID, name: "Pending One" };
    const second = { ...submittedEvent(), id: SECOND_ID, name: "Pending Two" };
    apiMock.mockImplementation(((path: string) =>
      Promise.resolve(path === "/coordinator/queue" ? [first, second] : path === "/requests" ? [] : {})) as typeof api);
    useAppStore.setState({
      currentUser: {
        id: "coordinator-1",
        name: "Coordinator One",
        email: "coordinator@example.test",
        role: "coordinator",
      },
      events: [],
      eventListFilters: { attendee: "upcoming", status: "submitted" },
    });
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  // Kills: an approved request still in the pending view, or not listed under the Approved filter.
  /** EVENT-APPROVE-02-C: an approved request leaves the default Submitted (pending) view and is listed under the Approved filter. */
  it("EVENT-APPROVE-02-C drops an approved request from the pending view and lists it under Approved", async () => {
    const user = userEvent.setup();
    renderCoordinatorPending();
    expect(await screen.findByText("Pending One")).toBeTruthy();
    expect(screen.getByText("Pending Two")).toBeTruthy();

    await act(async () => {
      await useAppStore.getState().approveEvent(FIRST_ID);
    });

    expect(screen.queryByText("Pending One")).toBeNull();
    expect(screen.getByText("Pending Two")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Filter by status"), "approved");
    expect(screen.getByText("Pending One")).toBeTruthy();
    expect(screen.queryByText("Pending Two")).toBeNull();
  });

  // Kills: a rejected request still in the pending view, or not listed under the Rejected filter.
  /** EVENT-REJECT-02-C: a rejected request leaves the default Submitted (pending) view and is listed under the Rejected filter. */
  it("EVENT-REJECT-02-C drops a rejected request from the pending view and lists it under Rejected", async () => {
    const user = userEvent.setup();
    renderCoordinatorPending();
    expect(await screen.findByText("Pending One")).toBeTruthy();

    await act(async () => {
      await useAppStore.getState().rejectEvent(FIRST_ID, "Duplicate of an existing event.");
    });

    expect(screen.queryByText("Pending One")).toBeNull();
    expect(screen.getByText("Pending Two")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Filter by status"), "rejected");
    expect(screen.getByText("Pending One")).toBeTruthy();
    expect(screen.queryByText("Pending Two")).toBeNull();
  });
});
