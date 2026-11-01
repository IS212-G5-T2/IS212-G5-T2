import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatSingaporeRange } from "@/utils/format";

/** The parts of a Coordinator's own booking the details dialog shows (a subset of the /venues/bookings/mine row). */
export interface CoordinatorBookingDetails {
  id: string;
  eventName: string;
  venueName: string;
  start: string;
  end: string;
  status: string;
  bookingReference: string;
  specialRequest?: string;
  rejectionReason?: string;
}

/**
 * Read-only details of one of the Coordinator's venue bookings, opened from a venue booking decision notification
 * (SPM-137 AC3): the booking's current status and, if rejected, the rejection reason (SPM-55 AC4). It has no decision
 * controls: only Venue Staff decide (BookingDetailModal).
 */
export function CoordinatorBookingDialog({ booking, onClose }: { booking: CoordinatorBookingDetails; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={`Booking details — ${booking.eventName}`}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Event</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{booking.eventName}</dd>
        </div>
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Venue</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{booking.venueName}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-gray-400 dark:text-gray-500">Date and time (Singapore)</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{formatSingaporeRange(booking.start, booking.end)}</dd>
        </div>
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Booking reference</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{booking.bookingReference}</dd>
        </div>
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Status</dt>
          <dd className="font-medium capitalize text-gray-900 dark:text-gray-100">{booking.status}</dd>
        </div>
        {booking.specialRequest && (
          <div className="sm:col-span-2">
            <dt className="text-gray-400 dark:text-gray-500">Special request</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">{booking.specialRequest}</dd>
          </div>
        )}
      </dl>
      {booking.status === "rejected" && (
        <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-red-700 dark:border-gray-800 dark:text-red-400">
          Rejection reason: {booking.rejectionReason ?? "Not provided"}
        </p>
      )}
    </Modal>
  );
}
