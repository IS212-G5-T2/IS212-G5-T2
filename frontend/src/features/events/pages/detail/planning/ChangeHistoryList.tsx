/*
 * Change history of an event's information during planning: every change the
 * assigned coordinator applied immediately (SPM-49, recorded since SPM-156) and
 * every flagged change that was confirmed or rejected (SPM-85 AC6), newest
 * first, with the original and resulting values, who and when. Read-only;
 * shown to the assigned coordinator and to the owning organiser.
 */
import type { ChangeHistoryEntry } from "@/types";
import { formatSgtDateTime } from "@/utils/sgtDate";
import { fieldLabel, formatFieldValue, historyOutcome } from "@/utils/planning";

export function ChangeHistoryList({
  history,
}: {
  history: ChangeHistoryEntry[];
}) {
  if (!history.length)
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No changes recorded yet.
      </p>
    );
  return (
    <ul aria-label="Change history" className="space-y-2 text-sm">
      {history.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
        >
          <span>
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {fieldLabel(entry.field)}:
            </span>{" "}
            <span>
              {formatFieldValue(entry.field, entry.originalValue)} →{" "}
              {formatFieldValue(entry.field, entry.proposedValue)}
            </span>
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">{historyOutcome(entry)}</span> by{" "}
            {entry.resolvedBy} ·{" "}
            <time dateTime={entry.resolvedAt}>
              {formatSgtDateTime(entry.resolvedAt)}
            </time>
          </span>
        </li>
      ))}
    </ul>
  );
}
