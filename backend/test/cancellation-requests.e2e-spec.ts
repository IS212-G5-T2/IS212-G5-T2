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
import { DEFAULT_RELEASERS, EVENT_RELEASERS, type EventReleaser } from '../src/events/cancel/release.registry.js';
import { SAFETY_OUTCOME_SOURCE, type SafetyOutcomeSource } from '../src/events/status/arrangements.reader.js';

/*
 * SPM-155 Request Cancellation of My Event (Organiser), over HTTP against real PostgreSQL.
 *
 * Story: SPM-155. ACs: AC1 to AC5. Test cases: CANCEL-REQUEST-01-A to 05-D
 * (document: docs/specs/SPM-155-test-cases.md). Boundary doubles: the clock is frozen at
 * T0 = 2026-10-12T04:00:00Z (the injected CLOCK); fault injection (04-C) replaces only the EVENT_RELEASERS list;
 * 05-D replaces only SAFETY_OUTCOME_SOURCE (the SPM-126 safety source is not built). Everything else is real:
 * events, requests, bookings, equipment, registrations, history and notifications are rows in PostgreSQL.
 *
 * Oracle tiers: SPEC = the test-case document; DERIVED = a Gate-1 decision (D2 acceptance runs the SPM-136 core in
 * one transaction, D3 only the assigned Coordinator decides, D4 a pending request on a Completed or Cancelled event
 * shows Closed, D5 the eligible set is SPM-136's, D7 check order); ASSUMED = wording of the new codes and messages.
 *
 * Deviations from the document (reported, not silent):
 *   - 01-B A and 04-D A use a Submitted clone assigned to COO-01 instead of EVT-1102 (Under Review is retired in
 *     this repository and the `events` table cannot hold it; the service unit spec covers an Under Review row).
 *   - 01-D A (Rejected) is refused 409 EVENT_NOT_CANCELLABLE (D5); 01-D B (Draft) is a draft in `event_drafts`.
 *   - 03-F and 03-G: SPM-153 (mark Completed) has no route here, so the Completed state is written with SQL.
 * Messages and codes are literal copies; this file never imports the production message module.
 * Mutant IDs in each "Kills:" line are defined in backend/scripts/mutation/spm155.mutants.mjs.
 *
 * Runs against TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 028 applied. Skipped
 * locally when neither is set; in CI a missing database fails the run.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-155 tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');
// The application's own pool reads DATABASE_URL.
if (database && !process.env.DATABASE_URL) process.env.DATABASE_URL = database;

const T0 = '2026-10-12T04:00:00.000Z';
const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';
// T+2d 12:00 SGT = 2026-10-14T04:00:00Z: the tentative hold of EVT-1104 (active at the frozen clock).
const HOLD_EXPIRY = '2026-10-14T04:00:00.000Z';
const PAST_START = '2026-10-11T23:00:00.000Z'; // T0 - 5h
const PAST_END = '2026-10-12T01:00:00.000Z'; // T0 - 3h

const MSG_REQUESTED = 'Cancellation request sent to your Event Coordinator.';
const MSG_NOT_CANCELLABLE = 'This event can no longer be cancelled.';
const MSG_PENDING = 'You already have a pending cancellation request for this event.';
const MSG_ACCEPTED = 'Cancellation request accepted. Annual Gala Dinner is cancelled.';
const MSG_DECLINED = 'Cancellation request declined.';
const MSG_DECIDED = 'This request has already been decided.';
const MSG_FORBIDDEN = 'You do not have permission to perform this action.';
const MSG_REASON = 'Use 500 characters or fewer.';
const MSG_INVALID_REQUEST = 'The request is not valid.';
const MSG_INVALID_DECISION = 'Choose accept or decline.';
const MSG_CN_04 = 'This event has been cancelled and its arrangements cannot be changed.';
const CANCELLED_NOTICE = 'Annual Gala Dinner has been cancelled.';

type Session = { uid: string; cookie: string; name: string };

describe.skipIf(!database)('SPM-155 Request Cancellation of My Event over HTTP (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let pool: pg.Pool;
  let safetyApproved = false;
  let createdEventIds: string[];
  let createdDraftIds: string[];
  let createdUserIds: string[];
  let createdVenueIds: string[];

  let org1: Session; // ORG-01 Farid Rahman
  let org2: Session; // ORG-02 Grace Lim
  let coo1: Session; // COO-01 Daniel Koh
  let coo2: Session; // COO-02 Evelyn Goh
  let lead: Session; // LEAD-01 Priya Nair
  let att1: Session;
  let att2: Session;
  let att3: Session;
  let att4: Session;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: database });
    // Drafts live in event_drafts, a backend-owned migration the Compose stack mounts as 004 (idempotent).
    await pool.query(await readFile(new URL('../migrations/001_event_drafts.sql', import.meta.url), 'utf8'));
    // Mutation runs (SPM155_REAPPLY_MIGRATION=1) rebuild the table from the migration file under test, so a mutated
    // migration is what the database holds. A normal run never drops anything.
    if (process.env.SPM155_REAPPLY_MIGRATION === '1') {
      await pool.query('DROP TABLE IF EXISTS event_cancellation_requests CASCADE');
      await pool.query(await readFile(new URL('../migrations/028_spm155_cancellation_requests.sql', import.meta.url), 'utf8'));
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdDraftIds = [];
    createdUserIds = [];
    createdVenueIds = [];
    safetyApproved = false;
    await buildApp();
    org1 = await createSession('ORGANISER', 'Farid Rahman');
    org2 = await createSession('ORGANISER', 'Grace Lim');
    coo1 = await createSession('COORDINATOR', 'Daniel Koh');
    coo2 = await createSession('COORDINATOR', 'Evelyn Goh');
    lead = await createSession('COORDINATOR_LEAD', 'Priya Nair');
    att1 = await createSession('ATTENDEE', 'Alice Tan');
    att2 = await createSession('ATTENDEE', 'Attendee 2');
    att3 = await createSession('ATTENDEE', 'Attendee 3');
    att4 = await createSession('ATTENDEE', 'Dev Patel');
  });

  afterEach(async () => {
    await closeApp();
    if (createdDraftIds.length) await pool.query('DELETE FROM event_drafts WHERE id = ANY($1::uuid[])', [createdDraftIds]);
    // event_cancellation_requests and the other event tables cascade from events.
    if (createdEventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdVenueIds.length) await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [createdVenueIds]);
    if (createdUserIds.length) {
      await pool.query('DELETE FROM notifications WHERE recipient_id = ANY($1::text[])', [createdUserIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  async function closeApp() {
    if (app) await app.close();
    app = undefined;
  }

  /** Builds the Nest app; `releasers` replaces the release registry (fault injection, 04-C only). */
  async function buildApp(releasers?: readonly EventReleaser[]) {
    await closeApp();
    const safety: SafetyOutcomeSource = { read: async () => (safetyApproved ? { state: 'Approved' } : undefined) };
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(T0) })
      .overrideProvider(SAFETY_OUTCOME_SOURCE)
      .useValue(safety);
    if (releasers) builder = builder.overrideProvider(EVENT_RELEASERS).useValue(releasers);
    const moduleFixture = await builder.compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    // Bind to 127.0.0.1 so supertest's requests cannot reach another local listener (as in SPM-136).
    await app.listen(0, '127.0.0.1');
  }

  const http = () => {
    if (!app) throw new Error('The test application is not running.');
    return request(app.getHttpServer());
  };
  const withSession = <T extends request.Test>(req: T, session?: Session): T => (session ? (req.set('Cookie', session.cookie) as T) : req);
  const postRequest = (session: Session | undefined, eventId: string, body: unknown = { reason: 'No longer needed' }) =>
    withSession(http().post(`/api/events/${eventId}/cancellation-requests`), session).send(body as object);
  const getRequests = (session: Session | undefined, eventId: string) =>
    withSession(http().get(`/api/events/${eventId}/cancellation-requests`), session);
  const getMine = (session: Session | undefined) => withSession(http().get('/api/cancellation-requests'), session);
  const decide = (session: Session | undefined, requestId: string, body: unknown) =>
    withSession(http().post(`/api/cancellation-requests/${requestId}/decision`), session).send(body as object);
  const directCancel = (session: Session, eventId: string) =>
    http().post(`/api/events/${eventId}/status-change`).set('Cookie', session.cookie).send({ targetStatus: 'Cancelled', confirmed: true });

  async function createSession(role: string, name: string): Promise<Session> {
    const email = `e2e-cancel-request-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, name],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const attempt = await http().post('/api/auth/login').send({ email, password: 'password123' });
    if (attempt.status !== 201) throw new Error(`login for ${role} returned ${attempt.status}: ${JSON.stringify(attempt.body)}`);
    const cookie = (attempt.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { uid, name, cookie: cookie.split(';', 1)[0] };
  }

  /** An event row. Defaults: owned by ORG-01, assigned to COO-01, 5 Nov 2026 10:00 to 12:00 SGT. */
  async function seedEvent(options: {
    name?: string;
    status: string;
    coordinatorId?: string | null;
    organiserId?: string;
    start?: string;
    end?: string;
    rejectionReason?: string;
  }) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key, rejection_reason)
       VALUES ($1,$2,'Organiser','organiser@example.test',$3,'Purpose','Description',
               $4,$5,80,'Banquet',ARRAY['Catering'],ARRAY[]::text[],'',
               $6,$7,'Daniel Koh',$8,$9)`,
      [
        id,
        options.organiserId ?? org1.uid,
        options.name ?? 'Annual Gala Dinner',
        options.start ?? SLOT_START,
        options.end ?? SLOT_END,
        options.status,
        options.coordinatorId === undefined ? coo1.uid : options.coordinatorId,
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

  async function seedBooking(eventId: string, venueId: string, status: 'approved' | 'pending', holdExpiresAt?: string) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [eventId, venueId, SLOT_START, SLOT_END, status, holdExpiresAt ?? null],
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

  async function seedRegistration(eventId: string, attendee: Session) {
    await pool.query(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email)
       VALUES ($1, $2, 'Registered', $3, 'attendee@example.test')`,
      [eventId, attendee.uid, attendee.name],
    );
  }

  async function seedWaitlistEntry(eventId: string, attendee: Session) {
    await pool.query(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, joined_at, waitlist_seq)
       VALUES ($1, $2, 'Waitlisted', $3, 'attendee@example.test', $4, nextval('event_registrations_waitlist_seq'))`,
      [eventId, attendee.uid, attendee.name, T0],
    );
  }

  /** EVT-1105 Annual Gala Dinner: Confirmed, two Approved venue bookings, Projector x2 Reserved, ATT-01 to 03 Registered, ATT-04 Waitlisted. */
  async function seedGala() {
    const eventId = await seedEvent({ status: 'Confirmed' });
    // The waiting list is open (SPM-138): a list that is not open is settled to Removed, not Cancelled, on cancellation.
    await pool.query(
      `UPDATE events SET registration_enabled = true, registration_limit = 3,
              registration_opens_at = '2026-10-11T04:00:00.000Z', registration_closes_at = '2026-10-19T15:59:00.000Z'
        WHERE id = $1`,
      [eventId],
    );
    const mainHall = await seedVenue('Main Hall');
    const breakout = await seedVenue('Breakout Room 1');
    const bookingA = await seedBooking(eventId, mainHall, 'approved');
    const bookingB = await seedBooking(eventId, breakout, 'approved');
    const projector = await seedEquipment(eventId, 'Projector', 2, 'Reserved');
    for (const attendee of [att1, att2, att3]) await seedRegistration(eventId, attendee);
    await seedWaitlistEntry(eventId, att4);
    return { eventId, bookingA, bookingB, projector };
  }

  /** EVT-1104 Career Fair: Planning with a Pending booking holding the venue until T+2d 12:00 SGT. */
  async function seedPlanningWithHold() {
    const eventId = await seedEvent({ status: 'Planning', name: 'Career Fair' });
    const venue = await seedVenue('Career Hall');
    const bookingId = await seedBooking(eventId, venue, 'pending', HOLD_EXPIRY);
    return { eventId, bookingId };
  }

  /** A request row written directly: for fixtures that need a decided request or a request that predates a state. */
  async function seedRequest(
    eventId: string,
    options: { status?: 'pending' | 'accepted' | 'declined'; requester?: Session; reason?: string | null; decider?: Session } = {},
  ) {
    const status = options.status ?? 'pending';
    const decider = options.decider ?? coo1;
    const requester = options.requester ?? org1;
    const id = randomUUID();
    await pool.query(
      `INSERT INTO event_cancellation_requests
         (id, event_id, requested_by_id, requested_by, reason, status, requested_at, decided_by_id, decided_by, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        eventId,
        requester.uid,
        requester.name,
        options.reason === undefined ? 'No longer needed' : options.reason,
        status,
        '2026-10-11T04:00:00.000Z',
        status === 'pending' ? null : decider.uid,
        status === 'pending' ? null : decider.name,
        status === 'pending' ? null : '2026-10-11T08:00:00.000Z',
      ],
    );
    return id;
  }

  const requestRows = async (eventId: string) =>
    (await pool.query('SELECT * FROM event_cancellation_requests WHERE event_id = $1 ORDER BY requested_at, id', [eventId])).rows;
  const requestCount = async (eventId: string) => (await requestRows(eventId)).length;
  const statusOf = async (eventId: string) =>
    (await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status;

  /** Every table a request must leave alone: the event, bookings, equipment, registrations, history, notifications, safety. */
  async function snapshot(eventId: string) {
    const [event, bookings, equipment, registrations, history, notifications, safety] = await Promise.all([
      pool.query('SELECT * FROM events WHERE id = $1', [eventId]),
      pool.query('SELECT * FROM venue_bookings WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT * FROM equipment_reservations WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT * FROM event_registrations WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT * FROM event_status_history WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT * FROM notifications WHERE related_event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT * FROM event_safety_checks WHERE event_id = $1', [eventId]),
    ]);
    return {
      event: event.rows[0],
      bookings: bookings.rows,
      equipment: equipment.rows,
      registrations: registrations.rows,
      history: history.rows,
      notifications: notifications.rows,
      safety: safety.rows,
    };
  }

  /**
   * Deterministic race gate for the two concurrency cases. A separate connection takes an ACCESS EXCLUSIVE lock on the
   * requests table, every request is started, and the helper waits (bounded) until each one is blocked on some lock
   * before it releases them together. Without the gate the five or six HTTP requests only sometimes overlap inside
   * the database, so a removed guard could pass by luck. With it every request is inside its transaction, past the
   * event read, when the race starts. The poll is bounded (200 x 25 ms) and the outcome is asserted by the caller.
   */
  async function fireTogether<T extends request.Test>(requests: T[]) {
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('LOCK TABLE event_cancellation_requests IN ACCESS EXCLUSIVE MODE');
      const inFlight = Promise.all(requests);
      await waitForBlockedBackends(requests.length);
      await holder.query('COMMIT');
      return await inFlight;
    } catch (error) {
      await holder.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      holder.release();
    }
  }

  async function waitForBlockedBackends(expected: number) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const blocked = await pool.query<{ n: number }>(
        `SELECT count(DISTINCT l.pid)::int AS n
           FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE NOT l.granted AND a.datname = current_database()`,
      );
      if (blocked.rows[0].n >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`fewer than ${expected} requests were blocked on the requests table`);
  }

  // ===================================================================== AC1

  /** CANCEL-REQUEST-01-A (SPEC): ORG-01 requests cancellation of the Approved EVT-1103; one pending row; nothing else changes. */
  describe('CANCEL-REQUEST-01-A: the Organiser requests cancellation of an Approved event', () => {
    // Kills: M1, M12a, M14c, M33, M38
    it('CANCEL-REQUEST-01-A: returns 201 pending with MSG-CR-01, stores one row by ORG-01 at T0, and the event stays Approved', async () => {
      // Arrange: EVT-1103 Hack Night, Approved, submitted by ORG-01, assigned to COO-01, no requests
      const eventId = await seedEvent({ status: 'Approved', name: 'Hack Night' });
      const before = await snapshot(eventId);

      // Act: POST /api/events/EVT-1103/cancellation-requests { reason: 'No longer needed' }
      const response = await postRequest(org1, eventId, { reason: 'No longer needed' }).expect(201);

      // Assert: HTTP 201, status pending, MSG-CR-01, requester ORG-01, the injected instant
      expect(response.body.message).toBe(MSG_REQUESTED);
      expect(response.body.request).toMatchObject({
        eventId,
        eventName: 'Hack Night',
        status: 'pending',
        displayStatus: 'pending',
        reason: 'No longer needed',
        requestedBy: 'Farid Rahman',
        requestedAt: T0,
      });
      // DB: exactly one request row, written by ORG-01, with the injected clock instant and no decision fields
      const rows = await requestRows(eventId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        requested_by_id: org1.uid,
        requested_by: 'Farid Rahman',
        reason: 'No longer needed',
        status: 'pending',
        decided_by_id: null,
        decided_at: null,
      });
      expect(rows[0].requested_at.toISOString()).toBe(T0);
      // The event, its arrangements, history and notifications are untouched; GET /api/events/:id still says approved
      expect(await snapshot(eventId)).toEqual(before);
      const read = await http().get(`/api/events/${eventId}`).set('Cookie', org1.cookie).expect(200);
      expect(read.body.status).toBe('approved');
    });
  });

  /** CANCEL-REQUEST-01-B (SPEC with deviation, DERIVED D5): each eligible status accepts a request and nothing else changes. */
  describe('CANCEL-REQUEST-01-B: a request can be made for each eligible status', () => {
    // Kills: M1, M12a, M2b, M38
    it.each([
      ['Submitted (clone assigned to COO-01, replaces EVT-1102)', 'Submitted'],
      ['Planning (EVT-1104 with a tentative hold)', 'Planning'],
      ['Confirmed (EVT-1105 with two venues, equipment, registrations)', 'Confirmed'],
    ])('CANCEL-REQUEST-01-B: %s accepts a request and nothing else changes', async (_label, status) => {
      // Arrange
      const eventId =
        status === 'Confirmed'
          ? (await seedGala()).eventId
          : status === 'Planning'
            ? (await seedPlanningWithHold()).eventId
            : await seedEvent({ status });
      const before = await snapshot(eventId);

      // Act
      const response = await postRequest(org1, eventId).expect(201);

      // Assert: created as pending; no event status, booking, hold, reservation or registration changes
      expect(response.body.request.status).toBe('pending');
      expect(await requestCount(eventId)).toBe(1);
      expect(await snapshot(eventId)).toEqual(before);
      expect(await statusOf(eventId)).toBe(status);
    });
  });

  /** CANCEL-REQUEST-01-C (SPEC): a Completed or Cancelled event refuses a request. */
  describe('CANCEL-REQUEST-01-C: a Completed or Cancelled event cannot be the subject of a request', () => {
    // Kills: M2d, M38, M4c
    it.each([
      ['EVT-1106 Completed', 'Completed'],
      ['EVT-1107 Cancelled', 'Cancelled'],
    ])('CANCEL-REQUEST-01-C: %s is refused 409 EVENT_NOT_CANCELLABLE (MSG-CR-02) and no row is created', async (_label, status) => {
      // Arrange
      const eventId = await seedEvent({ status });

      // Act
      const response = await postRequest(org1, eventId).expect(409);

      // Assert: [code, message] and no request row
      expect([response.body.code, response.body.message]).toEqual(['EVENT_NOT_CANCELLABLE', MSG_NOT_CANCELLABLE]);
      expect(await requestCount(eventId)).toBe(0);
    });
  });

  /** CANCEL-REQUEST-01-D (SPEC with deviation, DERIVED D5): Rejected and Draft are refused 409 MSG-CR-02. */
  describe('CANCEL-REQUEST-01-D: the status boundaries around the AC wording', () => {
    // Kills: M2a, M2d, M38, M4c
    it('CANCEL-REQUEST-01-D: a Rejected event (EVT-1108) is refused 409 EVENT_NOT_CANCELLABLE and no row is created', async () => {
      // Arrange: Rejected needs a reason of 10 to 500 characters (events_rejection_reason_check)
      const eventId = await seedEvent({ status: 'Rejected', rejectionReason: 'Budget was not approved' });

      // Act
      const response = await postRequest(org1, eventId).expect(409);

      // Assert: the AC wording ("not yet Completed or Cancelled") would allow it; Gate-1 D5 refuses it (finding F1)
      expect([response.body.code, response.body.message]).toEqual(['EVENT_NOT_CANCELLABLE', MSG_NOT_CANCELLABLE]);
      expect(await requestCount(eventId)).toBe(0);
    });

    // Kills: M25a, M25b, M38, M4c
    it('CANCEL-REQUEST-01-D: an unsubmitted Draft (EVT-1109) is refused 409 EVENT_NOT_CANCELLABLE and no row is created', async () => {
      // Arrange: a Draft lives in event_drafts, not in events
      const draftId = randomUUID();
      await pool.query(
        `INSERT INTO event_drafts (id, organiser_id, fields, status) VALUES ($1, $2, '{}'::jsonb, 'Draft')`,
        [draftId, org1.uid],
      );
      createdDraftIds.push(draftId);

      // Act
      const response = await postRequest(org1, draftId).expect(409);

      // Assert
      expect([response.body.code, response.body.message]).toEqual(['EVENT_NOT_CANCELLABLE', MSG_NOT_CANCELLABLE]);
      expect((await pool.query('SELECT count(*)::int AS n FROM event_cancellation_requests WHERE event_id = $1', [draftId])).rows[0].n).toBe(0);
    });

    // Kills: M25c, M38, M4c
    it('CANCEL-REQUEST-01-D: a Draft id of another Organiser is 404 EVENT_NOT_FOUND, not a hint that the draft exists', async () => {
      // Arrange: ORG-01's draft, requested by ORG-02
      const draftId = randomUUID();
      await pool.query(`INSERT INTO event_drafts (id, organiser_id, fields, status) VALUES ($1, $2, '{}'::jsonb, 'Draft')`, [draftId, org1.uid]);
      createdDraftIds.push(draftId);

      // Act
      const response = await postRequest(org2, draftId).expect(404);

      // Assert
      expect([response.body.code, response.body.message]).toEqual(['EVENT_NOT_FOUND', 'Event not found.']);
    });
  });

  /** CANCEL-REQUEST-01-E (SPEC): only the Organiser who submitted the event can request its cancellation. */
  describe('CANCEL-REQUEST-01-E: only the submitting Organiser can request', () => {
    // Kills: M3a, M38, M4c
    it.each([
      ['ORG-02, another organiser', () => org2],
      ['COO-01, the assigned coordinator', () => coo1],
      ['LEAD-01, the lead', () => lead],
      ['ATT-01, an attendee', () => att1],
    ])('CANCEL-REQUEST-01-E: %s is refused 403 FORBIDDEN (MSG-08) and no row is created', async (_label, actor) => {
      // Arrange: EVT-1103 submitted by ORG-01
      const eventId = await seedEvent({ status: 'Approved' });

      // Act
      const response = await postRequest(actor(), eventId).expect(403);

      // Assert
      expect([response.body.code, response.body.message]).toEqual(['FORBIDDEN', MSG_FORBIDDEN]);
      expect(await requestCount(eventId)).toBe(0);
    });

    // Kills: M38
    it('CANCEL-REQUEST-01-E: no token is refused 401 and no row is created', async () => {
      // Arrange
      const eventId = await seedEvent({ status: 'Approved' });

      // Act
      const response = await postRequest(undefined, eventId).expect(401);

      // Assert: the shared authentication middleware's literal message
      expect(response.body.message).toBe('Missing session');
      expect(await requestCount(eventId)).toBe(0);
    });

    // Kills: M3a, M38, M4c
    it('CANCEL-REQUEST-01-E: ORG-02 on a Completed event is 403, not 409, so the event\'s status is not disclosed', async () => {
      // Arrange
      const eventId = await seedEvent({ status: 'Completed' });

      // Act
      const response = await postRequest(org2, eventId).expect(403);

      // Assert
      expect([response.body.code, response.body.message]).toEqual(['FORBIDDEN', MSG_FORBIDDEN]);
    });
  });

  /** CANCEL-REQUEST-01-F (SPEC): one pending request per event, including simultaneous submissions. */
  describe('CANCEL-REQUEST-01-F: a second request cannot be created while one is pending', () => {
    // Kills: M1, M38, M4e
    it('CANCEL-REQUEST-01-F: a second request is refused 409 CANCELLATION_REQUEST_PENDING (MSG-CR-03) and one row remains', async () => {
      // Arrange: a fresh EVT-1103 clone
      const eventId = await seedEvent({ status: 'Approved' });

      // Act: step 1 creates, step 2 repeats
      await postRequest(org1, eventId).expect(201);
      const second = await postRequest(org1, eventId).expect(409);

      // Assert
      expect([second.body.code, second.body.message]).toEqual(['CANCELLATION_REQUEST_PENDING', MSG_PENDING]);
      expect(await requestCount(eventId)).toBe(1);
    });

    // Kills: M1, M38, M4e, M4h
    it('CANCEL-REQUEST-01-F: five parallel identical requests give one 201, four 409 CANCELLATION_REQUEST_PENDING and one pending row', async () => {
      // Arrange: a fresh clone with no requests
      const eventId = await seedEvent({ status: 'Approved' });

      // Act: 5 simultaneous requests, all inside their transactions when the race starts (fireTogether)
      const responses = await fireTogether([1, 2, 3, 4, 5].map(() => postRequest(org1, eventId)));

      // Assert: exactly one 201 and four 409 with the MSG-CR-03 code and text; exactly one pending row
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
      for (const loser of responses.filter((r) => r.status === 409))
        expect([loser.body.code, loser.body.message]).toEqual(['CANCELLATION_REQUEST_PENDING', MSG_PENDING]);
      const rows = await requestRows(eventId);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('pending');
    });

    // Kills: M4d, M4e
    it('CANCEL-REQUEST-01-F: the database itself refuses a second pending row for one event', async () => {
      // Arrange: one pending row
      const eventId = await seedEvent({ status: 'Approved' });
      await seedRequest(eventId);

      // Act / Assert: a direct second pending insert violates the unique index on the generated pending key
      await expect(seedRequest(eventId)).rejects.toMatchObject({ code: '23505' });
      // A decided row for the same event is allowed (history), and the pending key is null for it
      await seedRequest(eventId, { status: 'declined' });
      expect(await requestCount(eventId)).toBe(2);
    });
  });

  /** CANCEL-REQUEST-01-G (SPEC, DERIVED D3): a request on an unassigned Submitted event waits for the assigned Coordinator. */
  describe('CANCEL-REQUEST-01-G: the request for a Submitted event with no Coordinator yet', () => {
    // Kills: M1, M14c, M18d, M20, M21, M35, M38, M6a, M6c
    it('CANCEL-REQUEST-01-G: stays pending, LEAD-01 and COO-01 cannot decide it (403), and COO-01 can after assignment', async () => {
      // Arrange: EVT-1101 Student Mixer, Submitted, unassigned
      const eventId = await seedEvent({ status: 'Submitted', coordinatorId: null, name: 'Student Mixer' });

      // Act 1: ORG-01 requests
      const created = await postRequest(org1, eventId).expect(201);
      const requestId = created.body.request.id as string;
      // Act 2: LEAD-01 and COO-01 try to accept: refused, nothing changes
      const byLead = await decide(lead, requestId, { decision: 'accept' }).expect(403);
      const byCoordinator = await decide(coo1, requestId, { decision: 'accept' }).expect(403);
      // Assert 2: [code, message] literals; still pending; event still Submitted
      for (const refused of [byLead, byCoordinator]) expect([refused.body.code, refused.body.message]).toEqual(['FORBIDDEN', MSG_FORBIDDEN]);
      expect((await requestRows(eventId))[0].status).toBe('pending');
      expect(await statusOf(eventId)).toBe('Submitted');

      // Act 3: LEAD-01 assigns EVT-1101 to COO-01 (SPM-123)
      await http().post(`/api/lead/queue/${eventId}/assign`).set('Cookie', lead.cookie).send({ coordinatorId: coo1.uid }).expect(201);
      // Act 4: COO-01 opens the event's requests and decides
      const visible = await getRequests(coo1, eventId).expect(200);
      expect(visible.body).toHaveLength(1);
      expect(visible.body[0]).toMatchObject({ id: requestId, status: 'pending', displayStatus: 'pending' });
      const accepted = await decide(coo1, requestId, { decision: 'decline' }).expect(200);

      // Assert 4: the assigned Coordinator's decision is recorded
      expect(accepted.body.request).toMatchObject({ status: 'declined', decidedBy: 'Daniel Koh' });
    });
  });

  /** CANCEL-REQUEST-01-H (SPEC, DERIVED reason limit 0 to 500): the optional reason. */
  describe('CANCEL-REQUEST-01-H: the optional reason', () => {
    // Kills: M1, M27, M38, M5e
    it('CANCEL-REQUEST-01-H: subtest A, no reason is accepted and stored as null', async () => {
      // Arrange
      const eventId = await seedEvent({ status: 'Approved' });

      // Act: an empty body
      const response = await postRequest(org1, eventId, {}).expect(201);

      // Assert
      expect(response.body.request.reason).toBeNull();
      expect((await requestRows(eventId))[0].reason).toBeNull();
    });

    // Kills: M1, M38, M5f
    it('CANCEL-REQUEST-01-H: subtest B, a reason of 500 characters is accepted unchanged', async () => {
      // Arrange: 500 x "r" (limit 500, on the limit)
      const eventId = await seedEvent({ status: 'Approved' });
      const reason = 'r'.repeat(500);

      // Act
      await postRequest(org1, eventId, { reason }).expect(201);

      // Assert
      expect((await requestRows(eventId))[0].reason).toBe(reason);
    });

    // Kills: M38, M4c, M5a
    it('CANCEL-REQUEST-01-H: subtest C, a reason of 501 characters is refused 422 INVALID_REASON and nothing is saved', async () => {
      // Arrange: 501 x "r" (limit 500, one over)
      const eventId = await seedEvent({ status: 'Approved' });

      // Act
      const response = await postRequest(org1, eventId, { reason: 'r'.repeat(501) }).expect(422);

      // Assert
      expect([response.body.code, response.body.message]).toEqual(['INVALID_REASON', MSG_REASON]);
      expect(await requestCount(eventId)).toBe(0);
    });

    // Kills: M1, M38, M5g
    it('CANCEL-REQUEST-01-H: subtest D, script text is stored and returned exactly as typed', async () => {
      // Arrange
      const eventId = await seedEvent({ status: 'Approved' });
      const reason = '<script>alert(1)</script>';

      // Act
      await postRequest(org1, eventId, { reason }).expect(201);
      const read = await getRequests(org1, eventId).expect(200);

      // Assert: literal text in the database and in the API (the UI shows it as text; see the frontend suite)
      expect((await requestRows(eventId))[0].reason).toBe(reason);
      expect(read.body[0].reason).toBe(reason);
    });

    // Kills: M1, M27, M38, M5c
    it('CANCEL-REQUEST-01-H: spaces only is stored as null', async () => {
      // Arrange
      const eventId = await seedEvent({ status: 'Approved' });

      // Act
      await postRequest(org1, eventId, { reason: '    ' }).expect(201);

      // Assert
      expect((await requestRows(eventId))[0].reason).toBeNull();
    });

    // Kills: M38, M4c, M5d
    it('CANCEL-REQUEST-01-H: a reason that is not text is refused 400 INVALID_REQUEST and nothing is saved', async () => {
      // Arrange
      const eventId = await seedEvent({ status: 'Approved' });

      // Act
      const response = await postRequest(org1, eventId, { reason: 12345 }).expect(400);

      // Assert
      expect([response.body.code, response.body.message]).toEqual(['INVALID_REQUEST', MSG_INVALID_REQUEST]);
      expect(await requestCount(eventId)).toBe(0);
    });
  });

  /** CANCEL-REQUEST-01-SUP-BODY (DERIVED: strict body): server-owned fields cannot be supplied. */
  describe('CANCEL-REQUEST-01-SUP-BODY: server-owned fields in the body', () => {
    // Kills: M18a, M38, M4c
    it.each([
      ['status accepted', { reason: 'x', status: 'accepted' }],
      ['requestedById of another user', { reason: 'x', requestedById: 'someone-else' }],
      ['another eventId', { reason: 'x', eventId: randomUUID() }],
    ])('CANCEL-REQUEST-01-SUP-BODY: a body with %s is refused 400 INVALID_REQUEST and nothing is saved', async (_label, body) => {
      // Arrange
      const eventId = await seedEvent({ status: 'Approved' });

      // Act
      const response = await postRequest(org1, eventId, body).expect(400);

      // Assert
      expect([response.body.code, response.body.message]).toEqual(['INVALID_REQUEST', MSG_INVALID_REQUEST]);
      expect(await requestCount(eventId)).toBe(0);
    });
  });

  // ===================================================================== AC2

  /** CANCEL-REQUEST-02-A (SPEC): the Organiser sees a pending request, in the event's list and in the dashboard list. */
  describe('CANCEL-REQUEST-02-A: a pending request is shown', () => {
    // Kills: M1, M14c, M33, M38
    it('CANCEL-REQUEST-02-A: the event list and the dashboard list show pending with the request date, and the event stays Approved', async () => {
      // Arrange: a pending request on EVT-1103 created at T0
      const eventId = await seedEvent({ status: 'Approved', name: 'Hack Night' });
      await postRequest(org1, eventId).expect(201);

      // Act
      const forEvent = await getRequests(org1, eventId).expect(200);
      const mine = await getMine(org1).expect(200);

      // Assert: latest request pending with the request date; the dashboard list carries the same request
      expect(forEvent.body).toHaveLength(1);
      expect(forEvent.body[0]).toMatchObject({ status: 'pending', displayStatus: 'pending', requestedAt: T0, reason: 'No longer needed' });
      expect(mine.body.find((r: { eventId: string }) => r.eventId === eventId)).toMatchObject({ status: 'pending', displayStatus: 'pending', eventName: 'Hack Night' });
      expect(await statusOf(eventId)).toBe('Approved');
    });
  });

  /** CANCEL-REQUEST-02-B (SPEC): Accepted after the Coordinator accepts. */
  describe('CANCEL-REQUEST-02-B: the Organiser sees Accepted', () => {
    // Kills: M1, M10a, M12c, M17a, M33, M35, M38, M9
    it('CANCEL-REQUEST-02-B: after accept the request reads accepted with the decision date and the event reads cancelled', async () => {
      // Arrange: pending request on a Confirmed EVT-1105 clone
      const { eventId } = await seedGala();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;

      // Act: COO-01 accepts, then ORG-01 reloads
      await decide(coo1, requestId, { decision: 'accept' }).expect(200);
      const forEvent = await getRequests(org1, eventId).expect(200);
      const mine = await getMine(org1).expect(200);
      const event = await http().get(`/api/events/${eventId}`).set('Cookie', org1.cookie).expect(200);

      // Assert: accepted with the decision instant; the event is cancelled (lower case on the API)
      expect(forEvent.body[0]).toMatchObject({ status: 'accepted', displayStatus: 'accepted', decidedAt: T0, decidedBy: 'Daniel Koh' });
      expect(mine.body.find((r: { eventId: string }) => r.eventId === eventId)).toMatchObject({ status: 'accepted' });
      expect(event.body.status).toBe('cancelled');
    });
  });

  /** CANCEL-REQUEST-02-C (SPEC): Declined after the Coordinator declines. */
  describe('CANCEL-REQUEST-02-C: the Organiser sees Declined', () => {
    // Kills: M1, M18d, M33, M35, M38
    it('CANCEL-REQUEST-02-C: after decline the request reads declined with the decision date and the event keeps its status', async () => {
      // Arrange
      const { eventId } = await seedGala();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;

      // Act
      await decide(coo1, requestId, { decision: 'decline' }).expect(200);
      const forEvent = await getRequests(org1, eventId).expect(200);
      const event = await http().get(`/api/events/${eventId}`).set('Cookie', org1.cookie).expect(200);

      // Assert
      expect(forEvent.body[0]).toMatchObject({ status: 'declined', displayStatus: 'declined', decidedAt: T0, decidedBy: 'Daniel Koh' });
      expect(event.body.status).toBe('confirmed');
    });
  });

  /** CANCEL-REQUEST-02-D (SPEC): no one but the owner and the assigned Coordinator can read a request. */
  describe('CANCEL-REQUEST-02-D: request data is not exposed to others', () => {
    // Kills: M1, M16a, M38
    it.each([
      ['ORG-02, another organiser', () => org2],
      ['ATT-01, an attendee', () => att1],
      ['COO-02, an unassigned coordinator', () => coo2],
      ['LEAD-01, the lead', () => lead],
    ])('CANCEL-REQUEST-02-D: %s reading the event requests is refused 403 FORBIDDEN with no data', async (_label, actor) => {
      // Arrange: a pending request on EVT-1103 by ORG-01
      const eventId = await seedEvent({ status: 'Approved' });
      await postRequest(org1, eventId).expect(201);

      // Act
      const response = await getRequests(actor(), eventId).expect(403);

      // Assert: [code, message] and no request data in the body
      expect([response.body.code, response.body.message]).toEqual(['FORBIDDEN', MSG_FORBIDDEN]);
      expect(JSON.stringify(response.body)).not.toContain('No longer needed');
    });

    // Kills: M38
    it('CANCEL-REQUEST-02-D: no token is refused 401', async () => {
      // Arrange
      const eventId = await seedEvent({ status: 'Approved' });

      // Act / Assert
      const response = await getRequests(undefined, eventId).expect(401);
      expect(response.body.message).toBe('Missing session');
    });

    // Kills: M1, M16c, M38
    it('CANCEL-REQUEST-02-D: the dashboard list of ORG-02 does not contain ORG-01\'s request, and ATT-01 is refused', async () => {
      // Arrange
      const eventId = await seedEvent({ status: 'Approved' });
      await postRequest(org1, eventId).expect(201);

      // Act
      const theirs = await getMine(org2).expect(200);
      const attendee = await getMine(att1).expect(403);

      // Assert
      expect(theirs.body.filter((r: { eventId: string }) => r.eventId === eventId)).toEqual([]);
      expect([attendee.body.code, attendee.body.message]).toEqual(['FORBIDDEN', MSG_FORBIDDEN]);
    });

    // Kills: M32, M38
    it('CANCEL-REQUEST-02-D: an unknown event is 404 EVENT_NOT_FOUND for the read', async () => {
      // Act
      const response = await getRequests(org1, randomUUID()).expect(404);

      // Assert
      expect([response.body.code, response.body.message]).toEqual(['EVENT_NOT_FOUND', 'Event not found.']);
    });
  });

  /** CANCEL-REQUEST-02-E (SPEC, S2): after a decline the Organiser can request again; earlier requests stay listed. */
  describe('CANCEL-REQUEST-02-E: a new request after a declined one', () => {
    // Kills: M1, M10a, M12c, M19, M38
    it('CANCEL-REQUEST-02-E: the newest request is current, the declined one stays listed, and accepting the new one shows Accepted', async () => {
      // Arrange: EVT-1105 clone with one Declined request (decided before T0)
      const { eventId } = await seedGala();
      const declinedId = await seedRequest(eventId, { status: 'declined' });

      // Act 1: ORG-01 requests again
      const created = await postRequest(org1, eventId, { reason: 'Second try' }).expect(201);
      const newId = created.body.request.id as string;
      const list = await getRequests(org1, eventId).expect(200);

      // Assert 1: newest first; the declined request is still there, unchanged; one pending only
      expect(list.body.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([[newId, 'pending'], [declinedId, 'declined']]);
      expect(list.body[0].reason).toBe('Second try');
      expect((await requestRows(eventId)).filter((r) => r.status === 'pending')).toHaveLength(1);

      // Act 2: the Coordinator accepts the new request
      await decide(coo1, newId, { decision: 'accept' }).expect(200);
      const after = await getRequests(org1, eventId).expect(200);

      // Assert 2: Accepted for the new one; the declined one is still declined
      expect(after.body.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([[newId, 'accepted'], [declinedId, 'declined']]);
    });
  });

  /** CANCEL-REQUEST-02-F (SPEC): the latest status on every reload and new session; never cached. */
  describe('CANCEL-REQUEST-02-F: the latest status is shown after a reload or a new session', () => {
    // Kills: M1, M17b, M17c, M18d, M38
    it('CANCEL-REQUEST-02-F: after a decline every read, including a fresh login, says declined and the GETs are no-store', async () => {
      // Arrange: ORG-01 has read Pending
      const eventId = await seedEvent({ status: 'Approved' });
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;
      const pendingRead = await getRequests(org1, eventId).expect(200);
      expect(pendingRead.body[0].status).toBe('pending');

      // Act: COO-01 declines; ORG-01 reloads, then signs in again
      await decide(coo1, requestId, { decision: 'decline' }).expect(200);
      const reload = await getRequests(org1, eventId).expect(200);
      const freshOrg1 = await loginAgain(org1);
      const newSession = await getRequests(freshOrg1, eventId).expect(200);
      const dashboard = await getMine(freshOrg1).expect(200);

      // Assert: declined everywhere; Cache-Control no-store on both GET routes
      expect(reload.body[0].status).toBe('declined');
      expect(newSession.body[0].status).toBe('declined');
      expect(dashboard.body.find((r: { eventId: string }) => r.eventId === eventId).status).toBe('declined');
      expect(reload.headers['cache-control']).toBe('no-store');
      expect(dashboard.headers['cache-control']).toBe('no-store');
    });
  });

  /** CANCEL-REQUEST-02-SUP-CLOSED (DERIVED D4): a pending request whose event ended shows Closed; nothing is written. */
  describe('CANCEL-REQUEST-02-SUP-CLOSED: a pending request on a Completed or Cancelled event shows Closed', () => {
    // Kills: M1, M14a, M14b, M38
    it.each([
      ['Completed', 'The event is already completed.'],
      ['Cancelled', 'The event is already cancelled.'],
    ])('CANCEL-REQUEST-02-SUP-CLOSED: a pending request on a %s event is shown closed with its line and stays pending in storage', async (status, line) => {
      // Arrange: a pending request, then the event ends by another route
      const { eventId } = await seedGala();
      await postRequest(org1, eventId).expect(201);
      await pool.query('UPDATE events SET status = $2 WHERE id = $1', [eventId, status]);

      // Act
      const forEvent = await getRequests(org1, eventId).expect(200);
      const mine = await getMine(org1).expect(200);

      // Assert: displayStatus closed with the line; the stored status is untouched (derived, not written)
      expect(forEvent.body[0]).toMatchObject({ status: 'pending', displayStatus: 'closed', closedNote: line });
      expect(mine.body.find((r: { eventId: string }) => r.eventId === eventId)).toMatchObject({ displayStatus: 'closed', closedNote: line });
      expect((await requestRows(eventId))[0].status).toBe('pending');
    });
  });

  // ===================================================================== AC3

  /** CANCEL-REQUEST-03-A (SPEC): the assigned Coordinator sees and accepts a pending request. */
  describe('CANCEL-REQUEST-03-A: the assigned Coordinator accepts', () => {
    // Kills: M1, M10a, M10b, M12c, M33, M35, M38, M9
    it('CANCEL-REQUEST-03-A: COO-01 sees the pending request with its reason, accepts it, and the request records COO-01 and T0', async () => {
      // Arrange: pending request on a Confirmed EVT-1105 clone
      const { eventId } = await seedGala();
      const requestId = (await postRequest(org1, eventId, { reason: 'Sponsor withdrew' }).expect(201)).body.request.id as string;

      // Act 1: COO-01 opens the event's requests
      const visible = await getRequests(coo1, eventId).expect(200);
      expect(visible.body[0]).toMatchObject({ id: requestId, status: 'pending', reason: 'Sponsor withdrew' });

      // Act 2: COO-01 accepts
      const response = await decide(coo1, requestId, { decision: 'accept' }).expect(200);

      // Assert: HTTP 200 and MSG-CR-04; stored accepted with decider and instant; the event is cancelled by COO-01
      expect(response.body.message).toBe(MSG_ACCEPTED);
      expect(response.body.request).toMatchObject({ id: requestId, status: 'accepted', decidedBy: 'Daniel Koh', decidedAt: T0 });
      const row = (await requestRows(eventId))[0];
      expect(row).toMatchObject({ status: 'accepted', decided_by_id: coo1.uid, decided_by: 'Daniel Koh' });
      expect(row.decided_at.toISOString()).toBe(T0);
      const event = await pool.query('SELECT status, cancelled_by, cancelled_at FROM events WHERE id = $1', [eventId]);
      expect(event.rows[0].status).toBe('Cancelled');
      expect(event.rows[0].cancelled_by).toBe(coo1.uid);
      expect(event.rows[0].cancelled_at.toISOString()).toBe(T0);
    });
  });

  /** CANCEL-REQUEST-03-B (SPEC): the assigned Coordinator declines. */
  describe('CANCEL-REQUEST-03-B: the assigned Coordinator declines', () => {
    // Kills: M1, M10b, M11, M12b, M18d, M35, M38
    it('CANCEL-REQUEST-03-B: decline returns 200 with MSG-CR-05 and records COO-01 and T0; the event is unchanged', async () => {
      // Arrange
      const { eventId } = await seedGala();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;
      const before = await snapshot(eventId);

      // Act
      const response = await decide(coo1, requestId, { decision: 'decline' }).expect(200);

      // Assert
      expect(response.body.message).toBe(MSG_DECLINED);
      expect(response.body.request).toMatchObject({ status: 'declined', decidedBy: 'Daniel Koh' });
      const row = (await requestRows(eventId))[0];
      expect(row).toMatchObject({ status: 'declined', decided_by_id: coo1.uid, decided_by: 'Daniel Koh' });
      expect(row.decided_at.toISOString()).toBe(T0);
      expect(await snapshot(eventId)).toEqual(before);
    });
  });

  /** CANCEL-REQUEST-03-C (SPEC, DERIVED D3): only the assigned Coordinator can decide. */
  describe('CANCEL-REQUEST-03-C: only the assigned Coordinator decides', () => {
    // Kills: M21, M38, M6a, M6c
    it.each([
      ['COO-02, not assigned', () => coo2],
      ['LEAD-01, not assigned', () => lead],
      ['ORG-01, the requester', () => org1],
      ['ATT-01, an attendee', () => att1],
    ])('CANCEL-REQUEST-03-C: %s is refused 403 FORBIDDEN (MSG-08) and the request and event are unchanged', async (_label, actor) => {
      // Arrange
      const { eventId } = await seedGala();
      const requestId = await seedRequest(eventId);
      const before = await snapshot(eventId);

      // Act
      const response = await decide(actor(), requestId, { decision: 'accept' }).expect(403);

      // Assert
      expect([response.body.code, response.body.message]).toEqual(['FORBIDDEN', MSG_FORBIDDEN]);
      expect((await requestRows(eventId))[0].status).toBe('pending');
      expect(await snapshot(eventId)).toEqual(before);
    });

    // Kills: M38
    it('CANCEL-REQUEST-03-C: no token is refused 401 and the request stays pending', async () => {
      // Arrange
      const { eventId } = await seedGala();
      const requestId = await seedRequest(eventId);

      // Act
      const response = await decide(undefined, requestId, { decision: 'accept' }).expect(401);

      // Assert
      expect(response.body.message).toBe('Missing session');
      expect((await requestRows(eventId))[0].status).toBe('pending');
    });

    // Kills: M10b, M18d, M21, M35, M38, M6a, M6c
    it('CANCEL-REQUEST-03-C: after reassignment COO-01 is refused and the new Coordinator COO-02 can decide', async () => {
      // Arrange: a pending request; the event is then reassigned to COO-02
      const { eventId } = await seedGala();
      const requestId = await seedRequest(eventId);
      await pool.query('UPDATE events SET coordinator_id = $2, coordinator_name = $3 WHERE id = $1', [eventId, coo2.uid, coo2.name]);

      // Act
      const old = await decide(coo1, requestId, { decision: 'decline' }).expect(403);
      const current = await decide(coo2, requestId, { decision: 'decline' }).expect(200);

      // Assert: the replaced Coordinator is refused, the assigned one decides and is recorded
      expect([old.body.code, old.body.message]).toEqual(['FORBIDDEN', MSG_FORBIDDEN]);
      expect(current.body.request).toMatchObject({ status: 'declined', decidedBy: 'Evelyn Goh' });
      expect((await requestRows(eventId))[0].decided_by_id).toBe(coo2.uid);
    });

    // Kills: M20, M21, M38, M6a, M6c
    it('CANCEL-REQUEST-03-C: on an unassigned event the Lead and a Coordinator are both refused 403', async () => {
      // Arrange: an unassigned Submitted event with a pending request
      const eventId = await seedEvent({ status: 'Submitted', coordinatorId: null });
      const requestId = await seedRequest(eventId);

      // Act
      const byLead = await decide(lead, requestId, { decision: 'accept' }).expect(403);
      const byCoordinator = await decide(coo2, requestId, { decision: 'accept' }).expect(403);

      // Assert
      for (const refused of [byLead, byCoordinator]) expect([refused.body.code, refused.body.message]).toEqual(['FORBIDDEN', MSG_FORBIDDEN]);
      expect(await statusOf(eventId)).toBe('Submitted');
    });

    // Kills: M21, M30a, M38, M6a, M6c
    it('CANCEL-REQUEST-03-C: an unknown request id is refused 403 FORBIDDEN, exactly like a real request of another coordinator', async () => {
      // Arrange: a real pending request that COO-02 does not own, and an id that exists nowhere
      const { eventId } = await seedGala();
      const realId = await seedRequest(eventId);

      // Act
      const unknown = await decide(coo2, randomUUID(), { decision: 'accept' }).expect(403);
      const real = await decide(coo2, realId, { decision: 'accept' }).expect(403);

      // Assert: no status or body difference reveals which ids exist (user decision 31 Oct 2026, SC-155-009)
      expect([unknown.body.code, unknown.body.message]).toEqual(['FORBIDDEN', MSG_FORBIDDEN]);
      expect(unknown.body).toEqual(real.body);
    });
  });

  /** CANCEL-REQUEST-03-D (SPEC): a decided request cannot be decided again. */
  describe('CANCEL-REQUEST-03-D: a decided request is final', () => {
    // Kills: M38
    it.each([
      ['an Accepted request refuses decline', 'accepted', 'decline'],
      ['a Declined request refuses accept', 'declined', 'accept'],
    ])('CANCEL-REQUEST-03-D: %s with 409 CANCELLATION_REQUEST_DECIDED (MSG-CR-06) and nothing changes', async (_label, stored, decision) => {
      // Arrange: EVT-1105 clone with a decided request (the accepted one on an event that is still Confirmed, as seeded)
      const { eventId } = await seedGala();
      const requestId = await seedRequest(eventId, { status: stored as 'accepted' | 'declined' });
      const before = await snapshot(eventId);

      // Act
      const response = await decide(coo1, requestId, { decision }).expect(409);

      // Assert: [code, message], the first decision stands, event unchanged
      expect([response.body.code, response.body.message]).toEqual(['CANCELLATION_REQUEST_DECIDED', MSG_DECIDED]);
      expect((await requestRows(eventId))[0].status).toBe(stored);
      expect(await snapshot(eventId)).toEqual(before);
    });
  });

  /** CANCEL-REQUEST-03-E (SPEC): simultaneous accept and decline give exactly one decision. */
  describe('CANCEL-REQUEST-03-E: simultaneous decisions', () => {
    // Kills: M10a, M12b, M12c, M15, M31, M38, M7d, M9
    it('CANCEL-REQUEST-03-E: 3 accepts and 3 declines give one 200 and five 409, one final status, and no duplicates', async () => {
      // Arrange: pending request on a Confirmed EVT-1105 clone
      const { eventId } = await seedGala();
      const requestId = await seedRequest(eventId);

      // Act: fire 3 accepts and 3 declines together
      const responses = await fireTogether(
        ['accept', 'accept', 'accept', 'decline', 'decline', 'decline'].map((decision) => decide(coo1, requestId, { decision })),
      );

      // Assert: exactly one 200 and five 409 with the MSG-CR-06 text
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409, 409]);
      for (const loser of responses.filter((r) => r.status === 409))
        expect([loser.body.code, loser.body.message]).toEqual(['CANCELLATION_REQUEST_DECIDED', MSG_DECIDED]);
      // One final status, and the event matches it: Cancelled only if the winning decision was accept
      const final = (await requestRows(eventId))[0].status as string;
      expect(['accepted', 'declined']).toContain(final);
      expect(await statusOf(eventId)).toBe(final === 'accepted' ? 'Cancelled' : 'Confirmed');
      // No duplicate history or notifications: an accept writes one history row and one notice per recipient, a decline none
      const after = await snapshot(eventId);
      expect(after.history).toHaveLength(final === 'accepted' ? 1 : 0);
      const perRecipient = new Map<string, number>();
      for (const row of after.notifications) perRecipient.set(row.recipient_id, (perRecipient.get(row.recipient_id) ?? 0) + 1);
      expect([...perRecipient.values()].every((count) => count === 1)).toBe(true);
      expect(after.notifications).toHaveLength(final === 'accepted' ? 6 : 0);
    });
  });

  /** CANCEL-REQUEST-03-F (SPEC, DERIVED D4): the event is Completed while the request is pending. */
  describe('CANCEL-REQUEST-03-F: the event is Completed while the request is pending', () => {
    // Kills: M1, M13, M14a, M38
    it.each([
      ['accept', 'accept'],
      ['decline', 'decline'],
    ])('CANCEL-REQUEST-03-F: %s on a Completed event is refused 409 EVENT_NOT_CANCELLABLE (MSG-CR-02); the event is not cancelled and the request stays pending', async (_label, decision) => {
      // Arrange: EVT-1111 Past Gala (Confirmed, ended T-3h) with a pending request, then marked Completed
      const eventId = await seedEvent({ status: 'Confirmed', start: PAST_START, end: PAST_END, name: 'Past Gala' });
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;
      // SPM-153 has no route in this repository: the Completed state is written directly
      await pool.query(`UPDATE events SET status = 'Completed' WHERE id = $1`, [eventId]);
      const before = await snapshot(eventId);

      // Act
      const response = await decide(coo1, requestId, { decision }).expect(409);

      // Assert: [code, message]; the event stays Completed; the stored request status is recorded as pending and displays closed
      expect([response.body.code, response.body.message]).toEqual(['EVENT_NOT_CANCELLABLE', MSG_NOT_CANCELLABLE]);
      expect(await snapshot(eventId)).toEqual(before);
      expect((await requestRows(eventId))[0].status).toBe('pending');
      expect((await getRequests(org1, eventId).expect(200)).body[0]).toMatchObject({ displayStatus: 'closed', closedNote: 'The event is already completed.' });
    });
  });

  /** CANCEL-REQUEST-03-G (SPEC, DERIVED D4): the Coordinator cancels the event directly while a request is pending. */
  describe('CANCEL-REQUEST-03-G: the Coordinator cancels directly while a request is pending', () => {
    // Kills: M1, M14b, M38
    it('CANCEL-REQUEST-03-G: the event is cancelled once, the request shows Closed, and a later accept is refused 409 EVENT_NOT_CANCELLABLE', async () => {
      // Arrange: pending request on a Confirmed EVT-1105 clone
      const { eventId } = await seedGala();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;

      // Act 1: COO-01 cancels directly (SPM-136)
      await directCancel(coo1, eventId).expect(200);
      const afterDirect = await snapshot(eventId);
      // Act 2: COO-01 tries to accept the old request
      const response = await decide(coo1, requestId, { decision: 'accept' }).expect(409);

      // Assert: refused; the event was cancelled once (one history row, one notice per recipient) and nothing was written by the refusal
      expect([response.body.code, response.body.message]).toEqual(['EVENT_NOT_CANCELLABLE', MSG_NOT_CANCELLABLE]);
      expect(await snapshot(eventId)).toEqual(afterDirect);
      expect(afterDirect.history).toHaveLength(1);
      expect(afterDirect.notifications).toHaveLength(6);
      // The final request status is recorded: stored pending, displayed closed with "already cancelled"
      expect((await requestRows(eventId))[0].status).toBe('pending');
      expect((await getRequests(org1, eventId).expect(200)).body[0]).toMatchObject({ displayStatus: 'closed', closedNote: 'The event is already cancelled.' });
    });
  });

  /** CANCEL-REQUEST-03-SUP-INPUT (DERIVED D7): a bad decision body is refused before any write. */
  describe('CANCEL-REQUEST-03-SUP-INPUT: the decision body', () => {
    // Kills: M18a, M18b, M38
    it.each([
      ['an unknown decision', { decision: 'approve' }, 'INVALID_DECISION', MSG_INVALID_DECISION],
      ['a missing decision', {}, 'INVALID_DECISION', MSG_INVALID_DECISION],
      ['an upper-case decision', { decision: 'Accept' }, 'INVALID_DECISION', MSG_INVALID_DECISION],
      ['a client status field', { decision: 'accept', status: 'accepted' }, 'INVALID_REQUEST', MSG_INVALID_REQUEST],
    ])('CANCEL-REQUEST-03-SUP-INPUT: %s is refused 400 and the request and event are unchanged', async (_label, body, code, message) => {
      // Arrange
      const { eventId } = await seedGala();
      const requestId = await seedRequest(eventId);
      const before = await snapshot(eventId);

      // Act
      const response = await decide(coo1, requestId, body).expect(400);

      // Assert
      expect([response.body.code, response.body.message]).toEqual([code, message]);
      expect((await requestRows(eventId))[0].status).toBe('pending');
      expect(await snapshot(eventId)).toEqual(before);
    });
  });

  // ===================================================================== AC4

  /** CANCEL-REQUEST-04-A (SPEC): accepting changes the event status to Cancelled everywhere it is shown. */
  describe('CANCEL-REQUEST-04-A: acceptance cancels the event in every view', () => {
    // Kills: M1, M10a, M12c, M38, M9
    it('CANCEL-REQUEST-04-A: the organiser list, the coordinator queue and the event read all say cancelled, and the DB says Cancelled', async () => {
      // Arrange: pending request on a Confirmed EVT-1105 clone
      const { eventId } = await seedGala();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;

      // Act
      await decide(coo1, requestId, { decision: 'accept' }).expect(200);

      // Assert: the three views (twice, as a reload) and the database
      for (let reload = 0; reload < 2; reload += 1) {
        const organiserList = (await http().get('/api/events').set('Cookie', org1.cookie).expect(200)).body as { id: string; status: string }[];
        expect(organiserList.find((e) => e.id === eventId)?.status).toBe('cancelled');
        const queue = (await http().get('/api/coordinator/queue').set('Cookie', coo1.cookie).expect(200)).body as { id: string; status: string }[];
        expect(queue.find((e) => e.id === eventId)?.status).toBe('cancelled');
        const detail = await http().get(`/api/events/${eventId}`).set('Cookie', coo1.cookie).expect(200);
        expect(detail.body.status).toBe('cancelled');
      }
      expect(await statusOf(eventId)).toBe('Cancelled');
    });
  });

  /** CANCEL-REQUEST-04-B (SPEC, S6): acceptance has the same effects as SPM-136. */
  describe('CANCEL-REQUEST-04-B: acceptance triggers the SPM-136 effects', () => {
    // Kills: M1, M10a, M12a, M12c, M38, M9
    it('CANCEL-REQUEST-04-B: bookings and equipment are released, registrations and the waiting list are Cancelled, six recipients are notified once', async () => {
      // Arrange: EVT-1105 clone with two Approved bookings, Projector x2 Reserved, ATT-01 to 03 Registered, ATT-04 Waitlisted
      const { eventId } = await seedGala();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;

      // Act
      await decide(coo1, requestId, { decision: 'accept' }).expect(200);

      // Assert: bookings released at T0
      const bookings = await pool.query('SELECT status, released_at FROM venue_bookings WHERE event_id = $1', [eventId]);
      expect(bookings.rows.map((row) => row.status)).toEqual(['released', 'released']);
      expect(bookings.rows.every((row) => row.released_at.toISOString() === T0)).toBe(true);
      // Assert: equipment released
      const equipment = await pool.query('SELECT equipment_name, status FROM equipment_reservations WHERE event_id = $1', [eventId]);
      expect(equipment.rows).toEqual([{ equipment_name: 'Projector', status: 'Released' }]);
      // Assert: registrations and the waiting list entry Cancelled with the SPM-136 reason
      const registrations = await pool.query('SELECT attendee_id, status, cancellation_reason FROM event_registrations WHERE event_id = $1', [eventId]);
      expect(registrations.rows).toHaveLength(4);
      for (const row of registrations.rows.filter((r) => r.attendee_id !== att4.uid))
        expect(row).toMatchObject({ status: 'Cancelled', cancellation_reason: 'Event cancelled' });
      // The waiting-list entry (ATT-04) is Cancelled too (SPM-138 releaser; it carries no reason)
      expect(registrations.rows.find((r) => r.attendee_id === att4.uid)?.status).toBe('Cancelled');
      // Assert: ORG-01, COO-01 and ATT-01 to ATT-04 are each notified exactly once, with the SPM-136 notice and nothing else
      const notices = await pool.query('SELECT recipient_id, type, message FROM notifications WHERE related_event_id = $1 ORDER BY recipient_id', [eventId]);
      expect(notices.rows).toHaveLength(6);
      expect(notices.rows.map((row) => row.recipient_id).sort()).toEqual([org1.uid, coo1.uid, att1.uid, att2.uid, att3.uid, att4.uid].sort());
      for (const row of notices.rows) {
        // The waiting-list attendee's notice is the SPM-138 text (MSG-WL-06); everyone else gets the SPM-136 text
        const expected = row.recipient_id === att4.uid ? `${CANCELLED_NOTICE} Your waitlist place is cancelled.` : CANCELLED_NOTICE;
        expect(row).toMatchObject({ type: 'EventCancelled', message: expected });
      }
    });
  });

  /** CANCEL-REQUEST-04-C (SPEC, DERIVED D2): a failure during cancellation leaves the request pending and the event unchanged. */
  describe('CANCEL-REQUEST-04-C: a failure during cancellation rolls everything back', () => {
    // Kills: M10a, M12c, M38, M8, M8b, M9
    it('CANCEL-REQUEST-04-C: a failing release gives a generic 500, the request stays pending and nothing changed; the retry succeeds', async () => {
      // Arrange: EVT-1105 clone with a pending request; the last releaser throws (fault injection)
      const fault: EventReleaser = { name: 'fault', release: async () => { throw new Error('boom: equipment release failed'); } };
      await buildApp([...DEFAULT_RELEASERS, fault]);
      const { eventId } = await seedGala();
      const requestId = await seedRequest(eventId);
      const before = await snapshot(eventId);

      // Act 1: COO-01 accepts while the fault is injected
      const failed = await decide(coo1, requestId, { decision: 'accept' }).expect(500);

      // Assert 1: no stack trace or internal text; request pending; event, bookings, notifications, history unchanged
      expect(JSON.stringify(failed.body)).not.toMatch(/boom|equipment release|stack|\sat\s/i);
      const rows = await requestRows(eventId);
      expect(rows[0]).toMatchObject({ status: 'pending', decided_by_id: null, decided_at: null });
      expect(await snapshot(eventId)).toEqual(before);

      // Act 2: the fault is removed and the same request is accepted again
      await buildApp();
      const retry = await decide(coo1, requestId, { decision: 'accept' }).expect(200);

      // Assert 2
      expect(retry.body.request.status).toBe('accepted');
      expect(await statusOf(eventId)).toBe('Cancelled');
    });
  });

  /** CANCEL-REQUEST-04-D (SPEC with deviation): acceptance cancels from each eligible status. */
  describe('CANCEL-REQUEST-04-D: acceptance cancels from each eligible status', () => {
    // Kills: M1, M10a, M12c, M2b, M38, M9
    it.each([
      ['Submitted (clone assigned to COO-01, replaces EVT-1102)', 'Submitted'],
      ['Approved (EVT-1103)', 'Approved'],
      ['Planning (EVT-1104 with a hold)', 'Planning'],
      ['Confirmed (EVT-1105)', 'Confirmed'],
    ])('CANCEL-REQUEST-04-D: %s becomes Cancelled when the request is accepted', async (_label, status) => {
      // Arrange: a pending request on an event in the status under test
      let eventId: string;
      let holdId: string | undefined;
      if (status === 'Planning') ({ eventId, bookingId: holdId } = await seedPlanningWithHold());
      else if (status === 'Confirmed') eventId = (await seedGala()).eventId;
      else eventId = await seedEvent({ status });
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;

      // Act
      await decide(coo1, requestId, { decision: 'accept' }).expect(200);

      // Assert: Cancelled; the active hold on the Planning event is released
      expect(await statusOf(eventId)).toBe('Cancelled');
      if (holdId) {
        const hold = await pool.query('SELECT status, released_at FROM venue_bookings WHERE id = $1', [holdId]);
        expect(hold.rows[0].status).toBe('released');
        expect(hold.rows[0].released_at.toISOString()).toBe(T0);
      }
    });
  });

  /** CANCEL-REQUEST-04-E (SPEC): a cancelled event accepts no further requests, decisions or arrangement changes. */
  describe('CANCEL-REQUEST-04-E: a cancelled event is closed to requests, decisions and arrangement changes', () => {
    // Kills: M1, M10a, M12c, M15, M2d, M31, M38, M4c, M9
    it('CANCEL-REQUEST-04-E: a new request is 409 MSG-CR-02, the old request is 409 MSG-CR-06, and a booking change is 409 MSG-CN-04', async () => {
      // Arrange: EVT-1105 clone cancelled through an accepted request
      const { eventId, bookingA } = await seedGala();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;
      await decide(coo1, requestId, { decision: 'accept' }).expect(200);
      const before = await snapshot(eventId);

      // Act 1: ORG-01 sends a new cancellation request
      const again = await postRequest(org1, eventId).expect(409);
      // Act 2: COO-01 sends a decision on the old request
      const old = await decide(coo1, requestId, { decision: 'decline' }).expect(409);
      // Act 3: COO-01 changes a venue booking (removes the venue request)
      const booking = await http().delete(`/api/events/${eventId}/venue-requests/${bookingA}`).set('Cookie', coo1.cookie).send({}).expect(409);

      // Assert: [code, message] for each; the event remains Cancelled and nothing changed
      expect([again.body.code, again.body.message]).toEqual(['EVENT_NOT_CANCELLABLE', MSG_NOT_CANCELLABLE]);
      expect([old.body.code, old.body.message]).toEqual(['CANCELLATION_REQUEST_DECIDED', MSG_DECIDED]);
      expect([booking.body.code, booking.body.message]).toEqual(['EVENT_CANCELLED', MSG_CN_04]);
      expect(await statusOf(eventId)).toBe('Cancelled');
      expect(await snapshot(eventId)).toEqual(before);
    });
  });

  // ===================================================================== AC5

  /** CANCEL-REQUEST-05-A (SPEC): a decline leaves the event's status and arrangements unchanged. */
  describe('CANCEL-REQUEST-05-A: a decline leaves the event unchanged', () => {
    // Kills: M1, M11, M12b, M18d, M38
    it('CANCEL-REQUEST-05-A: status Confirmed, bookings Approved, equipment Reserved, registrations and the waiting entry equal the snapshot', async () => {
      // Arrange: EVT-1105 clone with a pending request; snapshot of every related table
      const { eventId } = await seedGala();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;
      const before = await snapshot(eventId);

      // Act: COO-01 declines
      await decide(coo1, requestId, { decision: 'decline' }).expect(200);

      // Assert: every table equals the snapshot; spot checks of the literals the case names
      const after = await snapshot(eventId);
      expect(after).toEqual(before);
      expect(after.event.status).toBe('Confirmed');
      expect(after.bookings.map((row) => row.status)).toEqual(['approved', 'approved']);
      expect(after.equipment.map((row) => row.status)).toEqual(['Reserved']);
      expect(after.registrations.map((row) => row.status).sort()).toEqual(['Registered', 'Registered', 'Registered', 'Waitlisted']);
      expect((await requestRows(eventId))[0].status).toBe('declined');
    });
  });

  /** CANCEL-REQUEST-05-B (SPEC): a decline does not disturb a Planning event with an active tentative hold. */
  describe('CANCEL-REQUEST-05-B: a decline keeps the tentative hold', () => {
    // Kills: M1, M11, M12b, M18d, M2b, M38
    it('CANCEL-REQUEST-05-B: status Planning, the pending booking and its hold expiry are unchanged and the queue shows the hold active', async () => {
      // Arrange: EVT-1104 clone, Planning, VB-1104 Pending with a hold until T+2d 12:00 SGT, pending request
      const { eventId, bookingId } = await seedPlanningWithHold();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;
      const before = await snapshot(eventId);

      // Act
      await decide(coo1, requestId, { decision: 'decline' }).expect(200);

      // Assert: status, booking and hold equal the snapshot; the expiry is exactly as seeded; released_at is null
      const after = await snapshot(eventId);
      expect(after).toEqual(before);
      expect(after.event.status).toBe('Planning');
      const hold = await pool.query('SELECT status, hold_expires_at, released_at FROM venue_bookings WHERE id = $1', [bookingId]);
      expect(hold.rows[0].status).toBe('pending');
      expect(hold.rows[0].hold_expires_at.toISOString()).toBe(HOLD_EXPIRY);
      expect(hold.rows[0].released_at).toBeNull();
      // The coordinator queue still shows the hold as active with the same expiry
      const queue = (await http().get('/api/coordinator/queue').set('Cookie', coo1.cookie).expect(200)).body as {
        id: string;
        status: string;
        queue: { holds: { expiresAt: string; state: string }[] };
      }[];
      const row = queue.find((e) => e.id === eventId);
      expect(row?.status).toBe('planning');
      expect(row?.queue.holds).toEqual([expect.objectContaining({ expiresAt: HOLD_EXPIRY, state: 'ACTIVE' })]);
    });
  });

  /** CANCEL-REQUEST-05-C (SPEC, S7): a decline sends no notices and writes no status change. */
  describe('CANCEL-REQUEST-05-C: a decline sends no notices', () => {
    // Kills: M1, M12a, M12b, M18d, M38
    it('CANCEL-REQUEST-05-C: no notification of any kind exists for the event and no status history row is written', async () => {
      // Arrange: EVT-1105 clone, attendees with zero notifications
      const { eventId } = await seedGala();
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;
      // Assert 0: filing the request notified nobody either (S7: nothing is sent for a request)
      expect((await snapshot(eventId)).notifications).toHaveLength(0);

      // Act
      await decide(coo1, requestId, { decision: 'decline' }).expect(200);

      // Assert: no notification related to the event, none for any attendee, the organiser or the coordinator, and no history row
      const after = await snapshot(eventId);
      expect(after.notifications).toHaveLength(0);
      const forPeople = await pool.query('SELECT 1 FROM notifications WHERE recipient_id = ANY($1::text[])', [[att1.uid, att2.uid, att3.uid, att4.uid, org1.uid, coo1.uid]]);
      expect(forPeople.rowCount).toBe(0);
      expect(after.history).toHaveLength(0);
    });
  });

  /** CANCEL-REQUEST-05-D (SPEC): the event continues its normal lifecycle after a declined request. */
  describe('CANCEL-REQUEST-05-D: the lifecycle continues after a decline', () => {
    // Kills: M1, M12a, M18d, M19, M2b, M38
    it('CANCEL-REQUEST-05-D: the event is confirmed (SPM-135) and a new request is then accepted as pending', async () => {
      // Arrange: EVT-1104 clone, Planning with complete arrangements (Approved venue, equipment reserved, safety Approved), declined request
      safetyApproved = true;
      const eventId = await seedEvent({ status: 'Planning', name: 'Career Fair' });
      const venue = await seedVenue('Career Hall');
      await seedBooking(eventId, venue, 'approved');
      await seedEquipment(eventId, 'Projector', 1, 'Reserved');
      const requestId = (await postRequest(org1, eventId).expect(201)).body.request.id as string;
      await decide(coo1, requestId, { decision: 'decline' }).expect(200);

      // Act 1: COO-01 confirms the event
      const confirmed = await http().post(`/api/events/${eventId}/status-change`).set('Cookie', coo1.cookie).send({ targetStatus: 'Confirmed' }).expect(200);
      // Act 2: ORG-01 sends a new cancellation request
      const again = await postRequest(org1, eventId, { reason: 'Changed our mind' }).expect(201);

      // Assert: Confirmed; a new pending request next to the declined one
      expect(confirmed.body.status).toBe('Confirmed');
      expect(await statusOf(eventId)).toBe('Confirmed');
      expect(again.body.request.status).toBe('pending');
      // Both requests carry the frozen instant T0, so their row order is not defined: compare as a set
      expect((await requestRows(eventId)).map((row) => row.status).sort()).toEqual(['declined', 'pending']);
    });
  });

  /** A fresh login for the same account (a new session cookie), for 02-F. */
  async function loginAgain(session: Session): Promise<Session> {
    const email = (await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [session.uid])).rows[0].email;
    const attempt = await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = (attempt.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { ...session, cookie: cookie.split(';', 1)[0] };
  }
});
