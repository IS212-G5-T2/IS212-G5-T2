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
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
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
