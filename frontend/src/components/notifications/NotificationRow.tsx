import { useId } from "react";
import { Link } from "react-router-dom";
import type { Notification } from "@/types";
import { formatDateTime, formatDecisionDate, timeAgo } from "@/utils/format";

// SPM-88 AC3: the bell never shows a reason; it is on the event detail page (AC4). Rejection messages carry none.
// SPM-65 change request denials still arrive as `Your change request for "<name>" was denied: <reason>` (that
// backend is unchanged), so the reason is cut off for display. The LAST separator is used so a name that itself
// contains `" was denied: ` stays whole. Old rejection rows that still hold `was rejected: <reason>` are not
// stripped: matching that phrase would cut a new rejection whose event name contains it.
const DENIED_SEPARATOR = '" was denied: ';
function headlineOf(message: string, type: Notification["type"]): string {
  if (type !== "change_request_denied") return message;
  const index = message.lastIndexOf(DENIED_SEPARATOR);
  return index === -1 ? message : `${message.slice(0, index + 1)} was denied`;
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
  const headline = headlineOf(n.message, n.type);
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
