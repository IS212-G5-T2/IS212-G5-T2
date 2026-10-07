// SPM-123 Assign Event Requests to Coordinators (Lead): backend unit tests.
// ACs: AC2 (unassigned queue), AC3/AC4 (coordinator availability and workload,
// fewest first), AC5 (assign), AC6 (unavailable refused), AC9 (coordinator
// notified), AC11 (Lead only).
// Test cases: LEAD-ASN-02-A, 03-A, 04-A, 05-A, 05-D, 05-E, 05-G, 06-A, 06-E,
// 09-A, 09-B, 11-SEC-1, 11-SEC-2, 11-SEC-6.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { LeadAssignmentService } from './lead-assignment.service.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000123';
const COORDINATOR_ID = '00000000-0000-4000-8000-0000000000c1';

// query: single statements; client: the statements run inside a transaction.
const database = { query: vi.fn(), transaction: vi.fn() };
const client = { query: vi.fn() };

const lead: AuthenticatedUser = {
  uid: 'lead-1',
  roles: ['COORDINATOR_LEAD'],
  email: 'lead@example.test',
  name: 'Coordinator Lead',
};

function userWithRole(role: AuthenticatedUser['roles'][number]): AuthenticatedUser {
  return { uid: `${role.toLowerCase()}-1`, roles: [role], name: role };
}

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    event_name: 'Welcome Evening',
    purpose: 'Community building',
    start_date_time: new Date('2027-01-10T10:00:00.000Z'),
    end_date_time: new Date('2027-01-10T12:00:00.000Z'),
    expected_attendance: 80,
    created_at: new Date('2026-10-01T09:00:00.000Z'),
    ...overrides,
  };
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return { ...queueRow(), status: 'Submitted', coordinator_id: null, coordinator_name: null, ...overrides };
}

function coordinatorRow(overrides: Record<string, unknown> = {}) {
  return { id: COORDINATOR_ID, display_name: 'Coordinator 1', is_available: true, ...overrides };
}

// Answers the assign transaction's statements in order: lock the event, look up
// the coordinator, update the event, insert the notification.
function wireAssign(options: {
  event?: Record<string, unknown> | null;
  coordinator?: Record<string, unknown> | null;
  notificationError?: Error;
}) {
  const event = options.event === undefined ? eventRow() : options.event;
  const coordinator = options.coordinator === undefined ? coordinatorRow() : options.coordinator;
  client.query.mockImplementation((sql: string) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    if (text.startsWith('SELECT') && text.includes('FROM events')) return { rows: event ? [event] : [] };
    if (text.startsWith('SELECT') && text.includes('FROM users')) return { rows: coordinator ? [coordinator] : [] };
    if (text.startsWith('UPDATE events'))
      return { rows: [{ ...eventRow(), coordinator_id: COORDINATOR_ID, coordinator_name: 'Coordinator 1' }] };
    if (text.startsWith('INSERT INTO notifications')) {
      if (options.notificationError) throw options.notificationError;
      return { rows: [] };
    }
    return { rows: [] };
  });
}

// Every statement sent inside the transaction, whitespace-normalised.
function txStatements() {
  return client.query.mock.calls.map(([sql, params]) => ({
    sql: String(sql).replace(/\s+/g, ' ').trim(),
    params,
  }));
}

let service: LeadAssignmentService;

beforeEach(async () => {
  // Fresh mocks per test; the transaction runs its work against `client`.
  vi.resetAllMocks();
  database.transaction.mockImplementation(async (work: (c: typeof client) => unknown) => work(client));
  const module = await Test.createTestingModule({
    providers: [LeadAssignmentService, { provide: DatabaseService, useValue: database }],
  }).compile();
  service = module.get(LeadAssignmentService);
});

describe('AC2: the unassigned queue', () => {
  // Only unassigned Submitted requests, with the four basic fields, oldest first.
  it('LEAD-ASN-02-A returns only unassigned submitted requests with their basic details, oldest first', async () => {
    // Arrange: one queued request.
    database.query.mockResolvedValueOnce({ rows: [queueRow()] });

    // Act: read the queue.
    const queue = await service.queue(lead);

    // Assert: the basic fields, and a query limited to unassigned Submitted requests, oldest first.
    expect(queue).toEqual([
      {
        id: EVENT_ID,
        name: 'Welcome Evening',
        purpose: 'Community building',
        startDateTime: '2027-01-10T10:00:00.000Z',
        endDateTime: '2027-01-10T12:00:00.000Z',
        expectedAttendance: 80,
        submittedAt: '2026-10-01T09:00:00.000Z',
      },
    ]);
    const sql = String(database.query.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toMatch(/status = 'Submitted'/);
    expect(sql).toMatch(/coordinator_id IS NULL/);
    expect(sql).toMatch(/ORDER BY created_at ASC/);
  });
});

describe('AC3 and AC4: coordinators with availability and workload', () => {
  // Availability and active count come back for each coordinator.
  it('LEAD-ASN-03-A returns each coordinator\'s availability and active assignment count', async () => {
    // Arrange: one available and one unavailable coordinator.
    database.query.mockResolvedValueOnce({
      rows: [
        { id: 'c1', display_name: 'Coordinator 1', is_available: true, active_assignments: '2' },
        { id: 'c2', display_name: 'Coordinator 2', is_available: false, active_assignments: '0' },
      ],
    });

    // Act: read the coordinators.
    const coordinators = await service.coordinators(lead);

    // Assert: numbers are numbers, availability is kept, and only active statuses are counted.
    expect(coordinators).toContainEqual({ id: 'c1', name: 'Coordinator 1', available: true, activeAssignments: 2 });
    expect(coordinators).toContainEqual({ id: 'c2', name: 'Coordinator 2', available: false, activeAssignments: 0 });
    const sql = String(database.query.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toMatch(/'Submitted', 'Approved', 'Confirmed'/);
    expect(sql).not.toMatch(/'Rejected'|'Completed'|'Cancelled'/);
  });

  // The Lead sees the least-loaded coordinators first; equal loads are alphabetical.
  it('LEAD-ASN-04-A orders coordinators by fewest active assignments, then by name', async () => {
    // Arrange: rows in an unhelpful order.
    database.query.mockResolvedValueOnce({
      rows: [
        { id: 'c3', display_name: 'Coordinator 3', is_available: true, active_assignments: '4' },
        { id: 'c2', display_name: 'Coordinator 2', is_available: true, active_assignments: '1' },
        { id: 'c1', display_name: 'Coordinator 1', is_available: false, active_assignments: '1' },
        { id: 'c4', display_name: 'Coordinator 4', is_available: true, active_assignments: '0' },
      ],
    });

    // Act: read the coordinators.
    const coordinators = await service.coordinators(lead);

    // Assert: 0, then the two 1s alphabetically, then 4.
    expect(coordinators.map((c) => c.id)).toEqual(['c4', 'c1', 'c2', 'c3']);
  });
});

describe('AC5: assigning a request', () => {
  // The update, under a row lock, sets exactly this coordinator.
  it('LEAD-ASN-05-A assigns the request to the chosen coordinator inside one transaction', async () => {
    // Arrange: an unassigned request and an available coordinator.
    wireAssign({});

    // Act: assign.
    const result = await service.assign(lead, EVENT_ID, { coordinatorId: COORDINATOR_ID });

    // Assert: locked first, then updated with the coordinator's id and name, and confirmed.
    const sent = txStatements();
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(sent[0].sql).toMatch(/^SELECT .* FROM events WHERE id = \$1 FOR UPDATE$/);
    const update = sent.find((s) => s.sql.startsWith('UPDATE events'))!;
    expect(update.params).toEqual([EVENT_ID, COORDINATOR_ID, 'Coordinator 1']);
    expect(result).toEqual({
      event: { id: EVENT_ID, name: 'Welcome Evening', coordinatorId: COORDINATOR_ID, coordinatorName: 'Coordinator 1' },
      message: 'Event request "Welcome Evening" assigned to Coordinator 1.',
    });
  });

  // A request that already has a coordinator is never reassigned here (reassignment is SPM-47).
  it('LEAD-ASN-05-D refuses a request that has already been assigned', async () => {
    // Arrange: the request already belongs to someone.
    wireAssign({ event: eventRow({ coordinator_id: 'someone-else', coordinator_name: 'Coordinator 9' }) });

    // Act + Assert: conflict, and nothing is written.
    await expect(service.assign(lead, EVENT_ID, { coordinatorId: COORDINATOR_ID })).rejects.toThrow(
      new ConflictException('This event request has already been assigned.'),
    );
    expect(txStatements().some((s) => /^(UPDATE|INSERT)/.test(s.sql))).toBe(false);
  });

  // An unassigned request whose status moved on (e.g. cancelled after the queue loaded) gets its own reason.
  it('LEAD-ASN-05-G refuses an unassigned request that is no longer Submitted, saying why', async () => {
    // Arrange: nobody is assigned, but the request was cancelled.
    wireAssign({ event: eventRow({ status: 'Cancelled' }) });

    // Act + Assert: conflict with the accurate message, and nothing is written.
    await expect(service.assign(lead, EVENT_ID, { coordinatorId: COORDINATOR_ID })).rejects.toThrow(
      new ConflictException('This event request is no longer awaiting assignment.'),
    );
    expect(txStatements().some((s) => /^(UPDATE|INSERT)/.test(s.sql))).toBe(false);
  });

  // Unknown requests and anyone who isn't an active coordinator are refused.
  it.each([
    ['an unknown request', { event: null }, new NotFoundException('Event request not found.')],
    ['an id that is not an active coordinator', { coordinator: null }, new BadRequestException('Choose an active Event Coordinator.')],
  ])('LEAD-ASN-05-E refuses %s without assigning', async (_label, wiring, error) => {
    // Arrange: the missing row.
    wireAssign(wiring);

    // Act + Assert: the specific error, and nothing is written.
    await expect(service.assign(lead, EVENT_ID, { coordinatorId: COORDINATOR_ID })).rejects.toThrow(error);
    expect(txStatements().some((s) => /^(UPDATE|INSERT)/.test(s.sql))).toBe(false);
  });

  // Malformed input never reaches the database.
  it.each([
    ['a malformed event id', 'not-a-uuid', { coordinatorId: COORDINATOR_ID }, new NotFoundException('Event request not found.')],
    ['a missing coordinator id', EVENT_ID, {}, new BadRequestException('Choose an active Event Coordinator.')],
    ['a non-uuid coordinator id', EVENT_ID, { coordinatorId: 'coord-1' }, new BadRequestException('Choose an active Event Coordinator.')],
  ])('LEAD-ASN-05-E refuses %s before opening a transaction', async (_label, eventId, body, error) => {
    // Act + Assert: refused up front.
    await expect(service.assign(lead, eventId, body)).rejects.toThrow(error);
    expect(database.transaction).not.toHaveBeenCalled();
  });
});

describe('AC6: unavailable coordinators', () => {
  // Availability is read inside the assign transaction, so a stale list can't win.
  it('LEAD-ASN-06-A refuses an unavailable coordinator without assigning or notifying', async () => {
    // Arrange: the coordinator is now unavailable.
    wireAssign({ coordinator: coordinatorRow({ is_available: false }) });

    // Act + Assert: refused, with nothing written, after reading availability in the transaction.
    await expect(service.assign(lead, EVENT_ID, { coordinatorId: COORDINATOR_ID })).rejects.toThrow(
      new ConflictException('This coordinator is unavailable.'),
    );
    const sent = txStatements();
    expect(sent.some((s) => s.sql.includes('is_available') && s.sql.includes('FROM users'))).toBe(true);
    expect(sent.some((s) => /^(UPDATE|INSERT)/.test(s.sql))).toBe(false);
  });

  // The coordinator's row is locked while assigning, so going unavailable at the same moment can't slip in.
  it('LEAD-ASN-06-E locks the coordinator row while checking availability', async () => {
    // Arrange: a normal assignment.
    wireAssign({});

    // Act: assign.
    await service.assign(lead, EVENT_ID, { coordinatorId: COORDINATOR_ID });

    // Assert: the availability read takes a share lock on users, before the event is updated.
    const sent = txStatements();
    const lookup = sent.findIndex((s) => s.sql.includes('FROM users'));
    const update = sent.findIndex((s) => s.sql.startsWith('UPDATE events'));
    expect(sent[lookup].sql).toMatch(/FOR SHARE OF users$/);
    expect(lookup).toBeLessThan(update);
  });
});

describe('AC9: the coordinator is notified', () => {
  // The notification goes to the assigned coordinator and links to the request.
  it('LEAD-ASN-09-A notifies the assigned coordinator that the request awaits their review', async () => {
    // Arrange: a normal assignment.
    wireAssign({});

    // Act: assign.
    await service.assign(lead, EVENT_ID, { coordinatorId: COORDINATOR_ID });

    // Assert: one coordinator_assignment notification with the right recipient, message and event.
    const inserts = txStatements().filter((s) => s.sql.startsWith('INSERT INTO notifications'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain("'coordinator_assignment'");
    expect(inserts[0].params).toEqual([
      expect.any(String),
      COORDINATOR_ID,
      'New event request "Welcome Evening" is awaiting your review.',
      EVENT_ID,
    ]);
  });

  // If the notification can't be saved, the assignment must not stick.
  it('LEAD-ASN-09-B rolls back the assignment if the notification cannot be saved', async () => {
    // Arrange: the notification insert fails; the transaction rethrows like the real one.
    wireAssign({ notificationError: new Error('notification store down') });

    // Act + Assert: the error propagates out of the transaction, so it rolls back.
    await expect(service.assign(lead, EVENT_ID, { coordinatorId: COORDINATOR_ID })).rejects.toThrow(
      'notification store down',
    );
    await expect(database.transaction.mock.results[0].value).rejects.toThrow('notification store down');
  });
});

describe('AC11: only the Event Coordinator Lead', () => {
  // Every other role, including Coordinator, is refused before any query.
  it.each(['COORDINATOR', 'ORGANISER', 'VENUE_STAFF', 'TECH_SUPPORT', 'ATTENDEE'] as const)(
    'LEAD-ASN-11-SEC-1 refuses the %s role on every Lead endpoint without querying',
    async (role) => {
      // Arrange: a signed-in user without the Lead role.
      const user = userWithRole(role);
      const forbidden = new ForbiddenException('Event Coordinator Lead access required.');

      // Act + Assert: queue, coordinators and assign are all forbidden.
      await expect(service.queue(user)).rejects.toThrow(forbidden);
      await expect(service.coordinators(user)).rejects.toThrow(forbidden);
      await expect(service.assign(user, EVENT_ID, { coordinatorId: COORDINATOR_ID })).rejects.toThrow(forbidden);
      expect(database.query).not.toHaveBeenCalled();
      expect(database.transaction).not.toHaveBeenCalled();
    },
  );

  // The Lead must never also be a Coordinator, so an account holding both roles is refused outright.
  it('LEAD-ASN-11-SEC-6 refuses an account that holds both the Lead and Coordinator roles without querying', async () => {
    // Arrange: a signed-in user wrongly granted both roles.
    const both: AuthenticatedUser = { ...lead, roles: ['COORDINATOR_LEAD', 'COORDINATOR'] };
    const forbidden = new ForbiddenException('An Event Coordinator Lead cannot also be an Event Coordinator.');

    // Act + Assert: queue, coordinators and assign are all forbidden, and nothing is read or written.
    await expect(service.queue(both)).rejects.toThrow(forbidden);
    await expect(service.coordinators(both)).rejects.toThrow(forbidden);
    await expect(service.assign(both, EVENT_ID, { coordinatorId: COORDINATOR_ID })).rejects.toThrow(forbidden);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Without a session nothing is read or written.
  it('LEAD-ASN-11-SEC-2 refuses a caller who is not signed in on every Lead endpoint', async () => {
    // Act + Assert: all three need a signed-in user.
    const unauthorized = new UnauthorizedException('Authentication required.');
    await expect(service.queue(undefined)).rejects.toThrow(unauthorized);
    await expect(service.coordinators(undefined)).rejects.toThrow(unauthorized);
    await expect(service.assign(undefined, EVENT_ID, { coordinatorId: COORDINATOR_ID })).rejects.toThrow(unauthorized);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
