import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { useAppStore } from "./useAppStore";
import type { EventRecord } from "@/types";

/**
 * SPM-83 — Reject a request. Store-level unit tests (Confluence: EVENT-REJECT-02
 * — rejection outcome, organiser notification, pending-list removal). These are
 * RED / TDD: the `rejectEvent` store action does not exist yet, so every case
 * fails at runtime until the feature is implemented. Intended contract:
 *
 *   rejectEvent(id: string, reason: string)
 *     - sets the event status to "rejected" and records the trimmed reason on
 *       `rejectionReason`
 *     - persists via POST /events/:id/reject with { reason }
 *     - pushes a "rejection" notification to the organiser including the reason
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

// Reference the not-yet-implemented action through a cast so the file type-checks
// while still failing at runtime (undefined is not a function).
type RejectStore = { rejectEvent: (id: string, reason: string) => void };
const rejectEvent = (id: string, reason: string) =>
  (useAppStore.getState() as unknown as RejectStore).rejectEvent(id, reason);

function pendingEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "event-1",
    name: "Welcome Evening",
    purpose: "Community",
    description: "",
    organiserId: "organiser-9",
    organiserName: "Organiser Nine",
    coordinatorId: "coordinator-1",
    coordinatorName: "Coordinator One",
    status: "under_review",
    startDateTime: "2026-10-01T09:00:00.000Z",
    endDateTime: "2026-10-01T10:00:00.000Z",
    expectedAttendance: 10,
    venueRequirements: { minCapacity: 10, layout: "", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

// Statuses that count as "awaiting review" in the coordinator's pending list.
const REVIEWABLE = ["submitted", "under_review"];

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockResolvedValue({});
  useAppStore.setState({ events: [pendingEvent()], notifications: [] });
});

describe("rejectEvent (SPM-83)", () => {
  // EVENT-REJECT-02-A
  it("sets the status to rejected and records the reason", () => {
    rejectEvent("event-1", "Budget not approved.");

    expect(useAppStore.getState().events[0]).toMatchObject({
      status: "rejected",
      rejectionReason: "Budget not approved.",
    });
  });

  it("persists the rejection to the backend with the reason", () => {
    rejectEvent("event-1", "Budget not approved.");

    expect(apiMock).toHaveBeenCalledWith(
      "/events/event-1/reject",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = apiMock.mock.calls.find(([p]) => String(p).includes("/reject"))!;
    expect(JSON.parse(init!.body as string)).toEqual({ reason: "Budget not approved." });
  });

  // EVENT-REJECT-02-B
  it("notifies the organiser of the rejection, including the reason", () => {
    rejectEvent("event-1", "Room capacity too low.");

    const notification = useAppStore.getState().notifications[0];
    expect(notification).toMatchObject({
      type: "rejection",
      audienceUserId: "organiser-9",
      relatedEventId: "event-1",
    });
    expect(notification.message).toContain("Room capacity too low.");
  });

  // EVENT-REJECT-02-C
  it("drops the rejected request out of the coordinator's pending list", () => {
    useAppStore.setState({
      events: [
        pendingEvent({ id: "event-1", status: "submitted" }),
        pendingEvent({ id: "event-2", status: "under_review" }),
      ],
      notifications: [],
    });

    // Both are pending to begin with.
    const pendingBefore = useAppStore
      .getState()
      .events.filter((e) => REVIEWABLE.includes(e.status));
    expect(pendingBefore.map((e) => e.id)).toEqual(["event-1", "event-2"]);

    rejectEvent("event-1", "Duplicate of an existing event.");

    const pendingAfter = useAppStore
      .getState()
      .events.filter((e) => REVIEWABLE.includes(e.status));
    expect(pendingAfter.map((e) => e.id)).toEqual(["event-2"]);

    // The rejected event still exists (now terminal) and remains retrievable.
    const rejected = useAppStore.getState().events.find((e) => e.id === "event-1");
    expect(rejected).toMatchObject({ status: "rejected" });
  });
});
