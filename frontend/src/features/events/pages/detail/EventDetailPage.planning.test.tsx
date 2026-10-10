import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { ApiError, api } from "@/utils/api";
import { PLANNING_REFRESH_MS } from "@/utils/planning";
import { formatDateTime } from "@/utils/format";
import type { ChangeHistoryEntry, EventRecord, FlaggedChange, PlanningView } from "@/types";

/**
 * SPM-97 (organiser), SPM-49 and SPM-85 (coordinator) on EventDetailPage.
 * Contract: for planning-phase events the page fetches GET /events/:id/planning
 * (organiser, or the assigned coordinator only), renders a region named
 * "Planning information", and re-fetches every PLANNING_REFRESH_MS while the tab
 * is visible. Assigned coordinators also get the update form and the review
 * panel, which call PATCH /events/:id/planning and
 * POST /events/:id/planning/changes/:changeId/resolve.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000049";

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: EVENT_ID,
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "organiser-1",
    organiserName: "Demo Organiser",
    coordinatorId: "coordinator-1",
    coordinatorName: "Demo Coordinator",
    status: "planning",
    startDateTime: "2026-11-10T10:00:00.000Z",
    endDateTime: "2026-11-10T13:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: ["Catering"], accessibility: ["Wheelchair ramps"] },
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-10-04T09:00:00.000Z",
    ...overrides,
  };
}

function planningView(overrides: Partial<PlanningView> = {}): PlanningView {
  return {
    event: eventRecord(),
    venueBookings: [
      { id: "bk-1", venueName: "Hall A", start: "2026-11-10T10:00:00.000Z", end: "2026-11-10T13:00:00.000Z", status: "Booked" },
    ],
    equipmentArrangements: [{ id: "eq-1", name: "Projector", quantity: 2, status: "Reserved" }],
    pendingChanges: [],
    readOnly: true,
    editableFields: [],
    lastUpdatedAt: "2026-10-04T09:00:00.000Z",
    ...overrides,
  };
}

let currentView: PlanningView;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const planningRegion = () => screen.findByRole("region", { name: /planning information/i });

beforeEach(() => {
  vi.clearAllMocks();
  currentView = planningView();
  apiMock.mockImplementation((async (path: string) => {
    if (path.endsWith("/planning")) return currentView;
    if (path.includes("/comments")) return [];
    return currentView.event;
  }) as typeof api);
  useAppStore.setState({
    currentUser: { id: "organiser-1", name: "Demo Organiser", email: "organiser@example.test", role: "organiser" },
    events: [],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EventDetailPage planning information (organiser)", () => {
  // EVENT-VIEW-01-A: once the event is in planning the organiser sees the planning panel.
  it("EVENT-VIEW-01-A shows the planning information panel for a planning-phase event", async () => {
    renderPage();
    expect(await planningRegion()).toBeInTheDocument();
  });

  // EVENT-VIEW-01-B: before planning there is no panel and the planning endpoint is not called.
  it("EVENT-VIEW-01-B hides the planning panel while the event is only submitted", async () => {
    currentView = planningView({ event: eventRecord({ status: "submitted" }) });
    renderPage();
    await screen.findByText("Event Details");
    expect(screen.queryByRole("region", { name: /planning information/i })).not.toBeInTheDocument();
    expect(apiMock.mock.calls.some(([path]) => String(path).endsWith("/planning"))).toBe(false);
  });

  // EVENT-VIEW-02-A: the organiser sees the current venue, equipment and booking status.
  it("EVENT-VIEW-02-A lists the booked venue, equipment arrangement and their status", async () => {
    renderPage();
    const region = await planningRegion();
    expect(within(region).getByText(/Hall A/)).toBeInTheDocument();
    expect(within(region).getByText(/Booked/)).toBeInTheDocument();
    expect(within(region).getByText(/Projector/)).toBeInTheDocument();
    expect(within(region).getByText(/Reserved/)).toBeInTheDocument();
  });

  // EVENT-VIEW-03-A: a field with a change pending because of a booking conflict is marked.
  it("EVENT-VIEW-03-A marks a conflict-driven pending change on the affected field", async () => {
    currentView = planningView({
      pendingChanges: [
        { id: "chg-1", kind: "booking_conflict", field: "expectedAttendance", currentValue: 80, proposedValue: 150, status: "Needs Review", impacts: [] },
      ],
    });
    renderPage();
    const region = await planningRegion();
    expect(within(region).getByText(/change pending/i)).toBeInTheDocument();
    expect(within(region).getByText(/booking conflict/i)).toBeInTheDocument();
  });

  // EVENT-VIEW-03-B: an unavailable booked venue is shown as needing a replacement.
  it("EVENT-VIEW-03-B shows that a replacement venue is required", async () => {
    currentView = planningView({
      venueBookings: [{ id: "bk-1", venueName: "Hall A", start: "2026-11-10T10:00:00.000Z", end: "2026-11-10T13:00:00.000Z", status: "Unavailable" }],
      pendingChanges: [
        { id: "venue-bk-1", kind: "replacement_venue_required", field: "venue", bookingId: "bk-1", venueName: "Hall A", status: "Needs Review" },
      ],
    });
    renderPage();
    const region = await planningRegion();
    expect(within(region).getByText(/replacement venue required/i)).toBeInTheDocument();
  });

  // EVENT-VIEW-04-A: the organiser's panel has no way to edit anything.
  it("EVENT-VIEW-04-A offers no edit controls to the organiser", async () => {
    renderPage();
    const region = await planningRegion();
    const editButtons = within(region)
      .queryAllByRole("button")
      .filter((button) => /edit|update|save|confirm|reject/i.test(button.textContent ?? ""));
    expect(editButtons).toHaveLength(0);
    for (const role of ["textbox", "spinbutton", "checkbox", "combobox"]) {
      expect(within(region).queryAllByRole(role)).toHaveLength(0);
    }
    expect(screen.queryByRole("link", { name: /^edit$/i })).not.toBeInTheDocument();
  });

  // EVENT-VIEW-05-A: after the coordinator resolves a change the page updates by itself.
  it("EVENT-VIEW-05-A refreshes automatically once the pending change is resolved", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    currentView = planningView({
      pendingChanges: [
        { id: "chg-1", kind: "booking_conflict", field: "expectedAttendance", currentValue: 80, proposedValue: 150, status: "Needs Review", impacts: [] },
      ],
    });
    renderPage();
    const region = await planningRegion();
    expect(within(region).getByText(/change pending/i)).toBeInTheDocument();

    // The coordinator confirms the change on the server; the organiser does nothing.
    currentView = planningView({ event: eventRecord({ expectedAttendance: 150 }), pendingChanges: [] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLANNING_REFRESH_MS);
    });

    await waitFor(() => {
      const refreshed = screen.getByRole("region", { name: /planning information/i });
      expect(within(refreshed).getByText(/150/)).toBeInTheDocument();
      expect(within(refreshed).queryByText(/change pending/i)).not.toBeInTheDocument();
    });
  });
});
// ---------------------------------------------------------------------------
// Gap coverage: coordinator flows, lifecycle, polling and failure handling.
// ---------------------------------------------------------------------------

const COORDINATOR_USER = {
  id: "coordinator-1",
  name: "Demo Coordinator",
  email: "coordinator@example.test",
  role: "coordinator" as const,
};

const PENDING_CHANGE: FlaggedChange = {
  id: "chg-1",
  kind: "booking_conflict",
  field: "expectedAttendance",
  currentValue: 80,
  proposedValue: 150,
  status: "Needs Review",
  impacts: [
    {
      bookingId: "bk-1",
      venueName: "Hall A",
      impacted: true,
      conflicts: [{ kind: "capacity", detail: "Attendance 150 exceeds capacity 100" }],
    },
    { bookingId: "bk-2", venueName: "Hall B", impacted: false, conflicts: [] },
  ],
  equipmentImpacts: [],
};

const HISTORY: ChangeHistoryEntry[] = [
  {
    id: "chg-0",
    field: "layout",
    originalValue: "Banquet",
    proposedValue: "Theatre",
    resolvedValue: "Banquet",
    resolvedBy: "Demo Coordinator",
    resolvedAt: "2026-10-03T10:00:00.000Z",
    status: "Rejected",
  },
];

// Fields whose change needs review once a booking exists; the rest apply directly.
const REVIEW_FIELDS = ["startDateTime", "endDateTime", "expectedAttendance", "layout", "facilities", "equipmentNeeds"];
const EDITABLE_FIELDS = [
  ...["name", "purpose", "description", "accessibility"].map((field) => ({ field, mode: "direct" as const })),
  ...REVIEW_FIELDS.map((field) => ({ field, mode: "needs_review" as const })),
];

let history: ChangeHistoryEntry[];

const planningCalls = () => apiMock.mock.calls.filter(([path]) => String(path).endsWith("/planning"));
const callsTo = (suffix: string, method?: string) =>
  apiMock.mock.calls.filter(
    ([path, init]) => String(path).endsWith(suffix) && (method ? (init as RequestInit | undefined)?.method === method : true),
  );

function asCoordinator(view: Partial<PlanningView> = {}) {
  useAppStore.setState({ currentUser: COORDINATOR_USER, events: [] });
  history = [...HISTORY];
  currentView = planningView({
    readOnly: false,
    editableFields: EDITABLE_FIELDS,
    pendingChanges: [PENDING_CHANGE],
    ...view,
  });
  apiMock.mockImplementation((async (path: string, init?: RequestInit) => {
    if (path.endsWith("/planning") && init?.method === "PATCH")
      return { event: currentView.event, applied: [], flagged: [], updatedAt: currentView.lastUpdatedAt };
    if (path.endsWith("/planning")) return currentView;
    if (path.endsWith("/planning/history")) return history;
    if (path.includes("/planning/changes/")) return { event: currentView.event, closed: true };
    if (path.includes("/comments")) return [];
    return currentView.event;
  }) as typeof api);
}

describe("EventDetailPage planning information (coordinator)", () => {
  // EVENT-UPDATE-01-A / EVENT-UPDATE-02-A / EVENT-FLAG-02-A: the assigned coordinator gets the form, the review panel and the history.
  it("EVENT-UPDATE-01-A shows the assigned coordinator the update form, pending changes and history", async () => {
    asCoordinator();
    renderPage();

    const form = await screen.findByRole("form", { name: /update event information/i });
    expect(within(form).getByLabelText(/expected attendance/i)).toHaveValue(80);
    expect(within(form).getAllByText("Needs review")).toHaveLength(REVIEW_FIELDS.length);

    const card = await screen.findByRole("article", { name: /expected attendance/i });
    expect(within(card).getByText("Proposed value").nextElementSibling).toHaveTextContent("150");
    expect(within(card).getByRole("group", { name: /hall a/i })).toHaveTextContent(/exceeds capacity/i);
    expect(within(screen.getByRole("list", { name: /change history/i })).getAllByRole("listitem")).toHaveLength(1);
    expect(callsTo("/planning/history")).toHaveLength(1);
  });

  // EVENT-UPDATE-03-A: saving sends only the changed fields, then re-reads the view.
  it("EVENT-UPDATE-03-A saves only the changed fields and then refreshes the planning view", async () => {
    asCoordinator();
    const user = userEvent.setup();
    renderPage();
    const form = await screen.findByRole("form", { name: /update event information/i });
    const before = planningCalls().length;

    // Attendance has a change awaiting review in this fixture, so it is locked;
    // edit a field that is free to change.
    await user.type(within(form).getByLabelText(/event name/i), " 2");
    await user.click(within(form).getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(callsTo("/planning", "PATCH")).toHaveLength(1));
    expect(callsTo("/planning", "PATCH")[0][0]).toBe(`/events/${EVENT_ID}/planning`);
    expect(JSON.parse(String((callsTo("/planning", "PATCH")[0][1] as RequestInit).body))).toEqual({
      name: "Welcome Evening 2",
    });
    await waitFor(() => expect(planningCalls().length).toBeGreaterThan(before + 1));
  });

  // EVENT-FLAG-03-A / 04-A / 07-A: each action posts its decision to the right change, then refreshes.
  it.each([
    ["Confirm change", "confirm", undefined],
    ["Reject change", "reject", undefined],
    ["Confirm for this booking", "confirm", "bk-1"],
    ["Reject for this booking", "reject", "bk-1"],
  ])("EVENT-FLAG-04-A the %s action posts the decision", async (label, decision, bookingId) => {
    asCoordinator();
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole("article", { name: /expected attendance/i });
    const historyBefore = callsTo("/planning/history").length;

    await user.click(within(card).getByRole("button", { name: label }));

    await waitFor(() => expect(callsTo("/resolve", "POST")).toHaveLength(1));
    const [path, init] = callsTo("/resolve", "POST")[0];
    expect(path).toBe(`/events/${EVENT_ID}/planning/changes/chg-1/resolve`);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(bookingId ? { decision, bookingId } : { decision });
    await waitFor(() => expect(callsTo("/planning/history").length).toBeGreaterThan(historyBefore));
  });

  // EVENT-FLAG-04-A: a refused decision is reported on the change and the actions stay available.
  it("EVENT-FLAG-04-A shows why a decision was refused and keeps the actions available", async () => {
    asCoordinator();
    const baseline = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((async (path: string, init?: RequestInit) => {
      if (path.includes("/planning/changes/")) throw new ApiError("This change has already been resolved.");
      return baseline(path, init);
    }) as typeof api);
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole("article", { name: /expected attendance/i });

    await user.click(within(card).getByRole("button", { name: "Confirm change" }));

    expect(await within(card).findByRole("alert")).toHaveTextContent("This change has already been resolved.");
    expect(within(card).getByRole("button", { name: "Confirm change" })).toBeEnabled();
  });

  // EVENT-UPDATE-01-B: a coordinator who is not assigned to the event never loads planning data.
  it("EVENT-UPDATE-01-B does not load planning information for an unassigned coordinator", async () => {
    asCoordinator({ event: eventRecord({ coordinatorId: "someone-else" }) });
    renderPage();
    await screen.findByText("Event Details");
    expect(planningCalls()).toHaveLength(0);
    expect(screen.queryByRole("form", { name: /update event information/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /planning information/i })).not.toBeInTheDocument();
  });

  // EVENT-VIEW-01-B: no other role gets planning information, even for an approved event.
  it.each(["attendee", "venue_staff", "tech_support"] as const)(
    "EVENT-VIEW-01-B never loads planning information for the %s role",
    async (role) => {
      asCoordinator({ event: eventRecord({ status: "approved" }) });
      useAppStore.setState({ currentUser: { ...COORDINATOR_USER, id: `${role}-1`, role } });
      renderPage();
      await screen.findByText("Event Details");
      expect(planningCalls()).toHaveLength(0);
      expect(screen.queryByRole("region", { name: /planning information/i })).not.toBeInTheDocument();
    },
  );

  // EVENT-VIEW-01-C: a Confirmed event is shown read-only, with no form, to the organiser and the coordinator.
  it.each([
    ["organiser", { id: "organiser-1", name: "Demo Organiser", email: "o@example.test", role: "organiser" as const }],
    ["coordinator", COORDINATOR_USER],
  ])("EVENT-VIEW-01-C shows a Confirmed event to the %s without any edit controls", async (_label, user) => {
    asCoordinator({ event: eventRecord({ status: "confirmed" }), readOnly: true, editableFields: [], pendingChanges: [] });
    useAppStore.setState({ currentUser: user });
    renderPage();
    const region = await planningRegion();
    expect(region).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /update event information/i })).not.toBeInTheDocument();
    expect(within(region).queryAllByRole("button")).toHaveLength(0);
  });

  // EVENT-VIEW-05-B: AC5 — background refreshes pause while the tab is hidden and resume when it is visible again.
  it("EVENT-VIEW-05-B skips the automatic refresh while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    asCoordinator();
    useAppStore.setState({ currentUser: { id: "organiser-1", name: "Demo Organiser", email: "o@example.test", role: "organiser" } });
    renderPage();
    await planningRegion();
    const loaded = planningCalls().length;

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLANNING_REFRESH_MS * 2);
      });
      expect(planningCalls()).toHaveLength(loaded);
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLANNING_REFRESH_MS);
    });
    expect(planningCalls().length).toBeGreaterThan(loaded);
  });

  // EVENT-VIEW-05-C: a failed refresh keeps the last data on screen and tells the user.
  it("EVENT-VIEW-05-C keeps the last planning data and shows an alert when a refresh fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    asCoordinator();
    useAppStore.setState({ currentUser: { id: "organiser-1", name: "Demo Organiser", email: "o@example.test", role: "organiser" } });
    renderPage();
    const region = await planningRegion();
    expect(within(region).getByText(/Hall A/)).toBeInTheDocument();

    const baseline = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((async (path: string, init?: RequestInit) => {
      if (path.endsWith("/planning")) throw new ApiError("Server down");
      return baseline(path, init);
    }) as typeof api);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLANNING_REFRESH_MS);
    });

    const refreshed = await planningRegion();
    expect(within(refreshed).getByText(/Hall A/)).toBeInTheDocument();
    expect(within(refreshed).getByRole("alert")).toHaveTextContent("Could not refresh planning information: Server down");
  });

  // EVENT-VIEW-05-C: with nothing loaded yet, a failure is shown instead of a blank page.
  it("EVENT-VIEW-05-C shows an alert instead of a blank panel when planning information cannot be loaded", async () => {
    asCoordinator();
    useAppStore.setState({ currentUser: { id: "organiser-1", name: "Demo Organiser", email: "o@example.test", role: "organiser" } });
    const baseline = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((async (path: string, init?: RequestInit) => {
      if (path.endsWith("/planning")) throw new ApiError("Server down");
      return baseline(path, init);
    }) as typeof api);
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not refresh planning information: Server down");
    expect(screen.queryByRole("region", { name: /planning information/i })).not.toBeInTheDocument();
    expect(screen.getByText("Event Details")).toBeInTheDocument();
  });

  // EVENT-VIEW-02-A: a response that is not planning data is ignored rather than crashing the page.
  it("EVENT-VIEW-02-A treats a malformed planning response as an error, not as data", async () => {
    asCoordinator();
    useAppStore.setState({ currentUser: { id: "organiser-1", name: "Demo Organiser", email: "o@example.test", role: "organiser" } });
    const baseline = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((async (path: string, init?: RequestInit) =>
      path.endsWith("/planning") ? { unexpected: true } : baseline(path, init)) as typeof api);
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Planning information could not be read.");
    expect(screen.getByText("Event Details")).toBeInTheDocument();
  });
});

describe("EventDetailPage planning: multi-role accounts (SPM-49 AC1)", () => {
  // Primary (display) role is organiser, but the account also holds coordinator.
  const ORGANISER_AND_COORDINATOR = {
    id: "coordinator-1",
    name: "Dual Role User",
    email: "dual@example.test",
    role: "organiser" as const,
    roles: ["organiser" as const, "coordinator" as const],
  };

  // EVENT-UPDATE-01-D: an assigned coordinator who is also an organiser gets the
  // editing UI, exactly as the backend allows.
  it("EVENT-UPDATE-01-D shows the update form to an assigned coordinator whose primary role is organiser", async () => {
    asCoordinator();
    useAppStore.setState({ currentUser: ORGANISER_AND_COORDINATOR });
    renderPage();
    // The form and the review panel both render for the dual-role account.
    expect(await screen.findByRole("form", { name: /update event information/i })).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: /expected attendance/i })).toBeInTheDocument();
    // History is coordinator-only, so it is loaded for this account too.
    await waitFor(() => expect(callsTo("/planning/history")).toHaveLength(1));
  });

  // EVENT-UPDATE-01-D: holding the coordinator role is not enough; the account
  // must be the assigned coordinator, and an organiser who does not own the
  // event does not load planning data either.
  it("EVENT-UPDATE-01-D does not show the form to a dual-role account that is neither assigned nor owner", async () => {
    asCoordinator({ event: eventRecord({ coordinatorId: "someone-else", organiserId: "someone-else" }) });
    useAppStore.setState({ currentUser: ORGANISER_AND_COORDINATOR });
    renderPage();
    await screen.findByText("Event Details");
    expect(planningCalls()).toHaveLength(0);
    expect(screen.queryByRole("form", { name: /update event information/i })).not.toBeInTheDocument();
  });

  // EVENT-VIEW-01-A: the same dual-role account still gets the read-only view
  // for an event it owns but does not coordinate.
  it("EVENT-VIEW-01-A shows a dual-role owner the read-only view of an event they do not coordinate", async () => {
    asCoordinator({
      event: eventRecord({ coordinatorId: "someone-else", organiserId: "coordinator-1" }),
      readOnly: true,
      editableFields: [],
    });
    useAppStore.setState({ currentUser: ORGANISER_AND_COORDINATOR });
    renderPage();
    expect(await planningRegion()).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /update event information/i })).not.toBeInTheDocument();
  });
});

describe("EventDetailPage planning: the form shows authoritative values after a save (SPM-49 / SPM-85)", () => {
  const LAYOUT_CHANGE: FlaggedChange = {
    id: "chg-layout",
    kind: "booking_conflict",
    field: "layout",
    currentValue: "Banquet",
    proposedValue: "Theatre",
    status: "Needs Review",
    impacts: [
      { bookingId: "bk-1", venueName: "Hall A", impacted: true, conflicts: [{ kind: "requirements", detail: "Check that Hall A supports the Theatre layout" }] },
    ],
    equipmentImpacts: [],
  };

  // Server double: the PATCH flags the layout change and leaves the event
  // untouched; the next GET reports it as pending.
  function flagLayoutOnSave() {
    const route = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((async (path: string, init?: RequestInit) => {
      if (path.endsWith("/planning") && init?.method === "PATCH") {
        currentView = { ...currentView, pendingChanges: [...currentView.pendingChanges, LAYOUT_CHANGE] };
        return { event: currentView.event, applied: [], flagged: [LAYOUT_CHANGE], updatedAt: currentView.lastUpdatedAt };
      }
      return route(path, init);
    }) as typeof api);
  }

  // EVENT-FLAG-01-E: after a flagged-only save the form goes back to the current
  // value, shows the proposal separately and locks the field so it cannot be
  // re-submitted by accident.
  it("EVENT-FLAG-01-E resets a flagged field to its current value and shows the proposal separately", async () => {
    asCoordinator({ pendingChanges: [] });
    flagLayoutOnSave();
    const user = userEvent.setup();
    renderPage();
    const form = await screen.findByRole("form", { name: /update event information/i });

    // Act: propose a layout that needs review.
    await user.selectOptions(within(form).getByLabelText(/room layout/i), "Theatre");
    await user.click(within(form).getByRole("button", { name: /save changes/i }));

    // Assert: the field shows the real current value again and is locked...
    await waitFor(() => expect(within(form).getByLabelText(/room layout/i)).toHaveValue("Banquet"));
    expect(within(form).getByLabelText(/room layout/i)).toBeDisabled();
    // ...the proposal is shown separately, and the outcome is explained.
    expect(within(form).getByTestId("pending-layout")).toHaveTextContent("proposed: Theatre");
    expect(within(form).getByRole("status")).toHaveTextContent(/sent for review/i);
    expect(within(form).getByRole("status")).toHaveTextContent(/current values stay in place/i);
  });

  // EVENT-FLAG-01-E: a second save does not resend the proposal that is awaiting review.
  it("EVENT-FLAG-01-E does not resend a flagged proposal on the next save", async () => {
    asCoordinator({ pendingChanges: [] });
    flagLayoutOnSave();
    const user = userEvent.setup();
    renderPage();
    const form = await screen.findByRole("form", { name: /update event information/i });
    await user.selectOptions(within(form).getByLabelText(/room layout/i), "Theatre");
    await user.click(within(form).getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(within(form).getByLabelText(/room layout/i)).toBeDisabled());

    // Act: save again without touching anything.
    await user.click(within(form).getByRole("button", { name: /save changes/i }));

    // Assert: nothing to send, so only the first PATCH ever went out.
    expect(within(form).getByRole("alert")).toHaveTextContent("No changes to save.");
    expect(callsTo("/planning", "PATCH")).toHaveLength(1);
  });

  // EVENT-UPDATE-05-A: when a save applies a change, the refreshed view has a new
  // lastUpdatedAt; the form updates in place and keeps the confirmation visible.
  it("EVENT-UPDATE-05-A keeps the confirmation and shows the saved value after the view refreshes", async () => {
    asCoordinator({ pendingChanges: [] });
    const route = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((async (path: string, init?: RequestInit) => {
      if (path.endsWith("/planning") && init?.method === "PATCH") {
        const event = eventRecord({ name: "Orientation Night", updatedAt: "2026-10-05T08:00:00.000Z" });
        currentView = { ...currentView, event, lastUpdatedAt: event.updatedAt };
        return { event, applied: ["name"], flagged: [], updatedAt: event.updatedAt };
      }
      return route(path, init);
    }) as typeof api);
    const user = userEvent.setup();
    renderPage();
    const form = await screen.findByRole("form", { name: /update event information/i });

    await user.clear(within(form).getByLabelText(/event name/i));
    await user.type(within(form).getByLabelText(/event name/i), "Orientation Night");
    await user.click(within(form).getByRole("button", { name: /save changes/i }));

    // The confirmation survives the refresh, and the field holds the saved value.
    expect(await within(form).findByRole("status")).toHaveTextContent("Changes saved.");
    await waitFor(() =>
      expect(within(form).getByText((content) => content.includes(formatDateTime("2026-10-05T08:00:00.000Z")))).toBeInTheDocument(),
    );
    expect(within(form).getByRole("status")).toHaveTextContent("Changes saved.");
    expect(within(form).getByLabelText(/event name/i)).toHaveValue("Orientation Night");
  });
});
