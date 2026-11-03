/*
 * SPM-157 history mapper. Oracles are the SPM-157 AC text (Jira, revised 2 Nov 2026) and the Confluence
 * AUDIT-HISTORY test cases; wording literals are copied from the Confluence expected results.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSections,
  chronological,
  displayValue,
  fromAuditLog,
  fromCancellationRequest,
  fromChangeRequest,
  fromChangeRequestOutcome,
  fromExpiredHold,
  fromFlaggedChange,
  summaryFor,
  toChange,
} from './event-history.mapper.js';
import type { AuditLogRow, HistorySources } from './event-history.types.js';

const at = (iso: string) => new Date(iso);

function logRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: '1',
    section: 'event',
    action: 'status_changed',
    subject_label: null,
    changes: [{ field: 'status', from: 'Planning', to: 'Confirmed' }],
    reason: null,
    actor_name: 'Coordinator One',
    actor_kind: 'user',
    occurred_at: at('2026-11-02T02:00:00.000Z'),
    ...overrides,
  };
}

function emptySources(overrides: Partial<HistorySources> = {}): HistorySources {
  return {
    auditLog: [],
    flaggedChanges: [],
    changeRequests: [],
    changeRequestOutcomes: [],
    cancellationRequests: [],
    expiredHolds: [],
    ...overrides,
  };
}

describe('SPM-157 event history mapper', () => {
  /** AUDIT-HISTORY-05-A: what changed (old and new), who, when, and the reason. */
  it('AUDIT-HISTORY-05-A maps an audit row to an entry with old and new values, author, time and reason', () => {
    const entry = fromAuditLog(logRow({
      id: '42',
      changes: [{ field: 'status', from: 'Submitted', to: 'Rejected' }],
      reason: '  Not enough detail given  ',
    }));
    expect(entry).toEqual({
      id: 'log-42',
      section: 'event',
      action: 'status_changed',
      summary: 'Event request rejected',
      changes: [{ field: 'status', label: 'Status', from: 'Submitted', to: 'Rejected' }],
      reason: 'Not enough detail given',
      actor: { kind: 'user', name: 'Coordinator One' },
      occurredAt: '2026-11-02T02:00:00.000Z',
    });
  });

  /** AUDIT-HISTORY-05-A: a blank reason is not shown. */
  it('AUDIT-HISTORY-05-A leaves out a blank reason and an empty subject', () => {
    const entry = fromAuditLog(logRow({ reason: '   ', subject_label: '' }));
    expect(entry).not.toHaveProperty('reason');
    expect(entry).not.toHaveProperty('subject');
  });

  /** AUDIT-HISTORY-05-B: automatic changes are made by the system; AUDIT-HISTORY-11-A: earlier entries without an author. */
  it('AUDIT-HISTORY-05-B / 11-A names the system and an unrecorded author', () => {
    expect(fromAuditLog(logRow({ actor_kind: 'system', actor_name: null })).actor).toEqual({ kind: 'system', name: 'System' });
    expect(fromAuditLog(logRow({ actor_kind: 'unrecorded', actor_name: null })).actor).toEqual({ kind: 'unrecorded', name: 'Not recorded' });
    // A user row that lost its name cannot be attributed to a person.
    expect(fromAuditLog(logRow({ actor_kind: 'user', actor_name: null })).actor).toEqual({ kind: 'system', name: 'System' });
  });

  /** AUDIT-HISTORY-01-A: approval and rejection decisions and other status changes read as such. */
  it('AUDIT-HISTORY-01-A words submission, approval, rejection and other status changes', () => {
    const status = (from: unknown, to: unknown) => [toChange('status', from, to)];
    expect(summaryFor('submitted', status(null, 'Submitted'))).toBe('Event request submitted');
    expect(summaryFor('status_changed', status('Submitted', 'Approved'))).toBe('Event request approved');
    expect(summaryFor('status_changed', status('Submitted', 'Rejected'))).toBe('Event request rejected');
    expect(summaryFor('status_changed', status('Approved', 'Planning'))).toBe('Status changed from Approved to Planning');
    // Confirmation, completion and cancellation read as the milestone (SPM-135, SPM-153, SPM-136).
    expect(summaryFor('status_changed', status('Planning', 'Confirmed'))).toBe('Event confirmed');
    expect(summaryFor('status_changed', status('Confirmed', 'Completed'))).toBe('Event completed');
    expect(summaryFor('status_changed', status('Planning', 'Cancelled'))).toBe('Event cancelled');
    expect(summaryFor('status_changed', [])).toBe('Status changed');
    expect(summaryFor('some_future_action', [])).toBe('some future action');
  });

  /** AUDIT-HISTORY-01-B: assignment and reassignment. */
  it('AUDIT-HISTORY-01-B words assignment and reassignment with the coordinator names', () => {
    const entry = fromAuditLog(logRow({
      action: 'coordinator_reassigned',
      changes: [{ field: 'coordinator', from: 'Coordinator One', to: 'Coordinator Two' }],
      actor_name: 'Lead',
    }));
    expect(entry.summary).toBe('Event reassigned to another coordinator');
    expect(entry.changes).toEqual([{ field: 'coordinator', label: 'Coordinator', from: 'Coordinator One', to: 'Coordinator Two' }]);
    expect(summaryFor('coordinator_assigned', [])).toBe('Coordinator assigned');
  });

  /** AUDIT-HISTORY-01-C: a flagged change gives its proposal and its decision; an applied change one entry. */
  it('AUDIT-HISTORY-01-C maps a flagged change to a proposal and a decision with old and new values', () => {
    const entries = fromFlaggedChange({
      id: 'f1',
      kind: 'booking_conflict',
      field: 'expectedAttendance',
      original_value: 100,
      proposed_value: 180,
      status: 'Rejected',
      proposed_by: 'Coordinator One',
      created_at: at('2026-11-01T01:00:00.000Z'),
      resolved_by: 'Coordinator Two',
      resolved_at: at('2026-11-01T03:00:00.000Z'),
    });
    expect(entries.map((item) => [item.id, item.summary, item.actor.name, item.occurredAt])).toEqual([
      ['flag-f1-proposed', 'Change flagged for review', 'Coordinator One', '2026-11-01T01:00:00.000Z'],
      ['flag-f1-resolved', 'Flagged change rejected', 'Coordinator Two', '2026-11-01T03:00:00.000Z'],
    ]);
    expect(entries[0].changes).toEqual([{ field: 'expectedAttendance', label: 'Expected attendance', from: 100, to: 180 }]);
  });

  /** AUDIT-HISTORY-01-C: a pending flagged change has no decision yet; an applied one says applied. */
  it('AUDIT-HISTORY-01-C gives a pending flagged change one entry and an applied one a decision', () => {
    const base = {
      id: 'f2', kind: 'booking_conflict' as const, field: 'layout', original_value: 'Theatre', proposed_value: 'Banquet',
      proposed_by: 'Coordinator One', created_at: at('2026-11-01T01:00:00.000Z'),
    };
    expect(fromFlaggedChange({ ...base, status: 'Needs Review', resolved_by: null, resolved_at: null })).toHaveLength(1);
    const applied = fromFlaggedChange({ ...base, status: 'Applied', resolved_by: 'Coordinator One', resolved_at: at('2026-11-01T02:00:00.000Z') });
    expect(applied[1].summary).toBe('Flagged change applied');
  });

  /** AUDIT-HISTORY-01-C: information updates (SPM-156), including those from an approved change request. */
  it('AUDIT-HISTORY-01-C maps applied information updates with instants in ISO UTC', () => {
    const [direct] = fromFlaggedChange({
      id: 'f3', kind: 'direct_update', field: 'startDateTime',
      original_value: '2026-12-01T02:00:00+00:00', proposed_value: '2026-12-02T02:00:00+00:00', status: 'Applied',
      proposed_by: 'Coordinator One', created_at: at('2026-11-01T01:00:00.000Z'),
      resolved_by: 'Coordinator One', resolved_at: at('2026-11-01T01:00:00.000Z'),
    });
    expect(direct.summary).toBe('Event information updated');
    expect(direct.changes[0]).toEqual({
      field: 'startDateTime', label: 'Start date and time', from: '2026-12-01T02:00:00.000Z', to: '2026-12-02T02:00:00.000Z',
    });
    const [fromRequest] = fromFlaggedChange({
      id: 'f4', kind: 'change_request', field: 'name', original_value: 'Old', proposed_value: 'New', status: 'Applied',
      proposed_by: 'Organiser One', created_at: at('2026-11-01T01:00:00.000Z'), resolved_by: null, resolved_at: null,
    });
    expect(fromRequest.summary).toBe('Event information updated from an approved change request');
    expect(fromRequest.actor.name).toBe('Organiser One');
  });

  /** AUDIT-HISTORY-01-D: change requests and their outcomes; a closure on cancellation is the system's. */
  it('AUDIT-HISTORY-01-D maps a change request and each outcome', () => {
    const changes = [{ field: 'expectedAttendance', originalValue: 100, proposedValue: 150 }];
    const submitted = fromChangeRequest({ id: 'c1', requested_by: 'Organiser One', changes, reason: 'More guests', created_at: at('2026-11-01T01:00:00.000Z') });
    expect(submitted).toMatchObject({ summary: 'Change request submitted', reason: 'More guests', actor: { name: 'Organiser One' } });
    expect(submitted.changes).toEqual([{ field: 'expectedAttendance', label: 'Expected attendance', from: 100, to: 150 }]);
    const outcome = (value: 'Approved' | 'Denied' | 'Withdrawn' | 'Closed') => fromChangeRequestOutcome({
      id: 'o1', outcome: value, changes, decided_by: 'Coordinator One', reason: value === 'Denied' ? 'No larger room' : null,
      decided_at: at('2026-11-01T02:00:00.000Z'),
    });
    expect(outcome('Approved').summary).toBe('Change request approved');
    expect(outcome('Denied')).toMatchObject({ summary: 'Change request denied', reason: 'No larger room' });
    expect(outcome('Withdrawn').summary).toBe('Change request withdrawn');
    expect(outcome('Closed')).toMatchObject({ summary: 'Change request closed', actor: { kind: 'system', name: 'System' } });
  });

  /** AUDIT-HISTORY-01-D: a requested change with no stored original or proposed value shows it as empty. */
  it('AUDIT-HISTORY-01-D shows a missing original or proposed value of a requested change as empty', () => {
    const submitted = fromChangeRequest({
      id: 'c2', requested_by: 'Organiser One', reason: null, created_at: at('2026-11-01T01:00:00.000Z'),
      changes: [{ field: 'expectedAttendance', proposedValue: 150 }, { field: 'name', originalValue: 'Old' }],
    });
    expect(submitted.changes).toEqual([
      { field: 'expectedAttendance', label: 'Expected attendance', from: null, to: 150 },
      { field: 'name', label: 'Event name', from: 'Old', to: null },
    ]);
  });

  /** AUDIT-HISTORY-11-A: an earlier flagged-change decision whose decider was not stored says so. */
  it('AUDIT-HISTORY-11-A names an unrecorded decider of an earlier flagged change as Not recorded', () => {
    const [, decision] = fromFlaggedChange({
      id: 'f5', kind: 'booking_conflict', field: 'venue', original_value: 'Hall A', proposed_value: 'Hall B',
      status: 'Rejected', proposed_by: 'Coordinator One', created_at: at('2026-11-01T01:00:00.000Z'),
      resolved_by: null, resolved_at: at('2026-11-01T02:00:00.000Z'),
    });
    expect(decision).toMatchObject({ summary: 'Flagged change rejected', actor: { kind: 'unrecorded', name: 'Not recorded' } });
  });

  /** AUDIT-HISTORY-01-E: cancellation requests and decisions. */
  it('AUDIT-HISTORY-01-E maps a cancellation request and its decision', () => {
    const base = { id: 'x1', requested_by: 'Organiser One', reason: 'Speaker unavailable', requested_at: at('2026-11-01T01:00:00.000Z') };
    expect(fromCancellationRequest({ ...base, status: 'pending', decided_by: null, decided_at: null })
      .map((item) => item.summary)).toEqual(['Cancellation requested']);
    const accepted = fromCancellationRequest({ ...base, status: 'accepted', decided_by: 'Coordinator One', decided_at: at('2026-11-01T02:00:00.000Z') });
    expect(accepted.map((item) => [item.summary, item.actor.name])).toEqual([
      ['Cancellation requested', 'Organiser One'],
      ['Cancellation request accepted', 'Coordinator One'],
    ]);
    expect(accepted[0].reason).toBe('Speaker unavailable');
    const declined = fromCancellationRequest({ ...base, status: 'declined', decided_by: 'Coordinator One', decided_at: at('2026-11-01T02:00:00.000Z') });
    expect(declined[1].summary).toBe('Cancellation request declined');
  });

  /** AUDIT-HISTORY-01-F / 02-A to 02-C / 03-A to 03-C / 04-A to 04-C: the wording of every recorded action. */
  it.each([
    ['safety_check_requested', 'Safety check requested'],
    ['safety_check_approved', 'Safety check approved'],
    ['safety_changes_requested', 'Safety Officer requested changes'],
    ['safety_check_rejected', 'Safety check rejected'],
    ['safety_check_reset', 'Safety check reset'],
    ['booking_requested', 'Venue booking requested'],
    ['booking_approved', 'Venue booking approved'],
    ['booking_rejected', 'Venue booking rejected'],
    ['booking_cancelled', 'Venue booking cancelled'],
    ['booking_released', 'Venue booking released'],
    ['booking_returned_for_review', 'Venue booking returned for review'],
    ['booking_removed', 'Venue request removed'],
    ['hold_requested', 'Tentative hold requested'],
    ['hold_placed', 'Tentative hold placed'],
    ['hold_rejected', 'Tentative hold rejected'],
    ['hold_cancelled', 'Tentative hold cancelled'],
    ['hold_released', 'Tentative hold released'],
    ['hold_converted', 'Tentative hold converted to a booking'],
    ['hold_expired', 'Tentative hold expired'],
    ['equipment_requested', 'Equipment requested'],
    ['equipment_reserved', 'Equipment request marked Reserved'],
    ['equipment_cannot_provide', 'Equipment request marked Cannot Provide'],
    ['equipment_returned_for_review', 'Equipment request returned for review'],
    ['equipment_released', 'Equipment released'],
    ['registered', 'Registered'],
    ['waitlist_joined', 'Joined the waiting list'],
    ['waitlist_promoted', 'Promoted from the waiting list'],
    ['waitlist_left', 'Left the waiting list'],
    ['registration_withdrawn', 'Registration withdrawn'],
    ['waitlist_removed', 'Removed from the waiting list'],
    ['registration_cancelled', 'Registration cancelled'],
    ['clarification_requested', 'Clarification requested'],
    ['clarification_replied', 'Clarification answered'],
    ['clarification_resolved', 'Clarification resolved'],
    ['safety_feedback_resolved', 'Safety feedback item marked resolved'],
    ['safety_feedback_reopened', 'Safety feedback item reopened'],
    ['completion_record_saved', 'Completion record updated'],
    ['equipment_request_updated', 'Equipment request updated'],
    ['registration_settings_changed', 'Registration settings changed'],
    ['venue_unavailable', 'Venue marked unavailable during the booking'],
    ['venue_timing_changed', 'Venue setup or turnaround time changed'],
    ['venue_capacity_changed', 'Venue capacity changed'],
  ])('AUDIT-HISTORY-01-F to 04-C words %s as "%s"', (action, summary) => {
    expect(summaryFor(action, [])).toBe(summary);
  });

  /** AUDIT-HISTORY-02-A: booking rows go to the venue section with the venue as subject and readable values. */
  it('AUDIT-HISTORY-02-A places booking entries in the venue section with readable values', () => {
    const entry = fromAuditLog(logRow({
      section: 'venue_booking', action: 'hold_placed', subject_label: 'Seminar Room 2-1',
      changes: [
        { field: 'status', from: 'pending', to: 'approved' },
        { field: 'holdExpiresAt', from: null, to: '2026-11-20T02:00:00+00:00' },
      ],
    }));
    expect(entry.section).toBe('venueBookings');
    expect(entry.subject).toBe('Seminar Room 2-1');
    expect(entry.changes).toEqual([
      { field: 'status', label: 'Status', from: 'Pending', to: 'Approved' },
      { field: 'holdExpiresAt', label: 'Hold expires', from: null, to: '2026-11-20T02:00:00.000Z' },
    ]);
    expect(fromAuditLog(logRow({ section: 'equipment' })).section).toBe('equipment');
    expect(fromAuditLog(logRow({ section: 'registration' })).section).toBe('registrations');
  });

  /** AUDIT-HISTORY-02-D: an expired hold is the system's, at the expiry instant. */
  it('AUDIT-HISTORY-02-D maps an expired hold to a system entry at its expiry time', () => {
    expect(fromExpiredHold({ id: 'h1', venue_name: 'Hall A', hold_expires_at: at('2026-11-20T02:00:00.000Z') })).toEqual({
      id: 'hold-expired-h1',
      section: 'venueBookings',
      action: 'hold_expired',
      summary: 'Tentative hold expired',
      subject: 'Hall A',
      changes: [{ field: 'holdExpiresAt', label: 'Hold expires', from: null, to: '2026-11-20T02:00:00.000Z' }],
      actor: { kind: 'system', name: 'System' },
      occurredAt: '2026-11-20T02:00:00.000Z',
    });
  });

  /** AUDIT-HISTORY-05-A: coded values read as words; unknown fields keep their name. */
  it('AUDIT-HISTORY-05-A shows coded values as words and keeps unparseable values', () => {
    expect(displayValue('safetyCheck', 'changes_needed')).toBe('Changes Requested');
    expect(displayValue('safetyCheck', 'pending')).toBe('Awaiting Safety Check');
    expect(displayValue('safetyCheck', 'other')).toBe('other');
    expect(displayValue('requestKind', 'tentative_hold')).toBe('Tentative hold');
    expect(displayValue('requestKind', 'other')).toBe('other');
    expect(displayValue('status', 'Cannot Provide')).toBe('Cannot Provide');
    expect(displayValue('start', 'not a date')).toBe('not a date');
    expect(displayValue('status', undefined)).toBeNull();
    expect(toChange('registrationOpensAt', null, '2027-01-01T01:00:00+00:00')).toEqual({
      field: 'registrationOpensAt', label: 'Registration opens', from: null, to: '2027-01-01T01:00:00.000Z',
    });
    expect(toChange('registrationLimit', 100, 120).label).toBe('Capacity');
    expect(toChange('somethingNew', 1, 2)).toEqual({ field: 'somethingNew', label: 'somethingNew', from: 1, to: 2 });
  });

  /** AUDIT-HISTORY-06-A: oldest first across sources; equal times keep the read order. */
  it('AUDIT-HISTORY-06-A merges every source into sections, oldest first', () => {
    const sections = buildSections(emptySources({
      auditLog: [
        logRow({ id: '1', action: 'submitted', occurred_at: at('2026-11-01T00:00:00.000Z'), changes: [] }),
        logRow({ id: '2', action: 'safety_check_requested', occurred_at: at('2026-11-01T05:00:00.000Z'), changes: [] }),
        logRow({ id: '3', section: 'registration', action: 'registered', occurred_at: at('2026-11-01T04:00:00.000Z'), changes: [] }),
        logRow({ id: '4', section: 'equipment', action: 'equipment_requested', occurred_at: at('2026-11-01T04:00:00.000Z'), changes: [] }),
      ],
      changeRequests: [{ id: 'c1', requested_by: 'Organiser One', changes: [], reason: null, created_at: at('2026-11-01T03:00:00.000Z') }],
      cancellationRequests: [{
        id: 'x1', requested_by: 'Organiser One', reason: null, status: 'accepted',
        requested_at: at('2026-11-01T05:00:00.000Z'), decided_by: 'Coordinator One', decided_at: at('2026-11-01T06:00:00.000Z'),
      }],
      expiredHolds: [{ id: 'h1', venue_name: 'Hall A', hold_expires_at: at('2026-11-01T02:00:00.000Z') }],
    }));
    expect(sections.event.map((item) => item.id)).toEqual([
      'log-1', 'change-request-c1', 'log-2', 'cancellation-x1-requested', 'cancellation-x1-decided',
    ]);
    expect(sections.venueBookings.map((item) => item.id)).toEqual(['hold-expired-h1']);
    expect(sections.equipment.map((item) => item.id)).toEqual(['log-4']);
    expect(sections.registrations.map((item) => item.id)).toEqual(['log-3']);
  });

  /** AUDIT-HISTORY-06-A: equal times keep the order the rows were read in. */
  it('AUDIT-HISTORY-06-A keeps the read order for entries at the same instant', () => {
    const same = '2026-11-01T00:00:00.000Z';
    const ordered = chronological([
      fromAuditLog(logRow({ id: '9', occurred_at: at(same) })),
      fromAuditLog(logRow({ id: '10', occurred_at: at(same) })),
      fromAuditLog(logRow({ id: '1', occurred_at: at('2026-10-31T00:00:00.000Z') })),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['log-1', 'log-9', 'log-10']);
  });
});
