import { useId } from "react";
import { Link } from "react-router-dom";
import type { Notification } from "@/types";
import { formatDateTime, formatDecisionDate, timeAgo } from "@/utils/format";

// Rejections (and SPM-65 change request denials) carry a reason in one combined backend
// message: `... "<event name>" was rejected: <reason>`. The separator is taken only where it
// follows the closing quote of the event name, so a name that itself contains " was rejected: "
// keeps its full text (SPM-88 AC3). Other messages have no separator and stay intact.
const DECISION_SEPARATOR = /" was (rejected|denied): /;
function splitRejectionMessage(message: string): { headline: string; reason: string | null } {
  const match = DECISION_SEPARATOR.exec(message);
  if (!match) return { headline: message, reason: null };
  return {
    headline: `${message.slice(0, match.index + 1)} was ${match[1]}`,
    reason: message.slice(match.index + match[0].length),
  };
}

const CHANGE_REQUEST_DECISIONS = new Set<Notification["type"]>(["change_request_approved", "change_request_denied"]);

/**
 * One unread notification inside the top-bar bell dropdown (SPM-88, SC-SPM88-10). Every type uses the same
 * style so other roles' notifications can reuse the row later; only the link target depends on the type.
 */
export function NotificationRow({
  notification: n,
  onMarkRead,
  onOpen,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  /** Called when the row's link is followed, so the dropdown can close. */
  onOpen: () => void;
}) {
  // The headline describes this row's repeated "View Request" and "Mark As Read" controls for screen readers.
  const headlineId = useId();
  const { headline, reason } = splitRejectionMessage(n.message);
  const isChangeRequest = CHANGE_REQUEST_DECISIONS.has(n.type);
  const decisionDate = formatDecisionDate(n.createdAt);
  return (
    <li className="flex gap-3 px-4 py-3">
      <span
        aria-label="Unread"
        role="img"
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-600"
      />
      <div className="min-w-0 flex-1">
        <p id={headlineId} className="break-words text-sm text-gray-800 dark:text-gray-100">{headline}</p>
        {reason && (
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
            Reason: {reason}
          </pre>
        )}
        {/* An unparseable createdAt shows no time text rather than "NaN" (SPM-88). */}
        {decisionDate && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
              {timeAgo(n.createdAt)}
            </time>
            <time dateTime={n.createdAt}>{decisionDate}</time>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <Link
            aria-describedby={headlineId}
            className="font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
            to={isChangeRequest ? `/events/${n.relatedEventId}/change-requests` : `/events/${n.relatedEventId}`}
            // SPM-88 A3: opening a decision marks it read; navigation does not wait for the call.
            onClick={() => {
              if (!isChangeRequest) onMarkRead(n.id);
              onOpen();
            }}
          >
            {isChangeRequest ? "View Change Request" : "View Request"}
          </Link>
          <button
            type="button"
            aria-describedby={headlineId}
            className="text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
            onClick={() => onMarkRead(n.id)}
          >
            Mark As Read
          </button>
        </div>
      </div>
    </li>
  );
}
