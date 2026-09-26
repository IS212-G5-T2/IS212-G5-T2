import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { useAppStore } from "./useAppStore";
import type { EventRecord } from "@/types";

/**
 * SPM-40 — Approve a request. Store-level unit tests (Confluence: EVENT-APPROVE-02
 * — approval outcome, organiser notification, pending-list removal). RED / TDD:
 * the `approveEvent` store action does not exist yet, so every case fails at
 * runtime until the feature is implemented. Intended contract (mirrors
 * `rejectEvent`, minus the reason):
 *
 *   approveEvent(id: string)
 *     - sets the event status to "approved"
 *     - persists via POST /events/:id/approve
 *     - pushes an "approval" notification to the organiser
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

// Reference the not-yet-implemented action through a cast so the file type-checks
// while still failing at runtime (undefined is not a function).
type ApproveStore = { approveEvent: (id: string) => Promise<void> };
const approveEvent = (id: string) =>
  (useAppStore.getState() as unknown as ApproveStore).approveEvent(id);

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
    status: "submitted",
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
const PENDING = ["submitted"];

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockResolvedValue({});
  useAppStore.setState({ events: [pendingEvent()], notifications: [] });
});

describe("approveEvent (SPM-40)", () => {
  // EVENT-APPROVE-02-A
  it("sets the status to approved", () => {
    approveEvent("event-1");

    expect(useAppStore.getState().events[0]).toMatchObject({ status: "approved" });
  });

  it("persists the approval to the backend", () => {
    approveEvent("event-1");

    expect(apiMock).toHaveBeenCalledWith(
      "/events/event-1/approve",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // EVENT-APPROVE-02-B
  it("notifies the organiser of the approval", () => {
    approveEvent("event-1");

    const notification = useAppStore.getState().notifications[0];
    expect(notification).toMatchObject({
      type: "approval",
      audienceUserId: "organiser-9",
      relatedEventId: "event-1",
    });
    expect(notification.message).toContain("Welcome Evening");
  });

  // EVENT-APPROVE-02-C
  it("drops the approved request out of the coordinator's pending list", () => {
    useAppStore.setState({
      events: [
        pendingEvent({ id: "event-1", status: "submitted" }),
        pendingEvent({ id: "event-2", status: "submitted" }),
      ],
      notifications: [],
    });

    // Both are pending to begin with.
    const pendingBefore = useAppStore
      .getState()
      .events.filter((e) => PENDING.includes(e.status));
    expect(pendingBefore.map((e) => e.id)).toEqual(["event-1", "event-2"]);

    approveEvent("event-1");

    const pendingAfter = useAppStore
      .getState()
      .events.filter((e) => PENDING.includes(e.status));
    expect(pendingAfter.map((e) => e.id)).toEqual(["event-2"]);

    // The approved event still exists (now further down the pipeline).
    const approved = useAppStore.getState().events.find((e) => e.id === "event-1");
    expect(approved).toMatchObject({ status: "approved" });
  });

  it("restores the submitted request when persistence fails", async () => {
    apiMock.mockRejectedValueOnce(new Error("Approval failed"));

    await expect(approveEvent("event-1")).rejects.toThrow("Approval failed");

    expect(useAppStore.getState().events[0]).toMatchObject({ status: "submitted" });
    expect(useAppStore.getState().notifications).toEqual([]);
  });
});
