import { REPORT_MESSAGES, formatReportDateTimeSgt, type ReportRow } from "@/features/registrations/lib/registrationReport";

const COLUMNS = ["Name", "Email", "Contact Number", "Registration Date", "Status"] as const;

/**
 * SPM-63 AC3: one row per Confirmed registration, in the order the server sends (registration date ascending).
 * Attendee-supplied text is rendered as text only; React escapes it.
 */
export function ReportTable({ registrations }: { registrations: ReportRow[] }) {
  if (registrations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
        {REPORT_MESSAGES.empty}
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
              <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{row.fullName}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{row.email}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{row.contactNumber}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{formatReportDateTimeSgt(row.registeredAt)}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
