import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
import {
  resolveFeedbackItem,
  unresolveFeedbackItem,
  requestSafetyCheck,
  type EquipmentRequestItem,
  type SafetyCheckFeedback,
  type VenueRequestItem,
} from "@/utils/arrangements";

interface Props {
  eventId: string;
  status: "changes_needed" | "rejected";
  feedback: SafetyCheckFeedback[];
  venues?: Pick<VenueRequestItem, "id" | "venueName">[];
  equipment?: Pick<EquipmentRequestItem, "id" | "name">[];
  blocking?: ("venue" | "equipment" | "registration")[];
  canRequestSafetyCheck: boolean;
  onRefresh: () => Promise<void>;
  pending: boolean;
  onError: (error: string) => void;
}

export function SafetyCheckChangesNeeded({
  eventId,
  status,
  feedback,
  venues = [],
  equipment = [],
  blocking = [],
  canRequestSafetyCheck,
  onRefresh,
  pending,
  onError,
}: Props) {
  const [itemPending, setItemPending] = useState<string | null>(null);

  const resolvedCount = feedback.filter((item) => item.resolvedByCoordinatorAt).length;
  const totalCount = feedback.length;
  const allResolved = resolvedCount === totalCount;
  const pendingApprovals = [
    ...(blocking.includes("venue") ? ["Venue Staff to approve the venue"] : []),
    ...(blocking.includes("equipment") ? ["Technical Support to reserve the equipment"] : []),
  ];

  const toggleResolution = useCallback(
    async (feedbackId: string, isResolved: boolean) => {
      setItemPending(feedbackId);
      try {
        if (isResolved) {
          await unresolveFeedbackItem(eventId, feedbackId);
        } else {
          await resolveFeedbackItem(eventId, feedbackId);
        }
        await onRefresh();
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Could not update feedback resolution.";
        onError(message);
      } finally {
        setItemPending(null);
      }
    },
    [eventId, onRefresh, onError],
  );

  const handleReRequest = useCallback(async () => {
    setItemPending("all");
    try {
      await requestSafetyCheck(eventId);
      await onRefresh();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Could not request the safety check.";
      onError(message);
    } finally {
      setItemPending(null);
    }
  }, [eventId, onRefresh, onError]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {status === "rejected" ? "Rejection feedback" : "Changes needed"}
      </h3>

      <div className="space-y-2">
        {feedback.map((item) => {
          const isResolved = !!item.resolvedByCoordinatorAt;
          const selectedVenues = new Set(item.reviewArrangements?.venueIds ?? []);
          const selectedEquipment = new Set(item.reviewArrangements?.equipmentIds ?? []);
          const arrangementTags = [
            ...venues
              .filter((venue) => selectedVenues.has(venue.id))
              .map((venue) => `Venue: ${venue.venueName}`),
            ...equipment
              .filter((entry) => selectedEquipment.has(entry.id))
              .map((entry) => `Equipment: ${entry.name}`),
          ];
          return (
            <label
              key={item.id}
              className={`flex items-start gap-3 rounded-lg p-3 transition-colors ${
                isResolved
                  ? "bg-success-50 dark:bg-success-900/20"
                  : "bg-gray-50 dark:bg-gray-900/30"
              }`}
            >
              <input
                type="checkbox"
                checked={isResolved}
                disabled={itemPending !== null || pending}
                onChange={() => toggleResolution(item.id, isResolved)}
                className="mt-0.5 flex-shrink-0"
              />
              <div className="flex-1">
                <p
                  className={`text-sm ${
                    isResolved
                      ? "line-through text-gray-500 opacity-60 dark:text-gray-400"
                      : "text-gray-800 dark:text-gray-200"
                  }`}
                >
                  {item.text}
                </p>
                {arrangementTags.length > 0 && (
                  <ul aria-label={`Arrangements to change for: ${item.text}`} className="mt-1 flex flex-wrap gap-1">
                    {arrangementTags.map((tag) => (
                      <li key={tag} className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isResolved
                    ? `Resolved by you – ${formatDateTime(item.resolvedByCoordinatorAt!)}`
                    : `Feedback from Safety Officer – ${formatDateTime(item.requestedAt)}`}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      <div className="space-y-2">
        {!allResolved && (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {resolvedCount} of {totalCount} items resolved. Complete all before re-requesting.
          </p>
        )}
        {allResolved && (
          <p className="text-sm text-success-700 dark:text-success-300">
            {canRequestSafetyCheck
              ? "All feedback checked off. You can re-request the safety check."
              : `All feedback checked off. Wait for ${pendingApprovals.length ? pendingApprovals.join(" and ") : "the selected arrangements to be approved or reserved"} before re-requesting.`}
          </p>
        )}
        <Button
          onClick={handleReRequest}
          disabled={!allResolved || pending || itemPending !== null || !canRequestSafetyCheck}
          aria-busy={pending || itemPending !== null}
        >
          Re-Request Safety Check
        </Button>
      </div>
    </div>
  );
}
