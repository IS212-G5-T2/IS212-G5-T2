// SPM-80 Coordinator Updates Availability: backend unit tests.
// ACs: AC1 (only coordinators use the availability settings), AC2 (mark
// unavailable without affecting current assignments), AC3 (view and modify at
// any time). AC4 (confirmation message) is a frontend concern.
// Test cases: COOR-AVAIL-01-SEC-1/2, 02-A/B/SEC-1, 03-A/B/E/G/BND-1.
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { CoordinatorAvailabilityService } from './coordinator-availability.service.js';

const database = { query: vi.fn() };

const coordinator: AuthenticatedUser = {
  uid: 'coord-1',
  roles: ['COORDINATOR'],
  email: 'coordinator1@example.test',
  name: 'Coordinator One',
};

function userWithRole(role: AuthenticatedUser['roles'][number]): AuthenticatedUser {
  return {
    uid: `${role.toLowerCase()}-1`,
    roles: [role],
    email: `${role.toLowerCase()}@example.test`,
    name: role,
  };
}

// Every SQL statement the service sent, with its parameters.
function statements() {
  return database.query.mock.calls.map(([sql, params]) => ({
    sql: String(sql).replace(/\s+/g, ' ').trim(),
    params,
  }));
}

let service: CoordinatorAvailabilityService;

beforeEach(async () => {
  // A fresh service and mock database per test keeps tests independent.
  vi.resetAllMocks();
  const module = await Test.createTestingModule({
    providers: [
      CoordinatorAvailabilityService,
      { provide: DatabaseService, useValue: database },
    ],
  }).compile();
  service = module.get(CoordinatorAvailabilityService);
});

describe('AC1: only coordinators use the availability settings', () => {
  // Every other role is refused before the database is touched.
  it.each(['ORGANISER', 'VENUE_STAFF', 'TECH_SUPPORT', 'ATTENDEE'] as const)(
    'COOR-AVAIL-01-SEC-1 refuses the %s role for both reading and saving, without querying',
    async (role) => {
      // Arrange: a signed-in user without the coordinator role.
      const user = userWithRole(role);

      // Act + Assert: both reading and saving are forbidden.
      await expect(service.getMine(user)).rejects.toThrow(
        new ForbiddenException('Coordinator access required.'),
      );
      await expect(service.updateMine(user, { available: false })).rejects.toThrow(
        new ForbiddenException('Coordinator access required.'),
      );
      expect(database.query).not.toHaveBeenCalled();
    },
  );

  // Without a session there is no account to read or change.
  it('COOR-AVAIL-01-SEC-2 refuses a caller who is not signed in, without querying', async () => {
    // Act + Assert: both reading and saving need a signed-in user.
    await expect(service.getMine(undefined)).rejects.toThrow(
      new UnauthorizedException('Authentication required.'),
    );
    await expect(service.updateMine(undefined, { available: false })).rejects.toThrow(
      new UnauthorizedException('Authentication required.'),
    );
    expect(database.query).not.toHaveBeenCalled();
  });
});

describe('AC2: mark unavailable without affecting current assignments', () => {
  // The coordinator's own users row is the only thing that changes.
  it('COOR-AVAIL-02-A saves the coordinator as unavailable on their own account', async () => {
    // Arrange: the update reports the saved value.
    database.query.mockResolvedValueOnce({ rows: [{ is_available: false }] });

    // Act: mark unavailable.
    const result = await service.updateMine(coordinator, { available: false });

    // Assert: one UPDATE of users, scoped to the caller, returning the new value.
    expect(result).toEqual({ available: false });
    const sent = statements();
    expect(sent).toHaveLength(1);
    expect(sent[0].sql).toMatch(/^UPDATE users SET is_available = \$1/);
    expect(sent[0].sql).toMatch(/WHERE id = \$2/);
    expect(sent[0].params).toEqual([false, 'coord-1']);
  });

  // Current assignments live on events.coordinator_id; saving must not touch them.
  it("COOR-AVAIL-02-B leaves the coordinator's assigned events untouched", async () => {
    // Arrange: the update succeeds.
    database.query.mockResolvedValueOnce({ rows: [{ is_available: false }] });

    // Act: mark unavailable.
    await service.updateMine(coordinator, { available: false });

    // Assert: exactly one statement ran, so the checks below can't pass vacuously,
    // and it updates users without mentioning events or their coordinator columns.
    const sent = statements();
    expect(sent).toHaveLength(1);
    expect(sent[0].sql).toMatch(/^UPDATE users /);
    expect(sent[0].sql).not.toMatch(/\bevents\b/i);
    expect(sent[0].sql).not.toMatch(/coordinator_(id|name)/i);
  });

  // The account always comes from the session, never from the request body.
  it('COOR-AVAIL-02-SEC-1 rejects a body that names another user and saves nothing', async () => {
    // Act + Assert: an extra userId field is refused outright.
    await expect(
      service.updateMine(coordinator, { available: false, userId: 'coord-2' }),
    ).rejects.toThrow(new BadRequestException('Availability must be true or false.'));
    expect(database.query).not.toHaveBeenCalled();
  });
});

describe('AC3: view and modify availability at any time', () => {
  // Reading returns whatever is stored, not a default.
  it.each([true, false])(
    "COOR-AVAIL-03-A returns the coordinator's own saved availability (%s)",
    async (stored) => {
      // Arrange: the stored value for this coordinator.
      database.query.mockResolvedValueOnce({ rows: [{ is_available: stored }] });

      // Act: read availability.
      const result = await service.getMine(coordinator);

      // Assert: the stored value, read from the caller's own row.
      expect(result).toEqual({ available: stored });
      const sent = statements();
      expect(sent).toHaveLength(1);
      expect(sent[0].sql).toMatch(/^SELECT is_available FROM users WHERE id = \$1/);
      expect(sent[0].params).toEqual(['coord-1']);
    },
  );

  // Availability can be switched back on, not only off.
  it('COOR-AVAIL-03-B lets an unavailable coordinator switch back to available', async () => {
    // Arrange: the update reports available again.
    database.query.mockResolvedValueOnce({ rows: [{ is_available: true }] });

    // Act: mark available.
    const result = await service.updateMine(coordinator, { available: true });

    // Assert: true is saved for the caller and returned.
    expect(result).toEqual({ available: true });
    expect(statements()[0].params).toEqual([true, 'coord-1']);
  });

  // Only a real boolean is accepted; "false" as text must not be saved as available.
  it.each([
    ['the string "false"', { available: 'false' }],
    ['null', { available: null }],
    ['the number 0', { available: 0 }],
    ['a missing value', {}],
    ['no body', null],
    ['an array', [false]],
  ])('COOR-AVAIL-03-E rejects %s and saves nothing', async (_label, body) => {
    // Act + Assert: invalid input is refused before any query.
    await expect(service.updateMine(coordinator, body)).rejects.toThrow(
      new BadRequestException('Availability must be true or false.'),
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  // A deleted account has no availability to read or save.
  it('COOR-AVAIL-03-G reports a missing coordinator account instead of guessing', async () => {
    // Arrange: neither the read nor the update finds the user.
    database.query.mockResolvedValue({ rows: [] });

    // Act + Assert: both report not found.
    await expect(service.getMine(coordinator)).rejects.toThrow(
      new NotFoundException('Coordinator account not found.'),
    );
    await expect(service.updateMine(coordinator, { available: false })).rejects.toThrow(
      new NotFoundException('Coordinator account not found.'),
    );
  });

  // Saving the current value again is a normal save, not an error.
  it('COOR-AVAIL-03-BND-1 accepts saving the value the coordinator already has', async () => {
    // Arrange: already available; the update reports available.
    database.query.mockResolvedValueOnce({ rows: [{ is_available: true }] });

    // Act: save available again.
    const result = await service.updateMine(coordinator, { available: true });

    // Assert: accepted with the same value.
    expect(result).toEqual({ available: true });
  });
});

// ---------------------------------------------------------------------------
// SPM-47 AC10: when a coordinator with active events marks themselves
// unavailable, the Event Coordinator Lead is told their events may need
// reassignment; marking available again clears that notification.
// Test cases: LEAD-REASN-10-A, 10-B, 10-BND-1, 10-C, 10-D.
// ---------------------------------------------------------------------------
describe('SPM-47 AC10: the Lead is told when a coordinator with active events becomes unavailable', () => {
  // Answer each statement by what it does: the availability update reports the
  // previous value, the events count, the Lead lookup, and notification writes.
  function wireAvailability(options: { was: boolean; now: boolean; activeEvents?: number }) {
    database.query.mockImplementation((sql: string) => {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text.startsWith('UPDATE users'))
        return { rows: [{ is_available: options.now, display_name: 'Coordinator One', was_available: options.was }] };
      if (text.includes('COORDINATOR_LEAD')) return { rows: [{ id: 'lead-1' }] };
      if (text.includes('FROM events')) return { rows: [{ count: String(options.activeEvents ?? 0) }] };
      return { rows: [] };
    });
  }

  // Notification inserts sent by the service.
  function inserts() {
    return statements().filter((s) => s.sql.startsWith('INSERT INTO notifications'));
  }

  // Going unavailable with active events notifies the Lead with the coordinator's name and count.
  it('LEAD-REASN-10-A notifies the Lead with the name and number of active events when a coordinator goes unavailable', async () => {
    // Arrange: available before, three active events.
    wireAvailability({ was: true, now: false, activeEvents: 3 });

    // Act: mark unavailable.
    const result = await service.updateMine(coordinator, { available: false });

    // Assert: saved, the active events are counted for this coordinator, and one notification goes to the Lead.
    expect(result).toEqual({ available: false });
    const count = statements().find((s) => s.sql.includes('FROM events'))!;
    expect(count.params).toEqual(expect.arrayContaining(['coord-1']));
    for (const status of ['Submitted', 'Approved', 'Confirmed'])
      expect(`${count.sql} ${JSON.stringify(count.params)}`).toContain(status);
    expect(inserts()).toHaveLength(1);
    const [notification] = inserts();
    expect(`${notification.sql} ${JSON.stringify(notification.params)}`).toContain('coordinator_unavailable');
    expect(notification.params).toEqual(
      expect.arrayContaining([
        'lead-1',
        'Coordinator One is now unavailable and has 3 active events that may need reassignment.',
        'coord-1',
      ]),
    );
  });

  // Exactly one active event is enough, and the wording is singular.
  it('LEAD-REASN-10-BND-1 notifies the Lead when the coordinator has exactly one active event', async () => {
    // Arrange: available before, one active event.
    wireAvailability({ was: true, now: false, activeEvents: 1 });

    // Act: mark unavailable.
    await service.updateMine(coordinator, { available: false });

    // Assert: one notification with the singular wording.
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].params).toEqual(
      expect.arrayContaining(['Coordinator One is now unavailable and has 1 active event that may need reassignment.']),
    );
  });

  // With nothing to reassign, the Lead is not bothered.
  it('LEAD-REASN-10-B sends no notification when the coordinator has no active events', async () => {
    // Arrange: available before, no active events.
    wireAvailability({ was: true, now: false, activeEvents: 0 });

    // Act: mark unavailable.
    await service.updateMine(coordinator, { available: false });

    // Assert: nothing is sent.
    expect(inserts()).toEqual([]);
  });

  // Saving "unavailable" again doesn't send a duplicate.
  it('LEAD-REASN-10-C sends no duplicate when the coordinator was already unavailable', async () => {
    // Arrange: already unavailable, with active events.
    wireAvailability({ was: false, now: false, activeEvents: 3 });

    // Act: save unavailable again.
    await service.updateMine(coordinator, { available: false });

    // Assert: nothing is sent.
    expect(inserts()).toEqual([]);
  });

  // Becoming available again clears the Lead's notification about this coordinator.
  it("LEAD-REASN-10-D marks the Lead's notification about this coordinator as read when they become available again", async () => {
    // Arrange: unavailable before, available now.
    wireAvailability({ was: false, now: true, activeEvents: 3 });

    // Act: mark available.
    await service.updateMine(coordinator, { available: true });

    // Assert: their unread unavailability notifications are marked read, and nothing new is sent.
    const markRead = statements().find((s) => s.sql.startsWith('UPDATE notifications'))!;
    expect(markRead.sql).toContain('read = true');
    expect(`${markRead.sql} ${JSON.stringify(markRead.params)}`).toContain('coordinator_unavailable');
    expect(markRead.params).toEqual(expect.arrayContaining(['coord-1']));
    expect(inserts()).toEqual([]);
  });
});
