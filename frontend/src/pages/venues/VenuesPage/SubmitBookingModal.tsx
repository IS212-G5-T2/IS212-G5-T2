import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord, Venue } from "@/types";
import { formatDateRange } from "@/utils/format";

export function SubmitBookingModal({
  event,
  venue,
  onClose,
}: {
  event: EventRecord | null;
  venue: Venue | null;
  onClose: () => void;
}) {
  const currentUser = useAppStore((s) => s.currentUser);
  const submitBookingRequest = useAppStore((s) => s.submitBookingRequest);
  const [submitted, setSubmitted] = useState(false);

  if (!event || !venue) return null;

  const submit = () => {
    submitBookingRequest({
      eventId: event.id,
      eventName: event.name,
      venueId: venue.id,
      venueName: venue.name,
      requestedBy: currentUser.name,
      start: event.startDateTime,
      end: event.endDateTime,
    });
    setSubmitted(true);
  };

  return (
    <Modal
      open={!!event && !!venue}
      onClose={() => {
        setSubmitted(false);
        onClose();
      }}
      title="Submit Venue Booking Request"
      footer={
        submitted ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>Submit Request</Button>
          </>
        )
      }
    >
      {submitted ? (
        <p className="text-sm text-success-800 dark:text-success-300">
          Booking request sent to Venue Staff for approval. You'll be notified once it's reviewed.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-400 dark:text-gray-500">Event</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">{event.name}</dd>
          </div>
          <div>
            <dt className="text-gray-400 dark:text-gray-500">Venue</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">{venue.name}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-400 dark:text-gray-500">Date / time</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">
              {formatDateRange(event.startDateTime, event.endDateTime)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-400 dark:text-gray-500">Venue requirements from event</dt>
            <dd className="font-medium text-gray-900 dark:text-gray-100">
              Capacity ≥ {event.venueRequirements.minCapacity}, {event.venueRequirements.facilities.join(", ") || "no specific facilities"}
            </dd>
          </div>
        </dl>
      )}
    </Modal>
  );
}
