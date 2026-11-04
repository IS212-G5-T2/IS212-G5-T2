/*
 * SPM-157 history API contract (GET /api/events/:eventId/history) and the raw rows the repository
 * reads. The mapper (event-history.mapper.ts) turns rows into entries.
 */

/** The four histories of AC1 to AC4. */
export type HistorySection = 'event' | 'venueBookings' | 'equipment' | 'registrations';

/** user: a named person; system: an automatic change (AC5); unrecorded: an earlier record kept no author (AC11). */
export type HistoryActorKind = 'user' | 'system' | 'unrecorded';

export interface HistoryChange {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
}

export interface HistoryEntry {
  id: string;
  section: HistorySection;
  action: string;
  summary: string;
  /** The booking's venue, the equipment items, or the attendee the entry is about. */
  subject?: string;
  changes: HistoryChange[];
  reason?: string;
  actor: { kind: HistoryActorKind; name: string };
  occurredAt: string;
}

export type HistoryViewer = 'coordinator' | 'organiser';

export interface EventHistoryResponse {
  eventId: string;
  eventName: string;
  eventStatus: string;
  viewer: HistoryViewer;
  sections: Partial<Record<HistorySection, HistoryEntry[]>>;
}

/** An event_audit_log row. */
export interface AuditLogRow {
  id: string;
  section: 'event' | 'venue_booking' | 'equipment' | 'registration';
  action: string;
  subject_label: string | null;
  changes: { field: string; from: unknown; to: unknown }[];
  reason: string | null;
  actor_name: string | null;
  actor_kind: HistoryActorKind;
  occurred_at: Date;
}

/** An event_flagged_changes row (SPM-85 flagged changes, SPM-156 applied changes). */
export interface FlaggedChangeRow {
  id: string;
  kind: 'booking_conflict' | 'direct_update' | 'change_request';
  field: string;
  original_value: unknown;
  proposed_value: unknown;
  status: 'Needs Review' | 'Applied' | 'Rejected';
  proposed_by: string;
  created_at: Date;
  resolved_by: string | null;
  resolved_at: Date | null;
}

/** An event_change_requests row (SPM-64). */
export interface ChangeRequestRow {
  id: string;
  requested_by: string;
  changes: { field: string; originalValue?: unknown; proposedValue?: unknown }[];
  reason: string | null;
  created_at: Date;
}

/** An event_change_request_audit row (SPM-65 AC10). */
export interface ChangeRequestOutcomeRow {
  id: string;
  outcome: 'Approved' | 'Denied' | 'Withdrawn' | 'Closed';
  changes: { field: string; originalValue?: unknown; proposedValue?: unknown }[];
  decided_by: string;
  reason: string | null;
  decided_at: Date;
}

/** An event_cancellation_requests row (SPM-155). */
export interface CancellationRequestRow {
  id: string;
  requested_by: string;
  reason: string | null;
  status: 'pending' | 'accepted' | 'declined';
  requested_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
}

/** An approved tentative hold whose expiry time has passed (SPM-159; SPM-133 not built yet). */
export interface ExpiredHoldRow {
  id: string;
  venue_name: string;
  hold_expires_at: Date;
}

export interface HistorySources {
  auditLog: AuditLogRow[];
  flaggedChanges: FlaggedChangeRow[];
  changeRequests: ChangeRequestRow[];
  changeRequestOutcomes: ChangeRequestOutcomeRow[];
  cancellationRequests: CancellationRequestRow[];
  expiredHolds: ExpiredHoldRow[];
}
