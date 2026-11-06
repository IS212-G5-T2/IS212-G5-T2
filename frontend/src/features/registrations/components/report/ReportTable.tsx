import { NOT_PROVIDED } from "@/utils/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  REPORT_MESSAGES,
  formatReportDateTimeSgt,
  type ReportRow,
  type ReportStatusFilter,
} from "@/features/registrations/lib/registrationReport";

const COLUMNS = ["Name", "Email", "Contact Number", "Registration Date", "Status"] as const;

/**
 * SPM-63 AC3, SPM-138 owner decision: one row per registration the server sends, in its order (Confirmed by registration
 * date, then the waitlist by position, then the rest). Each row carries its status badge; a waitlisted row also shows its
 * position. Attendee-supplied text is rendered as text only; React escapes it.
 */
export function ReportTable({ registrations, filter = "all" }: { registrations: ReportRow[]; filter?: ReportStatusFilter }) {
  if (registrations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
        {filter === "all" ? REPORT_MESSAGES.empty : REPORT_MESSAGES.emptyForStatus}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="px-4 py-2 font-semibold text-gray-700 dark:text-gray-300">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {registrations.map((row) => (
            <tr key={row.registrationId}>
              <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{row.fullName || NOT_PROVIDED}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{row.email || NOT_PROVIDED}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{row.contactNumber || NOT_PROVIDED}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{formatReportDateTimeSgt(row.registeredAt)}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.status} />
                  {row.status === "waitlisted" && row.waitlistPosition !== undefined && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Position {row.waitlistPosition}</span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
