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
  /** SPM-125 AC7: the event the booking is for, so the dialog can offer a replacement venue search. */
  eventId?: string;
  /** SPM-125 AC7: an unavailable period or setup/turnaround change affects the booking (SPM-122 AC7, SPM-121 AC8). */
  affected?: boolean;
}

/**
 * Read-only details of one of the Coordinator's venue bookings, opened from a venue booking decision notification
 * (SPM-137 AC3): the booking's current status and, if rejected, the rejection reason (SPM-55 AC4). It has no decision
 * controls: only Venue Staff decide (BookingDetailModal). SPM-125 AC7: the same dialog opens from a notice that a venue
 * change affects the booking; it then says so and offers the same "Find a replacement venue" search as the booking's
 * card (SPM-54 AC5).
 */
export function CoordinatorBookingDialog({ booking, onClose }: { booking: CoordinatorBookingDetails; onClose: () => void }) {
  // The same rule as the card's "Find a replacement venue" (BookingsPage).
  const canReplace =
    !!booking.eventId && (booking.affected || booking.status === "cancelled" || booking.status === "rejected");
  return (
    <Modal
      open
      onClose={onClose}
      title={`Booking details — ${booking.eventName}`}
      size="lg"
      footer={
        <>
          {canReplace && (
            <a
              className="inline-flex items-center rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              href={`/venues?eventId=${encodeURIComponent(booking.eventId!)}`}
            >
              Find a replacement venue
            </a>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
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
      {booking.affected && (
        <p role="status" className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          ⚠ This booking is affected by a venue availability change.
        </p>
      )}
      {booking.status === "rejected" && (
        <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-red-700 dark:border-gray-800 dark:text-red-400">
          Rejection reason: {booking.rejectionReason ?? "Not provided"}
        </p>
      )}
    </Modal>
  );
}
