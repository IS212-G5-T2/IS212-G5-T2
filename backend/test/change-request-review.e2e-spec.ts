/*
 * SPM-65 Review and Approve/Deny a Change Request through the real HTTP pipeline: AppModule, the
 * PostgreSQL-backed AuthenticationMiddleware (session cookies from /api/auth/login), the change
 * request routes and real PostgreSQL (triggers, constraints, row locks).
 *
 * Needs DATABASE_URL for a database initialized with database/postgresql/init 001 to 019
 * (019 adds the review columns and the audit log; existing databases apply
 * backend/migrations/013_spm65_change_request_review.sql).
 * Test IDs refer to the Confluence pages under SPM-28 > SPM-65 (REVIEW-CHANGE-NN-X).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { AppModule } from '../src/app.module.js';

const START = '2030-04-14T10:00:00.000Z';
const END = '2030-04-14T13:00:00.000Z';

type DatabaseUser = { uid: string; name: string; cookie: string };

describe('SPM-65 change request review over HTTP (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let createdEventIds: string[];
  let createdUserIds: string[];
  let createdVenueIds: string[];

  let organiser: DatabaseUser;
  let coordinator: DatabaseUser;
  let otherCoordinator: DatabaseUser;
  let eventId: string;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdUserIds = [];
    createdVenueIds = [];
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    organiser = await createDatabaseUser('ORGANISER', 'CR Organiser');
    coordinator = await createDatabaseUser('COORDINATOR', 'CR Coordinator');
    otherCoordinator = await createDatabaseUser(
      'COORDINATOR',
      'CR Other Coordinator',
    );
    eventId = await seedEvent('Planning');
  });

  afterEach(async () => {
    await app.close();
    if (createdEventIds.length)
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [
        createdEventIds,
      ]);
    if (createdVenueIds.length)
      await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [
        createdVenueIds,
      ]);
    if (createdUserIds.length)
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        createdUserIds,
      ]);
  });

  const http = () => app.getHttpServer();
  const base = (id = eventId) => `/api/events/${id}/change-requests`;
  const submit = (changes: Record<string, unknown>, id = eventId) =>
    request(http())
      .post(base(id))
      .set('Cookie', organiser.cookie)
      .send({ changes });
  const approve = (
    requestId: string,
    user = coordinator,
    id = eventId,
    body: object = {},
  ) =>
    request(http())
      .post(`${base(id)}/${requestId}/approve`)
      .set('Cookie', user.cookie)
      .send(body);
  const deny = (
    requestId: string,
    reason: unknown,
    user = coordinator,
    id = eventId,
  ) =>
    request(http())
      .post(`${base(id)}/${requestId}/deny`)
      .set('Cookie', user.cookie)
      .send({ reason });
  const eventRow = async (id = eventId) =>
    (await pool.query('SELECT * FROM events WHERE id = $1', [id])).rows[0];
  const notices = async (user: DatabaseUser, type: string) =>
    (
      await pool.query(
        'SELECT message FROM notifications WHERE recipient_id = $1 AND type = $2 ORDER BY created_at',
        [user.uid, type],
      )
    ).rows.map((row) => row.message);
  const auditRows = async (id = eventId) =>
    (
      await pool.query(
        'SELECT * FROM event_change_request_audit WHERE event_id = $1 ORDER BY decided_at',
        [id],
      )
    ).rows;

  /** REVIEW-CHANGE-01-A, 01-B, 01-C: the coordinator's pending list holds their events' pending requests only. */
  it('REVIEW-CHANGE-01-A lists pending requests for the assigned coordinator only', async () => {
    const second = await seedEvent('Approved');
    const a = await submit({ expectedAttendance: 90 }).expect(201);
    const b = await submit({ description: 'Updated agenda.' }, second).expect(
      201,
    );
    const list = await request(http())
      .get('/api/change-requests?status=Pending')
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(list.body.map((r: { id: string }) => r.id).sort()).toEqual(
      [a.body.id, b.body.id].sort(),
    );
    expect(list.body[0]).toMatchObject({
      organiserName: 'CR Organiser',
      eventName: 'CR Review Evening',
    });
    // REVIEW-CHANGE-01-B: another coordinator sees nothing and cannot open or decide it.
    const other = await request(http())
      .get('/api/change-requests?status=Pending')
      .set('Cookie', otherCoordinator.cookie)
      .expect(200);
    expect(other.body).toEqual([]);
    await request(http())
      .get(`${base()}/${a.body.id}/conflicts`)
      .set('Cookie', otherCoordinator.cookie)
      .expect(404);
    await approve(a.body.id, otherCoordinator).expect(404);
    // REVIEW-CHANGE-01-C: a decided request leaves the pending list and stays in the history.
    await approve(a.body.id).expect(200);
    const after = await request(http())
      .get('/api/change-requests?status=Pending')
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(after.body.map((r: { id: string }) => r.id)).toEqual([b.body.id]);
    const history = await request(http())
      .get(base())
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(history.body[0]).toMatchObject({
      id: a.body.id,
      status: 'Approved',
    });
  });

  /** REVIEW-CHANGE-01-E: after reassignment only the new coordinator can decide the request. */
  it('REVIEW-CHANGE-01-E moves the decision to the newly assigned coordinator', async () => {
    const created = await submit({ description: 'Updated agenda.' }).expect(
      201,
    );
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [
      eventId,
      otherCoordinator.uid,
    ]);
    await approve(created.body.id).expect(404);
    await approve(created.body.id, otherCoordinator).expect(200);
  });

  /** REVIEW-CHANGE-03-A, 03-C, 03-E, 03-H: the read-only preview lists venue and equipment conflicts and changes nothing. */
  it('REVIEW-CHANGE-03-A previews booking, turnaround and equipment conflicts without changing anything', async () => {
    const venue = await insertVenue('CR Hall', 150);
    const booking = await insertBooking(
      eventId,
      venue,
      '2030-04-14T09:30:00Z',
      '2030-04-14T13:30:00Z',
    );
    const neighbourEvent = await seedEvent('Planning', 'Data Night');
    await insertBooking(
      neighbourEvent,
      venue,
      '2030-04-14T14:00:00Z',
      '2030-04-14T16:00:00Z',
    );
    const equipment = await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, 'Projector', 2, 'Reserved') RETURNING id`,
      [eventId],
    );
    await pool.query(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, 'Old screen', 1, 'Released')`,
      [eventId],
    );
    const before = await eventRow();
    // Ends 13:45: outside the held window and only 15 min before Data Night.
    const created = await submit({
      endDateTime: '2030-04-14T13:45:00Z',
    }).expect(201);
    const preview = await request(http())
      .get(`${base()}/${created.body.id}/conflicts`)
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(preview.body.hasConflicts).toBe(true);
    expect(preview.body.venueBookings).toEqual([
      expect.objectContaining({
        kind: 'venue',
        refId: booking,
        name: 'CR Hall',
      }),
    ]);
    const details = preview.body.venueBookings[0].details.join(' | ');
    expect(details).toContain('the booking must change');
    expect(details).toContain(
      'Only 15 min turnaround before Data Night; 30 min needed for setup',
    );
    expect(preview.body.equipment).toEqual([
      {
        kind: 'equipment',
        refId: equipment.rows[0].id,
        name: 'Projector × 2',
        details: ['Reservation period must move with the new event time'],
      },
    ]);
    // Nothing changed: the event, its bookings and the request.
    expect(await eventRow()).toEqual(before);
    const stored = await pool.query(
      'SELECT status FROM event_change_requests WHERE id = $1',
      [created.body.id],
    );
    expect(stored.rows).toEqual([{ status: 'Pending' }]);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM event_flagged_changes WHERE event_id = $1',
          [eventId],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  /** REVIEW-CHANGE-03-F, 03-G: capacity and registrations are checked too; a compatible change has no conflicts. */
  it('REVIEW-CHANGE-03-G reports attendance below the registered count and the attendees a move affects', async () => {
    const venue = await insertVenue('CR Small Room', 60);
    await insertBooking(eventId, venue, START, END);
    for (const status of [
      'Registered',
      'Registered',
      'Registered',
      'Waitlisted',
    ])
      await insertRegistration(eventId, status);
    const fewer = await submit({ expectedAttendance: 2 }).expect(201);
    const p1 = await request(http())
      .get(`${base()}/${fewer.body.id}/conflicts`)
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(p1.body.registrations).toEqual({
      registered: 3,
      waitlisted: 1,
      details: [
        '3 attendees are already registered; the requested attendance is 2',
      ],
    });
    expect(p1.body.venueBookings).toEqual([]);
    await deny(
      fewer.body.id,
      'Too few seats for the registered guests.',
    ).expect(200);

    const more = await submit({
      expectedAttendance: 61,
      startDateTime: '2030-04-14T10:30:00Z',
    }).expect(201);
    const p2 = await request(http())
      .get(`${base()}/${more.body.id}/conflicts`)
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(p2.body.venueBookings[0].details).toEqual([
      'Attendance 61 exceeds capacity 60',
    ]);
    expect(p2.body.registrations.details).toEqual([
      '4 registered attendees (3 registered, 1 waitlisted) will be affected by the new date/time',
    ]);
    await deny(more.body.id, 'The room cannot take more people.').expect(200);

    // REVIEW-CHANGE-03-B: a description change has nothing to check.
    const plain = await submit({ description: 'New agenda.' }).expect(201);
    const p3 = await request(http())
      .get(`${base()}/${plain.body.id}/conflicts`)
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(p3.body).toMatchObject({
      hasConflicts: false,
      venueBookings: [],
      equipment: [],
    });
  });

  /** REVIEW-CHANGE-04-A, 07-A, 07-B, 07-D, 10-A: approving applies only the requested fields, notifies and audits once. */
  it('REVIEW-CHANGE-04-A approves, updates only the requested fields, notifies the organiser and audits', async () => {
    const before = await eventRow();
    const created = await submit({
      startDateTime: '2030-04-15T10:00:00Z',
      endDateTime: '2030-04-15T13:00:00Z',
      layout: 'Theatre',
    }).expect(201);
    const response = await approve(created.body.id).expect(200);
    expect(response.body).toMatchObject({
      request: {
        id: created.body.id,
        status: 'Approved',
        decidedBy: 'CR Coordinator',
        recheck: [],
        safetyCheckReset: false,
      },
      eventStatus: 'planning',
      safetyCheckReset: false,
    });
    const after = await eventRow();
    expect(after.start_date_time.toISOString()).toBe(
      '2030-04-15T10:00:00.000Z',
    );
    expect(after.end_date_time.toISOString()).toBe('2030-04-15T13:00:00.000Z');
    expect(after.preferred_room_layout).toBe('Theatre');
    // REVIEW-CHANGE-07-B: everything else is untouched.
    for (const column of [
      'event_name',
      'organiser_id',
      'description',
      'expected_attendance',
      'required_facilities',
      'accessibility_needs',
      'equipment_needs',
      'status',
    ])
      expect(after[column]).toEqual(before[column]);
    expect(after.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
    // REVIEW-CHANGE-07-A: the event API shows the new values.
    const shown = await request(http())
      .get(`/api/events/${eventId}`)
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(shown.body.venueRequirements.layout).toBe('Theatre');
    // REVIEW-CHANGE-07-D: the organiser is told once.
    expect(await notices(organiser, 'change_request_approved')).toEqual([
      'Your change request for "CR Review Evening" was approved.',
    ]);
    // REVIEW-CHANGE-10-A: one audit entry with the full outcome.
    const audit = await auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      change_request_id: created.body.id,
      outcome: 'Approved',
      requested_by: 'CR Organiser',
      decided_by: 'CR Coordinator',
      decided_by_id: coordinator.uid,
    });
    expect(audit[0].changes.map((c: { field: string }) => c.field)).toEqual([
      'startDateTime',
      'endDateTime',
      'layout',
    ]);
  });

  /** REVIEW-CHANGE-04-B, 04-C: a request is decided once; parallel decisions settle to one. */
  it('REVIEW-CHANGE-04-C decides a request exactly once', async () => {
    const created = await submit({ expectedAttendance: 90 }).expect(201);
    const [first, second] = await Promise.all([
      approve(created.body.id),
      deny(created.body.id, 'Not possible on these dates.'),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await auditRows()).toHaveLength(1);
    // REVIEW-CHANGE-04-B: deciding again is refused.
    const again = await approve(created.body.id).expect(409);
    expect(again.body.message).toBe(
      'This change request has already been decided.',
    );
  });

  /**
   * REVIEW-CHANGE-12-A (AC11): a pending request is closed automatically when the organiser withdraws it.
   * Its status is Withdrawn (agreed 18 Oct 2026); it leaves the coordinator's pending list, cannot be
   * decided (the coordinator is told why) and the withdrawal is audited.
   */
  it('REVIEW-CHANGE-12-A closes a pending request when the organiser withdraws it', async () => {
    const created = await submit({ description: 'Another change.' }).expect(
      201,
    );
    await request(http())
      .post(`${base()}/${created.body.id}/withdraw`)
      .set('Cookie', organiser.cookie)
      .expect(200);
    const stored = await pool.query(
      'SELECT status, decided_by FROM event_change_requests WHERE id = $1',
      [created.body.id],
    );
    expect(stored.rows).toEqual([
      { status: 'Withdrawn', decided_by: 'CR Organiser' },
    ]);
    const pending = await request(http())
      .get('/api/change-requests?status=Pending')
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(pending.body).toEqual([]);
    const refused = await approve(created.body.id).expect(409);
    expect(refused.body).toMatchObject({
      message: 'The organiser has withdrawn this change request.',
      code: 'change_request_withdrawn',
    });
    await deny(created.body.id, 'Not possible on these dates.').expect(409);
    await request(http())
      .get(`${base()}/${created.body.id}/conflicts`)
      .set('Cookie', coordinator.cookie)
      .expect(409);
    expect((await auditRows()).map((row) => row.outcome)).toEqual([
      'Withdrawn',
    ]);
  });

  /** REVIEW-CHANGE-04-D: values that are no longer valid are refused and nothing changes. */
  it('REVIEW-CHANGE-04-D refuses values that are no longer valid', async () => {
    const created = await submit({ description: 'x' }).expect(201);
    await pool.query(
      `UPDATE event_change_requests SET changes = '[{"field":"startDateTime","originalValue":"2030-04-14T10:00:00.000Z","proposedValue":"2020-01-01T10:00:00.000Z"}]'::jsonb WHERE id = $1`,
      [created.body.id],
    );
    const before = await eventRow();
    const refused = await approve(created.body.id).expect(400);
    expect(refused.body.errors).toEqual({
      startDateTime: 'Start date and time must be in the future.',
    });
    expect(await eventRow()).toEqual(before);
    const stored = await pool.query(
      'SELECT status FROM event_change_requests WHERE id = $1',
      [created.body.id],
    );
    expect(stored.rows).toEqual([{ status: 'Pending' }]);
    expect(await auditRows()).toEqual([]);
  });

  /**
   * REVIEW-CHANGE-12-B (AC11), 04-E: a pending request is closed automatically when the event is cancelled.
   * Status Closed, decided by System with the reason; it leaves the pending list, cannot be decided and is audited.
   */
  it('REVIEW-CHANGE-12-B closes a pending request when the event is cancelled', async () => {
    const created = await submit({ description: 'New agenda.' }).expect(201);
    await request(http())
      .post(`/api/events/${eventId}/status-change`)
      .set('Cookie', coordinator.cookie)
      .send({ targetStatus: 'Cancelled', confirmed: true })
      .expect(200);
    const stored = await pool.query(
      'SELECT status, decided_by, decision_reason FROM event_change_requests WHERE id = $1',
      [created.body.id],
    );
    expect(stored.rows).toEqual([
      {
        status: 'Closed',
        decided_by: 'System',
        decision_reason: 'The event was cancelled.',
      },
    ]);
    const pending = await request(http())
      .get('/api/change-requests?status=Pending')
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(pending.body).toEqual([]);
    const refused = await approve(created.body.id).expect(409);
    expect(refused.body).toMatchObject({
      code: 'change_request_closed',
      message:
        'This change request was closed because the event was cancelled.',
    });
    await deny(created.body.id, 'Not possible on these dates.').expect(409);
    // The organiser sees it as Closed with the reason.
    const history = await request(http())
      .get(base())
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(history.body[0]).toMatchObject({
      status: 'Closed',
      decisionReason: 'The event was cancelled.',
    });
    expect((await auditRows()).map((row) => row.outcome)).toEqual(['Closed']);
  });

  /** REVIEW-CHANGE-05-A, 05-B, 05-D, 10-B: denying needs a reason, leaves the event as it was, notifies and audits. */
  it('REVIEW-CHANGE-05-A denies with a reason and leaves the event unchanged', async () => {
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by) VALUES ($1, 'approved', now(), 'CR Coordinator')`,
      [eventId],
    );
    const created = await submit({ expectedAttendance: 140 }).expect(201);
    const before = await eventRow();
    for (const reason of [undefined, '', '    ']) {
      const refused = await deny(created.body.id, reason).expect(400);
      expect(refused.body.errors).toEqual({
        reason: 'Please give a reason for denying this change.',
      });
    }
    await deny(created.body.id, 'Too short').expect(400);
    const response = await deny(
      created.body.id,
      '  Venue cannot fit the larger group.  ',
    ).expect(200);
    expect(response.body.request).toMatchObject({
      status: 'Denied',
      decisionReason: 'Venue cannot fit the larger group.',
      decidedBy: 'CR Coordinator',
    });
    expect(await eventRow()).toEqual(before);
    // REVIEW-CHANGE-08-E: denial never resets the safety check.
    const safety = await pool.query(
      'SELECT status FROM event_safety_checks WHERE event_id = $1',
      [eventId],
    );
    expect(safety.rows).toEqual([{ status: 'approved' }]);
    expect(await notices(organiser, 'change_request_denied')).toEqual([
      'Your change request for "CR Review Evening" was denied: Venue cannot fit the larger group.',
    ]);
    expect(await auditRows()).toEqual([
      expect.objectContaining({
        outcome: 'Denied',
        reason: 'Venue cannot fit the larger group.',
      }),
    ]);
    // The organiser sees the denial and its reason.
    const list = await request(http())
      .get(base())
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(list.body[0]).toMatchObject({
      status: 'Denied',
      decisionReason: 'Venue cannot fit the larger group.',
    });
  });

  /** REVIEW-CHANGE-08-A, 08-C, 08-D: approving resets an existing safety check and a Confirmed event returns to Planning. */
  it('REVIEW-CHANGE-08-D resets the safety check and returns a Confirmed event to Planning', async () => {
    const confirmed = await seedEvent('Confirmed');
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by) VALUES ($1, 'approved', now(), 'CR Coordinator')`,
      [confirmed],
    );
    // REVIEW-CHANGE-08-C: even a description-only change resets it.
    const created = await submit(
      { description: 'Revised programme.' },
      confirmed,
    ).expect(201);
    const response = await approve(
      created.body.id,
      coordinator,
      confirmed,
    ).expect(200);
    expect(response.body).toMatchObject({
      eventStatus: 'planning',
      safetyCheckReset: true,
      request: { safetyCheckReset: true },
    });
    expect((await eventRow(confirmed)).status).toBe('Planning');
    expect(
      (
        await pool.query(
          'SELECT 1 FROM event_safety_checks WHERE event_id = $1',
          [confirmed],
        )
      ).rows,
    ).toEqual([]);
    const reset = await pool.query(
      'SELECT reason FROM event_safety_resets WHERE event_id = $1',
      [confirmed],
    );
    expect(reset.rows).toEqual([{ reason: 'Change request approved' }]);
    const history = await pool.query(
      'SELECT from_status, to_status, actor_id FROM event_status_history WHERE event_id = $1',
      [confirmed],
    );
    expect(history.rows).toEqual([
      {
        from_status: 'Confirmed',
        to_status: 'Planning',
        actor_id: coordinator.uid,
      },
    ]);
    expect(await notices(organiser, 'change_request_approved')).toEqual([
      'Your change request for "CR Review Evening" was approved. The event needs a new safety check.',
    ]);
    // REVIEW-CHANGE-08-F: an event without a safety check has nothing to reset.
    const plain = await submit({ description: 'Revised programme.' }).expect(
      201,
    );
    const second = await approve(plain.body.id).expect(200);
    expect(second.body.safetyCheckReset).toBe(false);
    expect(
      (
        await pool.query(
          'SELECT 1 FROM event_safety_resets WHERE event_id = $1',
          [eventId],
        )
      ).rows,
    ).toEqual([]);
  });

  /** REVIEW-CHANGE-08-B, 08-C: approving a change to any permitted detail resets an existing safety check. */
  it.each([
    ['startDateTime', { startDateTime: '2030-04-14T11:00:00Z' }],
    ['expectedAttendance', { expectedAttendance: 140 }],
    ['layout', { layout: 'Theatre' }],
    ['facilities', { facilities: ['Catering', 'Projector'] }],
    ['equipmentNeeds', { equipmentNeeds: 'Two microphones and a lectern.' }],
    ['accessibility', { accessibility: ['Wheelchair ramps', 'Hearing loop'] }],
  ])(
    'REVIEW-CHANGE-08-B resets the safety check when a %s change is approved',
    async (_field, changes) => {
      await pool.query(
        `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by) VALUES ($1, 'approved', now(), 'CR Coordinator')`,
        [eventId],
      );
      const created = await submit(changes).expect(201);
      const response = await approve(created.body.id).expect(200);
      expect(response.body.safetyCheckReset).toBe(true);
      expect(
        (
          await pool.query(
            'SELECT 1 FROM event_safety_checks WHERE event_id = $1',
            [eventId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await pool.query(
            'SELECT reason FROM event_safety_resets WHERE event_id = $1',
            [eventId],
          )
        ).rows,
      ).toEqual([{ reason: 'Change request approved' }]);
    },
  );

  /** REVIEW-CHANGE-09-A, 09-B, 09-D: the affected arrangements are listed after approval and ticked off one by one. */
  it('REVIEW-CHANGE-09-A lists arrangements to re-check after approval and ticks them off', async () => {
    const venue = await insertVenue('CR Hall', 150);
    const booking = await insertBooking(eventId, venue, START, END);
    const otherVenue = await insertVenue('CR Annex', 300);
    await insertBooking(
      eventId,
      otherVenue,
      '2030-04-14T08:00:00Z',
      '2030-04-14T15:00:00Z',
    );
    const equipment = await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, 'Microphone', 2, 'Reserved') RETURNING id`,
      [eventId],
    );
    // Starts at 09:00: outside CR Hall's window, still inside CR Annex's.
    const created = await submit({
      startDateTime: '2030-04-14T09:00:00Z',
      equipmentNeeds: 'Two microphones and a lectern.',
    }).expect(201);
    const response = await approve(created.body.id).expect(200);
    const recheck = response.body.request.recheck as {
      id: string;
      kind: string;
      refId: string;
      checkedAt?: string;
    }[];
    expect(recheck.map((item) => [item.kind, item.refId])).toEqual([
      ['venue', booking],
      ['equipment', equipment.rows[0].id],
    ]);
    const tick = (itemId: string, user = coordinator) =>
      request(http())
        .post(`${base()}/${created.body.id}/recheck/${itemId}`)
        .set('Cookie', user.cookie);
    await tick(recheck[0].id, otherCoordinator).expect(404);
    const first = await tick(recheck[0].id).expect(200);
    expect(first.body.recheck[0]).toMatchObject({
      checkedBy: 'CR Coordinator',
    });
    expect(first.body.recheck[1].checkedAt).toBeUndefined();
    await tick(recheck[0].id).expect(409);
    await tick(randomUUID()).expect(404);
    const second = await tick(recheck[1].id).expect(200);
    expect(
      second.body.recheck.every(
        (item: { checkedAt?: string }) => item.checkedAt,
      ),
    ).toBe(true);
    // The organiser sees the list read-only.
    const list = await request(http())
      .get(base())
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(list.body[0].recheck).toHaveLength(2);
    await tick(recheck[1].id, organiser as DatabaseUser).expect(403);
  });

  /** REVIEW-CHANGE-09-C: a description-only approval has nothing to re-check. */
  it('REVIEW-CHANGE-09-C lists nothing when no arrangement is affected', async () => {
    const venue = await insertVenue('CR Hall', 150);
    await insertBooking(eventId, venue, START, END);
    const created = await submit({ description: 'Updated agenda.' }).expect(
      201,
    );
    const response = await approve(created.body.id).expect(200);
    expect(response.body.request.recheck).toEqual([]);
  });

  /** REVIEW-CHANGE-10-D: the audit log is append-only, newest first, and readable by the owner and assigned coordinator only. */
  it('REVIEW-CHANGE-10-D keeps an append-only audit log for the owner and the assigned coordinator', async () => {
    const first = await submit({ description: 'First change.' }).expect(201);
    await deny(first.body.id, 'We keep the current agenda.').expect(200);
    const second = await submit({ description: 'Second change.' }).expect(201);
    await approve(second.body.id).expect(200);
    for (const user of [organiser, coordinator]) {
      const log = await request(http())
        .get(`${base()}/audit`)
        .set('Cookie', user.cookie)
        .expect(200);
      expect(
        log.body.map((entry: { outcome: string }) => entry.outcome),
      ).toEqual(['Approved', 'Denied']);
    }
    await request(http())
      .get(`${base()}/audit`)
      .set('Cookie', otherCoordinator.cookie)
      .expect(404);
    await request(http()).get(`${base()}/audit`).expect(401);
    await expect(
      pool.query(
        `UPDATE event_change_request_audit SET outcome = 'Approved' WHERE event_id = $1`,
        [eventId],
      ),
    ).rejects.toThrow('append-only');
    await request(http())
      .delete(`${base()}/audit`)
      .set('Cookie', coordinator.cookie)
      .expect(404);
    const entryId = (await auditRows())[0].id;
    await request(http())
      .patch(`${base()}/audit/${entryId}`)
      .set('Cookie', coordinator.cookie)
      .send({})
      .expect(404);
    await request(http())
      .delete(`${base()}/audit/${entryId}`)
      .set('Cookie', coordinator.cookie)
      .expect(404);
  });

  /** REVIEW-CHANGE-11-A, 11-B: only the assigned coordinator decides, and inputs are strict. */
  it('REVIEW-CHANGE-11-A refuses everyone but the assigned coordinator and invalid input', async () => {
    const created = await submit({ description: 'New agenda.' }).expect(201);
    await request(http())
      .post(`${base()}/${created.body.id}/approve`)
      .send({})
      .expect(401);
    await approve(created.body.id, organiser).expect(403);
    for (const role of ['ATTENDEE', 'COORDINATOR_LEAD']) {
      const other = await createDatabaseUser(role, `CR ${role}`);
      await approve(created.body.id, other).expect(403);
    }
    // REVIEW-CHANGE-11-B: the request under another event's URL is not found.
    const otherEvent = await seedEvent('Planning', 'Other Evening');
    const wrong = await approve(
      created.body.id,
      coordinator,
      otherEvent,
    ).expect(404);
    expect(wrong.body.message).toBe('Change request not found.');
    await approve(created.body.id, otherCoordinator).expect(404);
    await approve(randomUUID()).expect(404);
    await approve('not-a-uuid').expect(404);
    await approve(created.body.id, coordinator, eventId, {
      status: 'Approved',
    }).expect(400);
    const unknown = await request(http())
      .post(`${base()}/${created.body.id}/deny`)
      .set('Cookie', coordinator.cookie)
      .send({ reason: 'A good enough reason.', status: 'Denied' })
      .expect(400);
    expect(unknown.body.errors).toEqual({ status: 'Unknown field.' });
    const stored = await pool.query(
      'SELECT status FROM event_change_requests WHERE id = $1',
      [created.body.id],
    );
    expect(stored.rows).toEqual([{ status: 'Pending' }]);
  });

  // ---------------------------------------------------------------- helpers

  async function seedEvent(status: string, name = 'CR Review Evening') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'CR Organiser','organiser@example.test',$3,'Purpose','Description',
               $4,$5,50,'Banquet',ARRAY['Catering'],ARRAY['Wheelchair ramps'],'Two microphones',
               $6,$7,'CR Coordinator',$8)`,
      [
        id,
        organiser.uid,
        name,
        START,
        END,
        status,
        coordinator.uid,
        randomUUID(),
      ],
    );
    createdEventIds.push(id);
    return id;
  }

  async function insertVenue(name: string, capacity: number) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1,$2,$3,$4,'Open weekdays',0,0) RETURNING id`,
      [coordinator.uid, name, `E2E ${randomUUID()}`, capacity],
    );
    createdVenueIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  async function insertBooking(
    event: string,
    venue: string,
    start: string,
    end: string,
  ) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1,$2,$3,$4,'approved') RETURNING id`,
      [event, venue, start, end],
    );
    return result.rows[0].id;
  }

  async function insertRegistration(event: string, status: string) {
    const attendee = await createDatabaseUser('ATTENDEE', 'CR Attendee');
    await pool.query(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, contact_number, joined_at, waitlist_seq)
       VALUES ($1,$2,$3,'CR Attendee',$4,'91234567', now(), CASE WHEN $3 = 'Waitlisted' THEN nextval('event_registrations_waitlist_seq') ELSE NULL END)`,
      [event, attendee.uid, status, `${attendee.uid}@example.test`],
    );
  }

  async function createDatabaseUser(
    role: string,
    name: string,
  ): Promise<DatabaseUser> {
    const email = `e2e-change-review-${randomUUID()}@example.com`;
    const password = 'password123';
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 4))) RETURNING id`,
      [email, name, password],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
      [uid, role],
    );
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const cookie = login.headers['set-cookie'] as unknown as string[];
    return {
      uid,
      name,
      cookie:
        cookie.find((value) => value.startsWith('connectsphere_session=')) ??
        cookie[0],
    };
  }
});
