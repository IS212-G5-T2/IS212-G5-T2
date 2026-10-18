import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import type { Booking } from "@/types";
import { BookingCard } from "./BookingCard";

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);
const item: Booking = { id: "booking-1", eventId: "event-1", eventName: "Forum", venueId: "venue-1", venueName: "Hall", requestedBy: "Coordinator", start: "2030-01-12T04:00:00Z", end: "2030-01-12T05:00:00Z", status: "pending", createdAt: "2030-01-01T00:00:00Z" };

beforeEach(() => { vi.resetAllMocks(); useAppStore.setState({ bookings: [item] }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("BookingCard cancellation (SPM-54)", () => {
  /** VEN-BKG-06-A: an affected original remains visible and identified while the coordinator considers a replacement. */
  it("identifies an affected original without cancelling or replacing it", async () => {
    const affected = { ...item, status: "approved" as const, affectedByUnavailablePeriod: true, bookingReference: "VB-ORIGINAL" };
    const onReview = vi.fn();
    render(<BookingCard booking={affected} onReview={onReview} />);

    expect(screen.getByRole("status")).toHaveTextContent("Affected by venue unavailability");
    expect(screen.getByRole("status")).toHaveTextContent("this booking remains unchanged");
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeInTheDocument();
    expect(screen.getByText("Hall")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().bookings).toEqual([item]);
  });

  /** VEN-BKG-09: declining cancellation leaves the selected request unchanged. */
  it("does not send a cancellation when the Coordinator declines confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<BookingCard booking={item} onReview={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(confirm).toHaveBeenCalledWith("This may be your last active venue booking for the event. Cancel this booking anyway?");
    expect(apiMock).not.toHaveBeenCalled();
  });

  /** VEN-BKG-09-B: an approved request can be cancelled after the same explicit last-active confirmation. */
  it("uses the explicit last-active confirmation for an approved request", async () => {
    useAppStore.setState({ bookings: [{ ...item, status: "approved" }] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<BookingCard booking={{ ...item, status: "approved" }} onReview={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancel booking" }));

    expect(confirm).toHaveBeenCalledWith("This may be your last active venue booking for the event. Cancel this booking anyway?");
    expect(apiMock).toHaveBeenCalledWith("/venues/booking-requests/booking-1/cancel", {
      method: "POST", body: JSON.stringify({ confirmLastActive: true }),
    });
  });

  /** VEN-BKG-09-C: rejected and cancelled history rows expose no cancellation action. */
  it.each(["rejected", "cancelled"] as const)("does not offer cancellation for a %s request", (status) => {
    render(<BookingCard booking={{ ...item, status }} onReview={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  /** VEN-BKG-10: a server-detected last-active booking asks for explicit confirmation and retries only after consent. */
  it("retries a stale last-active refusal after confirmation", async () => {
    useAppStore.setState({ bookings: [item, { ...item, id: "booking-2", venueId: "venue-2" }] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    apiMock.mockRejectedValueOnce(new ApiError("This is the last active venue booking for this event. Confirm cancellation to proceed.", undefined, undefined, 409)).mockResolvedValueOnce({} as never);
    const onCancelled = vi.fn();
    const user = userEvent.setup();
    render(<BookingCard booking={item} onReview={vi.fn()} onCancelled={onCancelled} />);
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(apiMock).toHaveBeenNthCalledWith(2, "/venues/booking-requests/booking-1/cancel", { method: "POST", body: JSON.stringify({ confirmLastActive: true }) });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onCancelled).toHaveBeenCalledOnce();
  });

  /** VEN-BKG-10: if the server discovers a final booking after a concurrent change, declining the second prompt leaves it untouched. */
  it("does not retry after declining the server's last-booking confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(true).mockReturnValueOnce(false);
    apiMock.mockRejectedValueOnce(new ApiError("This is the last active venue booking for this event.", undefined, undefined, 409));
    const user = userEvent.setup();
    render(<BookingCard booking={item} onReview={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(apiMock).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  /** VEN-BKG-09: a failed retry after explicit confirmation is reported without hiding the request. */
  it("shows a retry failure after the Coordinator confirms the last-booking warning", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useAppStore.setState({ bookings: [item, { ...item, id: "booking-2", venueId: "venue-2" }] });
    apiMock.mockRejectedValueOnce(new ApiError("This is the last active venue booking for this event.", undefined, undefined, 409)).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<BookingCard booking={item} onReview={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to cancel this booking.");
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /** VEN-BKG-09: API cancellation failures remain visible and the per-booking details action is preserved. */
  it("displays a cancellation error and retains the detail action", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    apiMock.mockRejectedValue(new ApiError("Cancellation denied", undefined, undefined, 403));
    const onReview = vi.fn();
    const user = userEvent.setup();
    render(<BookingCard booking={{ ...item, affectedByUnavailablePeriod: true, specialRequests: "Ramp" }} onReview={onReview} />);
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cancellation denied");
    expect(screen.getByRole("status")).toHaveTextContent("Affected by venue unavailability");
    expect(screen.getByText("Special requests: Ramp")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review Details" }));
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }));
  });
});
