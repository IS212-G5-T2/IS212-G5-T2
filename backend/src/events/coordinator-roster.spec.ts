import { describe, expect, it, vi } from 'vitest';
import { getCoordinatorRoster, pickNextCoordinator } from './coordinator-roster.js';

function clientWithRoster(rows: { id: string; name: string }[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

const ROSTER = [
  { id: 'coord-1', name: 'Coordinator One' },
  { id: 'coord-2', name: 'Coordinator Two' },
];

describe('SPM-38 AC5: getCoordinatorRoster', () => {
  it('queries only active accounts holding the COORDINATOR role, ordered by creation', async () => {
    const client = clientWithRoster(ROSTER);

    const roster = await getCoordinatorRoster(client as never);

    expect(roster).toEqual(ROSTER);
    const [sql] = client.query.mock.calls[0];
    expect(sql).toContain("roles.name = 'COORDINATOR'");
    expect(sql).toContain('users.is_active = true');
    expect(sql).toContain('ORDER BY users.email');
  });
});

describe('SPM-38 AC5: pickNextCoordinator', () => {
  it('EVE-REV-05-D cycles through the live roster in order and wraps around', async () => {
    const client = clientWithRoster(ROSTER);

    expect(await pickNextCoordinator(client as never, 0)).toEqual(ROSTER[0]);
    expect(await pickNextCoordinator(client as never, 1)).toEqual(ROSTER[1]);
    expect(await pickNextCoordinator(client as never, 2)).toEqual(ROSTER[0]);
    expect(await pickNextCoordinator(client as never, 3)).toEqual(ROSTER[1]);
  });

  it('returns undefined when no active coordinator account exists', async () => {
    const client = clientWithRoster([]);

    expect(await pickNextCoordinator(client as never, 0)).toBeUndefined();
  });
});
