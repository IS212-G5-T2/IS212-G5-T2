import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import type { PendingBookingRequest } from "@/types";
import { formatSingaporeDateTime, formatSingaporeRange } from "@/utils/format";

/** Renders one venue booking for Venue Staff (pending, approved, or rejected — SPM-55 AC1). */
export function BookingCard({
  booking,
  onReview,
}: {
  booking: PendingBookingRequest;
  onReview: (b: PendingBookingRequest) => void;
}) {
  const decided = booking.status === "approved" || booking.status === "rejected";
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{booking.eventName}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Venue: {booking.venueName}</p>
            {booking.requestKind === "tentative_hold" && (
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Tentative hold request</p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">Coordinator: {booking.coordinatorName}</p>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {formatSingaporeRange(booking.start, booking.end)}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Reference {booking.bookingReference}</p>
        {booking.specialRequest && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Special request: {booking.specialRequest}</p>
        )}
        {booking.reassessmentRequired && booking.status === "pending" && (
          <p role="status" className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-200">
            Venue setup changed. Reassess the occupied period before approval.
          </p>
        )}
        {booking.requestKind === "tentative_hold" && booking.status === "approved" && booking.holdExpiresAt && (
          <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
            {booking.holdExpired ? "Expired tentative hold" : "Active tentative hold"} until {formatSingaporeDateTime(booking.holdExpiresAt)}
          </p>
        )}
        {booking.status === "rejected" && (
          <p className="mt-1 text-sm text-red-700 dark:text-red-400">
            Rejection reason: {booking.rejectionReason ?? "Not provided"}
          </p>
        )}
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => onReview(booking)}>
          {decided ? "View Details" : "Review Details"}
        </Button>
      </CardBody>
    </Card>
  );
}
