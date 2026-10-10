import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { useAppStore } from "./useAppStore";
import type { EventRecord } from "@/types";

/**
 * Store decision actions: SPM-40 approval (EVENT-APPROVE-02) and SPM-83
 * rejection (EVENT-REJECT-02). Both start with the same pending event and
 * share the API mock; the test groups retain their separate outcomes.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

type RejectStore = { rejectEvent: (id: string, reason: string) => void };
const rejectEvent = (id: string, reason: string) =>
  (useAppStore.getState() as unknown as RejectStore).rejectEvent(id, reason);

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
        pendingEvent({ id: "event-2", status: "submitted" }),
      ],
      notifications: [],
    });

    // Both are pending to begin with.
    const pendingBefore = useAppStore
      .getState()
      .events.filter((e) => PENDING.includes(e.status));
    expect(pendingBefore.map((e) => e.id)).toEqual(["event-1", "event-2"]);

    rejectEvent("event-1", "Duplicate of an existing event.");

    const pendingAfter = useAppStore
      .getState()
      .events.filter((e) => PENDING.includes(e.status));
    expect(pendingAfter.map((e) => e.id)).toEqual(["event-2"]);

    // The rejected event still exists (now terminal) and remains retrievable.
    const rejected = useAppStore.getState().events.find((e) => e.id === "event-1");
    expect(rejected).toMatchObject({ status: "rejected" });
  });
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

    const pendingBefore = useAppStore.getState().events.filter((event) => PENDING.includes(event.status));
    expect(pendingBefore.map((event) => event.id)).toEqual(["event-1", "event-2"]);

    approveEvent("event-1");

    const pendingAfter = useAppStore.getState().events.filter((event) => PENDING.includes(event.status));
    expect(pendingAfter.map((event) => event.id)).toEqual(["event-2"]);
    const approved = useAppStore.getState().events.find((event) => event.id === "event-1");
    expect(approved).toMatchObject({ status: "approved" });
  });

  it("restores the submitted request when persistence fails", async () => {
    apiMock.mockRejectedValueOnce(new Error("Approval failed"));

    await expect(approveEvent("event-1")).rejects.toThrow("Approval failed");

    expect(useAppStore.getState().events[0]).toMatchObject({ status: "submitted" });
    expect(useAppStore.getState().notifications).toEqual([]);
  });
});
