/*
 * SPM-64 ChangeRequestsService business rules against a scripted database.
 * The real SQL, row lock, unique index and notification visibility are
 * exercised against PostgreSQL in test/change-requests.e2e-spec.ts.
 * Test IDs refer to the Confluence pages under SPM-28 > SPM-64 (REQ-CHANGE-NN-X).
 */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import type { DatabaseService } from '../../database/database.service.js';
import { ChangeRequestsService, MESSAGES } from './change-requests.service.js';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2027-01-01T00:00:00.000Z');

const organiser: AuthenticatedUser = { uid: 'org-1', name: 'Organiser 1', roles: ['ORGANISER'] } as AuthenticatedUser;
const otherOrganiser = { ...organiser, uid: 'org-2' } as AuthenticatedUser;
const coordinator = { uid: 'coord-1', name: 'Coordinator 1', roles: ['COORDINATOR'] } as AuthenticatedUser;
const attendee = { uid: 'att-1', roles: ['ATTENDEE'] } as AuthenticatedUser;

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    organiser_id: 'org-1',
    coordinator_id: 'coord-1',
    event_name: 'Alumni Networking Night',
    status: 'Planning',
    description: 'An evening of networking.',
    start_date_time: new Date('2027-02-05T10:30:00.000Z'),
    end_date_time: new Date('2027-02-05T13:30:00.000Z'),
    expected_attendance: 120,
    preferred_room_layout: 'Banquet',
    required_facilities: ['Catering', 'AV System'],
    accessibility_needs: ['Wheelchair ramps'],
    equipment_needs: 'One wireless microphone.',
    ...overrides,
  };
}

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    event_id: EVENT_ID,
    requested_by_id: 'org-1',
    requested_by: 'Organiser 1',
    changes: [{ field: 'expectedAttendance', originalValue: 120, proposedValue: 140 }],
    reason: null,
    requires_safety_check: true,
    status: 'Pending',
    decision_reason: null,
    decided_by: null,
    decided_by_id: null,
    decided_at: null,
    created_at: NOW,
    ...overrides,
  };
}

interface Script {
  event?: Record<string, unknown>;
  pending?: boolean;
  /** Whether the event has a safety check (any status). */
  safety?: boolean;
  request?: Record<string, unknown>;
  insertError?: unknown;
}

/** A scripted DatabaseService: answers by SQL shape and records every statement. */
function fakeDatabase(script: Script) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM events')) return { rows: script.event ? [script.event] : [] };
    if (sql.startsWith('SELECT 1 FROM event_safety_checks')) return { rows: script.safety ? [{}] : [] };
    if (sql.includes("status = 'Pending'") && sql.startsWith('SELECT 1'))
      return { rows: script.pending ? [{}] : [] };
    if (sql.includes('INSERT INTO event_change_requests')) {
      if (script.insertError) throw script.insertError;
      return {
        rows: [
          requestRow({
            changes: JSON.parse(params[4] as string),
            reason: params[5],
            requires_safety_check: params[6],
          }),
        ],
      };
    }
    if (sql.includes('INSERT INTO notifications')) return { rows: [] };
    if (sql.startsWith('SELECT * FROM event_change_requests WHERE id'))
      return { rows: script.request ? [script.request] : [] };
    if (sql.includes("SET status = 'Withdrawn'"))
      return { rows: [requestRow({ status: 'Withdrawn', decided_by: params[1], decided_at: params[3] })] };
    if (sql.includes('WHERE r.event_id'))
      return { rows: [requestRow()] };
    if (sql.includes('JOIN events e')) return { rows: [{ ...requestRow(), event_name: 'Alumni Networking Night' }] };
    throw new Error(`unexpected SQL: ${sql}`);
  });
  const database = {
    query,
    transaction: vi.fn(async (work: (client: { query: typeof query }) => unknown) => work({ query })),
  };
  return { database: database as unknown as DatabaseService, calls };
}

function service(script: Script) {
  const fake = fakeDatabase(script);
  return { svc: new ChangeRequestsService(fake.database, { now: () => NOW }), ...fake };
}

const sqlOf = (calls: { sql: string }[]) => calls.map((c) => c.sql).join('\n');

describe('ChangeRequestsService.create', () => {
  let script: Script;
  beforeEach(() => {
    script = { event: eventRow() };
  });

  /** REQ-CHANGE-01-A, 03-A, 04-A: the owner's request is stored Pending, returned, and the coordinator notified. */
  it('REQ-CHANGE-01-A stores a pending request and notifies the assigned coordinator', async () => {
    const { svc, calls } = service({ ...script, safety: true });
    const record = await svc.create(organiser, EVENT_ID, { changes: { expectedAttendance: 140 } });
    expect(record).toMatchObject({
      id: REQUEST_ID,
      eventId: EVENT_ID,
      eventName: 'Alumni Networking Night',
      status: 'Pending',
      requestedBy: 'Organiser 1',
      changes: [{ field: 'expectedAttendance', originalValue: 120, proposedValue: 140 }],
      requiresSafetyCheck: true,
    });
    const notification = calls.find((c) => c.sql.includes('INSERT INTO notifications'))!;
    expect(notification.sql).toContain("'coordinator_change_request'");
    expect(notification.params[1]).toBe('coord-1');
    expect(notification.params[2]).toBe(
      'Organiser 1 requested a change to "Alumni Networking Night": expected attendance.',
    );
    expect(notification.params[3]).toBe(EVENT_ID);
  });

  /** REQ-CHANGE-01-G: the live event is never written when a request is made. */
  it('REQ-CHANGE-01-G never updates the event itself', async () => {
    const { svc, calls } = service(script);
    await svc.create(organiser, EVENT_ID, {
      changes: { startDateTime: '2027-02-06T10:30:00Z', endDateTime: '2027-02-06T13:30:00Z' },
    });
    expect(sqlOf(calls)).not.toMatch(/UPDATE events/);
    expect(sqlOf(calls)).toContain('FOR UPDATE');
  });

  /** REQ-CHANGE-01-B, 01-E: only fields that differ from the stored values are kept; dates compare as instants and lists as sets. */
  it('REQ-CHANGE-01-B keeps only the fields that actually change, with their original values', async () => {
    const { svc } = service(script);
    const record = await svc.create(organiser, EVENT_ID, {
      changes: {
        startDateTime: '2027-02-05T10:30:00.000Z', // same instant
        endDateTime: '2027-02-05T14:00:00Z',
        facilities: ['AV System', 'Catering'], // same set
        equipmentNeeds: 'Two microphones.',
      },
      reason: 'More speakers.',
    });
    expect(record.changes).toEqual([
      { field: 'endDateTime', originalValue: '2027-02-05T13:30:00.000Z', proposedValue: '2027-02-05T14:00:00Z' },
      { field: 'equipmentNeeds', originalValue: 'One wireless microphone.', proposedValue: 'Two microphones.' },
    ]);
    expect(record.reason).toBe('More speakers.');
  });

  /** REQ-CHANGE-01-E: values identical to the current ones are not a request. */
  it('REQ-CHANGE-01-E rejects a request whose values equal the current values', async () => {
    const { svc, calls } = service(script);
    await expect(
      svc.create(organiser, EVENT_ID, { changes: { facilities: ['AV System', 'Catering'] } }),
    ).rejects.toMatchObject({ response: { message: MESSAGES.noChanges } });
    expect(sqlOf(calls)).not.toContain('INSERT');
  });

  /** REQ-CHANGE-01-C: the end must stay after the start once merged with the stored values. */
  it.each([
    [{ endDateTime: '2027-02-05T10:00:00Z' }, 'endDateTime'],
    [{ startDateTime: '2027-02-05T14:00:00Z' }, 'startDateTime'],
  ])('REQ-CHANGE-01-C rejects a schedule that ends before it starts: %j', async (changes, field) => {
    const { svc } = service(script);
    const error = await svc.create(organiser, EVENT_ID, { changes }).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse().errors).toEqual({ [field]: MESSAGES.endBeforeStart });
  });

  /** REQ-CHANGE-01-F (AC7): Submitted, Approved, Planning and Confirmed accept requests. */
  it.each(['Submitted', 'Approved', 'Planning', 'Confirmed'])(
    'REQ-CHANGE-01-F accepts a request on a %s event',
    async (status) => {
      const { svc } = service({ event: eventRow({ status }) });
      const record = await svc.create(organiser, EVENT_ID, { changes: { description: 'New' } });
      expect(record.status).toBe('Pending');
    },
  );

  /**
   * REQ-CHANGE-07-A (SPM-64 note): a new safety check is needed exactly when the
   * event has a safety check, whatever its status and whichever detail changes.
   */
  it.each([
    ['Planning', true, { description: 'New' }],
    ['Confirmed', true, { expectedAttendance: 140 }],
    ['Approved', true, { equipmentNeeds: 'Two microphones.' }],
    ['Planning', false, { startDateTime: '2027-02-05T11:00:00Z' }],
    ['Submitted', false, { description: 'New' }],
  ])('REQ-CHANGE-07-A flags a %s event with safety check %s', async (status, safety, changes) => {
    const { svc, calls } = service({ event: eventRow({ status }), safety });
    const record = await svc.create(organiser, EVENT_ID, { changes });
    expect(record.requiresSafetyCheck).toBe(safety);
    const lookup = calls.find((c) => c.sql.startsWith('SELECT 1 FROM event_safety_checks'))!;
    expect(lookup.params).toEqual([EVENT_ID]);
  });

  /** REQ-CHANGE-01-F: closed events refuse change requests. */
  it.each(['Rejected', 'Cancelled', 'Completed'])(
    'REQ-CHANGE-01-F refuses a request on a %s event',
    async (status) => {
      const { svc } = service({ event: eventRow({ status }) });
      await expect(svc.create(organiser, EVENT_ID, { changes: { description: 'New' } })).rejects.toMatchObject({
        status: 409,
        response: { message: MESSAGES.closed, code: 'change_request_closed' },
      });
    },
  );

  /** REQ-CHANGE-01-F: an event that has started (at the start instant) refuses requests. */
  it('REQ-CHANGE-01-F refuses a request once the event has started', async () => {
    const { svc } = service({ event: eventRow({ start_date_time: NOW, end_date_time: new Date('2027-01-01T02:00:00Z') }) });
    await expect(svc.create(organiser, EVENT_ID, { changes: { description: 'New' } })).rejects.toMatchObject({
      status: 409,
      response: { code: 'event_started' },
    });
  });

  /** REQ-CHANGE-01-H: a second request while one is pending is refused. */
  it('REQ-CHANGE-01-H refuses a second request while one is pending', async () => {
    const { svc, calls } = service({ ...script, pending: true });
    await expect(svc.create(organiser, EVENT_ID, { changes: { description: 'New' } })).rejects.toMatchObject({
      status: 409,
      response: { message: MESSAGES.pending, code: 'change_request_pending' },
    });
    expect(sqlOf(calls)).not.toContain('INSERT');
  });

  /** REQ-CHANGE-01-H: a concurrent duplicate caught by the unique index is reported the same way. */
  it('REQ-CHANGE-01-H maps the one-pending unique index to the same 409', async () => {
    const { svc } = service({ ...script, insertError: Object.assign(new Error('dup'), { code: '23505' }) });
    await expect(svc.create(organiser, EVENT_ID, { changes: { description: 'New' } })).rejects.toMatchObject({
      status: 409,
      response: { code: 'change_request_pending' },
    });
  });

  /** Other storage errors are not disguised as a duplicate. */
  it('rethrows other storage errors unchanged', async () => {
    const failure = Object.assign(new Error('down'), { code: '57P01' });
    const { svc } = service({ ...script, insertError: failure });
    await expect(svc.create(organiser, EVENT_ID, { changes: { description: 'New' } })).rejects.toBe(failure);
  });

  /** REQ-CHANGE-03-C: an unassigned event's request is stored, with nobody to notify until the Lead assigns it. */
  it('REQ-CHANGE-03-C stores a request on an unassigned event without a notification', async () => {
    const { svc, calls } = service({ event: eventRow({ status: 'Submitted', coordinator_id: null }) });
    await svc.create(organiser, EVENT_ID, { changes: { description: 'New' } });
    expect(sqlOf(calls)).not.toContain('INSERT INTO notifications');
  });

  /** REQ-CHANGE-08-A: only an authenticated organiser who owns the event may submit. */
  it('REQ-CHANGE-08-A refuses everyone but the owning organiser', async () => {
    const body = { changes: { description: 'New' } };
    await expect(service(script).svc.create(undefined, EVENT_ID, body)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service(script).svc.create(coordinator, EVENT_ID, body)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service(script).svc.create(attendee, EVENT_ID, body)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service(script).svc.create(otherOrganiser, EVENT_ID, body)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service({}).svc.create(organiser, EVENT_ID, body)).rejects.toBeInstanceOf(NotFoundException);
  });

  /** REQ-CHANGE-08-C: a malformed event id is a 404 without touching the database. */
  it('REQ-CHANGE-08-C answers 404 for a malformed event id', async () => {
    const { svc, calls } = service(script);
    await expect(svc.create(organiser, 'not-a-uuid', { changes: { description: 'New' } })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls).toHaveLength(0);
  });

  /** A user with neither a name nor an email is still recorded by role. */
  it('falls back to the role name when the session has no name or email', async () => {
    const { svc, calls } = service(script);
    await svc.create({ uid: 'org-1', roles: ['ORGANISER'] } as AuthenticatedUser, EVENT_ID, {
      changes: { description: 'New' },
    });
    const insert = calls.find((c) => c.sql.includes('INSERT INTO event_change_requests'))!;
    expect(insert.params[3]).toBe('Organiser');
  });

  /** The email is used when the session has no display name. */
  it('uses the email when the session has no display name', async () => {
    const { svc, calls } = service(script);
    await svc.create({ uid: 'org-1', email: 'o@x.test', roles: ['ORGANISER'] } as AuthenticatedUser, EVENT_ID, {
      changes: { description: 'New' },
    });
    expect(calls.find((c) => c.sql.includes('INSERT INTO event_change_requests'))!.params[3]).toBe('o@x.test');
  });
});

describe('ChangeRequestsService reads', () => {
  /** REQ-CHANGE-05-A: the owner lists the event's requests; REQ-CHANGE-03-A: so does its assigned coordinator. */
  it('REQ-CHANGE-05-A lists an event\'s requests for its owner and its assigned coordinator', async () => {
    for (const user of [organiser, coordinator]) {
      const { svc } = service({ event: eventRow() });
      const list = await svc.listForEvent(user, EVENT_ID);
      expect(list).toEqual([
        expect.objectContaining({ id: REQUEST_ID, status: 'Pending', eventName: 'Alumni Networking Night' }),
      ]);
    }
  });

  /** REQ-CHANGE-05-C, 03-B: nobody else can read an event's requests. */
  it('REQ-CHANGE-05-C hides an event\'s requests from other organisers, coordinators and attendees', async () => {
    const otherCoordinator = { ...coordinator, uid: 'coord-2' } as AuthenticatedUser;
    await expect(service({ event: eventRow() }).svc.listForEvent(otherOrganiser, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service({ event: eventRow() }).svc.listForEvent(otherCoordinator, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service({ event: eventRow() }).svc.listForEvent(attendee, EVENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service({}).svc.listForEvent(organiser, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service({}).svc.listForEvent(undefined, EVENT_ID)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /** REQ-CHANGE-05-B: decided requests carry who decided, when and why. */
  it('REQ-CHANGE-05-B returns the decision details of a decided request', async () => {
    const { svc, database } = service({ event: eventRow() });
    vi.mocked(database.query).mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT * FROM events')
        ? ({ rows: [eventRow()] } as never)
        : ({
            rows: [
              requestRow({
                status: 'Denied',
                reason: 'Guest list grew.',
                decided_by: 'Coordinator 1',
                decided_at: '2027-01-02T00:00:00.000Z',
                decision_reason: 'Venue cannot fit the larger group.',
              }),
            ],
          } as never),
    );
    expect((await svc.listForEvent(organiser, EVENT_ID))[0]).toMatchObject({
      status: 'Denied',
      reason: 'Guest list grew.',
      decidedBy: 'Coordinator 1',
      decidedAt: '2027-01-02T00:00:00.000Z',
      decisionReason: 'Venue cannot fit the larger group.',
    });
  });

  /** REQ-CHANGE-07-A: a pending request shows the event's safety check now; a decided one keeps the stored flag. */
  it('REQ-CHANGE-07-A reads the safety check live for pending requests only', async () => {
    const { svc, database } = service({ event: eventRow() });
    vi.mocked(database.query).mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT * FROM events')
        ? ({ rows: [eventRow()] } as never)
        : ({
            rows: [
              requestRow({ requires_safety_check: false, has_safety_check: true }),
              requestRow({ id: 'cr-old', status: 'Denied', requires_safety_check: true, has_safety_check: false }),
            ],
          } as never),
    );
    const [pending, denied] = await svc.listForEvent(organiser, EVENT_ID);
    expect(pending.requiresSafetyCheck).toBe(true);
    expect(denied.requiresSafetyCheck).toBe(true);
    expect(vi.mocked(database.query).mock.calls[1][0]).toContain('event_safety_checks');
  });

  /** REQ-CHANGE-05-A: the dashboard list is scoped to the caller's own events and roles. */
  it('REQ-CHANGE-05-A lists the caller\'s requests scoped by role, optionally by status', async () => {
    const { svc, calls } = service({});
    const list = await svc.listMine(organiser, 'Pending');
    expect(list[0]).toMatchObject({ eventName: 'Alumni Networking Night', status: 'Pending' });
    expect(calls[0].params).toEqual(['org-1', true, false, 'Pending']);
    await svc.listMine(coordinator);
    expect(calls[1].params).toEqual(['coord-1', false, true, null]);
  });

  /** An unknown status filter is a client error; attendees have no dashboard list. */
  it('rejects an unknown status filter and non-organiser, non-coordinator callers', async () => {
    await expect(service({}).svc.listMine(organiser, 'Maybe')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service({}).svc.listMine(attendee)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ChangeRequestsService.withdraw', () => {
  /** REQ-CHANGE-09-C (AC8): the owner withdraws their own pending request. */
  it('REQ-CHANGE-09-C withdraws the owner\'s pending request', async () => {
    const { svc, calls } = service({ event: eventRow(), request: requestRow() });
    const record = await svc.withdraw(organiser, EVENT_ID, REQUEST_ID);
    expect(record).toMatchObject({ status: 'Withdrawn', decidedBy: 'Organiser 1', decidedAt: NOW.toISOString() });
    expect(sqlOf(calls)).toContain('FOR UPDATE');
  });

  /** REQ-CHANGE-09-B (AC8): a request that is already decided or withdrawn cannot be withdrawn. */
  it.each(['Approved', 'Denied', 'Withdrawn'])('REQ-CHANGE-09-B refuses to withdraw a %s request', async (status) => {
    const { svc, calls } = service({ event: eventRow(), request: requestRow({ status }) });
    await expect(svc.withdraw(organiser, EVENT_ID, REQUEST_ID)).rejects.toMatchObject({
      status: 409,
      response: { message: MESSAGES.decided },
    });
    expect(sqlOf(calls)).not.toContain("SET status = 'Withdrawn'");
  });

  /** REQ-CHANGE-09-A (AC8): only the owner may withdraw, and only a request of that event. */
  it('REQ-CHANGE-09-A refuses other users, unknown requests and malformed ids', async () => {
    await expect(service({}).svc.withdraw(undefined, EVENT_ID, REQUEST_ID)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service({ event: eventRow(), request: requestRow() }).svc.withdraw(otherOrganiser, EVENT_ID, REQUEST_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service({ event: eventRow() }).svc.withdraw(organiser, EVENT_ID, REQUEST_ID)).rejects.toMatchObject({
      response: { message: MESSAGES.requestNotFound },
    });
    await expect(service({}).svc.withdraw(organiser, EVENT_ID, 'nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service({}).svc.withdraw(coordinator, EVENT_ID, REQUEST_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
