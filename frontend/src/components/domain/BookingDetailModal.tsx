import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { RadioGroup, TextArea } from "@/components/ui/FormControls";
import { ConflictAlert } from "./ConflictAlert";
import { useAppStore } from "@/store/useAppStore";
import type { Booking } from "@/types";
import { formatDateRange } from "@/utils/format";

export function BookingDetailModal({
  booking,
  onClose,
}: {
  booking: Booking | null;
  onClose: () => void;
}) {
  const reviewBooking = useAppStore((s) => s.reviewBooking);
  const [decision, setDecision] = useState<"approved" | "rejected" | "">("");
  const [reason, setReason] = useState("");

  if (!booking) return null;

  const submit = () => {
    if (!decision) return;
    reviewBooking(booking.id, decision, decision === "rejected" ? reason : undefined);
    setDecision("");
    setReason("");
    onClose();
  };

  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      title={`Booking Request — ${booking.eventName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decision === "rejected" ? "danger" : "primary"}
            disabled={!decision || (decision === "rejected" && !reason.trim())}
            onClick={submit}
          >
            Submit Decision
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
        <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
          <RadioGroup
            label="Venue Staff Action"
            name="decision"
            value={decision}
            onChange={(v) => setDecision(v as "approved" | "rejected")}
            options={[
              { value: "approved", label: "Approve — accept booking" },
              { value: "rejected", label: "Reject — provide reason" },
            ]}
          />
          {decision === "rejected" && (
            <TextArea
              label="Rejection reason"
              required
              placeholder="e.g. Conflict with existing booking"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          This request was already {booking.status}
          {booking.rejectionReason ? `: ${booking.rejectionReason}` : "."}
        </p>
      )}
    </Modal>
  );
}
