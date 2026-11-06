/*
 * SPM-65 AC10: audit entries. The append-only trigger and unique index are exercised against
 * PostgreSQL in test/change-request-review.e2e-spec.ts (REVIEW-CHANGE-10-D).
 */
import { describe, expect, it, vi } from 'vitest';
import { recordOutcome, toAuditEntry } from './change-request-audit.js';

const NOW = new Date('2030-01-01T00:00:00.000Z');

describe('change request audit', () => {
  /** REVIEW-CHANGE-10-A: the entry records the request, outcome, changes, requester, decider and time. */
  it('REVIEW-CHANGE-10-A inserts one entry with the full outcome', async () => {
    const query = vi.fn().mockResolvedValue({});
    const changes = [
      { field: 'layout', originalValue: 'Banquet', proposedValue: 'Theatre' },
    ];
    await recordOutcome(
      { query },
      {
        id: 'r1',
        event_id: 'e1',
        changes,
        requested_by_id: 'o1',
        requested_by: 'Org',
      },
      'Denied',
      {
        decidedBy: 'Coord',
        decidedById: 'c1',
        reason: 'Not possible here.',
        decidedAt: NOW,
      },
    );
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO event_change_request_audit');
    expect(params.slice(1)).toEqual([
      'r1',
      'e1',
      'Denied',
      JSON.stringify(changes),
      'o1',
      'Org',
      'c1',
      'Coord',
      'Not possible here.',
      NOW,
    ]);
    await recordOutcome(
      { query },
      { id: 'r1', event_id: 'e1', changes },
      'Approved',
      { decidedBy: 'Coord', decidedById: 'c1', decidedAt: NOW },
    );
    expect(query.mock.calls[1][1][9]).toBeNull();
  });

  it('REVIEW-CHANGE-10-B maps a stored entry, leaving out an empty reason', () => {
    const row = {
      id: 'a1',
      change_request_id: 'r1',
      outcome: 'Approved',
      changes: [],
      requested_by: 'Org',
      decided_by: 'Coord',
      reason: null,
      decided_at: NOW,
    };
    expect(toAuditEntry(row)).toEqual({
      id: 'a1',
      changeRequestId: 'r1',
      outcome: 'Approved',
      changes: [],
      requestedBy: 'Org',
      decidedBy: 'Coord',
      decidedAt: NOW.toISOString(),
    });
    expect(
      toAuditEntry({ ...row, outcome: 'Denied', reason: 'Too late.' }).reason,
    ).toBe('Too late.');
  });
});
