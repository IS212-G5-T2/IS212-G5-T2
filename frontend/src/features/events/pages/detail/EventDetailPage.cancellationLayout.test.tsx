import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, PlanningView } from "@/types";

/*
 * SPM-155 event page layout and status timeline (EventDetailPage): the timeline shows only the stages an event has
 * reached, a cancelled event shows the stages up to the one it was cancelled from (read from its status history) and
 * then Cancelled, and the request panel and the decision panel sit at the end of the page. The HTTP layer is the
 * boundary and is mocked; the page and both panels are real.
 * Test cases: CANCEL-REQUEST-04-SUP-TIMELINE, 02-SUP-LAYOUT, 03-SUP-LAYOUT. Oracle tier: DERIVED (the user's UI
 * decisions of 1 Nov 2026 in the commit message of 02e56aa3: the stages reached, then Cancelled; the panels last).
 * Mutant IDs in each "Kills:" line are defined in frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);

const EVENT_ID = "00000000-0000-4000-8000-000000000156";
const T0 = "2026-10-12T04:00:00.000Z";

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: EVENT_ID,
    name: "Annual Gala Dinner",
    purpose: "Dinner",
    description: "A gala dinner.",
    organiserId: "org-01",
    organiserName: "Organiser 1",
    coordinatorId: "coo-01",
    coordinatorName: "Coordinator 1",
    status: "confirmed",
    startDateTime: "2026-11-05T02:00:00.000Z",
    endDateTime: "2026-11-05T04:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: ["Catering"], accessibility: [] },
    equipmentNeeds: "Projector",
    registrationEnabled: false,
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-10-04T09:00:00.000Z",
    ...overrides,
  };
}

const pending: CancellationRequest = {
  id: "req-1",
  eventId: EVENT_ID,
  eventName: "Annual Gala Dinner",
  status: "pending",
  displayStatus: "pending",
  reason: "Sponsor withdrew",
  requestedBy: "Farid Rahman",
  requestedAt: T0,
};

type History = { fromStatus: string; toStatus: string }[] | Error | { message: string };

function planningView(event: EventRecord): PlanningView {
  return { event, venueBookings: [], equipmentArrangements: [], pendingChanges: [], readOnly: false, editableFields: [], lastUpdatedAt: T0 };
}

function routeApi(event: EventRecord, requests: CancellationRequest[], history: History) {
  apiMock.mockImplementation(((path: string) => {
    if (path.endsWith("/cancellation-requests")) return Promise.resolve(requests);
    if (path.endsWith("/decision")) return Promise.resolve({ request: { ...pending, status: "accepted", displayStatus: "accepted" }, message: "Cancellation request accepted. Annual Gala Dinner is cancelled." });
    if (path.endsWith("/status-history"))
      // Full rows: the planning history panel on the same page reads changedAt and changedBy too.
      return history instanceof Error
        ? Promise.reject(history)
        : !Array.isArray(history)
          ? Promise.resolve(history)
          : Promise.resolve(history.map((row) => ({ ...row, changedAt: "2026-10-27T04:00:00.000Z", changedBy: { id: "u", name: "Daniel Koh" } })));
    if (path.endsWith("/arrangements-status")) return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [] });
    if (path.endsWith("/planning")) return Promise.resolve(planningView(event));
    if (path.includes("/comments")) return Promise.resolve([]);
    if (path.includes("/change-requests")) return Promise.resolve([]);
    if (path.endsWith("/confirmed-arrangements")) return Promise.reject(new Error("not confirmed"));
    return Promise.resolve(event);
  }) as typeof api);
}

const ORG1 = { id: "org-01", role: "organiser", roles: ["organiser"] };
const COO1 = { id: "coo-01", role: "coordinator", roles: ["coordinator"] };

function renderAs(
  user: { id: string; role: string; roles: string[] },
  event: EventRecord,
  options: { requests?: CancellationRequest[]; history?: History } = {},
) {
  routeApi(event, options.requests ?? [], options.history ?? []);
  useAppStore.setState({ currentUser: { ...user, name: user.id, email: `${user.id}@example.test` } as never, events: [event] });
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Each list item holds the stage name in its first span (the arrow between stages is a second span).
const stagesOf = (timeline: HTMLElement) => within(timeline).queryAllByRole("listitem").map((item) => item.querySelector("span")?.textContent);
const historyCalls = () => apiMock.mock.calls.filter(([path]) => String(path).endsWith("/status-history"));
const followsInDocument = (later: Node, earlier: Node) => Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SPM-155 status timeline: only the stages reached (commit 02e56aa3)", () => {
  // Kills: FM56, FM57
  /** CANCEL-REQUEST-04-SUP-TIMELINE (DERIVED): an event that is not cancelled shows the stages up to its current one and no later stage. */
  it.each([
    ["submitted", ["draft", "submitted"]],
    ["approved", ["draft", "submitted", "approved"]],
    ["planning", ["draft", "submitted", "approved", "planning"]],
    ["confirmed", ["draft", "submitted", "approved", "planning", "confirmed"]],
  ] as const)("CANCEL-REQUEST-04-SUP-TIMELINE: a %s event shows exactly %j", async (status, expected) => {
    // Arrange / Act
    renderAs(COO1, eventRecord({ status }));
    const timeline = await screen.findByRole("list", { name: "Event status timeline" });

    // Assert: the literal list of stages, in order
    expect(stagesOf(timeline)).toEqual(expected);
  });

  // Kills: FM58, FM59, FM63
  /** CANCEL-REQUEST-04-SUP-TIMELINE (DERIVED): a cancelled event shows the stages up to the one it was cancelled from, then Cancelled. */
  it.each([
    ["Submitted", ["draft", "submitted", "cancelled"]],
    ["Approved", ["draft", "submitted", "approved", "cancelled"]],
    ["Planning", ["draft", "submitted", "approved", "planning", "cancelled"]],
    ["Confirmed", ["draft", "submitted", "approved", "planning", "confirmed", "cancelled"]],
  ] as const)("CANCEL-REQUEST-04-SUP-TIMELINE: cancelled from %s shows exactly %j", async (from, expected) => {
    // Arrange
    renderAs(COO1, eventRecord({ status: "cancelled" }), { history: [{ fromStatus: from, toStatus: "Cancelled" }] });
    const timeline = await screen.findByRole("list", { name: "Event status timeline" });

    // Assert: after the history loads the stages stop at the one it was cancelled from
    await waitFor(() => expect(stagesOf(timeline)).toEqual(expected));
  });

  // Kills: FM58, FM59, FM61, FM62, FM63
  /** CANCEL-REQUEST-04-SUP-TIMELINE (DERIVED): the stage comes from the cancellation row of the history, not from another row. */
  it("CANCEL-REQUEST-04-SUP-TIMELINE: the cancellation row is used, whatever its position and the case of its text", async () => {
    // Arrange: two rows; the first is an earlier move, the second the cancellation from Planning
    renderAs(COO1, eventRecord({ status: "cancelled" }), {
      history: [
        { fromStatus: "Submitted", toStatus: "Approved" },
        { fromStatus: "PLANNING", toStatus: "CANCELLED" },
      ],
    });
    const timeline = await screen.findByRole("list", { name: "Event status timeline" });

    // Assert
    await waitFor(() => expect(stagesOf(timeline)).toEqual(["draft", "submitted", "approved", "planning", "cancelled"]));
  });

  // Kills: FM58, FM60, FM61
  /** CANCEL-REQUEST-04-SUP-TIMELINE (DERIVED): with no usable history the timeline shows Cancelled alone, never stages it cannot prove. */
  it.each([
    ["an empty history", []],
    ["a history with no cancellation row", [{ fromStatus: "Submitted", toStatus: "Approved" }]],
    ["a cancellation from a stage that is not on the timeline", [{ fromStatus: "Rejected", toStatus: "Cancelled" }]],
    ["a history that cannot be read", new Error("Unable to reach the server.")],
    ["a reply that is not a list", { message: "unexpected" }],
  ] as const)("CANCEL-REQUEST-04-SUP-TIMELINE: %s shows only cancelled", async (_label, history) => {
    // Arrange
    renderAs(COO1, eventRecord({ status: "cancelled" }), { history: history as History });
    const timeline = await screen.findByRole("list", { name: "Event status timeline" });
    await waitFor(() => expect(historyCalls().length).toBeGreaterThan(0));

    // Assert
    expect(stagesOf(timeline)).toEqual(["cancelled"]);
  });

  // Kills: FM106
  /** CANCEL-REQUEST-04-SUP-TIMELINE (DERIVED): a history row that names Cancelled as the origin does not add a second Cancelled step. */
  it("CANCEL-REQUEST-04-SUP-TIMELINE: a cancellation row whose origin is Cancelled shows Cancelled once", async () => {
    // Arrange
    renderAs(COO1, eventRecord({ status: "cancelled" }), { history: [{ fromStatus: "Cancelled", toStatus: "Cancelled" }] });
    const timeline = await screen.findByRole("list", { name: "Event status timeline" });
    await waitFor(() => expect(historyCalls().length).toBeGreaterThan(0));

    // Assert: the flow up to, and not past, its single Cancelled step
    await waitFor(() => expect(stagesOf(timeline)).toEqual(["draft", "submitted", "approved", "planning", "confirmed", "cancelled"]));
  });

  // Kills: FM64
  /** CANCEL-REQUEST-04-SUP-TIMELINE (DERIVED): the history is read only for a cancelled event. */
  it("CANCEL-REQUEST-04-SUP-TIMELINE: an event that is not cancelled does not read its status history for the timeline", async () => {
    // Arrange / Act: a Submitted event never shows the planning history panel either, so any call would be the timeline's
    renderAs(COO1, eventRecord({ status: "submitted" }));
    await screen.findByRole("list", { name: "Event status timeline" });

    // Assert
    expect(historyCalls()).toHaveLength(0);
  });

  // Kills: FM27, FM35, FM36, FM56, FM57, FM59, FM63, FM66
  /** CANCEL-REQUEST-04-A (page, DERIVED): accepting a request on the page moves the timeline from Confirmed to Confirmed then Cancelled. */
  it("CANCEL-REQUEST-04-SUP-TIMELINE: accepting the request extends the timeline with Cancelled after the stage it was cancelled from", async () => {
    // Arrange: a Confirmed event with a pending request; once cancelled its history says Confirmed to Cancelled
    const user = userEvent.setup();
    renderAs(COO1, eventRecord(), { requests: [pending], history: [{ fromStatus: "Confirmed", toStatus: "Cancelled" }] });
    const timeline = await screen.findByRole("list", { name: "Event status timeline" });
    expect(stagesOf(timeline)).toEqual(["draft", "submitted", "approved", "planning", "confirmed"]);

    // Act
    await user.click(await screen.findByRole("button", { name: "Accept" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm cancellation" }));

    // Assert
    await waitFor(() => expect(stagesOf(screen.getByRole("list", { name: "Event status timeline" }))).toEqual(["draft", "submitted", "approved", "planning", "confirmed", "cancelled"]));
  });
});

describe("SPM-155 status timeline across events", () => {
  // Kills: FM58, FM59, FM60, FM63, FM94
  /** CANCEL-REQUEST-04-SUP-TIMELINE (DERIVED): the stage of one cancelled event is not carried over to the next one whose history cannot be read. */
  it("CANCEL-REQUEST-04-SUP-TIMELINE: moving to another cancelled event whose history cannot be read drops the earlier event's stages", async () => {
    // Arrange: A was cancelled from Confirmed and its history reads; B was cancelled and its history fails
    const second = "00000000-0000-4000-8000-000000000157";
    const first = eventRecord({ status: "cancelled" });
    const other = eventRecord({ id: second, name: "Second Event", status: "cancelled" });
    apiMock.mockImplementation(((path: string) => {
      if (path === `/events/${EVENT_ID}/status-history`) return Promise.resolve([{ fromStatus: "Confirmed", toStatus: "Cancelled", changedAt: T0, changedBy: { id: "u", name: "Daniel Koh" } }]);
      if (path === `/events/${second}/status-history`) return Promise.reject(new Error("Unable to reach the server."));
      if (path.endsWith("/cancellation-requests")) return Promise.resolve([]);
      if (path.endsWith("/planning")) return Promise.resolve(planningView(path.includes(second) ? other : first));
      if (path.includes("/comments") || path.includes("/change-requests")) return Promise.resolve([]);
      if (path.endsWith("/arrangements-status")) return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [] });
      if (path.endsWith("/confirmed-arrangements")) return Promise.reject(new Error("not confirmed"));
      return Promise.resolve(path.includes(second) ? other : first);
    }) as typeof api);
    useAppStore.setState({ currentUser: { ...COO1, name: "coo-01", email: "coo-01@example.test" } as never, events: [first, other] });
    render(
      <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
        <Link to={`/events/${second}`}>Go to the second event</Link>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(stagesOf(screen.getByRole("list", { name: "Event status timeline" }))).toEqual(["draft", "submitted", "approved", "planning", "confirmed", "cancelled"]));

    // Act: open the second event
    await userEvent.click(screen.getByRole("link", { name: "Go to the second event" }));
    await screen.findByRole("heading", { name: "Second Event" });

    // Assert: its history cannot be read, so only Cancelled is shown, not the first event's stages
    await waitFor(() => expect(historyCalls().some(([path]) => String(path).includes(second))).toBe(true));
    await waitFor(() => expect(stagesOf(screen.getByRole("list", { name: "Event status timeline" }))).toEqual(["cancelled"]));
  });
});

describe("SPM-155 status timeline while another event's history loads", () => {
  // Kills: FM58, FM59, FM60, FM63, FM94
  /** CANCEL-REQUEST-04-SUP-TIMELINE (DERIVED): the origin of the previous cancelled event is not shown while the next one's history is loading. */
  it("CANCEL-REQUEST-04-SUP-TIMELINE: moving to another cancelled event shows only cancelled until its own history arrives", async () => {
    // Arrange: A was cancelled from Confirmed; B's history is held back
    const second = "00000000-0000-4000-8000-000000000158";
    const first = eventRecord({ status: "cancelled" });
    const other = eventRecord({ id: second, name: "Third Event", status: "cancelled" });
    let release: (rows: unknown[]) => void = () => undefined;
    const held = new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
    const row = (fromStatus: string) => ({ fromStatus, toStatus: "Cancelled", changedAt: T0, changedBy: { id: "u", name: "Daniel Koh" } });
    apiMock.mockImplementation(((path: string) => {
      if (path === `/events/${EVENT_ID}/status-history`) return Promise.resolve([row("Confirmed")]);
      if (path === `/events/${second}/status-history`) return held;
      if (path.endsWith("/cancellation-requests")) return Promise.resolve([]);
      if (path.endsWith("/planning")) return Promise.resolve(planningView(path.includes(second) ? other : first));
      if (path.includes("/comments") || path.includes("/change-requests")) return Promise.resolve([]);
      if (path.endsWith("/arrangements-status")) return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [] });
      if (path.endsWith("/confirmed-arrangements")) return Promise.reject(new Error("not confirmed"));
      return Promise.resolve(path.includes(second) ? other : first);
    }) as typeof api);
    useAppStore.setState({ currentUser: { ...COO1, name: "coo-01", email: "coo-01@example.test" } as never, events: [first, other] });
    render(
      <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
        <Link to={`/events/${second}`}>Go to the third event</Link>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(stagesOf(screen.getByRole("list", { name: "Event status timeline" }))).toEqual(["draft", "submitted", "approved", "planning", "confirmed", "cancelled"]));

    // Act: open the third event; its history has not arrived
    await userEvent.click(screen.getByRole("link", { name: "Go to the third event" }));
    await screen.findByRole("heading", { name: "Third Event" });
    await waitFor(() => expect(historyCalls().some(([path]) => String(path).includes(second))).toBe(true));

    // Assert 1: the first event's stages are gone while B's history is pending
    expect(stagesOf(screen.getByRole("list", { name: "Event status timeline" }))).toEqual(["cancelled"]);

    // Act 2 / Assert 2: when B's own history arrives (cancelled from Approved) its stages show
    release([row("Approved")]);
    await waitFor(() => expect(stagesOf(screen.getByRole("list", { name: "Event status timeline" }))).toEqual(["draft", "submitted", "approved", "cancelled"]));
  });
});

describe("SPM-155 panels last on the event page (commit 02e56aa3)", () => {
  // Kills: FM33, FM6b, FM83
  /** CANCEL-REQUEST-02-SUP-LAYOUT (DERIVED): the Organiser's request panel sits below the amendments and clarifications. */
  it("CANCEL-REQUEST-02-SUP-LAYOUT: the Organiser's request panel follows Clarification & Amendments", async () => {
    // Arrange / Act
    renderAs(ORG1, eventRecord({ status: "planning" }), { requests: [pending] });
    const clarifications = await screen.findByRole("heading", { name: "Clarification & Amendments" });
    const panel = await screen.findByRole("region", { name: "Cancellation request" });

    // Assert: below the amendments and clarifications and the status timeline, and only the Back link follows it
    expect(followsInDocument(panel, clarifications)).toBe(true);
    expect(followsInDocument(panel, screen.getByRole("list", { name: "Event status timeline" }))).toBe(true);
    // only the page's Back link follows the panel
    expect(panel.nextElementSibling?.textContent).toBe("← Back");
  });

  // Kills: FM35, FM82
  /** CANCEL-REQUEST-03-SUP-LAYOUT (DERIVED): the Coordinator's decision panel is the last thing on the page. */
  it("CANCEL-REQUEST-03-SUP-LAYOUT: the Coordinator's decision panel follows Clarification & Amendments", async () => {
    // Arrange / Act
    renderAs(COO1, eventRecord({ status: "planning" }), { requests: [pending] });
    const clarifications = await screen.findByRole("heading", { name: "Clarification & Amendments" });
    const panel = await screen.findByRole("region", { name: "Cancellation request" });

    // Assert: after the clarifications and the status timeline, and last on the page but for the Back link
    expect(followsInDocument(panel, clarifications)).toBe(true);
    expect(followsInDocument(panel, screen.getByRole("list", { name: "Event status timeline" }))).toBe(true);
    // only the page's Back link follows the panel
    expect(panel.nextElementSibling?.textContent).toBe("← Back");
  });
});
