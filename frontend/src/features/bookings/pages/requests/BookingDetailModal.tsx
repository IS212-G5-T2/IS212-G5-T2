import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { RadioGroup, TextArea } from "@/components/ui/FormControls";
import type { PendingBookingRequest, VenueBookingConflict } from "@/types";
import { api, ApiError } from "@/utils/api";
import { formatSingaporeDateTime, formatSingaporeRange } from "@/utils/format";

/**
 * Venue Staff decision on one pending request (SPM-55 AC2, AC3). Approve and reject call the
 * backend directly; the parent updates the booking's status through onDecided after success.
 */
export function BookingDetailModal({
  booking,
  onClose,
  onDecided,
  onConflict,
}: {
  booking: PendingBookingRequest | null;
  onClose: () => void;
  onDecided: (outcome: { id: string; status: "approved" | "rejected"; reason?: string; holdExpiresAt?: string }) => void;
  onConflict?: (message: string, conflicts?: VenueBookingConflict[]) => void;
}) {
  const [decision, setDecision] = useState<"approved" | "rejected" | "">("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isTentativeHold = booking?.requestKind === "tentative_hold";

  if (!booking) return null;

  // The submit button is disabled until a decision (and a rejection reason) is set, so no guard is needed here.
  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const path = `/venues/bookings/${encodeURIComponent(booking.id)}`;
      let holdExpiresAt: string | undefined;
      if (decision === "approved") {
        const result = await api<{ holdExpiresAt?: string }>(`${path}/approve`, { method: "POST" });
        holdExpiresAt = result.holdExpiresAt;
      } else {
        await api(`${path}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason: reason.trim() }),
        });
      }
      setDecision("");
      setReason("");
      onDecided({
        id: booking.id,
        status: decision as "approved" | "rejected",
        reason: decision === "rejected" ? reason.trim() : undefined,
        holdExpiresAt,
      });
      onClose();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "BOOKING_SLOT_CONFLICT" && onConflict) {
        onConflict(failure.message, failure.conflicts);
        onClose();
      } else {
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to submit this decision.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      title={`${isTentativeHold ? "Tentative Hold Request" : "Booking Request"} — ${booking.eventName}`}
      size="lg"
      footer={
        booking.status === "pending" ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant={decision === "rejected" ? "danger" : "primary"}
              disabled={
                !decision ||
                submitting ||
                (decision === "rejected" && !reason.trim())
              }
              onClick={() => void submit()}
            >
              Submit Decision
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
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
          <dt className="text-gray-400 dark:text-gray-500">Requested booking slot</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">
            {formatSingaporeRange(booking.start, booking.end)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Coordinator</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{booking.coordinatorName}</dd>
        </div>
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Booking reference</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{booking.bookingReference}</dd>
        </div>
        {booking.specialRequest && (
          <div className="sm:col-span-2">
            <dt className="text-gray-400 dark:text-gray-500">Special request</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">{booking.specialRequest}</dd>
          </div>
        )}
      </dl>

      {booking.reassessmentRequired && booking.status === "pending" && (
        <p role="status" className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          Venue setup changed after this request was submitted. Reassess the
          occupied period before approving it.
        </p>
      )}

      {isTentativeHold && booking.status === "pending" && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          If approved, this request activates a tentative hold for 14 days (336 hours) from approval. It does not confirm a booking.
        </p>
      )}

      {isTentativeHold && booking.status === "approved" && booking.holdExpiresAt && (
        <p role="status" className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          {booking.holdExpired ? "Expired tentative hold" : "Active tentative hold"} until {formatSingaporeDateTime(booking.holdExpiresAt)}.
        </p>
      )}

      {booking.status === "pending" ? (
        <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
          <RadioGroup
            label="Venue Staff Action"
            name="decision"
            value={decision}
            onChange={(v) => setDecision(v as "approved" | "rejected")}
            options={[
              { value: "approved", label: isTentativeHold ? "Approve — activate tentative hold" : "Approve — accept booking" },
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
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Decision: <span className="capitalize">{booking.status}</span>
          </p>
          {booking.status === "rejected" && (
            <p className="mt-1 text-sm text-red-700 dark:text-red-400">
              Rejection reason: {booking.rejectionReason ?? "Not provided"}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
