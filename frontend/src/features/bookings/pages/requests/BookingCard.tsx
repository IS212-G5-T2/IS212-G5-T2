import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import type { Booking } from "@/types";
import { formatDateRange } from "@/utils/format";
import { api, ApiError } from "@/utils/api";
import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export function BookingCard({ booking, onReview, onCancelled }: { booking: Booking; onReview: (b: Booking) => void; onCancelled?: () => void }) {
  const [error, setError] = useState("");
  const bookings = useAppStore((state) => state.bookings);
  async function cancel() {
    const sendCancellation = (confirmLastActive: boolean) => api(`/venues/booking-requests/${encodeURIComponent(booking.id)}/cancel`, {
      method: "POST", body: JSON.stringify({ confirmLastActive }),
    });
    const lastActive = bookings.filter((item) => item.eventId === booking.eventId && (item.status === "pending" || item.status === "approved")).length === 1;
    const confirmation = lastActive
      ? window.confirm("This may be your last active venue booking for the event. Cancel this booking anyway?")
      : window.confirm("Cancel this venue booking request?");
    if (!confirmation) return;
    try {
      await sendCancellation(lastActive);
      onCancelled?.();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409 && failure.message.includes("last active venue booking")) {
        if (window.confirm("This is now the last active venue booking for the event. Cancel it anyway?")) {
          try { await sendCancellation(true); onCancelled?.(); }
          catch (retryFailure) { setError(retryFailure instanceof ApiError ? retryFailure.message : "Unable to cancel this booking."); }
        }
        return;
      }
      setError(failure instanceof ApiError ? failure.message : "Unable to cancel this booking.");
    }
  }
  return (
    <Card className={booking.conflict ? "border-warning-300 dark:border-warning-700" : undefined}>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{booking.eventName}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{booking.venueName}</p>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{formatDateRange(booking.start, booking.end)}</p>
        {booking.bookingReference && <p className="mt-1 text-sm">Booking reference: <strong>{booking.bookingReference}</strong></p>}
        {booking.affectedByUnavailablePeriod && <p role="status" className="text-sm text-danger-700 dark:text-danger-300">Affected by venue unavailability. Submit a replacement request for this event if needed; this booking remains unchanged.</p>}
        {booking.specialRequests && <p className="text-sm">Special requests: {booking.specialRequests}</p>}
        {(booking.status === "pending" || booking.status === "approved") && <Button size="sm" variant="danger" className="mt-3" onClick={() => void cancel()}>Cancel booking</Button>}
        {error && <p role="alert">{error}</p>}
        {booking.conflict && (
          <p className="mt-1 text-xs font-medium text-warning-700 dark:text-warning-300">⚠️ Possible conflict with existing booking</p>
        )}
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => onReview(booking)}>
          Review Details
        </Button>
      </CardBody>
    </Card>
  );
}
