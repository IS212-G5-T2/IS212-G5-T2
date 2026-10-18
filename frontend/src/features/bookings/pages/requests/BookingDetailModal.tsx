import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ConflictAlert } from "./ConflictAlert";
import type { Booking } from "@/types";
import { formatDateRange } from "@/utils/format";

export function BookingDetailModal({
  booking,
  onClose,
}: {
  booking: Booking | null;
  onClose: () => void;
}) {
  if (!booking) return null;

  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      title={`Booking Request — ${booking.eventName}`}
      size="lg"
      footer={
        <>
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
          <dt className="text-gray-400 dark:text-gray-500">Date / Time</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{formatDateRange(booking.start, booking.end)}</dd>
        </div>
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Requested by</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{booking.requestedBy}</dd>
        </div>
      </dl>

      {booking.conflict && (
        <div className="mt-4">
          <ConflictAlert conflict={booking.conflict} />
        </div>
      )}

      {booking.status === "pending" ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          This request is pending review by Venue Staff.
        </p>
      ) : (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          This request was already {booking.status}
          {booking.rejectionReason ? `: ${booking.rejectionReason}` : "."}
        </p>
      )}
    </Modal>
  );
}
