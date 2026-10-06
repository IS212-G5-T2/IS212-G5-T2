import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ReportHeader } from "@/components/registrations/ReportHeader";
import { ReportTable } from "@/components/registrations/ReportTable";
import { useRegistrationReport } from "@/components/registrations/useRegistrationReport";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/api";
import {
  REPORT_MESSAGES,
  downloadReportExport,
  saveDownloadedFile,
  type ExportFormat,
} from "@/utils/registrationReport";

/**
 * SPM-63: the registration report for one event, shared by the assigned coordinator and the owning organiser. The
 * server decides access (assigned coordinator or owning organiser); a refusal shows MSG-08 and no data, and the route
 * deliberately has no client-side role redirect so an attendee is never bounced to the attendee view.
 */
export function RegistrationReportPage() {
  const { id = "" } = useParams();
  const { state, retry } = useRegistrationReport(id);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState("");

  async function exportAs(format: ExportFormat) {
    setDownloading(format);
    setExportError("");
    try {
      const { blob, filename } = await downloadReportExport(id, format);
      saveDownloadedFile(blob, filename);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) useAppStore.setState({ isAuthenticated: false });
      setExportError(error instanceof Error ? error.message : "The export failed. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

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
        capacity={report.event.capacity}
        availableSpots={report.availableSpots}
      />
      <div className="mb-4 flex gap-2">
        <Button variant="secondary" disabled={downloading !== null} onClick={() => void exportAs("csv")}>
          Export as CSV
        </Button>
        <Button variant="secondary" disabled={downloading !== null} onClick={() => void exportAs("pdf")}>
          Export as PDF
        </Button>
      </div>
      {exportError && <div role="alert" className="mb-4">{exportError}</div>}
      <ReportTable registrations={report.registrations} />
    </div>
  );
}
