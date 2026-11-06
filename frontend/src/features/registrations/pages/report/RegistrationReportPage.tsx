import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ReportHeader } from "@/features/registrations/components/report/ReportHeader";
import { ReportTable } from "@/features/registrations/components/report/ReportTable";
import { useRegistrationReport } from "@/features/registrations/components/report/useRegistrationReport";
import { useReportExport } from "@/features/registrations/components/report/useReportExport";
import {
  REPORT_MESSAGES,
  REPORT_STATUS_FILTERS,
  type ReportStatusFilter,
} from "@/features/registrations/lib/registrationReport";

/**
 * SPM-63: the registration report for one event, shared by the assigned coordinator and the owning organiser. The
 * server decides access (assigned coordinator or owning organiser); a refusal shows MSG-08 and no data, and the route
 * deliberately has no client-side role redirect so an attendee is never bounced to the attendee view.
 */
export function RegistrationReportPage() {
  const { id = "" } = useParams();
  // The status filter drives the request, so the header counts and the table come from the same response; the exports
  // use the same filter.
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("all");
  const { state, retry } = useRegistrationReport(id, statusFilter);
  const { downloading, exportError, exportAs } = useReportExport(id, statusFilter);

  if (state.status === "loading") return <p role="status">Loading registration report…</p>;
  if (state.status === "forbidden") return <div role="alert">{REPORT_MESSAGES.forbidden}</div>;
  if (state.status === "error") {
    return (
      <div role="alert">
        {state.message}{" "}
        <Button variant="secondary" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }

  const { report } = state;
  return (
    <div>
      <ReportHeader
        eventName={report.event.name}
        totalConfirmed={report.totalConfirmed}
        waitlistCount={report.waitlistCount}
        capacity={report.event.capacity}
        availableSpots={report.availableSpots}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="report-status-filter" className="text-gray-600 dark:text-gray-400">
          Status
        </label>
        <select
          id="report-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ReportStatusFilter)}
          className="min-w-[9rem] rounded-lg border border-gray-300 bg-white py-2 pl-2 pr-6 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          {REPORT_STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-4 flex gap-2">
        <Button variant="secondary" disabled={downloading !== null} onClick={() => void exportAs("csv")}>
          Export As CSV
        </Button>
        <Button variant="secondary" disabled={downloading !== null} onClick={() => void exportAs("pdf")}>
          Export As PDF
        </Button>
      </div>
      {exportError && <div role="alert" className="mb-4">{exportError}</div>}
      <ReportTable registrations={report.registrations} filter={statusFilter} />
    </div>
  );
}
