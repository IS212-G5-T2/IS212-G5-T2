import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import { BookingsPage } from "./BookingsPage";

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);
const booking = (id: string, venueName: string, status: "pending" | "approved" | "rejected" | "cancelled" = "pending") => ({
  id, eventId: "event-1", eventName: "Campus Forum", venueId: `venue-${id}`, venueName,
  start: "2030-01-12T04:00:00.000Z", end: "2030-01-12T05:00:00.000Z", status,
  specialRequests: "Step-free access", createdAt: "2030-01-01T00:00:00.000Z",
  affectedByUnavailablePeriod: false, bookingReference: `VB-${id}`,
});

beforeEach(() => {
  vi.resetAllMocks();
  useAppStore.setState({ currentUser: { id: "coord", name: "Coordinator", email: "coord@example.test", role: "coordinator" }, bookings: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("My Bookings (SPM-54)", () => {
  /** VEN-BKG-08: every booking for the event is listed with its own venue and status. */
  it("lists each event venue booking independently", async () => {
    apiMock.mockResolvedValue([booking("one", "North Hall"), booking("two", "Library Room", "approved"), booking("three", "Garden Pavilion", "rejected"), booking("four", "Studio", "cancelled")] as never);
    render(<BookingsPage />);
    expect(await screen.findByText("North Hall")).toBeInTheDocument();
    expect(screen.getByText("Library Room")).toBeInTheDocument();
    expect(screen.getByText("Garden Pavilion")).toBeInTheDocument();
    expect(screen.getByText("Studio")).toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(2);
    expect(screen.getAllByText("Approved")).toHaveLength(2);
    expect(screen.getAllByText("Rejected")).toHaveLength(2);
    expect(screen.getAllByText("Cancelled")).toHaveLength(2);
    expect(screen.getByText("VB-one")).toBeInTheDocument();
    expect(screen.getByText("VB-two")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/venues/my-bookings");
  });

  /** VEN-BKG-08: the status filter narrows the complete per-venue list without dropping other stored requests. */
  it("filters to the selected booking status", async () => {
    apiMock.mockResolvedValue([booking("one", "North Hall"), booking("two", "Library Room", "approved")] as never);
    const user = userEvent.setup();
    render(<BookingsPage />);
    await screen.findByText("North Hall");
    await user.selectOptions(screen.getByLabelText("Status filter"), "approved");
    expect(screen.getByText("Library Room")).toBeInTheDocument();
    expect(screen.queryByText("North Hall")).not.toBeInTheDocument();
  });

  /** VEN-BKG-08: a failed booking-list request is shown to the Coordinator. */
  it("shows an API error when the server cannot load My Bookings", async () => {
    apiMock.mockRejectedValue(new ApiError("Bookings unavailable", undefined, undefined, 503));
    render(<BookingsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Bookings unavailable");
  });

  /** VEN-BKG-08: the existing booking details view remains available from each booking row. */
  it("opens and closes the selected booking details", async () => {
    apiMock.mockResolvedValue([booking("one", "North Hall")] as never);
    const user = userEvent.setup();
    render(<BookingsPage />);
    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    expect(screen.getByRole("dialog", { name: "Booking Request — Campus Forum" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /** VEN-BKG-09/10: one booking can be cancelled, while the last active request requires explicit confirmation. */
  it("confirms a last active cancellation and sends it for only the selected booking", async () => {
    apiMock.mockResolvedValueOnce([booking("one", "North Hall")] as never)
      .mockResolvedValueOnce({ id: "one", eventId: "event-1", hasOtherActiveBookings: false } as never)
      .mockResolvedValueOnce([booking("one", "North Hall", "cancelled")] as never);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<BookingsPage />);
    await user.click(await screen.findByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/booking-requests/one/cancel", {
      method: "POST", body: JSON.stringify({ confirmLastActive: true }),
    }));
    expect(confirm).toHaveBeenCalledOnce();
  });

  /** VEN-BKG-10: another pending/confirmed venue booking suppresses the final-booking warning; cancellation stays row-specific. */
  it("cancels one request without the last-active warning when another active venue remains", async () => {
    apiMock.mockResolvedValueOnce([booking("one", "North Hall"), booking("two", "Library Room", "approved")] as never)
      .mockResolvedValueOnce({ id: "one", eventId: "event-1", hasOtherActiveBookings: true } as never)
      .mockResolvedValueOnce([booking("one", "North Hall", "cancelled"), booking("two", "Library Room", "approved")] as never);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<BookingsPage />);
    const cancelButtons = await screen.findAllByRole("button", { name: "Cancel booking" });
    await user.click(cancelButtons[0]);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/booking-requests/one/cancel", {
      method: "POST", body: JSON.stringify({ confirmLastActive: false }),
    }));
    expect(confirm).toHaveBeenCalledOnce();
  });
});
