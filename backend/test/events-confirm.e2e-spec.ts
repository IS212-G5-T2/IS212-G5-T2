import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import {
  SAFETY_OUTCOME_SOURCE,
  type SafetyOutcomeSource,
} from '../src/events/status/arrangements.reader.js';
import type { SafetyFact } from '../src/events/status/readiness.js';

/*
 * SPM-135 Confirm an Event through HTTP against real PostgreSQL.
 *
 * Boundary doubles (Guide 5D): the SPM-126 safety source is not built, so the
 * tests replace only SAFETY_OUTCOME_SOURCE with a fixture. Venue bookings,
 * equipment, events, notifications and history are real rows. The clock is
 * frozen at T0 = 2026-10-12T12:00:00+08:00 (= 04:00:00Z).
 *
 * Runs against TEST_DATABASE_URL (or DATABASE_URL) with
 * database/postgresql/init 001 to 012 applied. Skipped locally when neither is
 * set; in CI a missing database fails the run.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-135 confirm tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const T0 = '2026-10-12T04:00:00.000Z';
const SLOT_START = '2026-11-05T02:00:00.000Z'; // 10:00 SGT
const SLOT_END = '2026-11-05T04:00:00.000Z'; // 12:00 SGT
const PAST_HOLD = '2026-10-12T03:00:00.000Z';

type Session = { uid: string; cookie: string };

describe.skipIf(!database)('SPM-135 Confirm an Event over HTTP (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let safetyState: SafetyFact | undefined;
  let createdEventIds: string[];
  let createdUserIds: string[];
  let createdVenueIds: string[];

  let coordinator: Session;
  let organiser: Session;
  let organiser2: Session;
  let attendee: Session;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdUserIds = [];
    createdVenueIds = [];
    safetyState = { state: 'Approved' };
    const safety: SafetyOutcomeSource = { read: async () => safetyState };
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SAFETY_OUTCOME_SOURCE)
      .useValue(safety)
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(T0) })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    coordinator = await createSession('COORDINATOR', 'Coordinator 1');
    organiser = await createSession('ORGANISER', 'Organiser 1');
    organiser2 = await createSession('ORGANISER', 'Organiser 2');
    attendee = await createSession('ATTENDEE', 'Attendee 1');
  });

  afterEach(async () => {
    await app.close();
    if (createdEventIds.length)
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdVenueIds.length)
      await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [createdVenueIds]);
    if (createdUserIds.length) {
      await pool.query('DELETE FROM notifications WHERE recipient_id = ANY($1::text[])', [createdUserIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  const http = () => request(app.getHttpServer());
  const statusChange = (session: Session | undefined, eventId: string, targetStatus = 'Confirmed') => {
    const req = http().post(`/api/events/${eventId}/status-change`);
    return (session ? req.set('Cookie', session.cookie) : req).send({ targetStatus });
  };

  /** A ready EVT-201 clone: Main Hall Approved, Projector x1 and Microphone x2 Reserved. */
  async function seedReadyEvent(name = 'Product Launch Mixer') {
    const eventId = await seedEvent({ name, status: 'Planning', coordinatorId: coordinator.uid });
    const venueId = await seedVenue('Main Hall');
    await seedBooking(eventId, venueId, 'approved');
    await seedEquipment(eventId, 'Projector', 1, 'Reserved');
    await seedEquipment(eventId, 'Microphone', 2, 'Reserved');
    return { eventId, venueId };
  }

  async function createSession(role: string, name: string): Promise<Session> {
    const email = `e2e-confirm-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, name],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const response = await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = response.headers['set-cookie']?.find((value: string) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  async function seedEvent(options: {
    name?: string;
    status: string;
    coordinatorId: string | null;
    organiserId?: string;
    rejectionReason?: string;
  }) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key, rejection_reason)
       VALUES ($1,$2,'Organiser','organiser@example.test',$3,'Purpose','Description',
               '2026-11-05T02:00:00Z','2026-11-05T04:00:00Z',80,'Banquet',ARRAY['Catering'],ARRAY[]::text[],'',
               $4,$5,'Coordinator 1',$6,$7)`,
      [
        id,
        options.organiserId ?? organiser.uid,
        options.name ?? 'Product Launch Mixer',
        options.status,
        options.coordinatorId,
        randomUUID(),
        options.rejectionReason ?? null,
      ],
    );
    createdEventIds.push(id);
    return id;
  }

  async function seedVenue(name: string) {
    const owner = await createSession('VENUE_STAFF', 'Venue Staff 1');
    const result = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         setup_time_minutes, turnaround_time_minutes)
       VALUES ($1,$2,$3,200,'Open weekdays',0,0) RETURNING id`,
      [owner.uid, name, `Level 1 ${randomUUID()}`],
    );
    createdVenueIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  async function seedBooking(eventId: string, venueId: string, status: 'approved' | 'pending' | 'cancelled' | 'rejected', holdExpiresAt?: string) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [eventId, venueId, SLOT_START, SLOT_END, status, holdExpiresAt ?? null],
    );
    return result.rows[0].id;
  }

  async function seedEquipment(eventId: string, name: string, quantity: number, status: string) {
    await pool.query(
      'INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1,$2,$3,$4)',
      [eventId, name, quantity, status],
    );
  }

  async function statusOf(eventId: string) {
    return (await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status;
  }
  async function historyCount(eventId: string) {
    return Number((await pool.query('SELECT count(*) FROM event_status_history WHERE event_id = $1', [eventId])).rows[0].count);
  }
  async function notificationCount(recipient: string, eventId: string) {
    return Number(
      (
        await pool.query(
          `SELECT count(*) FROM notifications WHERE recipient_id = $1 AND related_event_id = $2 AND type = 'EventConfirmed'`,
          [recipient, eventId],
        )
      ).rows[0].count,
    );
  }

  // CONFIRM-EVENT-01-A (BE): one Approved venue, Reserved equipment, Approved safety -> Confirmed.
  it('CONFIRM-EVENT-01-A: the assigned coordinator confirms a fully arranged Planning event', async () => {
    // Arrange: EVT-201 "Product Launch Mixer" (Planning), VB-201 Main Hall Approved, EQ-201 Projector x1 and Microphone x2 Reserved, Safety Approved
    const { eventId, venueId } = await seedReadyEvent();

    // Act
    const response = await statusChange(coordinator, eventId).expect(200);

    // Assert: response literals (MSG-CF-01)
    expect(response.body).toMatchObject({
      eventId,
      status: 'Confirmed',
      message: 'Product Launch Mixer has been confirmed.',
    });
    // DB: status Confirmed; one history row with actor COO-01, from Planning, to Confirmed, at T0
    expect(await statusOf(eventId)).toBe('Confirmed');
    const history = await pool.query(
      'SELECT actor_id, from_status, to_status, created_at FROM event_status_history WHERE event_id = $1',
      [eventId],
    );
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0]).toMatchObject({ actor_id: coordinator.uid, from_status: 'Planning', to_status: 'Confirmed' });
    expect(history.rows[0].created_at.toISOString()).toBe(T0);
    // Arrangements unchanged
    const booking = await pool.query('SELECT status FROM venue_bookings WHERE id IN (SELECT id FROM venue_bookings WHERE venue_id = $1)', [venueId]);
    expect(booking.rows.map((row) => row.status)).toEqual(['approved']);
    const equipment = await pool.query('SELECT equipment_name, status FROM equipment_reservations WHERE event_id = $1 ORDER BY equipment_name', [eventId]);
    expect(equipment.rows).toEqual([
      { equipment_name: 'Microphone', status: 'Reserved' },
      { equipment_name: 'Projector', status: 'Reserved' },
    ]);
  });

  // CONFIRM-EVENT-01-B (BE): two venue bookings both Approved, both equipment lines Reserved.
  it('CONFIRM-EVENT-01-B: every one of several Approved bookings and equipment lines is checked', async () => {
    // Arrange: EVT-211 "Innovation Conference"
    const eventId = await seedEvent({ name: 'Innovation Conference', status: 'Planning', coordinatorId: coordinator.uid });
    const hall = await seedVenue('Main Hall');
    const breakout = await seedVenue('Breakout Room 2');
    await seedBooking(eventId, hall, 'approved');
    await seedBooking(eventId, breakout, 'approved');
    await seedEquipment(eventId, 'Projector', 2, 'Reserved');
    await seedEquipment(eventId, 'Microphone', 4, 'Reserved');

    // Act
    await statusChange(coordinator, eventId).expect(200);

    // Assert: confirmed, and both bookings still Approved, equipment still Reserved
    expect(await statusOf(eventId)).toBe('Confirmed');
    const bookings = await pool.query('SELECT status FROM venue_bookings WHERE event_id = $1', [eventId]);
    expect(bookings.rows.map((row) => row.status)).toEqual(['approved', 'approved']);
    const equipment = await pool.query('SELECT status FROM equipment_reservations WHERE event_id = $1', [eventId]);
    expect(equipment.rows.map((row) => row.status)).toEqual(['Reserved', 'Reserved']);
  });

  // CONFIRM-EVENT-01-C (BE): only the assigned coordinator; everyone else refused, nothing written.
  describe('CONFIRM-EVENT-01-C: authorisation is assignment', () => {
    it.each([
      ['another Coordinator (COO-02)', () => createSession('COORDINATOR', 'Coordinator 2')],
      ['the submitting Organiser (ORG-01)', () => Promise.resolve(organiser)],
      ['an Attendee (ATT-01)', () => Promise.resolve(attendee)],
      ['a Lead who is not assigned (LEAD-01)', () => createSession('COORDINATOR_LEAD', 'Lead 1')],
    ])('refuses %s with 403 MSG-CF-03', async (_label, sessionFor) => {
      // Arrange: EVT-201 ready and assigned to COO-01
      const { eventId } = await seedReadyEvent();
      const session = await sessionFor();

      // Act
      const response = await statusChange(session, eventId).expect(403);

      // Assert: MSG-CF-03 and no side effect
      expect(response.body.message).toBe('You do not have permission to confirm this event.');
      expect(await statusOf(eventId)).toBe('Planning');
      expect(await historyCount(eventId)).toBe(0);
      expect(await notificationCount(organiser.uid, eventId)).toBe(0);
    });

    it('CONFIRM-EVENT-01-C (D): no session gets 401 and nothing changes', async () => {
      // Arrange
      const { eventId } = await seedReadyEvent();

      // Act
      await statusChange(undefined, eventId).expect(401);

      // Assert
      expect(await statusOf(eventId)).toBe('Planning');
      expect(await historyCount(eventId)).toBe(0);
    });
  });

  // CONFIRM-EVENT-02-B (BE): readiness is enforced on the server, not only in the UI.
  it('CONFIRM-EVENT-02-B: a blocked confirm returns CONFIRM_BLOCKED with the three outstanding items and changes nothing', async () => {
    // Arrange: EVT-205 (VB-205 Pending, equipment Requested, safety Awaiting Check)
    safetyState = { state: 'Awaiting Check' };
    const eventId = await seedEvent({ name: 'Blocked Event', status: 'Planning', coordinatorId: coordinator.uid });
    await seedBooking(eventId, await seedVenue('Breakout Room 1'), 'pending');
    await seedEquipment(eventId, 'Projector', 1, 'Requested');

    // Act
    const response = await statusChange(coordinator, eventId).expect(422);

    // Assert: code, the full MSG-CF-02 text (the three items joined with "; ", ASSUMED join, D7), outstanding types
    expect(response.body.code).toBe('CONFIRM_BLOCKED');
    expect(response.body.message).toBe(
      'This event cannot be confirmed yet. Outstanding: Venue booking approval: Breakout Room 1 (Pending); Equipment reservation: Projector x1 (Requested); Safety Officer approval: Awaiting check',
    );
    expect(response.body.outstanding.map((item: { type: string }) => item.type)).toEqual(['venue', 'equipment', 'safety']);
    expect(await statusOf(eventId)).toBe('Planning');
    expect(await historyCount(eventId)).toBe(0);
    expect(await notificationCount(organiser.uid, eventId)).toBe(0);
  });

  // CONFIRM-EVENT-02-C (BE): one Pending booking among Approved ones blocks and names only that venue.
  it('CONFIRM-EVENT-02-C: one Pending booking blocks confirmation and only Breakout Room 1 is named', async () => {
    // Arrange: EVT-206 "Regional Summit"
    const eventId = await seedEvent({ name: 'Regional Summit', status: 'Planning', coordinatorId: coordinator.uid });
    await seedBooking(eventId, await seedVenue('Main Hall'), 'approved');
    await seedBooking(eventId, await seedVenue('Breakout Room 1'), 'pending');
    await seedEquipment(eventId, 'Projector', 1, 'Reserved');

    // Act
    const response = await statusChange(coordinator, eventId).expect(422);

    // Assert
    expect(response.body.code).toBe('CONFIRM_BLOCKED');
    expect(response.body.message).toContain('Breakout Room 1');
    expect(response.body.message).not.toContain('Main Hall');
    expect(response.body.outstanding).toHaveLength(1);
    expect(await statusOf(eventId)).toBe('Planning');
  });

  // CONFIRM-EVENT-02-D (BE): readiness is evaluated at submit time, not from the page-load snapshot.
  it('CONFIRM-EVENT-02-D: a venue flagged unavailable after page load blocks the confirm without a refresh', async () => {
    // Arrange: EVT-201 clone; the page loads with nothing outstanding
    const { eventId, venueId } = await seedReadyEvent();
    const before = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(before.body).toMatchObject({ eventId, ready: true, outstanding: [] });

    // Act: Main Hall is flagged venue-unavailable over the event's slot, then Confirm is clicked without a refresh
    await pool.query(
      `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason) VALUES ($1,$2,$3,'blocked','Maintenance')`,
      [venueId, SLOT_START, SLOT_END],
    );
    const response = await statusChange(coordinator, eventId).expect(422);

    // Assert: CONFIRM_BLOCKED naming Main Hall; the next status read shows the list; status stays Planning
    expect(response.body.code).toBe('CONFIRM_BLOCKED');
    expect(response.body.message).toContain('Main Hall');
    const after = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(after.body.ready).toBe(false);
    expect(after.body.outstanding[0]).toMatchObject({ type: 'venue', state: 'Venue unavailable' });
    expect(await statusOf(eventId)).toBe('Planning');
  });

  // CONFIRM-EVENT-03-A (BE): the coordinator sees exactly the three outstanding items in order.
  it('CONFIRM-EVENT-03-A: arrangements-status lists venue, equipment and safety in order with their states', async () => {
    // Arrange: EVT-205 (VB-205 Pending, equipment Requested, safety Awaiting Check)
    safetyState = { state: 'Awaiting Check' };
    const eventId = await seedEvent({ name: 'Blocked Event', status: 'Planning', coordinatorId: coordinator.uid });
    await seedBooking(eventId, await seedVenue('Breakout Room 1'), 'pending');
    await seedEquipment(eventId, 'Projector', 1, 'Requested');

    // Act
    const response = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);

    // Assert: exact count, order and states
    expect(response.body.ready).toBe(false);
    expect(response.body.outstanding.map((item: { type: string; state: string }) => [item.type, item.state])).toEqual([
      ['venue', 'Pending'],
      ['equipment', 'Requested'],
      ['safety', 'Awaiting Check'],
    ]);
  });

  /** SPM-135 AC1: canceled booking history remains in PostgreSQL but is absent from the planning read model. */
  it('SPM-135 AC1: arrangements-status omits cancelled bookings while retaining active requests', async () => {
    const eventId = await seedEvent({ name: 'Cancelled booking history', status: 'Planning', coordinatorId: coordinator.uid });
    const cancelledVenueId = await seedVenue('Cancelled Venue');
    const activeVenueId = await seedVenue('Active Venue');
    const cancelledId = await seedBooking(eventId, cancelledVenueId, 'cancelled');
    const activeId = await seedBooking(eventId, activeVenueId, 'pending');

    const response = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);

    expect(response.body.checklist.venue.items).toEqual([
      expect.objectContaining({ id: activeId, venueName: 'Active Venue', status: 'pending' }),
    ]);
    expect(response.body.outstanding.filter((item: { type: string }) => item.type === 'venue')).toEqual([
      expect.objectContaining({ type: 'venue', state: 'Pending' }),
    ]);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [cancelledId])).rows).toEqual([{ status: 'cancelled' }]);
  });

  // CONFIRM-EVENT-03-B (BE): satisfied items are not listed; after the venue is approved the confirm succeeds.
  it('CONFIRM-EVENT-03-B: only the unsatisfied venue is listed, and confirmation succeeds once it is approved', async () => {
    // Arrange: EVT-202 (venue Pending, equipment Reserved, safety Approved)
    const eventId = await seedEvent({ name: 'Venue Pending Event', status: 'Planning', coordinatorId: coordinator.uid });
    const venueBookingId = await seedBooking(eventId, await seedVenue('Main Hall'), 'pending');
    await seedEquipment(eventId, 'Projector', 1, 'Reserved');

    // Act 1: first list
    const first = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);

    // Assert 1
    expect(first.body.outstanding).toHaveLength(1);
    expect(first.body.outstanding[0].type).toBe('venue');

    // Act 2: venue approved (SPM-55 fixture), then confirm
    await pool.query("UPDATE venue_bookings SET status = 'approved' WHERE id = $1", [venueBookingId]);
    const confirmed = await statusChange(coordinator, eventId).expect(200);

    // Assert 2
    expect(confirmed.body.status).toBe('Confirmed');
    expect(await statusOf(eventId)).toBe('Confirmed');
  });

  // CONFIRM-EVENT-04-B (BE, real DB): a re-send on a Confirmed event is 409 with one history row.
  it('CONFIRM-EVENT-04-B (A): re-sending on a Confirmed event returns 409 EVENT_ALREADY_CONFIRMED and writes nothing', async () => {
    // Arrange: EVT-201 already confirmed once
    const { eventId } = await seedReadyEvent();
    await statusChange(coordinator, eventId).expect(200);

    // Act
    const response = await statusChange(coordinator, eventId).expect(409);

    // Assert
    expect(response.body).toMatchObject({ code: 'EVENT_ALREADY_CONFIRMED', message: 'This event is already confirmed.' });
    expect(await historyCount(eventId)).toBe(1);
    expect(await notificationCount(organiser.uid, eventId)).toBe(1);
  });

  // CONFIRM-EVENT-04-B (B, real DB): five parallel confirms -> exactly one 200, four 409, one row, one notification.
  it('CONFIRM-EVENT-04-B (B): five parallel confirms yield one 200, four 409, one history row and one notification', async () => {
    // Arrange: a fresh ready event
    const { eventId } = await seedReadyEvent();

    // Act
    const responses = await Promise.all(Array.from({ length: 5 }, () => statusChange(coordinator, eventId)));

    // Assert
    const codes = responses.map((response) => response.status).sort();
    expect(codes).toEqual([200, 409, 409, 409, 409]);
    expect(await statusOf(eventId)).toBe('Confirmed');
    expect(await historyCount(eventId)).toBe(1);
    expect(await notificationCount(organiser.uid, eventId)).toBe(1);
  });

  // CONFIRM-EVENT-04-B (B, deterministic): a confirm that waits behind a concurrent committed change gets 409 and writes nothing.
  // Not timing-dependent: the competing transaction holds the event row, the request is observed blocked on a
  // database lock, and only then is the competing transaction committed. Kills: M11c (no lock, unconditional UPDATE).
  it('CONFIRM-EVENT-04-B (B, deterministic): a confirm blocked behind a committed concurrent change returns 409 and writes nothing', async () => {
    // Arrange: EVT-201 ready; another transaction changes the status and holds the row until commit
    const { eventId } = await seedReadyEvent();
    const competing = await pool.connect();
    try {
      await competing.query('BEGIN');
      await competing.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [eventId]);

      // Act: the request starts while the competing change is open; wait until it is blocked on a lock
      // supertest sends on .then(); start it now so it can reach the lock
      const pending = statusChange(coordinator, eventId).then((response) => response);
      // Why this polls: the confirm request runs on the application's own connection, so the test cannot hold it
      // with a promise gate or barrier. The only observable sign that it is blocked behind the competing change is
      // the lock wait PostgreSQL reports in pg_stat_activity. The poll is bounded (200 x 10 ms = 2 s), and the
      // lockWaitObserved assertion below fails the test when the wait is never seen, so a missed wait cannot pass.
      // Only the confirm's own statements count as the waiting request (not other suites' sessions).
      let lockWaitObserved = false;
      for (let attempt = 0; attempt < 200 && !lockWaitObserved; attempt += 1) {
        const waiting = await pool.query(
          `SELECT count(*) FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND datname = current_database() AND pid <> pg_backend_pid()
              AND (query LIKE 'SELECT id, status, event_name, organiser_id, coordinator_id FROM events WHERE id = $1 FOR UPDATE%'
                   OR query LIKE 'UPDATE events SET status = ''Confirmed''%')`,
        );
        lockWaitObserved = Number(waiting.rows[0].count) > 0;
        if (!lockWaitObserved) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      // Release the lock first, so the pending request can finish even when the wait was not observed.
      await competing.query('COMMIT');
      const response = await pending;

      // Assert: the request really waited behind the competing change, then saw the committed Confirmed status,
      // refused, and left no history row
      expect(lockWaitObserved).toBe(true);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('EVENT_ALREADY_CONFIRMED');
      expect(await historyCount(eventId)).toBe(0);
      expect(await notificationCount(organiser.uid, eventId)).toBe(0);
    } finally {
      competing.release();
    }
  }, 15_000);

  // CONFIRM-EVENT-05-A (BE): the organiser gets exactly one EventConfirmed notification, present on the 200.
  it('CONFIRM-EVENT-05-A: the submitting organiser sees one unread EventConfirmed notification after confirm', async () => {
    // Arrange: EVT-201 ready, ORG-01 has zero notifications
    const { eventId } = await seedReadyEvent();

    // Act
    await statusChange(coordinator, eventId).expect(200);
    const response = await http().get('/api/notifications').set('Cookie', organiser.cookie).expect(200);

    // Assert
    const confirmed = response.body.filter((item: { type: string }) => item.type === 'EventConfirmed');
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({
      type: 'EventConfirmed',
      message: 'Product Launch Mixer has been confirmed.',
      relatedEventId: eventId,
      read: false,
    });
  });

  // CONFIRM-EVENT-05-B (BE): the organiser sees the allowlisted arrangements only.
  it('CONFIRM-EVENT-05-B: the organiser sees venue, equipment and safety on a Confirmed event through an allowlist', async () => {
    // Arrange: EVT-201 confirmed
    const { eventId } = await seedReadyEvent();
    await statusChange(coordinator, eventId).expect(200);

    // Act
    const response = await http().get(`/api/events/${eventId}/confirmed-arrangements`).set('Cookie', organiser.cookie).expect(200);

    // Assert: named fields only (M14 would add event row keys); literals from the fixtures
    expect(Object.keys(response.body).sort()).toEqual(['equipment', 'eventId', 'safety', 'status', 'venueBookings']);
    expect(response.body.status).toBe('Confirmed');
    expect(response.body.venueBookings).toEqual([
      { venueName: 'Main Hall', start: SLOT_START, end: SLOT_END, status: 'Approved' },
    ]);
    expect(response.body.equipment).toEqual([
      { name: 'Microphone', quantity: 2, status: 'Reserved' },
      { name: 'Projector', quantity: 1, status: 'Reserved' },
    ]);
    expect(response.body.safety).toEqual({ state: 'Approved' });
  });

  // CONFIRM-EVENT-05-C (BE): a blocked attempt notifies nobody; the success notifies only ORG-01.
  it('CONFIRM-EVENT-05-C: a blocked attempt notifies nobody; the success notifies only the submitting organiser', async () => {
    // Arrange: EVT-205 blocked, EVT-201 ready; all users start with zero EventConfirmed notifications
    safetyState = { state: 'Awaiting Check' };
    const blocked = await seedEvent({ name: 'Blocked Event', status: 'Planning', coordinatorId: coordinator.uid });
    await seedBooking(blocked, await seedVenue('Breakout Room 1'), 'pending');
    const { eventId } = await seedReadyEvent();
    safetyState = { state: 'Approved' };

    // Act
    await statusChange(coordinator, blocked).expect(422);
    await statusChange(coordinator, eventId).expect(200);

    // Assert
    expect(await notificationCount(organiser.uid, eventId)).toBe(1);
    expect(await notificationCount(organiser.uid, blocked)).toBe(0);
    expect(await notificationCount(organiser2.uid, eventId)).toBe(0);
    expect(await notificationCount(attendee.uid, eventId)).toBe(0);
    expect(await notificationCount(coordinator.uid, eventId)).toBe(0);
  });

  // CONFIRM-EVENT-06-A (Rejected) / 06-B (Cancelled) (BE): these events cannot be confirmed.
  // Status code: the Confluence expected result is HTTP 422 MSG-CF-05, and that is the oracle here. The execution
  // notes on the same pages say "HTTP 409", which is the already-Confirmed case (CONFIRM-EVENT-04-B,
  // EVENT_ALREADY_CONFIRMED) and not this one. See docs/specs/SPM-135-test-results.md, Assumptions (ASSUMED).
  it.each([
    ['CONFIRM-EVENT-06-A', 'Rejected', 'EVT-207'],
    ['CONFIRM-EVENT-06-B', 'Cancelled', 'EVT-208'],
  ])('%s: a %s event is refused with 422 EVENT_NOT_CONFIRMABLE and stays %s', async (_caseId, status, label) => {
    // Arrange: a ready arrangement set on an event that is Rejected or Cancelled, assigned to COO-01
    const eventId = await seedEvent({
      name: label,
      status,
      coordinatorId: coordinator.uid,
      rejectionReason: status === 'Rejected' ? 'Not enough detail for the review.' : undefined,
    });
    await seedBooking(eventId, await seedVenue('Main Hall'), 'approved');
    await seedEquipment(eventId, 'Projector', 1, 'Reserved');

    // Act
    const response = await statusChange(coordinator, eventId).expect(422);

    // Assert
    expect(response.body).toMatchObject({
      code: 'EVENT_NOT_CONFIRMABLE',
      message: 'A rejected or cancelled event cannot be confirmed.',
    });
    expect(await statusOf(eventId)).toBe(status);
    expect(await historyCount(eventId)).toBe(0);
    expect(await notificationCount(organiser.uid, eventId)).toBe(0);
  });

  // D6 / F6: with no safety source, the event is not ready. This uses the real production default.
  it('fail closed: with no safety record the event is not confirmable (production default)', async () => {
    // Arrange: override removed by re-creating the app with the real safety source
    await app.close();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(T0) })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    const { eventId } = await seedReadyEvent();

    // Act
    const response = await statusChange(coordinator, eventId).expect(422);

    // Assert: safety is outstanding with state "No record"
    expect(response.body.code).toBe('CONFIRM_BLOCKED');
    expect(response.body.outstanding).toEqual([
      { type: 'safety', label: 'Safety Officer approval', detail: 'Awaiting check', state: 'No record' },
    ]);
    expect(await statusOf(eventId)).toBe('Planning');
  });

  // EQUIPMENT-GATE-01 (BE): an event that needs equipment with no equipment request cannot be confirmed,
  // even when the venue and the safety check are ready. Kills: the zero-equipment-is-satisfied rule (D6, changed).
  it('EQUIPMENT-GATE-01: equipment needed but never requested blocks confirmation although venue and safety are ready', async () => {
    // Arrange: venue Approved, safety Approved, equipment needs "Projector x1", no equipment request rows
    const eventId = await seedEvent({ name: 'Equipment Never Requested', status: 'Planning', coordinatorId: coordinator.uid });
    await pool.query("UPDATE events SET equipment_needs = 'Projector x1' WHERE id = $1", [eventId]);
    await seedBooking(eventId, await seedVenue('Seminar Room D'), 'approved');

    // Act
    const response = await statusChange(coordinator, eventId).expect(422);

    // Assert: CONFIRM_BLOCKED with exactly the equipment item; nothing changed
    expect(response.body.code).toBe('CONFIRM_BLOCKED');
    expect(response.body.outstanding).toEqual([
      { type: 'equipment', label: 'Equipment reservation', detail: 'None requested', state: 'Not requested' },
    ]);
    expect(await statusOf(eventId)).toBe('Planning');
    expect(await historyCount(eventId)).toBe(0);
  });

  // EQUIPMENT-GATE-02 (BE): with no equipment needed, the coordinator confirms "none", and then confirmation is allowed.
  it('EQUIPMENT-GATE-02: an event with no equipment needs can be confirmed once the coordinator confirms none', async () => {
    // Arrange: venue Approved, safety Approved, equipment needs blank, no equipment rows
    const eventId = await seedEvent({ name: 'No Equipment Needed', status: 'Planning', coordinatorId: coordinator.uid });
    await seedBooking(eventId, await seedVenue('Seminar Room D'), 'approved');
    await statusChange(coordinator, eventId).expect(422);

    // Act: the coordinator confirms that no equipment is needed, then confirms the event
    await http().post(`/api/events/${eventId}/confirm-no-equipment`).set('Cookie', coordinator.cookie).expect(200);
    await statusChange(coordinator, eventId).expect(200);

    // Assert
    expect(await statusOf(eventId)).toBe('Confirmed');
  });

  // Unsupported target: Cancelled is handled by SPM-136 (the cancel path), so this uses Completed, which no handler supports.
  it('an unsupported target status is refused with 400 UNSUPPORTED_TARGET_STATUS and nothing changes', async () => {
    // Arrange
    const { eventId } = await seedReadyEvent();

    // Act
    const response = await statusChange(coordinator, eventId, 'Completed').expect(400);

    // Assert
    expect(response.body.code).toBe('UNSUPPORTED_TARGET_STATUS');
    expect(await statusOf(eventId)).toBe('Planning');
  });

  it('a stale hold on a pending booking is outstanding over HTTP (expired hold, D6)', async () => {
    // Arrange: a pending booking whose hold expired before T0
    const eventId = await seedEvent({ name: 'Held Event', status: 'Planning', coordinatorId: coordinator.uid });
    await seedBooking(eventId, await seedVenue('Main Hall'), 'pending', PAST_HOLD);
    await seedEquipment(eventId, 'Projector', 1, 'Reserved');

    // Act
    const response = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);

    // Assert
    expect(response.body.outstanding[0]).toMatchObject({ type: 'venue', state: 'Hold expired' });
  });

  /** Inserts a venue-unavailable block (no event) for the given window. */
  async function seedBlock(venueId: string, start: string, end: string) {
    await pool.query(
      `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason) VALUES ($1,$2,$3,'blocked','Maintenance')`,
      [venueId, start, end],
    );
  }

  // TR-05 (BE): a venue block on a DIFFERENT venue does not flag the event's venue.
  it('TR-05: a blocked row on a different venue over the same slot does not flag the approved venue', async () => {
    // Arrange: EVT-201 ready on Main Hall; Breakout Room 2 is blocked over the same slot
    const { eventId } = await seedReadyEvent();
    await seedBlock(await seedVenue('Breakout Room 2'), SLOT_START, SLOT_END);

    // Act
    const response = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);

    // Assert: still ready, nothing outstanding
    expect(response.body).toMatchObject({ eventId, ready: true, outstanding: [] });
  });

  // TR-05 (BE): a block that only touches the slot edge (end = slot start, or start = slot end) is not an overlap.
  it.each([
    ['ends exactly when the slot starts', '2026-11-05T01:00:00.000Z', SLOT_START],
    ['starts exactly when the slot ends', SLOT_END, '2026-11-05T05:00:00.000Z'],
  ])('TR-05: a same-venue block that %s is not flagged', async (_label, start, end) => {
    // Arrange: EVT-201 ready on Main Hall; the block touches the slot edge only
    const { eventId, venueId } = await seedReadyEvent();
    await seedBlock(venueId, start, end);

    // Act
    const response = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);

    // Assert
    expect(response.body).toMatchObject({ eventId, ready: true, outstanding: [] });
  });

  // TR-05 (BE): a block that overlaps only part of the slot flags the venue as unavailable.
  it('TR-05: a same-venue block that partly overlaps the slot flags the venue as Venue unavailable', async () => {
    // Arrange: EVT-201 ready on Main Hall; the block starts one hour into the slot and runs past its end
    const { eventId, venueId } = await seedReadyEvent();
    await seedBlock(venueId, '2026-11-05T03:00:00.000Z', '2026-11-05T05:00:00.000Z');

    // Act
    const response = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);

    // Assert
    expect(response.body.ready).toBe(false);
    expect(response.body.outstanding).toEqual([
      {
        type: 'venue',
        label: 'Venue booking approval',
        detail: 'Main Hall (Venue unavailable)',
        state: 'Venue unavailable',
      },
    ]);
  });

  // TR-01 (BE, GET): the readiness view is for the assigned coordinator only; others get 403 and no readiness data.
  describe('TR-01: arrangements-status is for the assigned coordinator only', () => {
    it.each([
      ['another Coordinator (COO-02)', () => createSession('COORDINATOR', 'Coordinator 2')],
      ['the submitting Organiser (ORG-01)', () => Promise.resolve(organiser)],
      ['an Attendee (ATT-01)', () => Promise.resolve(attendee)],
      ['a Lead who is not assigned (LEAD-01)', () => createSession('COORDINATOR_LEAD', 'Lead 1')],
    ])('refuses %s with 403 MSG-CF-03 and returns no readiness data', async (_label, sessionFor) => {
      // Arrange: EVT-201 ready and assigned to COO-01
      const { eventId } = await seedReadyEvent();
      const session = await sessionFor();

      // Act
      const response = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', session.cookie).expect(403);

      // Assert: MSG-CF-03, no readiness fields, no side effect
      expect(response.body.message).toBe('You do not have permission to confirm this event.');
      expect(response.body).not.toHaveProperty('ready');
      expect(response.body).not.toHaveProperty('outstanding');
      expect(await statusOf(eventId)).toBe('Planning');
      expect(await historyCount(eventId)).toBe(0);
    });

    it('no session gets 401 and no readiness data', async () => {
      // Arrange
      const { eventId } = await seedReadyEvent();

      // Act
      const response = await http().get(`/api/events/${eventId}/arrangements-status`).expect(401);

      // Assert
      expect(response.body).not.toHaveProperty('ready');
      expect(response.body).not.toHaveProperty('outstanding');
    });
  });

  // TR-02 (BE, GET): the organiser's confirmed view is for the submitting organiser of a Confirmed event only.
  describe('TR-02: confirmed-arrangements is for the submitting organiser of a Confirmed event', () => {
    it('a second organiser (ORG-02) who did not submit the event gets 404 Event not found.', async () => {
      // Arrange: EVT-201 confirmed by COO-01, submitted by ORG-01
      const { eventId } = await seedReadyEvent();
      await statusChange(coordinator, eventId).expect(200);

      // Act
      const response = await http().get(`/api/events/${eventId}/confirmed-arrangements`).set('Cookie', organiser2.cookie).expect(404);

      // Assert
      expect(response.body.message).toBe('Event not found.');
      expect(response.body).not.toHaveProperty('venueBookings');
    });

    it('the submitting organiser gets 404 for the same event while it is still Planning', async () => {
      // Arrange: EVT-201 ready, not yet confirmed
      const { eventId } = await seedReadyEvent();

      // Act
      const response = await http().get(`/api/events/${eventId}/confirmed-arrangements`).set('Cookie', organiser.cookie).expect(404);

      // Assert
      expect(response.body.message).toBe('Event not found.');
      expect(response.body).not.toHaveProperty('venueBookings');
    });

    it.each([
      ['the assigned Coordinator (COO-01)', () => Promise.resolve(coordinator), 'Organiser access required.'],
      ['an Attendee (ATT-01)', () => Promise.resolve(attendee), 'Organiser access required.'],
    ])('refuses %s with 403 and returns no arrangements', async (_label, sessionFor, message) => {
      // Arrange: EVT-201 confirmed
      const { eventId } = await seedReadyEvent();
      await statusChange(coordinator, eventId).expect(200);
      const session = await sessionFor();

      // Act
      const response = await http().get(`/api/events/${eventId}/confirmed-arrangements`).set('Cookie', session.cookie).expect(403);

      // Assert
      expect(response.body.message).toBe(message);
      expect(response.body).not.toHaveProperty('venueBookings');
    });

    it('no session gets 401 and no arrangements', async () => {
      // Arrange: EVT-201 confirmed
      const { eventId } = await seedReadyEvent();
      await statusChange(coordinator, eventId).expect(200);

      // Act
      const response = await http().get(`/api/events/${eventId}/confirmed-arrangements`).expect(401);

      // Assert
      expect(response.body).not.toHaveProperty('venueBookings');
    });
  });

  // TR-03 (BE, R2 / D5 / Q1): every non-Planning source other than Rejected, Cancelled and Confirmed is refused.
  // The text "Only events in Planning can be confirmed." is ASSUMED (D5). Kills: a removed or widened source guard.
  it.each(['Approved', 'Submitted'])(
    'TR-03: a %s event is refused with 422 EVENT_NOT_CONFIRMABLE and nothing changes',
    async (status) => {
      // Arrange: a ready arrangement set on a non-Planning event assigned to COO-01
      const eventId = await seedEvent({ name: `${status} Event`, status, coordinatorId: coordinator.uid });
      await seedBooking(eventId, await seedVenue('Main Hall'), 'approved');
      await seedEquipment(eventId, 'Projector', 1, 'Reserved');

      // Act
      const response = await statusChange(coordinator, eventId).expect(422);

      // Assert
      expect(response.body).toMatchObject({
        code: 'EVENT_NOT_CONFIRMABLE',
        message: 'Only events in Planning can be confirmed.',
      });
      expect(await statusOf(eventId)).toBe(status);
      expect(await historyCount(eventId)).toBe(0);
      expect(await notificationCount(organiser.uid, eventId)).toBe(0);
    },
  );
});
