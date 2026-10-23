// Story: SPM-48 Monitor Workspace Queue & Status (Coordinator)
// ACs: AC1 (my events, all statuses), AC2 (status terms), AC4 (latest on refresh or revisit), AC5 (needs action),
// AC6 to AC9 (queue indicators on the cards)
// Test cases: MONITOR-QUEUE-01-A, 01-C, 02-A, 04-A, 04-B, 05-B, 06-A, 06-B, 07-C, 08-A, 09-A (page level)
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventListPage } from "@/features/events/pages/list/EventListPage";
import { api } from "@/utils/api";
import { fetchMyChangeRequests } from "@/features/events/api/change-requests-api";
import { login } from "@/lib/auth";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord, QueueIndicators } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  login: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/events/api/change-requests-api", () => ({
  fetchMyChangeRequests: vi.fn(() => Promise.resolve([])),
  markChangeRequestNoticesRead: vi.fn(() => Promise.resolve()),
  fetchNewChangeRequestEventIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));

const apiMock = vi.mocked(api);
const COORDINATOR = { id: "coo-1", name: "COO-01 Coordinator", email: "coo1@example.test", role: "coordinator" as const };
const none: QueueIndicators = { safety: null, holds: [], unavailableVenues: [], actions: [], needsAction: false };

/** The SPM-94 safety indicator the server also returns for coordinators (EventsService.list), from the same state. */
function spm94Indicator(safety: QueueIndicators["safety"] | undefined): EventRecord["safetyIndicator"] {
  return safety === "AWAITING_CHECK" || safety === "CHANGES_REQUESTED" || safety === "CLEARED" ? safety : null;
}

function queueEvent(name: string, status: EventRecord["status"], queue: Partial<QueueIndicators> = {}): EventRecord {
  return {
    // Fields EventsService.list adds for coordinators alongside the queue (TR-02: keep the fixture realistic).
    safetyIndicator: spm94Indicator(queue.safety),
    venueRequestStatus: null,
    equipmentStatuses: [],
    id: `id-${name}`,
    name,
    purpose: "Testing",
    description: "Queue fixture",
    organiserId: "org-1",
    organiserName: "ORG-01 Organiser",
    coordinatorId: COORDINATOR.id,
    coordinatorName: COORDINATOR.name,
    status,
    // Fixed instants keep the order deterministic: EVT-403 first, then by name order below.
    startDateTime: `2026-12-${String(Number(name.replace(/\D/g, "")) % 28 || 1).padStart(2, "0")}T02:00:00.000Z`,
    endDateTime: `2026-12-${String(Number(name.replace(/\D/g, "")) % 28 || 1).padStart(2, "0")}T04:00:00.000Z`,
    expectedAttendance: 40,
    venueRequirements: { minCapacity: 40, layout: "Theatre", facilities: [], accessibility: [] },
    attachments: [],
    equipmentNeeds: "",
    registrationEnabled: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    queue: { ...none, ...queue },
  };
}

const ARRANGED = { venueRequestStatus: "approved" as const, equipmentStatuses: ["Reserved" as const] };

/** The coordinator's queue as the server returns it (MONITOR-QUEUE-01-A fixtures, a representative subset). */
const QUEUE: EventRecord[] = [
  queueEvent("EVT-403", "submitted", { actions: ["AWAITING_REVIEW"], needsAction: true }),
  // EVT-404 and EVT-405 have their venue approved and equipment reserved, as a requested safety check requires.
  { ...queueEvent("EVT-404", "planning", { safety: "AWAITING_CHECK" }), ...ARRANGED },
  { ...queueEvent("EVT-405", "planning", { safety: "CHANGES_REQUESTED", actions: ["SAFETY_CHANGES_REQUESTED"], needsAction: true }), ...ARRANGED },
  queueEvent("EVT-406", "confirmed"),
  queueEvent("EVT-407", "planning", {
    holds: [{ venueName: "Hall A", expiresAt: "2026-11-12T04:00:00.000Z", state: "ACTIVE" }],
  }),
  queueEvent("EVT-408", "planning", { unavailableVenues: ["Hall B"], actions: ["VENUE_UNAVAILABLE"], needsAction: true }),
  queueEvent("EVT-409", "approved"),
  queueEvent("EVT-410", "completed"),
  queueEvent("EVT-411", "cancelled"),
  queueEvent("EVT-412", "rejected"),
  queueEvent("EVT-415", "planning", {
    holds: [{ venueName: "Hall A", expiresAt: "2026-11-09T04:00:00.000Z", state: "EXPIRED" }],
    actions: ["HOLD_EXPIRED"],
    needsAction: true,
  }),
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events"]}>
      <Routes>
        <Route path="/events" element={<EventListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The card (link) for an event name. */
const card = (name: string) => screen.getByRole("heading", { name }).closest("a") as HTMLElement;

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockReset();
  apiMock.mockImplementation(((path: string) =>
    Promise.resolve(path === "/coordinator/queue" ? QUEUE : [])) as typeof api);
  vi.mocked(fetchMyChangeRequests).mockResolvedValue([]);
  useAppStore.setState({ currentUser: COORDINATOR, events: [], eventListFilters: { attendee: "upcoming", status: null } });
});

describe("SPM-48 coordinator dashboard", () => {
  /** MONITOR-QUEUE-01-A: the dashboard reads the coordinator queue, opens on All statuses and lists every row it returns. */
  it("MONITOR-QUEUE-01-A lists every queued event on All statuses", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "EVT-403" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/coordinator/queue");
    expect(apiMock).not.toHaveBeenCalledWith("/events");
    expect(screen.getByLabelText("Filter by status")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "All Events" })).toBeInTheDocument();
    // API result equals UI: one card per queued event.
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(QUEUE.map((e) => e.name));
  });

  /**
   * MONITOR-QUEUE-01-A (review finding, PR #80): a coordinator who signs in after another on the same browser starts on
   * All statuses and sees every queued event, not the previous coordinator's filter.
   */
  it("MONITOR-QUEUE-01-A does not carry one coordinator's status filter into the next session", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "EVT-403" });
    await user.selectOptions(screen.getByLabelText("Filter by status"), "planning");
    expect(screen.queryByRole("heading", { name: "EVT-403" })).toBeNull();
    cleanup();

    await useAppStore.getState().logout();
    const SECOND = { ...COORDINATOR, id: "coo-2", name: "COO-02 Coordinator", email: "coo2@example.test" };
    vi.mocked(login).mockResolvedValueOnce(SECOND);
    await useAppStore.getState().login("coo2@example.test", "secret");

    renderPage();
    expect(await screen.findByRole("heading", { name: "EVT-403" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by status")).toHaveValue("");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(QUEUE.length);
  });

  /** MONITOR-QUEUE-02-A: the filter offers All statuses and the seven standard terms, and each narrows the list. */
  it("MONITOR-QUEUE-02-A filters by each standard status term", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "EVT-403" });
    const filter = screen.getByLabelText("Filter by status");
    expect(within(filter).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All statuses", "Submitted", "Approved", "Planning", "Confirmed", "Completed", "Rejected", "Cancelled",
    ]);
    await user.selectOptions(filter, "submitted");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["EVT-403"]);
    expect(screen.getByRole("heading", { name: "Pending Requests" })).toBeInTheDocument();
    await user.selectOptions(filter, "");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(QUEUE.length);
  });

  /** MONITOR-QUEUE-01-C: an empty queue shows the empty-state message and no error. */
  it("MONITOR-QUEUE-01-C shows the empty state for an empty queue", async () => {
    apiMock.mockImplementation((() => Promise.resolve([])) as typeof api);
    renderPage();
    expect(await screen.findByText("No events match this filter.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  /** MONITOR-QUEUE-05-B: the four action-needed events carry the marker; EVT-406, EVT-410 and EVT-411 do not. */
  it("MONITOR-QUEUE-05-B marks exactly the events that need action", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "EVT-403" });
    for (const name of ["EVT-403", "EVT-405", "EVT-408", "EVT-415"])
      expect(within(card(name)).getByText("Needs action")).toBeInTheDocument();
    for (const name of ["EVT-406", "EVT-410", "EVT-411"])
      expect(within(card(name)).queryByText("Needs action")).toBeNull();
  });

  /** MONITOR-QUEUE-06-A, 08-A, 09-A: the queue's indicators show on their cards, and the SPM-94 indicator is not repeated. */
  it("MONITOR-QUEUE-06-A shows each card’s queue indicators once", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "EVT-404" });
    expect(within(card("EVT-404")).getAllByText("Awaiting Safety Officer Check")).toHaveLength(1);
    expect(within(card("EVT-406")).queryByText(/Safety/)).toBeNull();
    expect(within(card("EVT-407")).getByText("Hold active: Hall A, expires 12 Nov 2026, 12:00 SGT")).toBeInTheDocument();
    expect(within(card("EVT-408")).getByText("Venue unavailable – alternative arrangements needed: Hall B")).toBeInTheDocument();
    expect(within(card("EVT-415")).getByText("Hold expired: Hall A, expired 09 Nov 2026, 12:00 SGT")).toBeInTheDocument();
  });

  /**
   * MONITOR-QUEUE-06-B, 07-C: the queue-only safety states (reset, rejected) show on their cards. The SPM-94 indicator
   * has no value for them, so only the queue label can show them.
   */
  it("MONITOR-QUEUE-06-B shows the reset and rejected safety states on their cards", async () => {
    apiMock.mockImplementation(((path: string) =>
      Promise.resolve(
        path === "/coordinator/queue"
          ? [
              { ...queueEvent("EVT-416", "planning", { safety: "RESET", actions: ["SAFETY_RESET"], needsAction: true }), ...ARRANGED },
              { ...queueEvent("EVT-417", "planning", { safety: "REJECTED", actions: ["SAFETY_REJECTED"], needsAction: true }), ...ARRANGED },
            ]
          : [],
      )) as typeof api);
    renderPage();
    await screen.findByRole("heading", { name: "EVT-416" });
    expect(within(card("EVT-416")).getByText("Safety Check Reset: Re-request Needed")).toBeInTheDocument();
    expect(within(card("EVT-417")).getByText("Safety Arrangement Rejected")).toBeInTheDocument();
  });

  /**
   * MONITOR-QUEUE-09-A: a card whose venue became unavailable does not also say the venue is reserved; the combined
   * label keeps only the equipment part. A card with an available reserved venue keeps its labels.
   */
  it("MONITOR-QUEUE-09-A drops the reserved-venue claim when the venue is unavailable", async () => {
    const reserved = { venueRequestStatus: "approved" as const, equipmentStatuses: ["Reserved"] };
    apiMock.mockImplementation(((path: string) =>
      Promise.resolve(
        path === "/coordinator/queue"
          ? [
              { ...queueEvent("EVT-408", "planning", { unavailableVenues: ["Hall B"], actions: ["VENUE_UNAVAILABLE"], needsAction: true }), ...reserved },
              { ...queueEvent("EVT-421", "planning", { unavailableVenues: ["Hall C"], actions: ["VENUE_UNAVAILABLE"], needsAction: true }), venueRequestStatus: "approved" as const, equipmentStatuses: [] },
              { ...queueEvent("EVT-404", "planning"), ...reserved },
            ]
          : [],
      )) as typeof api);
    renderPage();
    await screen.findByRole("heading", { name: "EVT-408" });
    expect(within(card("EVT-408")).getByText("Equipment Reserved")).toBeInTheDocument();
    expect(within(card("EVT-408")).queryByText(/Venue Reserved/)).toBeNull();
    expect(within(card("EVT-421")).queryByText("Venue Reserved")).toBeNull();
    expect(within(card("EVT-404")).getByText("Equipment & Venue Reserved")).toBeInTheDocument();
  });

  /** MONITOR-QUEUE-04-A: Retry after a failed load reads the queue again and shows the latest statuses. */
  it("MONITOR-QUEUE-04-A reloads the latest queue after a failed load", async () => {
    const user = userEvent.setup();
    let queueReads = 0;
    apiMock.mockImplementation(((path: string) => {
      if (path !== "/coordinator/queue") return Promise.resolve([]);
      queueReads += 1;
      return queueReads === 1 ? Promise.reject(new Error("Unable to reach the server.")) : Promise.resolve(QUEUE);
    }) as typeof api);
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to reach the server.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "EVT-403" })).toBeInTheDocument();
    expect(apiMock.mock.calls.filter(([path]) => path === "/coordinator/queue")).toHaveLength(2);
  });

  /** MONITOR-QUEUE-04-B: revisiting the page reads the queue again, so a new request and a changed status appear. */
  it("MONITOR-QUEUE-04-B shows the latest queue on revisit", async () => {
    const first = renderPage();
    await screen.findByRole("heading", { name: "EVT-403" });
    first.unmount();
    const revisited = [{ ...QUEUE[0], status: "approved" as const, queue: none }, queueEvent("EVT-420", "submitted")];
    apiMock.mockImplementation(((path: string) =>
      Promise.resolve(path === "/coordinator/queue" ? revisited : [])) as typeof api);
    renderPage();
    expect(await screen.findByRole("heading", { name: "EVT-420" })).toBeInTheDocument();
    expect(within(card("EVT-403")).getByText("Approved")).toBeInTheDocument();
    expect(apiMock.mock.calls.filter(([path]) => path === "/coordinator/queue")).toHaveLength(2);
  });

  /** MONITOR-QUEUE-02-A: other staff roles who open /events keep their filter as before: statuses only, behind the placeholder. */
  it("MONITOR-QUEUE-02-A leaves the venue staff filter unchanged", async () => {
    useAppStore.setState({ currentUser: { id: "vs-1", name: "VS-01", email: "vs@example.test", role: "venue_staff" } });
    renderPage();
    await screen.findByText("No events match this filter.");
    const options = within(screen.getByLabelText("Filter by status")).getAllByRole("option").map((o) => o.textContent);
    expect(options[0]).toBe("Select…");
    expect(options).not.toContain("All statuses");
    expect(apiMock).not.toHaveBeenCalledWith("/coordinator/queue");
  });

  /** MONITOR-QUEUE-01-A: an organiser's list still reads /events, never the coordinator queue. */
  it("MONITOR-QUEUE-01-A keeps other roles on the events list", async () => {
    useAppStore.setState({ currentUser: { id: "org-1", name: "ORG-01", email: "org@example.test", role: "organiser" } });
    renderPage();
    await screen.findByText("No matching events found");
    expect(apiMock).toHaveBeenCalledWith("/events");
    expect(apiMock).not.toHaveBeenCalledWith("/coordinator/queue");
  });
});
