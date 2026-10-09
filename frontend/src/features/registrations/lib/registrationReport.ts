/*
 * SPM-63 registration report: contract types, display formats and the authenticated file download. The wording and
 * date formats mirror backend/src/registrations/report-format.ts (the CSV and PDF use the same text). Instants arrive
 * as UTC ISO strings and are always displayed in Singapore time. The access decision belongs to the server; the
 * link rule here only decides whether to OFFER the report.
 */
import type { User } from "@/types";
import { ApiError, api, apiBaseUrl } from "@/utils/api";

export interface ReportRow {
  registrationId: string;
  fullName: string;
  email: string;
  contactNumber: string;
  registeredAt: string;
  status: "Confirmed";
  specialRequirements?: string;
}

export interface RegistrationReport {
  event: { id: string; name: string; startDateTime: string; endDateTime: string; capacity: number };
  totalConfirmed: number;
  availableSpots: number;
  generatedAt: string;
  registrations: ReportRow[];
}

export type ExportFormat = "csv" | "pdf";

/** The report is refreshed this often; the story's limit is 10 s ([A9]), so one missed poll still fits. */
export const REPORT_POLL_INTERVAL_MS = 5_000;

export const REPORT_MESSAGES = {
  // MSG-08, fixed by the test cases and mirrored from backend/src/registrations/helpers/messages.ts.
  forbidden: "You do not have access to this event's registrations.",
  empty: "No registrations yet",
} as const;

// Fixed month table: the "en-GB" short form of September is "Sept" in newer ICU data.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SGT_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Singapore",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "28 Sep 2026 10:30 SGT" (D8). */
export function formatReportDateTimeSgt(value: string | Date): string {
  const parts = SGT_PARTS.formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${Number(part("day"))} ${MONTHS[Number(part("month")) - 1]} ${part("year")} ${part("hour")}:${part("minute")} SGT`;
}

/** "28 Sep 2026" (Singapore calendar date). */
export function formatReportDateSgt(value: string | Date): string {
  return formatReportDateTimeSgt(value).split(" ").slice(0, 3).join(" ");
}

/** Singapore calendar day as YYYY-MM-DD, for "registered today" comparisons. */
export function sgtDayKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date(value));
}

export type FilterType = "all" | "today" | "special-requirements";

/** Search by name, email or phone (case-insensitive), then the optional "registered today" (Singapore day) or "indicated special requirements" filter. */
export function filterRegistrations(rows: ReportRow[], search: string, filter: FilterType, now = new Date()): ReportRow[] {
  const term = search.trim().toLowerCase();
  const today = sgtDayKey(now);
  return rows.filter((row) => {
    const matchesSearch =
      !term ||
      row.fullName.toLowerCase().includes(term) ||
      row.email.toLowerCase().includes(term) ||
      row.contactNumber.toLowerCase().includes(term);
    if (!matchesSearch) return false;
    if (filter === "all") return true;
    if (filter === "today") return sgtDayKey(row.registeredAt) === today;
    if (filter === "special-requirements") {
      return !!row.specialRequirements;
    }
    return true;
  });
}

/** "3 Attendees Registered (3 / 50)"; singular "1 Attendee Registered (1 / 50)". */
export function attendeeCountLine(count: number, capacity: number): string {
  return `${count} ${count === 1 ? "Attendee" : "Attendees"} Registered (${count} / ${capacity})`;
}

/** "47 spots available"; singular "1 spot available". */
export function spotsLine(spots: number): string {
  return `${spots} ${spots === 1 ? "spot" : "spots"} available`;
}

/** Whether to offer "View Registrations": the assigned coordinator or the owning organiser (the server enforces it). */
export function canViewRegistrationReport(
  user: Pick<User, "id" | "role"> & Partial<Pick<User, "roles">>,
  event: { coordinatorId?: string; organiserId?: string },
): boolean {
  const has = (role: User["role"]) => user.roles?.includes(role) ?? user.role === role;
  return (
    (has("coordinator") && event.coordinatorId !== undefined && event.coordinatorId === user.id) ||
    (has("organiser") && event.organiserId !== undefined && event.organiserId === user.id)
  );
}

export function fetchRegistrationReport(eventId: string): Promise<RegistrationReport> {
  return api<RegistrationReport>(`/events/${eventId}/registrations/report`);
}

/** Reads the filename from a Content-Disposition value: `filename*=UTF-8''...` first, then `filename="..."`. */
export function filenameFromDisposition(header: string | null): string | undefined {
  const encoded = /filename\*=UTF-8''([^;\s]+)/i.exec(header ?? "")?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // A malformed encoding falls through to the plain filename.
    }
  }
  return /filename="([^"]+)"/.exec(header ?? "")?.[1];
}

/**
 * Downloads an export with the session cookie (so a 403 or 500 can be shown in the page instead of a browser
 * error page) and returns the file with the server's filename.
 */
export async function downloadReportExport(
  eventId: string,
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/events/${eventId}/registrations/report/export?format=${format}`, {
      credentials: "include",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ApiError("Unable to reach the server. Check your connection and try again.");
  }
  if (!response.ok) {
    let message: string | undefined;
    try {
      message = ((await response.json()) as { message?: string }).message;
    } catch {
      // A non-JSON error body falls through to the status-based message.
    }
    throw new ApiError(
      response.status >= 500 ? "The service is temporarily unavailable. Please try again." : (message ?? "Request failed."),
      undefined,
      undefined,
      response.status,
    );
  }
  const blob = await response.blob();
  // The header is exposed to the browser by the backend's CORS config; the fallback only covers a hidden header.
  const filename =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ?? `${eventId}_registrations.${format}`;
  return { blob, filename };
}

/** Saves a downloaded file through a temporary object URL, revoking it afterwards. */
export function saveDownloadedFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
