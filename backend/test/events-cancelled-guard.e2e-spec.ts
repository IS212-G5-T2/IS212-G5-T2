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

/*
 * SPM-136 AC7: nobody can change the arrangements of a cancelled event (CANCEL-EVENT-07-A, 07-B).
 * Real PostgreSQL, frozen clock (T0 = 2026-10-12T04:00:00Z). Every existing mutation route that takes an
 * event is called against EVT-301 Cancelled; each must answer 409 EVENT_CANCELLED with MSG-CN-04 and
 * leave every table unchanged. Routes that do not exist in this repository are listed in the results
 * document as Blocked, not written here.
 *
 * Runs against TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 017 applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-136 guard tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const T0 = '2026-10-12T04:00:00.000Z';
const MSG_ARRANGEMENTS_LOCKED = 'This event has been cancelled and its arrangements cannot be changed.';

type Session = { uid: string; cookie: string };

describe.skipIf(!database)('SPM-136 cancelled events refuse every arrangement change (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let createdEventIds: string[];
  let createdUserIds: string[];
  let createdVenueIds: string[];
  let coordinator: Session;
  let organiser: Session;

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
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(T0) })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    // TR-136-08: bind the test server to 127.0.0.1 so supertest's 127.0.0.1 requests cannot reach another local listener.
    await app.listen(0, '127.0.0.1');
    coordinator = await createSession('COORDINATOR', 'Coordinator 1');
    organiser = await createSession('ORGANISER', 'Organiser 1');
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

  async function createSession(role: string, name: string): Promise<Session> {
    const email = `e2e-guard-${randomUUID()}@example.com`;
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

  /** EVT-301 "Annual Gala Dinner", Cancelled, assigned to COO-01, submitted by ORG-01, with one Main Hall booking and one Projector line. */
  async function seedCancelledEvent() {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key,
         cancelled_by, cancelled_at)
       VALUES ($1,$2,'Organiser','organiser@example.test','Annual Gala Dinner','Purpose','Description',
               '2026-11-05T02:00:00Z','2026-11-05T04:00:00Z',80,'Banquet',ARRAY['Catering'],ARRAY[]::text[],'',
               'Cancelled',$3,'Coordinator 1',$4,$5,$6)`,
      [id, organiser.uid, coordinator.uid, randomUUID(), coordinator.uid, T0],
    );
    createdEventIds.push(id);
    const venue = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1,'Main Hall',$2,200,'Open weekdays',0,0) RETURNING id`,
      [coordinator.uid, `Level 1 ${randomUUID()}`],
    );
    createdVenueIds.push(venue.rows[0].id);
    const booking = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status, released_at)
       VALUES ($1,$2,'2026-11-05T02:00:00Z','2026-11-05T04:00:00Z','released',$3) RETURNING id`,
      [id, venue.rows[0].id, T0],
    );
    const line = await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status, released_at)
       VALUES ($1,'Projector',2,'Released',$2) RETURNING id`,
      [id, T0],
    );
    return { eventId: id, bookingId: booking.rows[0].id, lineId: line.rows[0].id };
  }

  async function snapshot(eventId: string) {
    const [event, bookings, equipment, comments, safety, notifications, history] = await Promise.all([
      pool.query('SELECT status, purpose, cancelled_by, cancelled_at, updated_at FROM events WHERE id = $1', [eventId]),
      pool.query('SELECT id, status, venue_id, start_at, end_at FROM venue_bookings WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT id, equipment_name, quantity, status FROM equipment_reservations WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT id FROM event_comments WHERE event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT status FROM event_safety_checks WHERE event_id = $1', [eventId]),
      pool.query('SELECT id FROM notifications WHERE related_event_id = $1 ORDER BY id', [eventId]),
      pool.query('SELECT id FROM event_status_history WHERE event_id = $1 ORDER BY id', [eventId]),
    ]);
    return {
      event: event.rows[0],
      bookings: bookings.rows,
      equipment: equipment.rows,
      comments: comments.rows,
      safety: safety.rows,
      notifications: notifications.rows,
      history: history.rows,
    };
  }

  /** CANCEL-EVENT-07-A: every existing mutation of a cancelled event answers 409 MSG-CN-04 and changes nothing. */
  describe('CANCEL-EVENT-07-A: every arrangement mutation on EVT-301 Cancelled is refused with 409', () => {
    const unknownId = randomUUID();
    type Case = { label: string; actor: () => Session; method: 'patch' | 'post' | 'delete'; path: (id: string) => string; body?: object };
    const cases: Case[] = [
      { label: 'planning PATCH (event details)', actor: () => coordinator, method: 'patch', path: (id) => `/api/events/${id}/planning`, body: { purpose: 'Changed purpose' } },
      { label: 'flagged change resolve', actor: () => coordinator, method: 'post', path: (id) => `/api/events/${id}/planning/changes/${unknownId}/resolve`, body: { decision: 'confirm' } },
      { label: 'confirm no equipment', actor: () => coordinator, method: 'post', path: (id) => `/api/events/${id}/confirm-no-equipment` },
      { label: 'safety check request', actor: () => coordinator, method: 'post', path: (id) => `/api/events/${id}/safety-check/request` },
      { label: 'safety feedback resolve', actor: () => coordinator, method: 'post', path: (id) => `/api/events/${id}/safety-check/feedback/${unknownId}/resolve` },
      { label: 'safety feedback unresolve', actor: () => coordinator, method: 'delete', path: (id) => `/api/events/${id}/safety-check/feedback/${unknownId}/resolve` },
      { label: 'equipment request removal', actor: () => coordinator, method: 'delete', path: (id) => `/api/events/${id}/equipment-reservations/${unknownId}` },
      { label: 'venue request removal', actor: () => coordinator, method: 'delete', path: (id) => `/api/events/${id}/venue-requests/${unknownId}` },
      { label: 'clarification create', actor: () => coordinator, method: 'post', path: (id) => `/api/events/${id}/clarifications`, body: { message: 'Is the hall still free?' } },
      { label: 'clarification reply', actor: () => organiser, method: 'post', path: (id) => `/api/events/${id}/clarifications/${unknownId}/reply`, body: { message: 'Yes.' } },
      { label: 'clarification resolve', actor: () => organiser, method: 'post', path: (id) => `/api/events/${id}/clarifications/${unknownId}/resolve` },
    ];

    it.each(cases)('$label answers 409 EVENT_CANCELLED and leaves every table unchanged', async ({ actor, method, path, body }) => {
      // Arrange: EVT-301 Cancelled with a released booking and a released Projector line
      const { eventId } = await seedCancelledEvent();
      const before = await snapshot(eventId);

      // Act
      const req = http()[method](path(eventId)).set('Cookie', actor().cookie);
      const response = await (body ? req.send(body) : req.send({})).expect(409);

      // Assert: literal code and MSG-CN-04; the database is unchanged
      expect(response.body).toMatchObject({ code: 'EVENT_CANCELLED', message: MSG_ARRANGEMENTS_LOCKED });
      expect(await snapshot(eventId)).toEqual(before);
    });
  });

  /**
   * CANCEL-EVENT-07-B (part): the Coordinator cannot move a cancelled event back to Confirmed or Planning,
   * and the Organiser's planning PATCH is refused as a non-coordinator (existing rule, see results).
   */
  describe('CANCEL-EVENT-07-B: other roles and status reversals cannot alter a cancelled event', () => {
    it('CANCEL-EVENT-07-B (D): COO-01 Confirmed is refused with 422 MSG-CF-05 and the status stays Cancelled', async () => {
      // Arrange
      const { eventId } = await seedCancelledEvent();

      // Act
      const response = await http()
        .post(`/api/events/${eventId}/status-change`)
        .set('Cookie', coordinator.cookie)
        .send({ targetStatus: 'Confirmed' })
        .expect(422);

      // Assert: MSG-CF-05 and the event row is unchanged
      expect(response.body).toMatchObject({ code: 'EVENT_NOT_CONFIRMABLE', message: 'A rejected or cancelled event cannot be confirmed.' });
      expect((await pool.query('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status).toBe('Cancelled');
    });

    it('CANCEL-EVENT-07-B (D): COO-01 Planning is refused with 422 INVALID_STATUS_TRANSITION and the status stays Cancelled', async () => {
      // Arrange
      const { eventId } = await seedCancelledEvent();

      // Act
      const response = await http()
        .post(`/api/events/${eventId}/status-change`)
        .set('Cookie', coordinator.cookie)
        .send({ targetStatus: 'Planning' })
        .expect(422);

      // Assert: ASSUMED code and text (Unknown in the Confluence pages)
      expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
      expect((await pool.query('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status).toBe('Cancelled');
    });

    it('CANCEL-EVENT-07-B (C): ORG-01 cannot edit the event details of a cancelled event (refused, unchanged)', async () => {
      // Arrange
      const { eventId } = await seedCancelledEvent();
      const before = await snapshot(eventId);

      // Act: the planning PATCH is coordinator-only, so the organiser is refused before the cancelled check
      const response = await http()
        .patch(`/api/events/${eventId}/planning`)
        .set('Cookie', organiser.cookie)
        .send({ purpose: 'Changed purpose' })
        .expect(403);

      // Assert: DEVIATION from the expected 409 MSG-CN-04 (recorded in the results document); nothing changed
      expect(response.body.message).toBe('Only the assigned coordinator can change event information.');
      expect(await snapshot(eventId)).toEqual(before);
    });
  });
});
