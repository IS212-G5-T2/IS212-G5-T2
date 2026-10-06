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

export interface ReportRow {
  registrationId: string;
  fullName: string;
  email: string;
  contactNumber: string;
  registeredAt: string;
  /** The SPEC label for the stored "Registered" status (F18). */
  status: 'Confirmed';
}

export interface RegistrationReport {
  event: ReportEvent;
  totalConfirmed: number;
  availableSpots: number;
  generatedAt: string;
  registrations: ReportRow[];
}

export type ExportFormat = 'csv' | 'pdf';
