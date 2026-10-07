import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { useAppStore } from "./useAppStore";
import type { EventRecord, Venue, VenueCreateInput } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function venueCreateInput(venue: Venue): VenueCreateInput {
  return {
    name: venue.name,
    location: venue.location,
    capacity: venue.capacity,
    facilities: venue.facilities,
    accessibility: venue.accessibility,
    layouts: venue.layouts,
    operatingInformation: venue.operatingInformation,
    operatingDays: venue.operatingDays,
    operatingStartTime: venue.operatingStartTime,
    operatingEndTime: venue.operatingEndTime,
    setupTimeMinutes: venue.setupTimeMinutes,
    turnaroundTimeMinutes: venue.turnaroundTimeMinutes,
  };
}

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

describe("createVenue", () => {
  // SPM-50 / VEN-CRE-05-A: creation does not update the separate catalogue feature.
  it("persists a venue and leaves catalogue state unchanged", async () => {
    // Arrange the complete Confluence fixture returned by the API.
    const venue: Venue = {
      id: "b9c6f700-85b1-4a79-96d8-5f5c3fd616fb",
      name: "Orchid Hall Test",
      location: "Test Building Level 3",
      capacity: 120,
      facilities: ["AV System", "Wi-Fi"],
      accessibility: ["Wheelchair access"],
      layouts: ["Classroom", "Theatre"],
      operatingInformation: "Closed on public holidays",
      operatingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      operatingStartTime: "08:00",
      operatingEndTime: "22:00",
      setupTimeMinutes: 30,
      turnaroundTimeMinutes: 45,
    };
    apiMock.mockResolvedValueOnce({ venue, message: "Venue created successfully." });
    const existingVenue: Venue = { ...venue, id: "existing-venue" };
    useAppStore.setState({ venues: [existingVenue] });
    // Act through the public store operation.
    const input = venueCreateInput(venue);
    await expect(useAppStore.getState().createVenue(input)).resolves.toBe(
      "Venue created successfully.",
    );
    // Assert the exact backend payload without coupling creation to catalogue display.
    expect(apiMock).toHaveBeenCalledWith("/venues", {
      method: "POST",
      body: JSON.stringify(input),
    });
    expect(useAppStore.getState().venues).toEqual([existingVenue]);
  });

  // SPM-50 / VEN-CRE-05-C: a failed create returns the API failure and never mutates the separate catalogue state.
  it("propagates a venue-create failure without changing catalogue state", async () => {
    const failure = new Error("Venue persistence failed");
    apiMock.mockRejectedValueOnce(failure);
    const existingVenue = { ...submittedEvent(), id: "not-a-venue" } as unknown as Venue;
    useAppStore.setState({ venues: [existingVenue] });

    await expect(
      useAppStore.getState().createVenue(
        venueCreateInput({
          ...existingVenue,
          id: "b9c6f700-85b1-4a79-96d8-5f5c3fd616fb",
          name: "Orchid Hall Test",
          location: "Test Building Level 3",
          capacity: 120,
          facilities: ["AV System"],
          accessibility: [],
          layouts: ["Classroom"],
          operatingInformation: "Closed on public holidays",
          operatingDays: ["Monday"],
          operatingStartTime: "08:00",
          operatingEndTime: "22:00",
          setupTimeMinutes: 30,
          turnaroundTimeMinutes: 45,
        }),
      ),
    ).rejects.toBe(failure);
    expect(useAppStore.getState().venues).toEqual([existingVenue]);
  });
});
