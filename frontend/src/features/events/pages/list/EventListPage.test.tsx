import { StrictMode } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventCreatePage } from "@/features/events/pages/create/EventCreatePage";
import { EventListPage } from "@/features/events/pages/list/EventListPage";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import { deferred } from "@/test/deferred";
import type { EventRecord } from "@/types";
import type { DraftRecord } from "@/features/events/types/draft";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

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
    changeRequests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps queued *Once values; reset them so one test's leftovers can't reach the next.
  apiMock.mockReset();
  apiMock.mockResolvedValue([]);
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
    expect(screen.getByText("Submitted", { selector: "span" })).toBeTruthy();
  });

  // Coordinators can view rejected requests via the "Rejected" status filter.
  it("lets coordinators view rejected requests through the Rejected status filter", async () => {
    const user = userEvent.setup();
    const rejected: EventRecord = {
      ...submittedEvent(),
      id: "00000000-0000-4000-8000-0000000000ff",
      name: "Rejected Gala",
      status: "rejected",
      rejectionReason: "Venue unavailable for the requested date.",
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

    // Default is the Submitted (Pending Requests) view; switching to Rejected
    // surfaces the rejected request.
    expect(screen.getByText("Welcome Evening")).toBeTruthy();
    expect(screen.queryByText("Rejected Gala")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Filter by status"), "rejected");

    expect(screen.getByText("Rejected Gala")).toBeTruthy();
    expect(screen.queryByText("Welcome Evening")).toBeNull();
  });

  // SPM-123 AC9: the coordinator sees new assignments on the events page itself, not just in the standalone panel.
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
  // Kills: BADGE-M1, BADGE-M2, BADGE-M4, F13
  it("gives attendees personal filters and a Registered badge", async () => {
    const user = userEvent.setup();
    const future = new Date(Date.now() + 7 * 86_400_000);
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
    // Attendee rule: "Confirmed" means a registration, so a registered event shows exactly one Confirmed badge.
    expect(within(screen.getByText("My Registered Event").closest("a")!).getAllByText("Confirmed")).toHaveLength(1);
    expect(screen.queryByLabelText("Filter by status")).not.toBeInTheDocument();

    // Registered Events: only my future registration, with its one Confirmed badge.
    await user.selectOptions(screen.getByLabelText("Show"), "registered");
    expect(screen.getByText("My Registered Event")).toBeInTheDocument();
    expect(screen.queryByText("Open Approved Event")).not.toBeInTheDocument();
    expect(within(screen.getByText("My Registered Event").closest("a")!).getAllByText("Confirmed")).toHaveLength(1);

    // Past Events keeps the Completed tag and adds Confirmed (the registration badge; the event status Confirmed is hidden).
    await user.selectOptions(screen.getByLabelText("Show"), "past");
    expect(screen.getByText("My Past Event")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(within(screen.getByText("My Past Event").closest("a")!).getByText("Confirmed")).toBeInTheDocument();

    // Cancelled: only the cancelled event I registered for.
    await user.selectOptions(screen.getByLabelText("Show"), "cancelled");
    expect(screen.getByText("My Cancelled Event")).toBeInTheDocument();
    expect(screen.queryByText("My Past Event")).not.toBeInTheDocument();
  });

  // SPM-36 Test Case EVE-CRE-07-F: when the event list cannot be loaded, the
  // user sees the error with a Retry button; Retry loads the list again.
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

  // SPM-36 Test Case EVE-CRE-07-G: StrictMode runs the load effect twice, so the
  // first load is superseded. If that stale load succeeds late, it must not
  // replace the list the user is waiting for.
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

  // SPM-36 Test Case EVE-CRE-07-H: if a superseded event list load fails late,
  // its error must not be shown while the current load is still in progress.
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
describe("JOIN-WAITLIST-03-A-FE-LIST: the dashboard card for a waiting entry reads Waitlisted (AC3)", () => {
  // Kills: BADGE-M1, BADGE-M4, F12, F15
  it("JOIN-WAITLIST-03-A-FE-LIST: the Waitlisted badge appears in the waiting event's card and not in the others", async () => {
    const future = new Date(Date.now() + 7 * 86_400_000);
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
  // Kills: BADGE-M1, BADGE-M4, LIST-M5
  it("CARD-BADGE-05-A-STATE: a withdrawn event card reads Withdrawn and no Confirmed", async () => {
    const future = new Date(Date.now() + 7 * 86_400_000);
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
  it("TRACK-EVENT-STATUS-01-A: lists the organiser's Draft requests and links each to its draft", async () => {
    // Arrange: one Draft and one Submitted request from /requests; the events list is empty.
    apiMock.mockImplementation(((path: string) =>
      path === "/requests"
        ? Promise.resolve([
            { id: "00000000-0000-4000-8000-000000000508", fields: { name: "Draft Concert" }, status: "Draft", version: 1, eventId: null, updatedAt: new Date().toISOString() },
            { id: "00000000-0000-4000-8000-000000000509", fields: { name: "Sent Request" }, status: "Submitted", version: 1, eventId: null, updatedAt: new Date().toISOString() },
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
