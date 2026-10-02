/*
 * SPM-61 store actions (D14): GETs auto-retry transient failures with
 * exponential backoff; the registration POST is never retried automatically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./useAppStore";
import { ApiError, api } from "@/utils/api";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const attendee = { id: "attendee-1", name: "Alice", email: "a@example.com", role: "attendee" as const };
const registration = { id: "REG-1", eventId: "e1", attendeeId: "attendee-1", attendeeName: "Alice", status: "registered" as const, registeredAt: "2030-01-01T00:00:00.000Z" };
const details = { fullName: "Alice", email: "a@example.com", contactNumber: "", specialRequirements: "" };

beforeEach(() => {
  apiMock.mockReset();
  useAppStore.setState({ isAuthenticated: true, currentUser: attendee, registrations: [] });
});
afterEach(() => vi.useRealTimers());

describe("SPM-61 loadMyRegistration (D14 GET retry)", () => {
  // A network failure is retried with backoff and then succeeds.
  it("retries a transient failure with exponential backoff", async () => {
    vi.useFakeTimers();
    apiMock
      .mockRejectedValueOnce(new ApiError("Unable to reach the server."))
      .mockRejectedValueOnce(new ApiError("down", undefined, undefined, 503))
      .mockResolvedValueOnce({ registration });
    const loading = useAppStore.getState().loadMyRegistration("e1");
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await loading;
    expect(apiMock).toHaveBeenCalledTimes(3);
    expect(useAppStore.getState().registrations).toEqual([registration]);
  });
  // Client errors are not transient and are not retried.
  it("does not retry a 4xx error", async () => {
    apiMock.mockRejectedValue(new ApiError("Attendee access required.", undefined, undefined, 403));
    await expect(useAppStore.getState().loadMyRegistration("e1")).rejects.toThrow("Attendee access required.");
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
  // A null registration clears any stale local copy for this attendee and event.
  it("clears a stale local registration when the server has none", async () => {
    useAppStore.setState({ registrations: [registration] });
    apiMock.mockResolvedValue({ registration: null });
    await useAppStore.getState().loadMyRegistration("e1");
    expect(useAppStore.getState().registrations).toEqual([]);
  });
});

describe("SPM-61 registerForEvent (D14 no POST retry)", () => {
  // A failed POST is attempted exactly once and surfaces the error.
  it("does not retry a failed POST", async () => {
    apiMock.mockRejectedValue(new ApiError("Unable to reach the server."));
    await expect(useAppStore.getState().registerForEvent("e1", details)).rejects.toThrow();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
  // A non-attendee session never sends the request.
  it("refuses to send for a non-attendee", async () => {
    useAppStore.setState({ currentUser: { ...attendee, role: "organiser" } });
    await expect(useAppStore.getState().registerForEvent("e1", details)).rejects.toThrow("Only signed-in attendees");
    expect(apiMock).not.toHaveBeenCalled();
  });
});
