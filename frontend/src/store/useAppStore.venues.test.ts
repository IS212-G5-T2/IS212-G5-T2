import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { useAppStore } from "./useAppStore";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

type UpdateVenueStore = {
  updateVenue: (id: string, venue: object) => Promise<{ message: string; affectedBookings: unknown[]; capacityBookings: unknown[] }>;
};
const updateVenue = (id: string, venue: object) =>
  (useAppStore.getState() as unknown as UpdateVenueStore).updateVenue(id, venue);

const venueId = "b9c6f700-85b1-4a79-96d8-5f5c3fd616fb";
const venueInput = {
  name: "Orchid Hall Updated",
  location: "Block B Level 1",
  capacity: 80,
  facilities: ["Wi-Fi"],
  accessibility: [],
  layouts: ["Theatre"],
  operatingInformation: "Weekdays",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};

beforeEach(() => vi.resetAllMocks());

describe("SPM-121 updateVenue store action", () => {
  /** VEN-UPD-05-STORE-A: successful PATCH returns message and booking lists. */
  it("VEN-UPD-05-STORE-A calls PATCH /venues/:id and returns message with booking lists", async () => {
    const updatedVenue = { id: venueId, ...venueInput, ownerId: "staff-1" };
    apiMock.mockResolvedValueOnce({
      venue: updatedVenue,
      message: "Venue updated successfully.",
      affectedBookings: [],
      capacityBookings: [],
    } as unknown as ReturnType<typeof api>);

    const result = await updateVenue(venueId, venueInput);

    expect(apiMock).toHaveBeenCalledWith(`/venues/${venueId}`, {
      method: "PATCH",
      body: JSON.stringify(venueInput),
    });
    expect(result.message).toBe("Venue updated successfully.");
    expect(result.affectedBookings).toEqual([]);
    expect(result.capacityBookings).toEqual([]);
  });

  /** VEN-UPD-09-STORE-A: capacityBookings from the server are passed through. */
  it("VEN-UPD-09-STORE-A passes through capacityBookings returned by the server", async () => {
    const capacityBooking = {
      bookingId: "bk-1",
      eventName: "Workshop",
      start: "2030-04-01T09:00:00.000Z",
      end: "2030-04-01T11:00:00.000Z",
      status: "approved",
    };
    apiMock.mockResolvedValueOnce({
      venue: { id: venueId, ...venueInput, ownerId: "staff-1" },
      message: "Venue updated successfully.",
      affectedBookings: [],
      capacityBookings: [capacityBooking],
    } as unknown as ReturnType<typeof api>);

    const result = await updateVenue(venueId, venueInput);

    expect(result.capacityBookings).toEqual([capacityBooking]);
  });
});
