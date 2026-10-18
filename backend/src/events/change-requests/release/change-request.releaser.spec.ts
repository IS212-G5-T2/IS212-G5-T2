/*
 * SPM-65 AC11: cancelling an event closes its pending change requests automatically and audits each one.
 * End to end: test/change-request-review.e2e-spec.ts (REVIEW-CHANGE-12-B).
 */
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  CLOSED_BY,
  CLOSED_REASON,
  changeRequestReleaser,
} from './change-request.releaser.js';

const NOW = new Date('2030-01-01T00:00:00.000Z');

describe('changeRequestReleaser', () => {
  it('REVIEW-CHANGE-12-B closes each pending request and records a Closed audit entry', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) =>
      sql.startsWith('SELECT')
        ? {
            rows: [
              { id: 'r1', event_id: 'e1', changes: [] },
              { id: 'r2', event_id: 'e1', changes: [] },
            ],
          }
        : { rows: [] },
    );
    await changeRequestReleaser.release(
      'e1',
      { query } as unknown as pg.PoolClient,
      NOW,
    );
    expect(changeRequestReleaser.name).toBe('event_change_requests');
    const sql = query.mock.calls.map((call) => call[0] as string);
    expect(sql[0]).toContain("status = 'Pending' FOR UPDATE");
    expect(sql.filter((s) => s.includes("SET status = 'Closed'"))).toHaveLength(
      2,
    );
    expect(
      sql.filter((s) => s.includes('INSERT INTO event_change_request_audit')),
    ).toHaveLength(2);
    expect(query.mock.calls[1][1]).toEqual([
      'r1',
      CLOSED_BY,
      NOW,
      CLOSED_REASON,
    ]);
    expect((query.mock.calls[2] as unknown[])[1]).toEqual(
      expect.arrayContaining(['r1', 'Closed', CLOSED_BY, null, CLOSED_REASON]),
    );
  });

  it('does nothing when no request is pending', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await changeRequestReleaser.release(
      'e1',
      { query } as unknown as pg.PoolClient,
      NOW,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
