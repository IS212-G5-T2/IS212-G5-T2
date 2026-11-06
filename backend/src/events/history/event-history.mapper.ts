/*
 * SPM-157: turns the stored history rows into one chronological list per section. Pure (no database,
 * no clock), so every wording and ordering rule is unit-tested in event-history.mapper.spec.ts.
 *
 * AC5: each entry has what changed (field, old and new value), who (a person, the system, or
 * 'Not recorded' for an earlier record without an author, AC11), when, and the reason if one was given.
 * AC6: entries are sorted oldest first; equal times keep the order the rows were read in.
 */
import type {
  AuditLogRow,
  CancellationRequestRow,
  ChangeRequestOutcomeRow,
  ChangeRequestRow,
  ExpiredHoldRow,
  FlaggedChangeRow,
  HistoryActorKind,
  HistoryChange,
  HistoryEntry,
  HistorySection,
  HistorySources,
} from './event-history.types.js';

export const SYSTEM_ACTOR_NAME = 'System';
export const UNRECORDED_ACTOR_NAME = 'Not recorded';

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  coordinator: 'Coordinator',
  safetyCheck: 'Safety check',
  start: 'Start',
  end: 'End',
  holdExpiresAt: 'Hold expires',
  requestKind: 'Request type',
  name: 'Event name',
  purpose: 'Purpose',
  description: 'Description',
  startDateTime: 'Start date and time',
  endDateTime: 'End date and time',
  expectedAttendance: 'Expected attendance',
  layout: 'Room layout',
  facilities: 'Facilities',
  accessibility: 'Accessibility needs',
  equipmentNeeds: 'Equipment needs',
  items: 'Items',
  message: 'Message',
  registrationEnabled: 'Registration open',
  registrationOpensAt: 'Registration opens',
  registrationClosesAt: 'Registration closes',
  registrationLimit: 'Capacity',
  attendanceCount: 'Attendance',
  operationalNotes: 'Operational notes',
  issues: 'Issues',
};

/** Fields whose values are instants; shown to the client as ISO 8601 UTC strings. */
const INSTANT_FIELDS = new Set([
  'start', 'end', 'holdExpiresAt', 'startDateTime', 'endDateTime', 'registrationOpensAt', 'registrationClosesAt',
]);

const SAFETY_VALUES: Record<string, string> = {
  pending: 'Awaiting Safety Check',
  approved: 'Approved',
  changes_needed: 'Changes Requested',
  rejected: 'Rejected',
};

const REQUEST_KIND_VALUES: Record<string, string> = {
  booking: 'Booking',
  tentative_hold: 'Tentative hold',
};

const SECTION_OF: Record<AuditLogRow['section'], HistorySection> = {
  event: 'event',
  venue_booking: 'venueBookings',
  equipment: 'equipment',
  registration: 'registrations',
};

const SUMMARIES: Record<string, string> = {
  submitted: 'Event request submitted',
  coordinator_assigned: 'Coordinator assigned',
  coordinator_reassigned: 'Event reassigned to another coordinator',
  coordinator_unassigned: 'Coordinator removed',
  safety_check_requested: 'Safety check requested',
  safety_check_approved: 'Safety check approved',
  safety_changes_requested: 'Safety Officer requested changes',
  safety_check_rejected: 'Safety check rejected',
  safety_check_reset: 'Safety check reset',
  safety_check_changed: 'Safety check changed',
  booking_requested: 'Venue booking requested',
  booking_approved: 'Venue booking approved',
  booking_rejected: 'Venue booking rejected',
  booking_cancelled: 'Venue booking cancelled',
  booking_released: 'Venue booking released',
  booking_returned_for_review: 'Venue booking returned for review',
  booking_removed: 'Venue request removed',
  booking_status_changed: 'Venue booking status changed',
  booking_kind_changed: 'Venue request type changed',
  hold_requested: 'Tentative hold requested',
  hold_placed: 'Tentative hold placed',
  hold_rejected: 'Tentative hold rejected',
  hold_cancelled: 'Tentative hold cancelled',
  hold_released: 'Tentative hold released',
  hold_returned_for_review: 'Tentative hold returned for review',
  hold_removed: 'Tentative hold removed',
  hold_converted: 'Tentative hold converted to a booking',
  hold_expiry_changed: 'Tentative hold expiry changed',
  hold_expired: 'Tentative hold expired',
  equipment_requested: 'Equipment requested',
  equipment_reserved: 'Equipment request marked Reserved',
  equipment_cannot_provide: 'Equipment request marked Cannot Provide',
  equipment_returned_for_review: 'Equipment request returned for review',
  equipment_unavailable: 'Equipment request marked Unavailable',
  equipment_cancelled: 'Equipment request cancelled',
  equipment_released: 'Equipment released',
  equipment_status_changed: 'Equipment request status changed',
  registered: 'Registered',
  waitlist_joined: 'Joined the waiting list',
  waitlist_promoted: 'Promoted from the waiting list',
  waitlist_left: 'Left the waiting list',
  registration_withdrawn: 'Registration withdrawn',
  waitlist_removed: 'Removed from the waiting list',
  registration_cancelled: 'Registration cancelled',
  registration_status_changed: 'Registration status changed',
  flagged_change_proposed: 'Change flagged for review',
  flagged_change_applied: 'Flagged change applied',
  flagged_change_rejected: 'Flagged change rejected',
  information_updated: 'Event information updated',
  information_updated_by_change_request: 'Event information updated from an approved change request',
  change_request_submitted: 'Change request submitted',
  change_request_approved: 'Change request approved',
  change_request_denied: 'Change request denied',
  change_request_withdrawn: 'Change request withdrawn',
  change_request_closed: 'Change request closed',
  cancellation_requested: 'Cancellation requested',
  cancellation_accepted: 'Cancellation request accepted',
  cancellation_declined: 'Cancellation request declined',
  clarification_requested: 'Clarification requested',
  clarification_replied: 'Clarification answered',
  clarification_resolved: 'Clarification resolved',
  safety_feedback_resolved: 'Safety feedback item marked resolved',
  safety_feedback_reopened: 'Safety feedback item reopened',
  completion_record_saved: 'Completion record updated',
  equipment_request_updated: 'Equipment request updated',
  registration_settings_changed: 'Registration settings changed',
  venue_unavailable: 'Venue marked unavailable during the booking',
  venue_timing_changed: 'Venue setup or turnaround time changed',
  venue_capacity_changed: 'Venue capacity changed',
};

/** A status change that is a milestone reads as the milestone (SPM-135 confirm, SPM-153 complete, SPM-136 cancel). */
const STATUS_MILESTONES: Record<string, string> = {
  Confirmed: 'Event confirmed',
  Completed: 'Event completed',
  Cancelled: 'Event cancelled',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** A stored value as the client shows it: instants as ISO UTC, coded statuses as words. */
export function displayValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (INSTANT_FIELDS.has(field) && typeof value === 'string') {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? value : instant.toISOString();
  }
  if (field === 'safetyCheck' && typeof value === 'string') return SAFETY_VALUES[value] ?? value;
  if (field === 'requestKind' && typeof value === 'string') return REQUEST_KIND_VALUES[value] ?? value;
  if (field === 'status' && typeof value === 'string' && /^[a-z]/.test(value)) {
    // venue_bookings statuses are stored in lower case ('approved'); events, equipment and registrations are not.
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
}

export function toChange(field: string, from: unknown, to: unknown): HistoryChange {
  return { field, label: fieldLabel(field), from: displayValue(field, from), to: displayValue(field, to) };
}

export function actorOf(kind: HistoryActorKind, name: string | null): HistoryEntry['actor'] {
  if (kind === 'user' && name) return { kind, name };
  if (kind === 'unrecorded') return { kind, name: UNRECORDED_ACTOR_NAME };
  return { kind: 'system', name: SYSTEM_ACTOR_NAME };
}

/** The entry's one-line description. A status change names its old and new status. */
export function summaryFor(action: string, changes: HistoryChange[]): string {
  if (action === 'status_changed') {
    const status = changes.find((change) => change.field === 'status');
    if (status?.from === 'Submitted' && status.to === 'Approved') return 'Event request approved';
    if (status?.from === 'Submitted' && status.to === 'Rejected') return 'Event request rejected';
    if (status && typeof status.to === 'string' && STATUS_MILESTONES[status.to]) return STATUS_MILESTONES[status.to];
    if (status) return `Status changed from ${String(status.from)} to ${String(status.to)}`;
    return 'Status changed';
  }
  return SUMMARIES[action] ?? action.replace(/_/g, ' ');
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function entry(
  id: string,
  section: HistorySection,
  action: string,
  changes: HistoryChange[],
  actor: HistoryEntry['actor'],
  occurredAt: Date,
  extra: { subject?: string | null; reason?: string | null; summary?: string } = {},
): HistoryEntry {
  const subject = optionalText(extra.subject);
  const reason = optionalText(extra.reason);
  return {
    id,
    section,
    action,
    summary: extra.summary ?? summaryFor(action, changes),
    ...(subject ? { subject } : {}),
    changes,
    ...(reason ? { reason } : {}),
    actor,
    occurredAt: occurredAt.toISOString(),
  };
}

export function fromAuditLog(row: AuditLogRow): HistoryEntry {
  const changes = row.changes.map((change) => toChange(change.field, change.from, change.to));
  return entry(`log-${row.id}`, SECTION_OF[row.section], row.action, changes, actorOf(row.actor_kind, row.actor_name),
    row.occurred_at, { subject: row.subject_label, reason: row.reason });
}

/** A flagged change gives its proposal and, once decided, its decision; an applied change gives one entry. */
export function fromFlaggedChange(row: FlaggedChangeRow): HistoryEntry[] {
  const change = toChange(row.field, row.original_value, row.proposed_value);
  const named = (name: string | null) => actorOf(name ? 'user' : 'unrecorded', name);
  if (row.kind !== 'booking_conflict') {
    const action = row.kind === 'change_request' ? 'information_updated_by_change_request' : 'information_updated';
    return [entry(`flag-${row.id}`, 'event', action, [change], named(row.resolved_by ?? row.proposed_by), row.resolved_at ?? row.created_at)];
  }
  const entries = [entry(`flag-${row.id}-proposed`, 'event', 'flagged_change_proposed', [change], named(row.proposed_by), row.created_at)];
  if (row.status !== 'Needs Review' && row.resolved_at) {
    entries.push(entry(`flag-${row.id}-resolved`, 'event',
      row.status === 'Applied' ? 'flagged_change_applied' : 'flagged_change_rejected',
      [change], named(row.resolved_by), row.resolved_at));
  }
  return entries;
}

function requestChanges(changes: ChangeRequestRow['changes']): HistoryChange[] {
  return changes.map((change) => toChange(change.field, change.originalValue ?? null, change.proposedValue ?? null));
}

export function fromChangeRequest(row: ChangeRequestRow): HistoryEntry {
  return entry(`change-request-${row.id}`, 'event', 'change_request_submitted', requestChanges(row.changes),
    actorOf('user', row.requested_by), row.created_at, { reason: row.reason });
}

export function fromChangeRequestOutcome(row: ChangeRequestOutcomeRow): HistoryEntry {
  // SPM-65 AC11: a request closed by the event's cancellation is closed by the system.
  const actor = row.outcome === 'Closed' ? actorOf('system', null) : actorOf('user', row.decided_by);
  return entry(`change-request-outcome-${row.id}`, 'event', `change_request_${row.outcome.toLowerCase()}`,
    requestChanges(row.changes), actor, row.decided_at, { reason: row.reason });
}

export function fromCancellationRequest(row: CancellationRequestRow): HistoryEntry[] {
  const entries = [entry(`cancellation-${row.id}-requested`, 'event', 'cancellation_requested', [],
    actorOf('user', row.requested_by), row.requested_at, { reason: row.reason })];
  if (row.status !== 'pending' && row.decided_at) {
    entries.push(entry(`cancellation-${row.id}-decided`, 'event',
      row.status === 'accepted' ? 'cancellation_accepted' : 'cancellation_declined', [],
      actorOf('user', row.decided_by), row.decided_at));
  }
  return entries;
}

export function fromExpiredHold(row: ExpiredHoldRow): HistoryEntry {
  return entry(`hold-expired-${row.id}`, 'venueBookings', 'hold_expired',
    [toChange('holdExpiresAt', null, row.hold_expires_at.toISOString())],
    actorOf('system', null), row.hold_expires_at, { subject: row.venue_name });
}

/** Oldest first; Array.prototype.sort is stable, so equal times keep the read order. */
export function chronological(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

/** Every entry from every source, grouped by section, each section oldest first. */
export function buildSections(sources: HistorySources): Record<HistorySection, HistoryEntry[]> {
  const all: HistoryEntry[] = [
    ...sources.auditLog.map(fromAuditLog),
    ...sources.flaggedChanges.flatMap(fromFlaggedChange),
    ...sources.changeRequests.map(fromChangeRequest),
    ...sources.changeRequestOutcomes.map(fromChangeRequestOutcome),
    ...sources.cancellationRequests.flatMap(fromCancellationRequest),
    ...sources.expiredHolds.map(fromExpiredHold),
  ];
  const sorted = chronological(all);
  return {
    event: sorted.filter((item) => item.section === 'event'),
    venueBookings: sorted.filter((item) => item.section === 'venueBookings'),
    equipment: sorted.filter((item) => item.section === 'equipment'),
    registrations: sorted.filter((item) => item.section === 'registrations'),
  };
}
