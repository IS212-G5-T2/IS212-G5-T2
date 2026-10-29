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
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockResolvedValue({});
  useAppStore.setState({ events: [pendingEvent()], notifications: [] });
});

describe("rejectEvent (SPM-83)", () => {
  // EVENT-REJECT-02-A
  // Kills: rejectEvent not setting status 'rejected', or dropping the reason from the stored event.
  it("sets the status to rejected and records the reason", () => {
    rejectEvent("event-1", "Budget not approved.");

    expect(useAppStore.getState().events[0]).toMatchObject({
      status: "rejected",
      rejectionReason: "Budget not approved.",
    });
  });

  // Kills: the reject request sent without POST, to another route, or with a body missing the reason.
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
  // Kills: no rejection notification, a notification missing the reason, or an audience other than the organiser.
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

  // EVENT-REJECT-02-C: the pending-list view itself is asserted on EventListPage (EventListPage.test.tsx,
  // "EVENT-REJECT-02-C"). This store test checks only the state the list reads: the rejected request is
  // no longer Submitted, and the other pending request is untouched.
  // Kills: the store changing the other submitted request too (update applied to every event).
  it("moves only the rejected request out of the Submitted status", () => {
    useAppStore.setState({
      events: [
        pendingEvent({ id: "event-1", status: "submitted" }),
        pendingEvent({ id: "event-2", status: "submitted" }),
      ],
      notifications: [],
    });

    rejectEvent("event-1", "Duplicate of an existing event.");

    const events = useAppStore.getState().events;
    expect(events.find((e) => e.id === "event-1")).toMatchObject({ status: "rejected" });
    expect(events.find((e) => e.id === "event-2")).toMatchObject({ status: "submitted" });
  });
});

describe("approveEvent (SPM-40)", () => {
  // EVENT-APPROVE-02-A
  // Kills: approveEvent not setting 'approved' on the decided event.
  it("sets the status to approved", () => {
    approveEvent("event-1");

    expect(useAppStore.getState().events[0]).toMatchObject({ status: "approved" });
  });

  // Kills: the approve request sent without POST, or to another route.
  it("persists the approval to the backend", () => {
    approveEvent("event-1");

    expect(apiMock).toHaveBeenCalledWith(
      "/events/event-1/approve",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // EVENT-APPROVE-02-B
  // Kills: no approval notification, or one whose message lacks the event name or whose audience and related event are wrong.
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

  // EVENT-APPROVE-02-C: the pending-list view itself is asserted on EventListPage (EventListPage.test.tsx,
  // "EVENT-APPROVE-02-C"). This store test checks only the state the list reads.
  // Kills: approving one request changing the other submitted request's status.
  it("moves only the approved request out of the Submitted status", () => {
    useAppStore.setState({
      events: [
        pendingEvent({ id: "event-1", status: "submitted" }),
        pendingEvent({ id: "event-2", status: "submitted" }),
      ],
      notifications: [],
    });

    approveEvent("event-1");

    const events = useAppStore.getState().events;
    expect(events.find((event) => event.id === "event-1")).toMatchObject({ status: "approved" });
    expect(events.find((event) => event.id === "event-2")).toMatchObject({ status: "submitted" });
  });

  // Kills: a failed approval leaving the event approved, or adding a notification despite the failure.
  it("restores the submitted request when persistence fails", async () => {
    apiMock.mockRejectedValueOnce(new Error("Approval failed"));

    await expect(approveEvent("event-1")).rejects.toThrow("Approval failed");

    expect(useAppStore.getState().events[0]).toMatchObject({ status: "submitted" });
    expect(useAppStore.getState().notifications).toEqual([]);
  });
});

// Decision actions must change only the request that was decided, including when the request is
// missing from the loaded list or when another request is loaded alongside it.
describe("decision actions and other loaded requests (SPM-40, SPM-83)", () => {
  // Kills: a server response replacing the whole events list, or changing the other event's name or status.
  /** An approval that the server confirms updates only the approved request. */
  it("approves one request and leaves the other loaded requests unchanged", async () => {
    useAppStore.setState({
      events: [pendingEvent(), pendingEvent({ id: "event-2", name: "Second Event" })],
      notifications: [],
    });
    apiMock.mockResolvedValueOnce(pendingEvent({ status: "approved" }));

    await approveEvent("event-1");

    const events = useAppStore.getState().events;
    expect(events.find((event) => event.id === "event-1")).toMatchObject({ status: "approved" });
    expect(events.find((event) => event.id === "event-2")).toMatchObject({
      name: "Second Event",
      status: "submitted",
    });
  });

  // Kills: a failed approval restoring the other loaded request, or leaving the failed request approved.
  /** A failed approval restores only the approved request and keeps the other loaded requests. */
  it("restores only the failed approval when another request is loaded", async () => {
    useAppStore.setState({
      events: [pendingEvent(), pendingEvent({ id: "event-2", name: "Second Event" })],
      notifications: [],
    });
    apiMock.mockRejectedValueOnce(new Error("Approval failed"));

    await expect(approveEvent("event-1")).rejects.toThrow("Approval failed");

    const events = useAppStore.getState().events;
    expect(events.find((event) => event.id === "event-1")).toMatchObject({ status: "submitted" });
    expect(events.find((event) => event.id === "event-2")).toMatchObject({
      name: "Second Event",
      status: "submitted",
    });
  });

  // Kills: an approval of an unloaded request inventing a notification or adding a loaded event.
  /** Approving a request that is not in the loaded list does not invent an organiser notification. */
  it("approves a request missing from the loaded list without adding a notification", async () => {
    useAppStore.setState({ events: [pendingEvent({ id: "event-2" })], notifications: [] });

    await approveEvent("event-1");

    expect(useAppStore.getState().notifications).toEqual([]);
    expect(apiMock).toHaveBeenCalledWith("/events/event-1/approve", { method: "POST" });
  });

  // Kills: a failed approval of an unloaded request altering or adding loaded events or notifications.
  /** A failed approval of a request missing from the loaded list leaves the loaded requests as they were. */
  it("keeps the loaded requests unchanged when approving a request missing from the list fails", async () => {
    useAppStore.setState({ events: [pendingEvent({ id: "event-2" })], notifications: [] });
    apiMock.mockRejectedValueOnce(new Error("Approval failed"));

    await expect(approveEvent("event-1")).rejects.toThrow("Approval failed");

    expect(useAppStore.getState().events).toEqual([pendingEvent({ id: "event-2" })]);
    expect(useAppStore.getState().notifications).toEqual([]);
  });

  // Kills: a rejection of an unloaded request not sent, or an organiser notification added for it.
  /** A rejection of a request missing from the loaded list is still sent, without an organiser notification. */
  it("sends a rejection for a request missing from the loaded list without adding a notification", () => {
    useAppStore.setState({ events: [pendingEvent({ id: "event-2" })], notifications: [] });

    rejectEvent("event-1", "Budget not approved.");

    expect(useAppStore.getState().notifications).toEqual([]);
    expect(apiMock).toHaveBeenCalledWith(
      "/events/event-1/reject",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
