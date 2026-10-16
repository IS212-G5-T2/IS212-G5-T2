import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/api";
import {
  downloadReportExport,
  saveDownloadedFile,
  type ExportFormat,
  type ReportStatusFilter,
} from "@/features/registrations/lib/registrationReport";

/**
 * Downloads the server-generated CSV/PDF for one event with the status filter on screen (the export holds the same rows);
 * a 401 ends the session, other failures are returned as text.
 */
export function useReportExport(eventId: string, filter: ReportStatusFilter = "all") {
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState("");

  async function exportAs(format: ExportFormat) {
    setDownloading(format);
    setExportError("");
    try {
      const { blob, filename } = await downloadReportExport(eventId, format, filter);
      saveDownloadedFile(blob, filename);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) useAppStore.setState({ isAuthenticated: false });
      setExportError(error instanceof Error ? error.message : "The export failed. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

  return { downloading, exportError, exportAs };
}
