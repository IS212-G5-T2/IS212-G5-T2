import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import {
  DEFAULT_RELEASERS,
  EVENT_RELEASERS,
  type EventReleaser,
} from '../src/events/cancel/release.registry.js';

/*
 * SPM-136 Cancel an Event and Release its Reservations, over HTTP against real PostgreSQL.
 *
 * Story: SPM-136. ACs: AC1 to AC8. Test cases: CANCEL-EVENT-01-A to 08-B (Confluence space SP).
 * Boundary doubles: the clock is frozen at T0 = 2026-10-12T04:00:00Z (the injected CLOCK). Fault
 * injection (04-C) replaces only the EVENT_RELEASERS list. Nothing else is mocked: events, bookings,
 * equipment, registrations, history and notifications are real rows.
 *
 * Runs against TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 017
 * applied. Skipped locally when neither is set; in CI a missing database fails the run.
 *
 * Cases that need a route or table this repository does not have are not written here (Blocked):
 *   CANCEL-EVENT-05-B x4/x5 (no equipment request flow), 06-A attendee bell (no attendee notification read
 *   path), 07-B A/B (no Safety Officer or Venue Staff approval routes). See docs/specs/SPM-136-test-results.md.
 * The waiting list exists (SPM-138), so its SPM-136 cases are covered: CANCEL-EVENT-06-B (the waiting notices)
 *   is JOIN-WAITLIST-12-A in test/registrations.waitlist.e2e-spec.ts, and the waiting-list half of 08-A is
 *   JOIN-WAITLIST-12-A to 12-C there plus the combined CANCEL-EVENT-08-A test in this file.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-136 cancel tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const T0 = '2026-10-12T04:00:00.000Z';
const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';
const HOLD_LIVE = '2026-10-13T04:00:00.000Z';

const MSG_NOT_CONFIRMED = 'Cancellation must be confirmed.';
const MSG_FORBIDDEN = 'You do not have permission to cancel this event.';
const MSG_NOT_CANCELLABLE = 'This event can no longer be cancelled.';
const CANCELLED_NOTICE = 'Annual Gala Dinner has been cancelled.';

type Session = { uid: string; cookie: string };

describe.skipIf(!database)('SPM-136 Cancel an Event over HTTP (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let pool: pg.Pool;
  let createdEventIds: string[];
  let createdUserIds: string[];
  let createdVenueIds: string[];
  let createdEquipmentIds: string[];

  let coordinator: Session; // COO-01, assigned to EVT-301
  let coordinator2: Session; // COO-02, not assigned
  let organiser: Session; // ORG-01, submitter of EVT-301
  let organiser2: Session; // ORG-02
  let attendee1: Session; // ATT-01 (Registered)
  let attendee2: Session; // ATT-02 (Registered)
  let attendee3: Session; // ATT-03 (Registered)
  let attendee6: Session; // ATT-06 (Withdrawn)
  let attendee7: Session; // ATT-07 (no registration)
  let lead: Session; // LEAD-01

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: database });
    // The venues suite re-applies migration 009 to this shared database, which restores the older
    // venue_bookings constraints. Re-applying 011 (idempotent) makes this suite independent of that order.
    await pool.query(await readFile(new URL('../migrations/011_spm136_cancel_event.sql', import.meta.url), 'utf8'));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdUserIds = [];
    createdVenueIds = [];
    createdEquipmentIds = [];
    await buildApp();

    coordinator = await createSession('COORDINATOR', 'Coordinator 1');
    coordinator2 = await createSession('COORDINATOR', 'Coordinator 2');
    organiser = await createSession('ORGANISER', 'Organiser 1');
    organiser2 = await createSession('ORGANISER', 'Organiser 2');
    attendee1 = await createSession('ATTENDEE', 'Attendee 1');
    attendee2 = await createSession('ATTENDEE', 'Attendee 2');
    attendee3 = await createSession('ATTENDEE', 'Attendee 3');
    attendee6 = await createSession('ATTENDEE', 'Attendee 6');
    attendee7 = await createSession('ATTENDEE', 'Attendee 7');
    lead = await createSession('COORDINATOR_LEAD', 'Lead 1');
  });

  afterEach(async () => {
    await closeApp();
    if (createdEventIds.length)
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdVenueIds.length)
      await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [createdVenueIds]);
    if (createdEquipmentIds.length)
      await pool.query('DELETE FROM equipment WHERE id = ANY($1::uuid[])', [createdEquipmentIds]);
    if (createdUserIds.length) {
      await pool.query('DELETE FROM notifications WHERE recipient_id = ANY($1::text[])', [createdUserIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  /** Builds the Nest app; `releasers` replaces the release registry (fault injection, 04-C only). */
  async function closeApp() {
    if (app) await app.close();
    app = undefined;
  }

  async function buildApp(releasers?: readonly EventReleaser[]) {
    await closeApp();
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(T0) });
    if (releasers) builder = builder.overrideProvider(EVENT_RELEASERS).useValue(releasers);
    const moduleFixture = await builder.compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    // TR-136-08: bind the test server to 127.0.0.1 so supertest's 127.0.0.1 requests cannot reach another local listener.
    await app.listen(0, '127.0.0.1');
  }

  const http = () => {
    if (!app) throw new Error('The test application is not running.');
    return request(app.getHttpServer());
  };
  const cancel = (session: Session | undefined, eventId: string, body: unknown = { targetStatus: 'Cancelled', confirmed: true }) => {
    const req = http().post(`/api/events/${eventId}/status-change`);
    return (session ? req.set('Cookie', session.cookie) : req).send(body as object);
  };

  async function createSession(role: string, name: string): Promise<Session> {
    const email = `e2e-cancel-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, name],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    // A non-201 keeps its body in the message so a rare failure is diagnosable (TR-136-08).
    const attempt = await http().post('/api/auth/login').send({ email, password: 'password123' });
    if (attempt.status !== 201) throw new Error(`login for ${role} returned ${attempt.status}: ${JSON.stringify(attempt.body)}`);
    const response = attempt;
    const cookie = response.headers['set-cookie']?.find((value: string) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  /** EVT-301 "Annual Gala Dinner": Confirmed, assigned to COO-01, submitted by ORG-01. */
  async function seedEvent(options: { name?: string; status: string; coordinatorId?: string | null; organiserId?: string; rejectionReason?: string }) {
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
        options.name ?? 'Annual Gala Dinner',
        options.status,
        options.coordinatorId === undefined ? coordinator.uid : options.coordinatorId,
        randomUUID(),
        options.rejectionReason ?? null,
      ],
    );
    createdEventIds.push(id);
    return id;
  }

  /** The seeded EVT-301 arrangements: VB-301a Main Hall Approved, VB-301b Breakout Room 1 live hold. */
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

  async function seedBooking(eventId: string, venueId: string, status: 'approved' | 'pending', holdExpiresAt?: string, slot = { start: SLOT_START, end: SLOT_END }) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [eventId, venueId, slot.start, slot.end, status, holdExpiresAt ?? null],
    );
    return result.rows[0].id;
  }

  async function seedEquipment(eventId: string, name: string, quantity: number, status: string) {
    const result = await pool.query<{ id: string }>(
      'INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1,$2,$3,$4) RETURNING id',
      [eventId, name, quantity, status],
    );
    return result.rows[0].id;
  }

  /** Equipment inventory row (the stock the reservations draw on). */
  async function seedInventory(name: string, type: string, quantity: number) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO equipment (equipment_name, equipment_type, quantity, maintenance_status, location, is_available)
       VALUES ($1,$2,$3,'Active','Storage Room A',true) RETURNING id`,
      [name, type, quantity],
    );
    createdEquipmentIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  async function seedRegistration(eventId: string, attendeeId: string, status: 'Registered' | 'Withdrawn') {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, withdrawn_at)
       VALUES ($1, $2, $3, 'Attendee', 'attendee@example.test', $4) RETURNING id`,
      [eventId, attendeeId, status, status === 'Withdrawn' ? '2026-10-10T04:00:00.000Z' : null],
    );
    return result.rows[0].id;
  }

  /** A Waitlisted entry with the SPM-138 row shape: joined_at and the waiting sequence set, no position stored. */
  async function seedWaitlistEntry(eventId: string, attendeeId: string, joinedAt: string) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, joined_at, waitlist_seq)
       VALUES ($1, $2, 'Waitlisted', 'Attendee', 'attendee@example.test', $3, nextval('event_registrations_waitlist_seq'))
       RETURNING id`,
      [eventId, attendeeId, joinedAt],
    );
    return result.rows[0].id;
  }

  /** The whole EVT-301 fixture: two bookings, two equipment lines, three Registered and one Withdrawn attendee. */
  async function seedGalaEvent() {
    const eventId = await seedEvent({ status: 'Confirmed' });
    const mainHall = await seedVenue('Main Hall');
    const breakout = await seedVenue('Breakout Room 1');
    const approvedId = await seedBooking(eventId, mainHall, 'approved');
    const holdId = await seedBooking(eventId, breakout, 'pending', HOLD_LIVE);
    const projectorId = await seedEquipment(eventId, 'Projector', 2, 'Reserved');
    const microphoneId = await seedEquipment(eventId, 'Microphone', 4, 'Reserved');
    const registrations = [
      await seedRegistration(eventId, attendee1.uid, 'Registered'),
      await seedRegistration(eventId, attendee2.uid, 'Registered'),
      await seedRegistration(eventId, attendee3.uid, 'Registered'),
    ];
    const withdrawnId = await seedRegistration(eventId, attendee6.uid, 'Withdrawn');
    return { eventId, mainHall, breakout, approvedId, holdId, projectorId, microphoneId, registrations, withdrawnId };
  }

  async function snapshot(eventId: string) {
    const [event, bookings, equipment, registrations, history, notifications] = await Promise.all([
      pool.query('SELECT status, cancelled_by, cancelled_at FROM events WHERE id = $1', [eventId]),
      pool.query('SELECT id, status, released_at, hold_expires_at FROM venue_bookings WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT id, equipment_name, status, released_at FROM equipment_reservations WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT id, attendee_id, status, withdrawn_at, cancellation_reason FROM event_registrations WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT id FROM event_status_history WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT id FROM notifications WHERE related_event_id = $1 ORDER BY id', [eventId]),
    ]);
    return {
      event: event.rows[0],
      bookings: bookings.rows,
      equipment: equipment.rows,
      registrations: registrations.rows,
      historyCount: history.rowCount,
      notificationCount: notifications.rowCount,
    };
  }

  async function statusOf(eventId: string) {
    return (await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status;
  }

  async function cancelledNotifications(eventId: string, recipient: string) {
    return pool.query(
      `SELECT message, read FROM notifications
        WHERE related_event_id = $1 AND recipient_id = $2 AND type = 'EventCancelled'`,
      [eventId, recipient],
    );
  }

  // ---------- AC1: who can cancel ----------

  /** CANCEL-EVENT-01-A: the assigned Coordinator cancels a Confirmed event. */
  // Kills: M4
  it('CANCEL-EVENT-01-A: the assigned coordinator cancels EVT-301 and the audit row names COO-01', async () => {
    // Arrange: EVT-301 Confirmed, assigned to COO-01, submitted by ORG-01
    const { eventId } = await seedGalaEvent();

    // Act: POST /api/events/EVT-301/status-change { targetStatus: 'Cancelled', confirmed: true }
    const response = await cancel(coordinator, eventId).expect(200);

    // Assert: HTTP 200, status Cancelled, history from Confirmed to Cancelled by COO-01 (MSG-CN-02)
    expect(response.body).toMatchObject({ eventId, status: 'Cancelled', message: CANCELLED_NOTICE });
    expect(await statusOf(eventId)).toBe('Cancelled');
    const history = await pool.query(
      'SELECT from_status, to_status, actor_id FROM event_status_history WHERE event_id = $1',
      [eventId],
    );
    expect(history.rows).toEqual([{ from_status: 'Confirmed', to_status: 'Cancelled', actor_id: coordinator.uid }]);
  });

  /** CANCEL-EVENT-01-B: the submitting Organiser cancels; the Coordinator is notified too (PO decision). */
  // Kills: M4, M17, S19, S24
  it('CANCEL-EVENT-01-B: the submitting organiser cancels EVT-301 and the audit row names ORG-01', async () => {
    // Arrange: EVT-301 Confirmed, submitted by ORG-01 and assigned to COO-01
    const { eventId } = await seedGalaEvent();

    // Act
    await cancel(organiser, eventId).expect(200);

    // Assert: status Cancelled; audit row actor ORG-01; the assigned coordinator COO-01 is notified (see 06-A)
    expect(await statusOf(eventId)).toBe('Cancelled');
    const history = await pool.query('SELECT actor_id FROM event_status_history WHERE event_id = $1', [eventId]);
    expect(history.rows).toEqual([{ actor_id: organiser.uid }]);
    expect(await cancelledNotifications(eventId, coordinator.uid)).toHaveProperty('rowCount', 1);
  });

  /**
   * CANCEL-EVENT-01-C: neither the unassigned Coordinator, another Organiser, a registered Attendee,
   * an anonymous caller nor the Coordinator Lead can cancel. Each refusal changes nothing.
   */
  describe('CANCEL-EVENT-01-C: only the assigned coordinator or the submitting organiser can cancel', () => {
    // Kills: M1, S19 (COO-02 row); M1, M8, S19 (ORG-02 row); M1, S19 (ATT-01 row); M1, M7, S19 (LEAD-01 row).
    // The no-token case was deleted: its 401 comes from the shared AuthenticationMiddleware before any SPM-136 code runs,
    // and the service-level 401 is the unit row CANCEL-EVENT-01-C (no identity), killed by C1.
    it.each([
      ['COO-02, not assigned', () => coordinator2, 403, MSG_FORBIDDEN],
      ['ORG-02, a different organiser', () => organiser2, 403, MSG_FORBIDDEN],
      ['ATT-01, a registered attendee', () => attendee1, 403, MSG_FORBIDDEN],
      ['LEAD-01, Coordinator Lead', () => lead, 403, MSG_FORBIDDEN],
    ])('refuses %s with HTTP %i and changes nothing', async (_label, actor, status, message) => {
      // Arrange: EVT-301 Confirmed with arrangements, registrations and a notification-free history
      const { eventId } = await seedGalaEvent();
      const before = await snapshot(eventId);

      // Act
      const response = await cancel(actor(), eventId).expect(status);

      // Assert: refusal literal (MSG-CN-05) and the event is untouched in every table
      if (message) expect(response.body.message).toBe(message);
      expect(await snapshot(eventId)).toEqual(before);
      expect(before.event.status).toBe('Confirmed');
    });
  });

  // ---------- AC2: confirmation is required by the server ----------

  /** CANCEL-EVENT-02-C: a body that does not carry boolean true confirmation is refused with MSG-CN-03. */
  describe('CANCEL-EVENT-02-C: the server refuses a cancel request without strict confirmation', () => {
    // Kills: M3 (every row); M10 (the string "true" row and the number 1 row)
    it.each([
      ['confirmed omitted', { targetStatus: 'Cancelled' }],
      ['confirmed false', { targetStatus: 'Cancelled', confirmed: false }],
      ['confirmed the string "true"', { targetStatus: 'Cancelled', confirmed: 'true' }],
      ['confirmed 1', { targetStatus: 'Cancelled', confirmed: 1 }],
      ['confirmed null', { targetStatus: 'Cancelled', confirmed: null }],
    ])('rejects %s with HTTP 400 CANCEL_NOT_CONFIRMED', async (_label, body) => {
      // Arrange
      const { eventId } = await seedGalaEvent();
      const before = await snapshot(eventId);

      // Act
      const response = await cancel(coordinator, eventId, body).expect(400);

      // Assert: literal code and message; status Confirmed; nothing released or notified
      expect(response.body).toMatchObject({ code: 'CANCEL_NOT_CONFIRMED', message: MSG_NOT_CONFIRMED });
      expect(await snapshot(eventId)).toEqual(before);
    });
  });

  // ---------- AC3: status becomes Cancelled, and only from cancellable statuses ----------

  /** CANCEL-EVENT-03-A: the stored row records who cancelled and when, from the injected clock. */
  // Kills: M4, M11
  it('CANCEL-EVENT-03-A: stores cancelled_by COO-01 and cancelled_at equal to the injected clock instant', async () => {
    // Arrange
    const { eventId } = await seedGalaEvent();

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert: DB row exact values (cancelled_at is T0, not SQL now())
    const row = await pool.query('SELECT status, cancelled_by, cancelled_at FROM events WHERE id = $1', [eventId]);
    expect(row.rows[0].status).toBe('Cancelled');
    expect(row.rows[0].cancelled_by).toBe(coordinator.uid);
    expect(row.rows[0].cancelled_at.toISOString()).toBe(T0);
    // The event read model shows the same status (lower case on the API)
    const read = await http().get(`/api/events/${eventId}`).set('Cookie', coordinator.cookie).expect(200);
    expect(read.body.status).toBe('cancelled');
  });

  /** CANCEL-EVENT-03-B: every status that is cancellable becomes Cancelled; every other status refuses. */
  describe('CANCEL-EVENT-03-B: cancellable statuses are Submitted, Approved, Planning and Confirmed', () => {
    // Kills: M4 (every row); S18 (Planning, Submitted and Approved rows); S19 and S22 (Submitted row); M12 and S19 (Approved row)
    it.each([
      ['Planning (EVT-302)', 'Planning', 'coordinator', 200],
      ['Confirmed (EVT-301)', 'Confirmed', 'coordinator', 200],
      ['Submitted (no coordinator yet, submitted by ORG-01)', 'Submitted', 'organiser', 200],
      ['Approved (no coordinator yet, submitted by ORG-01)', 'Approved', 'organiser', 200],
    ])('cancels %s with HTTP %i', async (_label, status, actor, httpStatus) => {
      // Arrange: a fixture per status; the coordinator is assigned only where the status has one
      const eventId = await seedEvent({ status, coordinatorId: actor === 'coordinator' ? coordinator.uid : null });

      // Act
      await cancel(actor === 'coordinator' ? coordinator : organiser, eventId).expect(httpStatus);

      // Assert: stored status Cancelled and one history row from the source status
      expect(await statusOf(eventId)).toBe('Cancelled');
      const history = await pool.query('SELECT from_status FROM event_status_history WHERE event_id = $1', [eventId]);
      expect(history.rows).toEqual([{ from_status: status }]);
    });

    // Kills: M2 and M4 (Completed row); M4 and S21 (Rejected row); M4 (Cancelled row)
    it.each([
      ['Completed (EVT-303)', 'Completed'],
      ['Rejected (EVT-304)', 'Rejected'],
      ['Cancelled (EVT-305)', 'Cancelled'],
    ])('refuses %s with HTTP 409 MSG-CN-06 and changes nothing', async (_label, status) => {
      // Arrange: a fixture for the blocked status, assigned to COO-01
      const eventId = await seedEvent({
        status,
        rejectionReason: status === 'Rejected' ? 'Venue clash' : undefined,
      });
      await pool.query('INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), eventId, 'Approved', status, 'seed']);
      const before = await snapshot(eventId);

      // Act
      const response = await cancel(coordinator, eventId).expect(409);

      // Assert: literal MSG-CN-06 and code; status and history unchanged; no new notification
      expect(response.body).toMatchObject({ code: 'EVENT_NOT_CANCELLABLE', message: MSG_NOT_CANCELLABLE });
      expect(await snapshot(eventId)).toEqual(before);
    });
  });

  /**
   * CANCEL-EVENT-03-C: five simultaneous confirmed requests from both authorised users cancel once.
   * The Projector stock is 5; EVT-301 holds 2 and EVT-308 holds 1, so 2 are free before and 4 after.
   */
  // Kills: M4, S17, S19, S20, S24
  it('CANCEL-EVENT-03-C: five parallel cancels produce one success, one history row, one notice per recipient and one release', async () => {
    // Arrange: inventory Projector 5, EVT-301 with Projector x2 (Reserved); EVT-308 with Projector x1 (Reserved)
    await seedInventory('Projector', 'Visual', 5);
    const { eventId } = await seedGalaEvent();
    const otherEvent = await seedEvent({ name: 'Product Launch', status: 'Planning' });
    await seedEquipment(otherEvent, 'Projector', 1, 'Reserved');

    // Act: five parallel requests, mixing COO-01 and ORG-01
    const responses = await Promise.all([
      cancel(coordinator, eventId),
      cancel(organiser, eventId),
      cancel(coordinator, eventId),
      cancel(organiser, eventId),
      cancel(coordinator, eventId),
    ]);

    // Assert: exactly one 200 and four 409 MSG-CN-06
    const codes = responses.map((response) => response.status).sort();
    expect(codes).toEqual([200, 409, 409, 409, 409]);
    expect(responses.filter((response) => response.status === 409).every((response) => response.body.message === MSG_NOT_CANCELLABLE)).toBe(true);
    // One history row, and one notification per recipient (ORG-01, COO-01, ATT-01..03)
    expect(await statusOf(eventId)).toBe('Cancelled');
    const history = await pool.query('SELECT id FROM event_status_history WHERE event_id = $1', [eventId]);
    expect(history.rowCount).toBe(1);
    for (const recipient of [organiser.uid, coordinator.uid, attendee1.uid, attendee2.uid, attendee3.uid]) {
      expect(await cancelledNotifications(eventId, recipient)).toHaveProperty('rowCount', 1);
    }
    // Projector available: 5 total - 1 (EVT-308, still Reserved) = 4; released once, not inflated
    expect(await projectorAvailable()).toBe(4);
  });

  async function projectorAvailable() {
    // Derived in the test: stock minus quantities still held by Requested, Reserved or Unavailable lines.
    const result = await pool.query<{ available: number }>(
      `SELECT (SELECT quantity FROM equipment WHERE equipment_name = 'Projector' AND is_available) -
              COALESCE((SELECT SUM(quantity) FROM equipment_reservations
                         WHERE equipment_name = 'Projector' AND status IN ('Requested', 'Reserved', 'Unavailable')), 0)
              AS available`,
    );
    return Number(result.rows[0].available);
  }

  // ---------- AC4: venue bookings and holds are released ----------

  /** CANCEL-EVENT-04-A: the approved booking and the live hold are released and the venue frees the slot. */
  // Kills: M4, M5, S11
  it('CANCEL-EVENT-04-A: VB-301a and VB-301b are released with released_at T0 and the slot is free for others', async () => {
    // Arrange: VB-301a Main Hall Approved; VB-301b Breakout Room 1 live hold
    const { eventId, mainHall, breakout, approvedId, holdId } = await seedGalaEvent();

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert: both records Released with released_at T0 (the hold is no longer active)
    const rows = await pool.query(
      'SELECT id, status, released_at FROM venue_bookings WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[approvedId, holdId]],
    );
    const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row]));
    expect(byId[approvedId].status).toBe('released');
    expect(byId[holdId].status).toBe('released');
    expect(byId[approvedId].released_at.toISOString()).toBe(T0);
    expect(byId[holdId].released_at.toISOString()).toBe(T0);
    // Availability: neither venue lists the cancelled event's reservation any more
    const mainHallView = await http().get(`/api/venues/${mainHall}`).set('Cookie', coordinator.cookie).expect(200);
    const breakoutView = await http().get(`/api/venues/${breakout}`).set('Cookie', coordinator.cookie).expect(200);
    expect(mainHallView.body.reservations).toEqual([]);
    expect(breakoutView.body.reservations).toEqual([]);
  });

  /**
   * CANCEL-EVENT-04-B: another event's booking at Main Hall (a different slot) is untouched, and the
   * cancelled event's old slot no longer conflicts.
   */
  // Kills: M4, M14
  it('CANCEL-EVENT-04-B: VB-308 stays Approved at Main Hall and the released slot is not in conflict', async () => {
    // Arrange: EVT-301 at Main Hall 2026-11-05 10:00-12:00 SGT; EVT-308 Approved at Main Hall on 2026-11-06
    const { eventId, mainHall } = await seedGalaEvent();
    const otherEvent = await seedEvent({ name: 'Tech Talk', status: 'Confirmed', coordinatorId: coordinator2.uid });
    const vb308 = await seedBooking(otherEvent, mainHall, 'approved', undefined, {
      start: '2026-11-06T02:00:00.000Z',
      end: '2026-11-06T04:00:00.000Z',
    });

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert: VB-308 remains Approved; Main Hall reservations now hold only VB-308
    const row = await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [vb308]);
    expect(row.rows[0].status).toBe('approved');
    const view = await http().get(`/api/venues/${mainHall}`).set('Cookie', coordinator.cookie).expect(200);
    expect(view.body.reservations.map((reservation: { eventName: string }) => reservation.eventName)).toEqual(['Tech Talk']);
  });

  /**
   * CANCEL-EVENT-04-C: a fault while releasing equipment, after the status, venue and registration writes,
   * leaves the whole cancellation unapplied. A retry without the fault releases everything.
   */
  // Kills: M4, M5, M6, M15, S11
  it('CANCEL-EVENT-04-C: a release fault rolls back the whole cancellation and a retry completes it', async () => {
    // Arrange: EVT-301 Confirmed; the equipment releaser is replaced by one that throws
    const { eventId } = await seedGalaEvent();
    const before = await snapshot(eventId);
    const failing: EventReleaser = {
      name: 'equipment_reservations',
      release: async () => {
        throw new Error('injected fault: equipment release');
      },
    };
    await buildApp([DEFAULT_RELEASERS[0], DEFAULT_RELEASERS[1], failing]);

    // Act: first attempt with the fault
    const failed = await cancel(coordinator, eventId).expect(500);

    // Assert: generic 500, no stack trace; every table unchanged
    expect(JSON.stringify(failed.body)).not.toMatch(/injected fault|at .*\.ts|stack/i);
    expect(await snapshot(eventId)).toEqual(before);

    // Act: retry with the real registry
    await buildApp();
    await cancel(coordinator, eventId).expect(200);

    // Assert: full release
    const after = await snapshot(eventId);
    expect(after.event.status).toBe('Cancelled');
    expect(after.bookings.every((row) => row.status === 'released')).toBe(true);
    expect(after.equipment.every((row) => row.status === 'Released')).toBe(true);
  });

  /**
   * CANCEL-EVENT-04-A-SAFETY (TR-136-01): an approved safety check and its feedback items are left as they are when
   * the venue bookings and equipment are released, and no safety reset is recorded. The release-skip branches of the
   * venue and equipment triggers (migration 017) are what keeps these rows; a removed branch would delete them.
   * Oracle: Gate-1 decision D2 (safety-check rows are left untouched; every safety action is guarded). DERIVED from D2 by
   * the implementation team; the Confluence 04-A page does not state the safety-row outcome (TR-136-11).
   */
  // Kills: M4, M5, S11
  it('CANCEL-EVENT-04-A-SAFETY: an approved safety check with feedback survives the release and no reset row is written', async () => {
    // Arrange: EVT-301 with an approved safety check and two feedback items (one resolved, one not)
    const { eventId } = await seedGalaEvent();
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, decided_at)
       VALUES ($1, 'approved', $2, $3, 'Safety Officer 1', $2)`,
      [eventId, '2026-10-10T04:00:00.000Z', coordinator.uid],
    );
    await pool.query(
      `INSERT INTO safety_check_feedback_items (event_id, feedback_text, requested_at, resolved_by_coordinator_at)
       VALUES ($1, 'Fire exit signage', $2, NULL), ($1, 'Lift capacity note', $2, $3)`,
      [eventId, '2026-10-10T04:00:00.000Z', '2026-10-11T04:00:00.000Z'],
    );
    const safetyBefore = await pool.query('SELECT * FROM event_safety_checks WHERE event_id = $1', [eventId]);
    const feedbackBefore = await pool.query('SELECT id, feedback_text, resolved_by_coordinator_at FROM safety_check_feedback_items WHERE event_id = $1 ORDER BY id', [eventId]);

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert: the safety row and both feedback items are identical; no reset row exists for the event
    const safetyAfter = await pool.query('SELECT * FROM event_safety_checks WHERE event_id = $1', [eventId]);
    // ASSUMPTION A6: the safety rows are untouched because of decision D2 (DERIVED, not stated in Confluence 04-A; TR-136-11)
    expect(safetyAfter.rows).toEqual(safetyBefore.rows);
    expect(safetyAfter.rows[0].status).toBe('approved');
    const feedbackAfter = await pool.query('SELECT id, feedback_text, resolved_by_coordinator_at FROM safety_check_feedback_items WHERE event_id = $1 ORDER BY id', [eventId]);
    expect(feedbackAfter.rows).toEqual(feedbackBefore.rows);
    expect(feedbackAfter.rows).toHaveLength(2);
    const resets = await pool.query('SELECT count(*)::int AS count FROM event_safety_resets WHERE event_id = $1', [eventId]);
    expect(resets.rows[0].count).toBe(0);
    // The released rows really were released (the test is not vacuous)
    const released = await pool.query("SELECT count(*)::int AS count FROM venue_bookings WHERE event_id = $1 AND status = 'released'", [eventId]);
    expect(released.rows[0].count).toBe(2);
  });

  /**
   * CANCEL-EVENT-04-A-VIEW (RR-136-01): after the cancel, the venue a released booking held is not shown
   * on the event list, the event detail or the planning read. Decision (ASSUMED, documented): released bookings are
   * left out of the venue summary, because a cancelled event holds no venue.
   */
  // Kills: M4, M5, M22, S11
  it('CANCEL-EVENT-04-A-VIEW: a released booking is not shown as a venue on the list or the detail after cancel', async () => {
    // Arrange: EVT-301 with VB-301a Main Hall (approved) and VB-301b Breakout Room 1 (live hold)
    const { eventId } = await seedGalaEvent();
    const before = await http().get(`/api/events/${eventId}`).set('Cookie', organiser.cookie).expect(200);
    expect(before.body.venueName).toContain('Main Hall');

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert: the detail and the organiser list carry no venue text for the released bookings
    const detail = await http().get(`/api/events/${eventId}`).set('Cookie', organiser.cookie).expect(200);
    // ASSUMPTION A5: a released venue is left out of the detail and the list (ASSUMED label; RR-136-01)
    expect(detail.body.venueName).toBeUndefined();
    const list = await http().get('/api/events').set('Cookie', organiser.cookie).expect(200);
    const row = list.body.find((event: { id: string }) => event.id === eventId);
    expect(row).toBeDefined();
    expect(row.venueName).toBeUndefined();
    expect(JSON.stringify(list.body)).not.toMatch(/\(unavailable\)/);
  });

  /**
   * CANCEL-EVENT-04-A-ARR (RR-136-02): the coordinator's readiness view of a cancelled event does not list
   * the released venue bookings as outstanding or pending.
   */
  // Kills: M4, M5, M23, M24, S11
  it('CANCEL-EVENT-04-A-ARR: the readiness view of a cancelled event lists no outstanding venue and no pending venue request', async () => {
    // Arrange: EVT-301 with an approved booking and a live hold, both released by the cancel
    const { eventId } = await seedGalaEvent();
    await cancel(coordinator, eventId).expect(200);

    // Act
    const view = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);

    // Assert
    expect(view.body.outstanding.filter((item: { type: string }) => item.type === 'venue')).toEqual([]);
    // ASSUMPTION A5: a released venue reads "not_requested" with no items (ASSUMED label; RR-136-02)
    expect(view.body.checklist.venue).toMatchObject({ status: 'not_requested', items: [] });
  });

  // ---------- AC5: equipment reservations are released ----------

  /** CANCEL-EVENT-05-A: both equipment lines are Released and the stock they held becomes available. */
  // Kills: M4, M6, S12, S13
  it('CANCEL-EVENT-05-A: Projector shows 4 of 5 and Microphone 10 of 10 after the cancellation', async () => {
    // Arrange: inventory Projector 5 and Microphone 10; EVT-301 holds Projector x2 and Microphone x4; EVT-308 holds Projector x1
    await seedInventory('Projector', 'Visual', 5);
    await seedInventory('Microphone', 'Audio', 10);
    const { eventId, projectorId, microphoneId } = await seedGalaEvent();
    const otherEvent = await seedEvent({ name: 'Product Launch', status: 'Planning' });
    await seedEquipment(otherEvent, 'Projector', 1, 'Reserved');
    // TR-136-04: a Requested line and an Unavailable line on the cancelled event are released too.
    const requestedId = await seedEquipment(eventId, 'Speaker', 1, 'Requested');
    const unavailableId = await seedEquipment(eventId, 'Lectern', 1, 'Unavailable');
    expect(await projectorAvailable()).toBe(2); // before: 5 - (2 + 1)
    expect(await microphoneAvailable()).toBe(6); // before: 10 - 4

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert: all four lines Released (Projector x2, Microphone x4, Speaker x1 Requested, Lectern x1 Unavailable)
    const lines = await pool.query('SELECT id, status, released_at FROM equipment_reservations WHERE event_id = $1 ORDER BY id', [eventId]);
    expect(lines.rows.map((row) => row.status)).toEqual(['Released', 'Released', 'Released', 'Released']);
    expect(lines.rows.every((row) => row.released_at.toISOString() === T0)).toBe(true);
    const ids = lines.rows.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([projectorId, microphoneId, requestedId, unavailableId]));
    expect(await projectorAvailable()).toBe(4);
    expect(await microphoneAvailable()).toBe(10);
  });

  async function microphoneAvailable() {
    const result = await pool.query<{ available: number }>(
      `SELECT (SELECT quantity FROM equipment WHERE equipment_name = 'Microphone' AND is_available) -
              COALESCE((SELECT SUM(quantity) FROM equipment_reservations
                         WHERE equipment_name = 'Microphone' AND status IN ('Requested', 'Reserved', 'Unavailable')), 0)
              AS available`,
    );
    return Number(result.rows[0].available);
  }

  /** CANCEL-EVENT-05-B (part): another event's Projector reservation is untouched by the cancellation. */
  // Kills: E1 (the equipment release not scoped to the cancelled event: EQ-308 of another event is released too)
  it('CANCEL-EVENT-05-B: EQ-308 stays Reserved x1 after EVT-301 is cancelled', async () => {
    // Arrange: EVT-301 holds Projector x2; EVT-308 holds Projector x1 Reserved
    const { eventId } = await seedGalaEvent();
    const otherEvent = await seedEvent({ name: 'Product Launch', status: 'Planning' });
    const eq308 = await seedEquipment(otherEvent, 'Projector', 1, 'Reserved');

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert: EQ-308 Reserved, quantity 1
    const row = await pool.query('SELECT status, quantity FROM equipment_reservations WHERE id = $1', [eq308]);
    expect(row.rows[0]).toEqual({ status: 'Reserved', quantity: 1 });
  });

  // ---------- AC6: notifications ----------

  /**
   * CANCEL-EVENT-06-A: the organiser, the assigned coordinator and every Registered attendee get exactly one
   * unread notice, whoever cancels. Two clones of EVT-301 cover both cancelling users.
   */
  // Kills: M4, M17, S17, S19, S24
  it('CANCEL-EVENT-06-A: ORG-01, COO-01, ATT-01..03 each get one unread notice whoever cancels', async () => {
    // Arrange: two EVT-301 clones, each with the same three Registered attendees
    const clone = await seedGalaEvent();
    const second = await seedGalaEvent();

    // Act: subtest A (COO-01 cancels the first clone), subtest B (ORG-01 cancels the second)
    await cancel(coordinator, clone.eventId).expect(200);
    await cancel(organiser, second.eventId).expect(200);

    // Assert: each recipient has exactly one unread notice naming the event (B also notifies COO-01)
    for (const eventId of [clone.eventId, second.eventId]) {
      for (const recipient of [organiser.uid, coordinator.uid, attendee1.uid, attendee2.uid, attendee3.uid]) {
        const rows = await cancelledNotifications(eventId, recipient);
        // ASSUMPTION A1: the attendee copies read the same notice text as the organiser and coordinator copies (ASSUMED)
    expect(rows.rows).toEqual([{ message: CANCELLED_NOTICE, read: false }]);
      }
    }
  });

  /**
   * CANCEL-EVENT-06-A-API (TR-136-05): the organiser and the coordinator read the notice through GET /api/notifications.
   * The coordinator's copy is labelled with the coordinator audience, not the organiser one.
   */
  // Kills: M4, M17, M25, S15, S16, S17, S19, S24
  it('CANCEL-EVENT-06-A-API: ORG-01 and COO-01 see one unread EventCancelled notice each on GET /api/notifications', async () => {
    // Arrange
    const { eventId } = await seedGalaEvent();
    await cancel(organiser, eventId).expect(200);

    // Act
    const forOrganiser = await http().get('/api/notifications').set('Cookie', organiser.cookie).expect(200);
    const forCoordinator = await http().get('/api/notifications').set('Cookie', coordinator.cookie).expect(200);

    // Assert: exactly one EventCancelled item for this event per user, unread, with the literal text
    const pick = (body: Array<{ relatedEventId: string; type: string }>) =>
      body.filter((item) => item.relatedEventId === eventId && item.type === 'EventCancelled');
    expect(pick(forOrganiser.body)).toEqual([
      expect.objectContaining({ type: 'EventCancelled', audienceRole: 'organiser', message: CANCELLED_NOTICE, read: false }),
    ]);
    expect(pick(forCoordinator.body)).toEqual([
      expect.objectContaining({ type: 'EventCancelled', audienceRole: 'coordinator', message: CANCELLED_NOTICE, read: false }),
    ]);
  });

  /** CANCEL-EVENT-06-C: non-recipients get nothing and recipients get one notice each. */
  // Kills: M4, M18, S17, S20, S24
  it('CANCEL-EVENT-06-C: the withdrawn attendee, an unrelated attendee, another organiser and another coordinator get nothing', async () => {
    // Arrange: EVT-301 with ATT-06 Withdrawn; ATT-07 unregistered; ORG-02 and COO-02 not linked to EVT-301
    const { eventId } = await seedGalaEvent();

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert: none of the four receive a notice; the email transport is not part of this repository (see report)
    for (const nonRecipient of [attendee6.uid, attendee7.uid, organiser2.uid, coordinator2.uid]) {
      expect(await cancelledNotifications(eventId, nonRecipient)).toHaveProperty('rowCount', 0);
    }
    const total = await pool.query('SELECT count(*)::int AS count FROM notifications WHERE related_event_id = $1', [eventId]);
    expect(total.rows[0].count).toBe(5);
  });

  // ---------- AC8: registrations ----------

  /** CANCEL-EVENT-08-A (registrations): Registered rows become Cancelled with a reason; nothing is promoted. */
  // Kills: M4, M19, S14
  it('CANCEL-EVENT-08-A: three Registered rows become Cancelled with reason "Event cancelled" and nothing is promoted', async () => {
    // Arrange: EVT-301 with ATT-01..03 Registered (the waiting-list half is the combined case below)
    const { eventId, registrations, withdrawnId } = await seedGalaEvent();

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert: three Cancelled rows with the reason; the Withdrawn row is untouched
    const rows = await pool.query(
      'SELECT id, status, cancellation_reason FROM event_registrations WHERE event_id = $1 ORDER BY id',
      [eventId],
    );
    const cancelled = rows.rows.filter((row) => row.status === 'Cancelled');
    expect(cancelled.map((row) => row.id).sort()).toEqual([...registrations].sort());
    expect(cancelled.every((row) => row.cancellation_reason === 'Event cancelled')).toBe(true);
    expect(rows.rows.find((row) => row.id === withdrawnId)?.status).toBe('Withdrawn');
    // Attendee view shows Cancelled (SPM-62 registration read)
    const mine = await http().get(`/api/events/${eventId}/registrations/me`).set('Cookie', attendee1.cookie).expect(200);
    expect(mine.body.registration.status).toBe('cancelled');
  });

  /**
   * CANCEL-EVENT-08-A-COMBINED (waiting list): one event with three Confirmed registrations and two Waitlisted entries.
   * One cancel: the three registrations are Cancelled with the reason, the two waiting entries are Cancelled (their notices
   * are JOIN-WAITLIST-12-A), nothing is promoted (no Registered row is created), and each attendee's registration view
   * shows cancelled. Kills: W1, W2 (the waiting releaser is not registered or does nothing).
   */
  // Kills: M4, S14, W1, W2
  it('CANCEL-EVENT-08-A-COMBINED: three Confirmed rows and two waiting entries are Cancelled, and nothing is promoted', async () => {
    // Arrange: ATT-01..03 Registered; ATT-04 and ATT-05 Waitlisted (joined before the cancel instant T0)
    const attendee4 = await createSession('ATTENDEE', 'Attendee 4');
    const attendee5 = await createSession('ATTENDEE', 'Attendee 5');
    const eventId = await seedEvent({ status: 'Confirmed' });
    // The waiting list is open. registration_enabled defaults to false, which the settle step treats as a closed list
    // (SPM-138 D9) and would mark the entries Removed, not Cancelled.
    await pool.query(
      `UPDATE events SET registration_enabled = true, registration_limit = 3,
              registration_opens_at = '2026-10-11T04:00:00.000Z', registration_closes_at = '2026-10-19T15:59:00.000Z'
        WHERE id = $1`,
      [eventId],
    );
    const confirmed = [attendee1, attendee2, attendee3];
    const waiting = [attendee4, attendee5];
    for (const who of confirmed) await seedRegistration(eventId, who.uid, 'Registered');
    await seedWaitlistEntry(eventId, attendee4.uid, '2026-10-12T03:00:00.000Z');
    await seedWaitlistEntry(eventId, attendee5.uid, '2026-10-12T03:05:00.000Z');

    // Act
    await cancel(coordinator, eventId).expect(200);

    // Assert 1: the three registrations are Cancelled with the reason; the two waiting entries are Cancelled
    const rows = await pool.query<{ attendee_id: string; status: string; cancellation_reason: string | null }>(
      'SELECT attendee_id, status, cancellation_reason FROM event_registrations WHERE event_id = $1',
      [eventId],
    );
    const byAttendee = new Map(rows.rows.map((row) => [row.attendee_id, row]));
    for (const who of confirmed)
      expect(byAttendee.get(who.uid)).toMatchObject({ status: 'Cancelled', cancellation_reason: 'Event cancelled' });
    for (const who of waiting) expect(byAttendee.get(who.uid)).toMatchObject({ status: 'Cancelled' });

    // Assert 2: nothing is promoted: no Registered row exists for the event
    const registered = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count FROM event_registrations WHERE event_id = $1 AND status = 'Registered'`,
      [eventId],
    );
    expect(registered.rows[0].count).toBe(0);

    // Assert 3: every attendee's registration view shows cancelled, and no waiting position is offered
    for (const who of [...confirmed, ...waiting]) {
      const view = await http().get(`/api/events/${eventId}/registrations/me`).set('Cookie', who.cookie).expect(200);
      expect(view.body.registration.status).toBe('cancelled');
      expect(view.body.registration.waitlistPosition ?? null).toBeNull();
    }
  });

  /**
   * CANCEL-EVENT-08-B: the Withdrawn row is untouched, withdrawing a cancelled registration is refused,
   * the report shows zero, and a new registration is refused as closed.
   */
  // Kills: M4, M19, S9
  it('CANCEL-EVENT-08-B: withdrawn rows stay identical, cancelled registrations cannot be withdrawn or re-registered', async () => {
    // Arrange: EVT-301 cancelled; ATT-06 Withdrawn (withdrawn_at 2026-10-10T04:00Z)
    const { eventId, registrations, withdrawnId } = await seedGalaEvent();
    const withdrawnBefore = await pool.query('SELECT status, withdrawn_at FROM event_registrations WHERE id = $1', [withdrawnId]);
    await cancel(coordinator, eventId).expect(200);

    // Act: read ATT-06's withdrawn row back after the cancellation
    const withdrawnAfter = await pool.query('SELECT status, withdrawn_at FROM event_registrations WHERE id = $1', [withdrawnId]);

    // Assert 1: ATT-06's withdrawn row is identical
    expect(withdrawnAfter.rows).toEqual(withdrawnBefore.rows);
    expect(withdrawnAfter.rows[0].status).toBe('Withdrawn');

    // Act: ATT-01 withdraws the cancelled registration
    const withdraw = await http()
      .post(`/api/registrations/${registrations[0]}/withdraw`)
      .set('Cookie', attendee1.cookie)
      .send({})
      .expect(409);
    // Assert 2: 409 with no status change
    // ASSUMPTION A3: the EVENT_CANCELLED code on a withdrawal of a cancelled registration is ASSUMED (the case asks for 409 only)
    expect(withdraw.body.code).toBe('EVENT_CANCELLED');
    const row = await pool.query('SELECT status FROM event_registrations WHERE id = $1', [registrations[0]]);
    expect(row.rows[0].status).toBe('Cancelled');

    // Act and assert 3: the report (SPM-63) counts zero confirmed registrations for the coordinator
    const report = await http().get(`/api/events/${eventId}/registrations/report`).set('Cookie', coordinator.cookie).expect(200);
    expect(report.body.totalConfirmed).toBe(0);

    // Act and assert 4: ATT-07 tries to register for the cancelled event: refused as closed (422)
    const register = await http()
      .post(`/api/events/${eventId}/registrations`)
      .set('Cookie', attendee7.cookie)
      .send({ fullName: 'Attendee 7', email: 'attendee7@example.test', contactNumber: '91234567' })
      .expect(422);
    expect(register.body).toMatchObject({ code: 'registration_closed', message: 'Registration has closed for this event.' });
  });
});

/*
 * ASSUMPTION INDEX (SPM-136). Master list: docs/specs/SPM-136-test-results.md, "Assumptions (SPM-136)".
 *   A1 attendee copies of the EventCancelled notice use the organiser text -> CANCEL-EVENT-06-A
 *   A3 EVENT_CANCELLED code and MSG-CN-04 wording on a withdrawal of a cancelled registration -> CANCEL-EVENT-08-B
 *   A5 released venue label "not_requested" and no venue item -> CANCEL-EVENT-04-A-VIEW, CANCEL-EVENT-04-A-ARR
 *   A6 safety rows untouched, DERIVED from D2 -> CANCEL-EVENT-04-A-SAFETY
 */
