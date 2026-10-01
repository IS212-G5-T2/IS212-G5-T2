import { describe, expect, it, vi } from 'vitest';
import {
  getEligibleCoordinators,
  selectCoordinator,
  TERMINAL_STATUSES,
  type CoordinatorCandidate,
} from './coordinator-assignment.js';

function candidate(
  id: string,
  activeLoad: number,
  lastAssignedAt: string | null = null,
): CoordinatorCandidate {
  return { id, name: `Coordinator ${id}`, activeLoad, lastAssignedAt };
}

describe('SPM-123 getEligibleCoordinators', () => {
  it('EVE-ASN-05-A only queries active accounts holding the COORDINATOR role', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await getEligibleCoordinators(client as never);

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("roles.name = 'COORDINATOR'");
    expect(sql).toContain('users.is_active = true');
    // Rejected requests stop counting toward workload.
    expect(sql).toContain('events.status <> ALL($1::text[])');
    expect(params).toEqual([TERMINAL_STATUSES]);
    // Spelled out so an emptied or misspelled status list is caught too.
    expect(TERMINAL_STATUSES).toEqual(['Rejected']);
  });

  it('EVE-ASN-05-B returns candidates with workload and last-assigned time as ISO strings', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { id: 'c-1', name: 'Coordinator 1', activeLoad: 2, lastAssignedAt: new Date('2026-09-20T10:00:00.000Z') },
          { id: 'c-2', name: 'Coordinator 2', activeLoad: 0, lastAssignedAt: null },
        ],
      }),
    };

    expect(await getEligibleCoordinators(client as never)).toEqual([
      { id: 'c-1', name: 'Coordinator 1', activeLoad: 2, lastAssignedAt: '2026-09-20T10:00:00.000Z' },
      { id: 'c-2', name: 'Coordinator 2', activeLoad: 0, lastAssignedAt: null },
    ]);
  });

  // The tie-break's "last assigned" time comes from the coordinator's newest
  // assigned event, since auto-assignment happens when the event is created.
  it('EVE-ASN-05-E takes the last-assigned time from the newest event assigned to each coordinator', async () => {
    // Arrange: a client that records the query.
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    // Act: look up the candidates.
    await getEligibleCoordinators(client as never);

    // Assert: last-assigned is the latest created_at among that coordinator's events.
    const [sql] = client.query.mock.calls[0];
    expect(sql).toMatch(
      /SELECT MAX\(events\.created_at\)\s+FROM events\s+WHERE events\.coordinator_id = users\.id::text\) AS "lastAssignedAt"/,
    );
  });

  it('EVE-ASN-05-C returns an empty list when no active coordinator exists', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    expect(await getEligibleCoordinators(client as never)).toEqual([]);
  });
});

describe('SPM-123 selectCoordinator', () => {
  it('EVE-ASN-03-A picks the coordinator with the fewest active requests', () => {
    const chosen = selectCoordinator([candidate('a', 3), candidate('b', 1), candidate('c', 2)]);

    expect(chosen?.id).toBe('b');
  });

  it('EVE-ASN-03-B breaks a workload tie by picking the least recently assigned', () => {
    const chosen = selectCoordinator([
      candidate('a', 1, '2026-09-22T10:00:00.000Z'),
      candidate('b', 1, '2026-09-20T10:00:00.000Z'),
      candidate('c', 1, '2026-09-21T10:00:00.000Z'),
    ]);

    expect(chosen?.id).toBe('b');
  });

  it('EVE-ASN-03-C treats a never-assigned coordinator as the least recently assigned', () => {
    const chosen = selectCoordinator([
      candidate('a', 0, '2026-09-20T10:00:00.000Z'),
      candidate('b', 0, null),
    ]);

    expect(chosen?.id).toBe('b');
  });

  // The never-assigned coordinator wins wherever the database happens to list them.
  it('EVE-ASN-03-C2 prefers a never-assigned coordinator even when they are listed first', () => {
    // Arrange: equal load, the never-assigned one ahead of a recently assigned one.
    const input = [candidate('never', 2, null), candidate('recent', 2, '2026-09-21T10:00:00.000Z')];

    // Act + Assert: the never-assigned coordinator is still chosen.
    expect(selectCoordinator(input)?.id).toBe('never');
  });

  // Identical last-assigned times are a full tie, so database (email) order decides.
  it('EVE-ASN-03-D2 keeps the given (email) order when last-assigned times are identical', () => {
    // Arrange: same load and the exact same last-assigned timestamp.
    const same = '2026-09-21T10:00:00.000Z';
    const input = [candidate('first', 1, same), candidate('second', 1, same)];

    // Act + Assert: the one listed first wins.
    expect(selectCoordinator(input)?.id).toBe('first');
  });

  it('EVE-ASN-03-D keeps the given (email) order on a complete tie', () => {
    const chosen = selectCoordinator([candidate('a', 0), candidate('b', 0), candidate('c', 0)]);

    expect(chosen?.id).toBe('a');
  });

  it('EVE-ASN-03-E workload beats recency: a busier coordinator is never picked over a freer one', () => {
    const chosen = selectCoordinator([
      candidate('busy-but-idle-for-long', 4, null),
      candidate('free-but-recent', 1, '2026-09-22T10:00:00.000Z'),
    ]);

    expect(chosen?.id).toBe('free-but-recent');
  });

  it('EVE-ASN-01-B returns undefined when there is nobody to assign to', () => {
    expect(selectCoordinator([])).toBeUndefined();
  });

  it('EVE-ASN-03-J returns the only candidate when there is exactly one', () => {
    expect(selectCoordinator([candidate('only', 9)])?.id).toBe('only');
  });

  it('EVE-ASN-03-K does not reorder the caller\'s array', () => {
    const input = [candidate('a', 3), candidate('b', 1)];

    selectCoordinator(input);

    expect(input.map((c) => c.id)).toEqual(['a', 'b']);
  });

  // Simulates a run of submissions: after each pick the winner's load goes up
  // by one and their last-assigned time moves forward, exactly as the database
  // would report on the next submission.
  function simulate(initialLoads: number[], submissions: number) {
    const state = initialLoads.map((load, i) => candidate(`c${i}`, load));
    let clock = 0;
    const spreads: number[] = [];
    for (let i = 0; i < submissions; i += 1) {
      const chosen = selectCoordinator(state)!;
      chosen.activeLoad += 1;
      clock += 1;
      chosen.lastAssignedAt = new Date(Date.UTC(2026, 8, 1, 0, 0, clock)).toISOString();
      const loads = state.map((c) => c.activeLoad);
      spreads.push(Math.max(...loads) - Math.min(...loads));
    }
    return { state, spreads };
  }

  it('EVE-ASN-03-F spreads work evenly: nobody is ever more than one request ahead of anyone else', () => {
    const { state, spreads } = simulate([0, 0, 0, 0], 13);

    expect(Math.max(...spreads)).toBeLessThanOrEqual(1);
    expect(state.map((c) => c.activeLoad).sort((a, b) => a - b)).toEqual([3, 3, 3, 4]);
  });

  it('EVE-ASN-03-G sends new work to the others until they catch up with an overloaded coordinator', () => {
    const { state } = simulate([6, 0, 0], 6);

    // The overloaded coordinator receives nothing until the others reach their level.
    expect(state.map((c) => c.activeLoad)).toEqual([6, 3, 3]);
  });
});
