// Story: SPM-135 Confirm an Event (Coordinator)
// Unit spec for the FACT_STATE mapping that turns a stored safety check status into the readiness fact.
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../../database/database.service.js';
import { EventSafetyCheckSource } from './safety-check.source.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000301';

function sourceReturning(rows: Array<Record<string, unknown>>) {
  const query = vi.fn().mockResolvedValue({ rows });
  const database = { query } as unknown as DatabaseService;
  return { source: new EventSafetyCheckSource(database), query };
}

const REQUESTED_AT = new Date('2026-10-13T09:00:00.000Z');

describe('EventSafetyCheckSource.read (FACT_STATE mapping)', () => {
  /** A pending request maps to the readiness state "Awaiting Check", which keeps Confirm blocked. */
  it('maps a pending safety check to Awaiting Check', async () => {
    const { source, query } = sourceReturning([{ status: 'pending', requested_at: REQUESTED_AT, approver_name: null }]);

    await expect(source.read(EVENT_ID)).resolves.toEqual({ state: 'Awaiting Check' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM event_safety_checks'), [EVENT_ID]);
  });

  /** A check sent back for changes maps to "Changes Requested", which keeps Confirm blocked. */
  it('maps a changes_needed safety check to Changes Requested', async () => {
    const { source } = sourceReturning([{ status: 'changes_needed', requested_at: REQUESTED_AT, approver_name: null }]);

    await expect(source.read(EVENT_ID)).resolves.toEqual({ state: 'Changes Requested' });
  });

  /** Only an approved safety check maps to "Approved", the one state that clears the Confirm gate. */
  it('maps an approved safety check to Approved', async () => {
    const { source } = sourceReturning([{ status: 'approved', requested_at: REQUESTED_AT, approver_name: 'Safety Officer 1' }]);

    await expect(source.read(EVENT_ID)).resolves.toEqual({ state: 'Approved' });
  });

  /** With no row the source returns undefined, so readiness fails closed as "No record". */
  it('returns undefined when the event has no safety check row', async () => {
    const { source } = sourceReturning([]);

    await expect(source.read(EVENT_ID)).resolves.toBeUndefined();
  });
});

/** Builds a source whose queries return the given result sets in call order (row, then feedback or reset). */
function sourceReturningInOrder(...results: Array<Array<Record<string, unknown>>>) {
  const query = vi.fn();
  for (const rows of results) query.mockResolvedValueOnce({ rows });
  return new EventSafetyCheckSource({ query } as unknown as DatabaseService);
}

describe('EventSafetyCheckSource.view', () => {
  /** With no safety row and no earlier reset, the view is simply "not requested". */
  it('reports not requested with no reset reason when the event was never requested', async () => {
    const source = sourceReturningInOrder([], []);

    await expect(source.view(EVENT_ID)).resolves.toEqual({ status: 'not_requested' });
  });

  /** A reset left by an earlier change is shown as "not requested" with its reason and date. */
  it('reports not requested with the reason and date of an earlier reset', async () => {
    const resetAt = new Date('2026-10-13T09:00:00.000Z');
    const source = sourceReturningInOrder([], [{ reset_at: resetAt, reason: 'Event details were updated' }]);

    await expect(source.view(EVENT_ID)).resolves.toEqual({
      status: 'not_requested',
      resetReason: 'Event details were updated',
      resetDate: '2026-10-13T09:00:00.000Z',
    });
  });

  /** A pending request shows its request date and no approver or feedback when there are none. */
  it('reports a pending request with its date and no approver or feedback', async () => {
    const requestedAt = new Date('2026-10-12T01:00:00.000Z');
    const source = sourceReturningInOrder(
      [{ status: 'pending', requested_at: requestedAt, approver_name: null }],
      [],
    );

    await expect(source.view(EVENT_ID)).resolves.toEqual({
      status: 'pending',
      requestedDate: '2026-10-12T01:00:00.000Z',
    });
  });

  /** An approved check shows the approver, and feedback items keep their resolved mark only when set. */
  it('reports an approved check with its approver and each feedback item with its resolved mark', async () => {
    const requestedAt = new Date('2026-10-12T01:00:00.000Z');
    const raisedAt = new Date('2026-10-12T02:00:00.000Z');
    const resolvedAt = new Date('2026-10-12T03:00:00.000Z');
    const source = sourceReturningInOrder(
      [{ status: 'approved', requested_at: requestedAt, approver_name: 'Safety Officer 1' }],
      [
        { id: 'f1', feedback_text: 'Clear the aisle', requested_at: raisedAt, resolved_by_coordinator_at: resolvedAt },
        { id: 'f2', feedback_text: 'Check the exits', requested_at: raisedAt, resolved_by_coordinator_at: null },
      ],
    );

    await expect(source.view(EVENT_ID)).resolves.toEqual({
      status: 'approved',
      requestedDate: '2026-10-12T01:00:00.000Z',
      approverName: 'Safety Officer 1',
      feedback: [
        { id: 'f1', text: 'Clear the aisle', requestedAt: '2026-10-12T02:00:00.000Z', resolvedByCoordinatorAt: '2026-10-12T03:00:00.000Z' },
        { id: 'f2', text: 'Check the exits', requestedAt: '2026-10-12T02:00:00.000Z' },
      ],
    });
  });
});
