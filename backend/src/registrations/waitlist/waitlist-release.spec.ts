/*
 * SPM-138 D8 and AC12: the waitlist promotion loop and the cancelled-event releaser, asserted against a recording client.
 * The client answers each SQL shape from a script and records every statement, so the writes (and their absence) are evidence.
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { fillFreeSpots } from './promotion.js';
import { releaseWaitlistForCancelledEvent } from './cancel-releaser.js';
import { waitlistReleaser } from '../release/waitlist.releaser.js';

const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-14T04:00:00Z');

interface Recorded { sql: string; params: unknown[] }

function recordingClient(script: { capacity?: number; taken?: number; waiting?: Array<{ id: string; attendee_id: string }>; name?: string; cancelled?: string[] }) {
  const statements: Recorded[] = [];
  const waiting = [...(script.waiting ?? [])];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (/SET status = 'Removed'/.test(sql)) return { rows: [] };
      if (/registration_limit AS capacity/.test(sql)) return { rows: [{ capacity: script.capacity ?? 0, name: script.name ?? 'Gala' }] };
      if (/COUNT\(\*\)::integer AS count/.test(sql)) return { rows: [{ count: script.taken ?? 0 }] };
      if (/status = 'Waitlisted'\s+ORDER BY joined_at/.test(sql)) return { rows: waiting.length ? [waiting.shift()] : [] };
      if (/^\s*UPDATE event_registrations SET status = 'Registered'/.test(sql)) return { rows: [] };
      if (/SELECT event_name AS name FROM events/.test(sql)) return { rows: [{ name: script.name ?? 'Gala' }] };
      if (/SET status = 'Cancelled'/.test(sql)) return { rows: (script.cancelled ?? []).map((attendee_id) => ({ attendee_id })) };
      if (/^\s*INSERT INTO notifications/.test(sql)) return { rows: [] };
      throw new Error(`unexpected statement: ${sql}`);
    },
  };
  return { client: client as unknown as pg.PoolClient, statements };
}

const writesOf = (statements: Recorded[], pattern: RegExp) => statements.filter((s) => pattern.test(s.sql));

describe('SPM-138 fillFreeSpots (D8): one promotion per free place, in joining order', () => {
  // Traceability: Jira 138 AC8 (matrix 25657376)
  /** JOIN-WAITLIST-08-A: two free places and three waiting entries promote exactly the first two, each with one notice. */
  it('promotes the earliest waiting entries up to the free places and writes one notice each', async () => {
    const { client, statements } = recordingClient({
      capacity: 3, taken: 1, name: 'Gala',
      waiting: [{ id: 'w1', attendee_id: 'a1' }, { id: 'w2', attendee_id: 'a2' }, { id: 'w3', attendee_id: 'a3' }],
    });

    await expect(fillFreeSpots(client, EVENT_ID, NOW)).resolves.toBe(2);

    const promotions = writesOf(statements, /SET status = 'Registered'/);
    expect(promotions.map((p) => p.params)).toEqual([['w1', NOW], ['w2', NOW]]);
    const notices = writesOf(statements, /INSERT INTO notifications/);
    expect(notices.map((n) => n.params.slice(1))).toEqual([
      ['a1', 'A spot opened up. You are now registered for Gala.', EVENT_ID, 'a1'],
      ['a2', 'A spot opened up. You are now registered for Gala.', EVENT_ID, 'a2'],
    ]);
  });

  /** A full event has no free place, so nobody is promoted and nothing is read from the list. */
  it('promotes nobody when Confirmed already fills the capacity', async () => {
    const { client, statements } = recordingClient({ capacity: 2, taken: 2, waiting: [{ id: 'w1', attendee_id: 'a1' }] });

    await expect(fillFreeSpots(client, EVENT_ID, NOW)).resolves.toBe(0);
    expect(writesOf(statements, /SET status = 'Registered'|INSERT INTO notifications/)).toEqual([]);
    expect(writesOf(statements, /ORDER BY joined_at/)).toEqual([]);
  });

  /** An empty list ends the loop early: free places stay free and the count is the number actually promoted. */
  it('stops when the list runs out before the free places do', async () => {
    const { client } = recordingClient({ capacity: 5, taken: 0, waiting: [{ id: 'w1', attendee_id: 'a1' }] });
    await expect(fillFreeSpots(client, EVENT_ID, NOW)).resolves.toBe(1);
  });
});

describe('SPM-138 AC12 releaseWaitlistForCancelledEvent', () => {
  /** JOIN-WAITLIST-12-A: each Waitlisted entry is cancelled and its attendee gets one EventCancelled notice stamped with the cancel instant. */
  it('writes one EventCancelled notice per cancelled entry with the injected time', async () => {
    const { client, statements } = recordingClient({ name: 'Gala', cancelled: ['a1', 'a2'] });

    await expect(releaseWaitlistForCancelledEvent(client, EVENT_ID, NOW)).resolves.toBe(2);

    const cancelUpdate = writesOf(statements, /SET status = 'Cancelled'/);
    expect(cancelUpdate).toHaveLength(1);
    expect(cancelUpdate[0].params).toEqual([EVENT_ID, NOW]);
    const notices = writesOf(statements, /INSERT INTO notifications/);
    expect(notices.map((n) => n.params.slice(1))).toEqual([
      ['a1', 'Gala has been cancelled. Your waitlist place is cancelled.', EVENT_ID, 'a1', NOW],
      ['a2', 'Gala has been cancelled. Your waitlist place is cancelled.', EVENT_ID, 'a2', NOW],
    ]);
    expect(notices[0].sql).toContain('ON CONFLICT (recipient_id, related_event_id, type) WHERE type = \'EventCancelled\' DO NOTHING');
  });

  /** JOIN-WAITLIST-12-C: an event with no waiting entries writes no notice. */
  it('writes no notice when nobody is waiting', async () => {
    const { client, statements } = recordingClient({ cancelled: [] });

    await expect(releaseWaitlistForCancelledEvent(client, EVENT_ID, NOW)).resolves.toBe(0);
    expect(writesOf(statements, /INSERT INTO notifications/)).toEqual([]);
  });

  /** The settle (closed-list removal) runs first, so a due entry is Removed rather than Cancelled. */
  it('settles the list before cancelling entries', async () => {
    const { client, statements } = recordingClient({ cancelled: [] });
    await releaseWaitlistForCancelledEvent(client, EVENT_ID, NOW);
    expect(statements[0].sql).toContain("SET status = 'Removed'");
    expect(statements[0].params).toEqual([EVENT_ID, NOW]);
  });
});

describe('SPM-138 waitlistReleaser registration with the cancellation core', () => {
  it('is named for the waitlist table and releases the event waiting list through the shared client', async () => {
    const { client, statements } = recordingClient({ name: 'Gala', cancelled: ['a1'] });

    expect(waitlistReleaser.name).toBe('event_registrations.waitlist');
    await waitlistReleaser.release(EVENT_ID, client, NOW);

    expect(writesOf(statements, /SET status = 'Cancelled'/)).toHaveLength(1);
    expect(writesOf(statements, /INSERT INTO notifications/)).toHaveLength(1);
  });
});
