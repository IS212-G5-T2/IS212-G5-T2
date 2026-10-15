/*
 * Story: SPM-138 Join Waiting List, unit level for the one promotion guard that no database fixture can reach.
 * The close, boundary, reopen, releaser and list rules are asserted against rows in
 * test/registrations.waitlist.e2e-spec.ts (11-A, 11-A-LIST, 11-B, 11-D, 11-G, 11-E-HOOK, 12-C-REL).
 * Test cases: JOIN-WAITLIST-08-C-GUARD.
 *
 * ASSUMPTION index:
 *  - A-GUARD: the missing-event branch of fillFreeSpots is reached only through a recording fake, because the entries
 *    reference the event (a foreign key), so no database fixture can produce a missing event row.
 */
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { fillFreeSpots } from './promotion.js';

const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const T0 = new Date('2026-10-14T04:00:00Z'); // 12:00 SGT

describe('SPM-138 promotion guard (D8)', () => {
  /**
   * JOIN-WAITLIST-08-C-GUARD: an event row that is gone promotes nobody. The only statements are the settle write and
   * the event read; no entry is written. The guard keeps a missing row from ever counting as a free place. No database
   * fixture can reach this state (the entries reference the event), so it is asserted against a recording client.
   * ASSUMPTION A-GUARD: the fake's answer for a missing event row is the one the real query gives.
   */
  it('JOIN-WAITLIST-08-C-ERR-GUARD: a missing event promotes nobody and issues exactly the settle write and the event read', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (/UPDATE event_registrations r\b/.test(sql)) return { rows: [], rowCount: 0 };
        if (/registration_limit AS capacity/.test(sql)) return { rows: [], rowCount: 0 };
        throw new Error(`unexpected statement: ${sql}`);
      },
    } as unknown as Pick<PoolClient, 'query'>;

    expect(await fillFreeSpots(client, EVENT_ID, T0)).toBe(0);
    expect(statements).toHaveLength(2);
  });
});
