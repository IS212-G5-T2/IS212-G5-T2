import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
import {
  resolveFeedbackItem,
  unresolveFeedbackItem,
  requestSafetyCheck,
  type SafetyCheckFeedback,
} from "@/utils/arrangements";

interface Props {
  eventId: string;
  status: "changes_needed" | "rejected";
  feedback: SafetyCheckFeedback[];
  canRequestSafetyCheck: boolean;
  onRefresh: () => Promise<void>;
  pending: boolean;
  onError: (error: string) => void;
}

export function SafetyCheckChangesNeeded({
  eventId,
  status,
  feedback,
  canRequestSafetyCheck,
  onRefresh,
  pending,
  onError,
}: Props) {
  const [itemPending, setItemPending] = useState<string | null>(null);

  const resolvedCount = feedback.filter((item) => item.resolvedByCoordinatorAt).length;
  const totalCount = feedback.length;
  const allResolved = resolvedCount === totalCount;

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
      <p className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger-800 dark:bg-danger-900/30 dark:text-danger-300">
          {status === "rejected" ? "Rejected" : "Changes needed"}
        </span>
      </p>

      <div className="space-y-2">
        {feedback.map((item) => {
          const isResolved = !!item.resolvedByCoordinatorAt;
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
            All items resolved. Safety Officer will review your changes.
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
