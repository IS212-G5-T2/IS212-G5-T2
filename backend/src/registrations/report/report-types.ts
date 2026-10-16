/*
 * SPM-63 registration report contract (D2 / D16). The report, the CSV and the PDF are all built from this one
 * shape, and every key below is an allowlist: nothing else from the event or registration rows is exposed.
 * Instants are ISO-8601 UTC strings; display formatting happens in report-format.ts (SGT).
 */
export interface ReportEvent {
  id: string;
  name: string;
  startDateTime: string;
  endDateTime: string;
  capacity: number;
}

/**
 * The report's status values (the lower-case API vocabulary used by the attendee read and the filter). "registered" is the
 * stored Registered row, labelled Confirmed on screen and in the exports (SPM-138 D3). SPM-138 owner decision: the report
 * lists every status; the filter narrows it.
 */
export const REPORT_STATUSES = ['registered', 'waitlisted', 'withdrawn', 'removed', 'cancelled'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** The on-screen and export label for each status. */
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  registered: 'Confirmed',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
  removed: 'Removed',
  cancelled: 'Cancelled',
};

export interface ReportRow {
  registrationId: string;
  fullName: string;
  email: string;
  contactNumber: string;
  /** The registration instant (created_at). */
  registeredAt: string;
  status: ReportStatus;
  specialRequirements?: string;
  /** Waitlisted rows only: the derived position (D6). */
  waitlistPosition?: number;
  /** Waitlisted rows only: when the attendee joined the waitlist (ISO-8601 UTC). */
  joinedAt?: string;
}

export interface RegistrationReport {
  event: ReportEvent;
  /** Confirmed (registered) count, unfiltered: capacity is Confirmed-only (SPM-138). */
  totalConfirmed: number;
  /** Waitlisted count, unfiltered. Waitlisted entries never take capacity. */
  waitlistCount: number;
  availableSpots: number;
  generatedAt: string;
  registrations: ReportRow[];
}

export type ExportFormat = 'csv' | 'pdf';
