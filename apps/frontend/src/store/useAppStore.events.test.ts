import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { useAppStore } from "./useAppStore";
import type { EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function submittedEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "event-1",
    name: "Welcome Evening",
    purpose: "Community",
    description: "",
    organiserId: "organiser-9",
    organiserName: "Organiser Nine",
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

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockResolvedValue({});
  useAppStore.setState({ events: [submittedEvent()], notifications: [] });
});

describe("assignCoordinator", () => {
  it("optimistically assigns the coordinator and advances a submitted event to under_review", () => {
    useAppStore.getState().assignCoordinator("event-1", "coord-9", "Coord Nine");

    expect(useAppStore.getState().events[0]).toMatchObject({
      coordinatorId: "coord-9",
      coordinatorName: "Coord Nine",
      status: "under_review",
    });
  });

  it("persists the assignment to the backend with the coordinator identity", () => {
    useAppStore.getState().assignCoordinator("event-1", "coord-9", "Coord Nine");

    expect(apiMock).toHaveBeenCalledWith(
      "/events/event-1/assign",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = apiMock.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({
      coordinatorId: "coord-9",
      coordinatorName: "Coord Nine",
    });
  });

  it("notifies the organiser that a coordinator was assigned", () => {
    useAppStore.getState().assignCoordinator("event-1", "coord-9", "Coord Nine");

    expect(useAppStore.getState().notifications[0]).toMatchObject({
      type: "coordinator_assignment",
      audienceUserId: "organiser-9",
      relatedEventId: "event-1",
    });
  });

  it("leaves a non-submitted event's status unchanged while still assigning", () => {
    useAppStore.setState({ events: [submittedEvent({ status: "approved" })], notifications: [] });

    useAppStore.getState().assignCoordinator("event-1", "coord-9", "Coord Nine");

    expect(useAppStore.getState().events[0]).toMatchObject({
      coordinatorId: "coord-9",
      status: "approved",
    });
  });

  it("keeps the optimistic assignment even if the persistence call fails", async () => {
    apiMock.mockRejectedValue(new Error("offline"));

    useAppStore.getState().assignCoordinator("event-1", "coord-9", "Coord Nine");
    // Let the rejected persistence promise settle.
    await Promise.resolve();

    expect(useAppStore.getState().events[0]).toMatchObject({
      coordinatorId: "coord-9",
      status: "under_review",
    });
  });
});
