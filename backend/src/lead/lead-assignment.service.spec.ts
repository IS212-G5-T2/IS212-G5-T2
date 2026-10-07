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

// ---------------------------------------------------------------------------
// SPM-47 Reassign an Event to Another Coordinator (Lead): backend unit tests.
// ACs: AC1 (assigned active events), AC3 (reassign to a different available
// coordinator), AC4 (unavailable refused), AC5 (prior context preserved),
// AC7 (confirmation; stale page refused), AC8 (both coordinators notified),
// AC9 (Lead only), AC11 (unavailable coordinator flagged).
// Test cases: LEAD-REASN-01-A, 03-A, 03-B, 03-C, 03-G, 04-A, 05-A, 07-B, 07-C,
// 08-A, 08-B, 08-C, 09-SEC-1, 09-SEC-2, 09-SEC-5, 11-A.
// ---------------------------------------------------------------------------

const NEW_COORDINATOR_ID = '00000000-0000-4000-8000-0000000000c2';
const SECOND_EVENT_ID = '00000000-0000-4000-8000-000000000124';

// One row of the reassignment list as the database returns it.
function assignedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    event_name: 'Welcome Evening',
    status: 'Approved',
    start_date_time: new Date('2027-01-10T10:00:00.000Z'),
    end_date_time: new Date('2027-01-10T12:00:00.000Z'),
    coordinator_id: COORDINATOR_ID,
    coordinator_name: 'Coordinator 1',
    coordinator_available: true,
    ...overrides,
  };
}

// The locked event row read at the start of a reassignment.
function reassignEventRow(overrides: Record<string, unknown> = {}) {
  return { id: EVENT_ID, event_name: 'Welcome Evening', status: 'Approved', coordinator_id: COORDINATOR_ID, coordinator_name: 'Coordinator 1', ...overrides };
}

// The body the Lead's page sends: the chosen coordinator and the one the page showed.
const reassignBody = { coordinatorId: NEW_COORDINATOR_ID, currentCoordinatorId: COORDINATOR_ID };

// Wire the transaction for a reassignment: lock the event, look up the new
// coordinator, update the event, mark the old notification read, insert the two notifications.
function wireReassign(options: {
  event?: Record<string, unknown> | null;
  coordinator?: Record<string, unknown> | null;
  notificationError?: Error;
  historyError?: Error;
}) {
  const event = options.event === undefined ? reassignEventRow() : options.event;
  const coordinator =
    options.coordinator === undefined
      ? { id: NEW_COORDINATOR_ID, display_name: 'Coordinator 2', is_available: true }
      : options.coordinator;
  client.query.mockImplementation((sql: string) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    if (text.startsWith('SELECT') && text.includes('FROM events')) return { rows: event ? [event] : [] };
    if (text.startsWith('SELECT') && text.includes('FROM users')) return { rows: coordinator ? [coordinator] : [] };
    if (text.startsWith('INSERT INTO notifications') && options.notificationError) throw options.notificationError;
    if (text.startsWith('INSERT INTO event_reassignments') && options.historyError) throw options.historyError;
    return { rows: [] };
  });
}

// Statements that change data (anything but SELECT), whitespace-normalised.
function writes() {
  return txStatements().filter((s) => !s.sql.startsWith('SELECT'));
}

describe('SPM-47 AC1 and AC11: the reassignment list', () => {
  // Only events that already have a coordinator and are still active, soonest first.
  it('LEAD-REASN-01-A returns assigned Submitted, Approved and Confirmed events, soonest first', async () => {
    // Arrange: two assigned events as the database returns them.
    database.query.mockResolvedValue({
      rows: [
        assignedRow(),
        assignedRow({
          id: SECOND_EVENT_ID,
          event_name: 'Spring Gala',
          status: 'Submitted',
          start_date_time: new Date('2027-02-01T09:00:00.000Z'),
          end_date_time: new Date('2027-02-01T11:00:00.000Z'),
          coordinator_id: NEW_COORDINATOR_ID,
          coordinator_name: 'Coordinator 2',
        }),
      ],
    });

    // Act: load the list.
    const result = await service.assigned(lead);

    // Assert: each event's name, status, dates and current coordinator, in the database's order.
    expect(result).toEqual([
      {
        id: EVENT_ID,
        name: 'Welcome Evening',
        status: 'Approved',
        startDateTime: '2027-01-10T10:00:00.000Z',
        endDateTime: '2027-01-10T12:00:00.000Z',
        coordinatorId: COORDINATOR_ID,
        coordinatorName: 'Coordinator 1',
        coordinatorAvailable: true,
      },
      {
        id: SECOND_EVENT_ID,
        name: 'Spring Gala',
        status: 'Submitted',
        startDateTime: '2027-02-01T09:00:00.000Z',
        endDateTime: '2027-02-01T11:00:00.000Z',
        coordinatorId: NEW_COORDINATOR_ID,
        coordinatorName: 'Coordinator 2',
        coordinatorAvailable: true,
      },
    ]);
    // Assert: the query keeps only assigned events whose status is in exactly the
    // three active statuses, and orders by start time.
    const [sql, params] = database.query.mock.calls[0];
    const text = String(sql).replace(/\s+/g, ' ');
    expect(text).toMatch(/coordinator_id IS NOT NULL/);
    expect(text).toMatch(/status = ANY\(\$1\)/);
    expect(params).toEqual([['Submitted', 'Approved', 'Confirmed']]);
    expect(text).toMatch(/ORDER BY (events\.)?start_date_time ASC/);
  });

  // The list says when an event's coordinator is unavailable.
  it("LEAD-REASN-11-A marks events whose coordinator is unavailable using the coordinator's saved availability", async () => {
    // Arrange: one event whose coordinator is unavailable.
    database.query.mockResolvedValue({ rows: [assignedRow({ coordinator_available: false })] });

    // Act: load the list.
    const [event] = await service.assigned(lead);

    // Assert: flagged, and read from the coordinator's availability.
    expect(event.coordinatorAvailable).toBe(false);
    expect(String(database.query.mock.calls[0][0])).toContain('is_available');
  });
});

describe('SPM-47 AC3, AC4 and AC5: reassigning an event', () => {
  // The event is locked, moved to exactly the chosen coordinator, and confirmed.
  it('LEAD-REASN-03-A reassigns the event to the chosen coordinator inside one transaction', async () => {
    // Arrange: an assigned, active event and an available new coordinator.
    wireReassign({});

    // Act: reassign.
    const result = await service.reassign(lead, EVENT_ID, reassignBody);

    // Assert: locked first, updated with the new coordinator's id and name, and confirmed.
    const sent = txStatements();
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(sent[0].sql).toMatch(/^SELECT .* FROM events WHERE id = \$1 FOR UPDATE$/);
    const update = sent.find((s) => s.sql.startsWith('UPDATE events'))!;
    expect(update.params).toEqual([EVENT_ID, NEW_COORDINATOR_ID, 'Coordinator 2']);
    expect(result).toEqual({
      event: { id: EVENT_ID, name: 'Welcome Evening', coordinatorId: NEW_COORDINATOR_ID, coordinatorName: 'Coordinator 2' },
      message: 'Event "Welcome Evening" reassigned to Coordinator 2.',
    });
  });

  // Choosing the coordinator the event already has is refused.
  it('LEAD-REASN-03-B refuses the coordinator the event is already assigned to', async () => {
    // Arrange: the chosen coordinator is the current one.
    wireReassign({});

    // Act + Assert: refused, and nothing is written.
    await expect(
      service.reassign(lead, EVENT_ID, { coordinatorId: COORDINATOR_ID, currentCoordinatorId: COORDINATOR_ID }),
    ).rejects.toThrow(new BadRequestException('Choose a different coordinator.'));
    expect(writes()).toEqual([]);
  });

  // Unknown events and anyone who isn't an active coordinator are refused inside the transaction.
  it.each([
    ['an unknown event', { event: null }, new NotFoundException('Event not found.')],
    ['an id that is not an active coordinator', { coordinator: null }, new BadRequestException('Choose an active Event Coordinator.')],
  ])('LEAD-REASN-03-C refuses %s without reassigning', async (_label, wiring, error) => {
    // Arrange: the missing row.
    wireReassign(wiring);

    // Act + Assert: the specific error, and nothing is written.
    await expect(service.reassign(lead, EVENT_ID, reassignBody)).rejects.toThrow(error);
    expect(writes()).toEqual([]);
  });

  // Malformed input never reaches the database.
  it.each([
    ['a malformed event id', 'not-a-uuid', reassignBody, new NotFoundException('Event not found.')],
    ['a missing coordinator id', EVENT_ID, { currentCoordinatorId: COORDINATOR_ID }, new BadRequestException('Choose an active Event Coordinator.')],
    ['a non-uuid coordinator id', EVENT_ID, { coordinatorId: 'coord-2', currentCoordinatorId: COORDINATOR_ID }, new BadRequestException('Choose an active Event Coordinator.')],
  ])('LEAD-REASN-03-C refuses %s before opening a transaction', async (_label, eventId, body, error) => {
    // Act + Assert: refused up front.
    await expect(service.reassign(lead, eventId, body)).rejects.toThrow(error);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // The new coordinator's row is locked and Lead accounts can never be chosen.
  it('LEAD-REASN-03-G locks the new coordinator row and excludes accounts that are also the Lead', async () => {
    // Arrange: a normal reassignment.
    wireReassign({});

    // Act: reassign.
    await service.reassign(lead, EVENT_ID, reassignBody);

    // Assert: the lookup excludes Lead accounts and takes a share lock before the event is updated.
    const sent = txStatements();
    const lookup = sent.findIndex((s) => s.sql.includes('FROM users'));
    const update = sent.findIndex((s) => s.sql.startsWith('UPDATE events'));
    expect(sent[lookup].sql).toContain('COORDINATOR_LEAD');
    expect(sent[lookup].sql).toMatch(/FOR SHARE OF users$/);
    expect(lookup).toBeLessThan(update);
  });

  // An unavailable coordinator is refused, with availability read inside the transaction.
  it('LEAD-REASN-04-A refuses an unavailable coordinator without reassigning or notifying', async () => {
    // Arrange: the new coordinator is now unavailable.
    wireReassign({ coordinator: { id: NEW_COORDINATOR_ID, display_name: 'Coordinator 2', is_available: false } });

    // Act + Assert: refused, after reading availability, with nothing written.
    await expect(service.reassign(lead, EVENT_ID, reassignBody)).rejects.toThrow(
      new ConflictException('This coordinator is unavailable.'),
    );
    expect(txStatements().some((s) => s.sql.includes('is_available') && s.sql.includes('FROM users'))).toBe(true);
    expect(writes()).toEqual([]);
  });

  // Reassignment changes only who coordinates the event; status and clarifications are untouched.
  it('LEAD-REASN-05-A changes only the coordinator columns and never touches status or clarifications', async () => {
    // Arrange: a normal reassignment.
    wireReassign({});

    // Act: reassign.
    await service.reassign(lead, EVENT_ID, reassignBody);

    // Assert: the event update sets the coordinator only; nothing deletes rows or writes comments.
    const update = txStatements().find((s) => s.sql.startsWith('UPDATE events'))!;
    expect(update.sql).toMatch(/SET coordinator_id = \$2, coordinator_name = \$3, updated_at = now\(\)/);
    expect(update.sql).not.toContain('status');
    expect(writes().some((s) => /^DELETE|event_comments/.test(s.sql))).toBe(false);
  });
});

describe('SPM-47 AC7: stale pages and events that moved on', () => {
  // If the event's coordinator changed since the page loaded, nothing happens.
  it('LEAD-REASN-07-B refuses a reassignment made from a page that showed a different coordinator', async () => {
    // Arrange: the event now belongs to someone else than the page showed.
    wireReassign({ event: reassignEventRow({ coordinator_id: '00000000-0000-4000-8000-0000000000c9', coordinator_name: 'Coordinator 9' }) });

    // Act + Assert: refused as stale, and nothing is written.
    await expect(service.reassign(lead, EVENT_ID, reassignBody)).rejects.toThrow(
      new ConflictException('This event was changed since you loaded the page. Refresh and try again.'),
    );
    expect(writes()).toEqual([]);
  });

  // Only assigned, active events can be reassigned.
  it.each([
    ['a Rejected event', { status: 'Rejected' }],
    ['a Completed event', { status: 'Completed' }],
    ['a Cancelled event', { status: 'Cancelled' }],
    ['an event with no coordinator', { status: 'Submitted', coordinator_id: null, coordinator_name: null }],
  ])('LEAD-REASN-07-C refuses %s', async (_label, overrides) => {
    // Arrange: the event is no longer reassignable.
    wireReassign({ event: reassignEventRow(overrides) });

    // Act + Assert: refused, and nothing is written.
    await expect(service.reassign(lead, EVENT_ID, reassignBody)).rejects.toThrow(
      new ConflictException('This event can no longer be reassigned.'),
    );
    expect(writes()).toEqual([]);
  });
});

describe('SPM-47 AC8: both coordinators are notified', () => {
  // The new coordinator and the original coordinator each get one notification about the event.
  it('LEAD-REASN-08-A notifies the new and the original coordinator in the same transaction', async () => {
    // Arrange: a normal reassignment.
    wireReassign({});

    // Act: reassign.
    await service.reassign(lead, EVENT_ID, reassignBody);

    // Assert: exactly two notifications, one per coordinator, with the agreed type and wording.
    const inserts = writes().filter((s) => s.sql.startsWith('INSERT INTO notifications'));
    expect(inserts).toHaveLength(2);
    const toNew = inserts.find((s) => (s.params as unknown[]).includes(NEW_COORDINATOR_ID))!;
    const toOriginal = inserts.find((s) => (s.params as unknown[]).includes(COORDINATOR_ID))!;
    expect(`${toNew.sql} ${JSON.stringify(toNew.params)}`).toContain('coordinator_reassignment');
    expect(toNew.params).toEqual(expect.arrayContaining(['Event "Welcome Evening" has been reassigned to you.', EVENT_ID]));
    expect(`${toOriginal.sql} ${JSON.stringify(toOriginal.params)}`).toContain('coordinator_unassignment');
    expect(toOriginal.params).toEqual(
      expect.arrayContaining(['Event "Welcome Evening" has been reassigned to Coordinator 2.', EVENT_ID]),
    );
  });

  // The original coordinator's unread notices saying the event is theirs no longer apply,
  // whether from the first assignment or an earlier reassignment to them.
  it("LEAD-REASN-08-B marks the original coordinator's unread assignment and reassignment notifications for the event as read", async () => {
    // Arrange: a normal reassignment.
    wireReassign({});

    // Act: reassign.
    await service.reassign(lead, EVENT_ID, reassignBody);

    // Assert: one update marks that coordinator's assignment and reassignment notices for this event as read.
    const markRead = writes().find((s) => s.sql.startsWith('UPDATE notifications'))!;
    expect(markRead.sql).toContain('read = true');
    expect(`${markRead.sql} ${JSON.stringify(markRead.params)}`).toContain("'coordinator_assignment'");
    expect(`${markRead.sql} ${JSON.stringify(markRead.params)}`).toContain("'coordinator_reassignment'");
    expect(markRead.params).toEqual(expect.arrayContaining([COORDINATOR_ID, EVENT_ID]));
  });

  // If a notification can't be saved, the reassignment doesn't stick.
  it('LEAD-REASN-08-C rolls the reassignment back if a notification cannot be saved', async () => {
    // Arrange: saving notifications fails.
    wireReassign({ notificationError: new Error('notification store down') });

    // Act + Assert: the error leaves the transaction, so it rolls back.
    await expect(service.reassign(lead, EVENT_ID, reassignBody)).rejects.toThrow('notification store down');
  });
});

describe('SPM-47 AC9: only the Event Coordinator Lead', () => {
  // Every other role is refused before any query.
  it.each(['COORDINATOR', 'ORGANISER', 'VENUE_STAFF', 'TECH_SUPPORT', 'ATTENDEE'] as const)(
    'LEAD-REASN-09-SEC-1 refuses the %s role on the list and on reassign without querying',
    async (role) => {
      // Arrange: a signed-in user without the Lead role.
      const user = userWithRole(role);
      const forbidden = new ForbiddenException('Event Coordinator Lead access required.');

      // Act + Assert: both are forbidden, and nothing is read or written.
      await expect(service.assigned(user)).rejects.toThrow(forbidden);
      await expect(service.reassign(user, EVENT_ID, reassignBody)).rejects.toThrow(forbidden);
      expect(database.query).not.toHaveBeenCalled();
      expect(database.transaction).not.toHaveBeenCalled();
    },
  );

  // Without a session nothing is read or written.
  it('LEAD-REASN-09-SEC-2 refuses a caller who is not signed in', async () => {
    // Act + Assert: both need a signed-in user.
    const unauthorized = new UnauthorizedException('Authentication required.');
    await expect(service.assigned(undefined)).rejects.toThrow(unauthorized);
    await expect(service.reassign(undefined, EVENT_ID, reassignBody)).rejects.toThrow(unauthorized);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // An account wrongly holding both the Lead and Coordinator roles can't reassign.
  it('LEAD-REASN-09-SEC-5 refuses an account that holds both the Lead and Coordinator roles', async () => {
    // Arrange: a user granted both roles.
    const both: AuthenticatedUser = { ...lead, roles: ['COORDINATOR_LEAD', 'COORDINATOR'] };
    const forbidden = new ForbiddenException('An Event Coordinator Lead cannot also be an Event Coordinator.');

    // Act + Assert: both are forbidden, and nothing is read or written.
    await expect(service.assigned(both)).rejects.toThrow(forbidden);
    await expect(service.reassign(both, EVENT_ID, reassignBody)).rejects.toThrow(forbidden);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SPM-46 View a Reassigned Event: every reassignment is recorded so the new
// coordinator can see who the event came from and when (AC2), and a previous
// coordinator can be told it moved (AC4).
// Test cases: REASN-VIEW-02-A, 02-B.
// ---------------------------------------------------------------------------
describe('SPM-46 AC2: each reassignment is recorded', () => {
  // One history row per reassignment, naming both coordinators and the Lead.
  it('REASN-VIEW-02-A records the reassignment (from, to and the Lead) in the same transaction', async () => {
    // Arrange: a normal reassignment from Coordinator 1 to Coordinator 2.
    wireReassign({});

    // Act: reassign.
    await service.reassign(lead, EVENT_ID, reassignBody);

    // Assert: exactly one history row inside the reassignment transaction, with both coordinators and the Lead.
    const history = txStatements().filter((s) => s.sql.startsWith('INSERT INTO event_reassignments'));
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(history).toHaveLength(1);
    expect(history[0].params).toEqual(
      expect.arrayContaining([EVENT_ID, COORDINATOR_ID, 'Coordinator 1', NEW_COORDINATOR_ID, 'Coordinator 2', 'lead-1']),
    );
  });

  // Without its history row, a reassignment doesn't stick.
  it('REASN-VIEW-02-B rolls the reassignment back if the history row cannot be saved', async () => {
    // Arrange: saving the history row fails.
    wireReassign({ historyError: new Error('history store down') });

    // Act + Assert: the error leaves the transaction, so it rolls back.
    await expect(service.reassign(lead, EVENT_ID, reassignBody)).rejects.toThrow('history store down');
  });
});
