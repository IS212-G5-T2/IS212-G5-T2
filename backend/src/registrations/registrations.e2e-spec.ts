/*
 * SPM-61 attendee registration against the real Nest pipeline and PostgreSQL.
 * Time comes from an injected, frozen clock; no test sleeps or reads the wall
 * clock. Test Case IDs are ASSUMED from the task's matrix because
 * docs/specs/SPM-61-test-cases.md is absent; quotes are Jira AC wording.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { CLOCK } from './clock.js';
import { MESSAGES, formatSgt } from './messages.js';

const database = process.env.DATABASE_URL;
// Frozen "now"; every fixture time is an offset from it.
const T0 = new Date('2030-06-01T00:00:00.000Z');
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);
const details = { fullName: 'Alice Tan', email: 'alice@example.com', contactNumber: '91234567', specialRequirements: 'Vegetarian meal' };

describe.skipIf(!database)('SPM-61 event registration (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let now = T0;
  const eventIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    now = T0;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds.splice(0)]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds.splice(0)]);
  });

  /** Creates a user with one role and returns a session cookie. */
  async function createUser(role: string, name = 'Alice Tan') {
    const email = `spm61-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 12))) RETURNING id`,
      [email, name],
    );
    const uid = created.rows[0].id;
    userIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('connectsphere_session='))!;
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  /** Seeds an event whose registration window is expressed as offsets from T0. */
  async function seedEvent(options: { opens?: number | null; closes?: number | null; limit?: number; status?: string; enabled?: boolean; name?: string } = {}) {
    const id = randomUUID();
    eventIds.push(id);
    const { opens = -HOUR, closes = 24 * HOUR, limit = 50, status = 'Confirmed', enabled = true, name = 'Open Event' } = options;
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         start_date_time, end_date_time, expected_attendance, registration_enabled, registration_limit,
         registration_opens_at, registration_closes_at, status, submission_key)
       VALUES ($1,'organiser-x','Organiser','o@example.com',$2,'Purpose',$3,$4,50,$5,$6,$7,$8,$9,$10)`,
      [id, name, at(48 * HOUR), at(50 * HOUR), enabled, limit, opens === null ? null : at(opens), closes === null ? null : at(closes), status, randomUUID()],
    );
    return id;
  }

  const post = (eventId: string, cookie: string, body: unknown = details) =>
    request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', cookie).send(body as object);
  const rows = (eventId: string) =>
    pool.query('SELECT * FROM event_registrations WHERE event_id = $1', [eventId]).then((r) => r.rows);

  describe('EVENT-REG-01-A: registration open (AC1: "registration button only if the period is open")', () => {
    // Expected: the event API reports registrationOpen=true while the window is open.
    it('event detail reports registrationOpen=true', async () => {
      const id = await seedEvent();
      const { cookie } = await createUser('ATTENDEE');
      const res = await request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie).expect(200);
      expect(res.body.registrationOpen).toBe(true);
    });
  });

  describe('SPM-61: only Confirmed events are visible and registrable to attendees', () => {
    // Expected: a Confirmed event is listed as open and accepts a registration (one row stored).
    it('lists a Confirmed event and accepts a registration for it', async () => {
      const id = await seedEvent({ status: 'Confirmed' });
      const { cookie } = await createUser('ATTENDEE');
      const list = await request(app.getHttpServer()).get('/api/events').set('Cookie', cookie).expect(200);
      expect(list.body.find((e: { id: string }) => e.id === id)).toMatchObject({ registrationOpen: true });
      await post(id, cookie).expect(201);
      expect(await rows(id)).toHaveLength(1);
    });
    // Expected: an Approved event is absent from the attendee list.
    it('does not list an Approved event to attendees', async () => {
      const id = await seedEvent({ status: 'Approved' });
      const { cookie } = await createUser('ATTENDEE');
      const list = await request(app.getHttpServer()).get('/api/events').set('Cookie', cookie).expect(200);
      expect(list.body.find((e: { id: string }) => e.id === id)).toBeUndefined();
    });
    // Expected: an Approved event cannot be opened or registered for, and nothing is stored.
    it('hides an Approved event: detail 404, POST 404, no registration row', async () => {
      const id = await seedEvent({ status: 'Approved' });
      const { cookie } = await createUser('ATTENDEE');
      await request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie).expect(404);
      await post(id, cookie).expect(404);
      expect(await rows(id)).toHaveLength(0);
    });
    // Expected: the browse list tells each attendee only about their own registration.
    it('reports myRegistrationStatus per attendee in the browse list', async () => {
      const id = await seedEvent();
      const alice = await createUser('ATTENDEE');
      const ben = await createUser('ATTENDEE', 'Ben Lim');
      await post(id, alice.cookie).expect(201);
      const mine = await request(app.getHttpServer()).get('/api/events').set('Cookie', alice.cookie).expect(200);
      expect(mine.body.find((e: { id: string }) => e.id === id).myRegistrationStatus).toBe('registered');
      const theirs = await request(app.getHttpServer()).get('/api/events').set('Cookie', ben.cookie).expect(200);
      expect(theirs.body.find((e: { id: string }) => e.id === id).myRegistrationStatus).toBeUndefined();
    });
  });

  describe('EVENT-REG-01-B: not yet open', () => {
    // Expected: registrationOpen=false and a POST is refused with the "opens on" message.
    it('reports registrationOpen=false and POST -> 422 registration_not_open (MSG-02)', async () => {
      const id = await seedEvent({ opens: 2 * HOUR });
      const { cookie } = await createUser('ATTENDEE');
      const detail = await request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie).expect(200);
      expect(detail.body.registrationOpen).toBe(false);
      const res = await post(id, cookie).expect(422);
      expect(res.body).toMatchObject({ code: 'registration_not_open', message: MESSAGES.notOpen(at(2 * HOUR)) });
      expect(res.body.message).toContain(formatSgt(at(2 * HOUR)));
      expect(await rows(id)).toHaveLength(0);
    });
  });

  describe('EVENT-REG-01-C / EVENT-REG-02-A: closed (AC2: "error message if I register after the period has closed")', () => {
    // [A] time-based close: registrationOpen=false and POST -> 422 MSG-01, nothing stored.
    it('[A] time-based close: POST -> 422 registration_closed (MSG-01) and no row', async () => {
      const id = await seedEvent({ opens: -48 * HOUR, closes: -HOUR });
      const { cookie } = await createUser('ATTENDEE');
      const detail = await request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie).expect(200);
      expect(detail.body.registrationOpen).toBe(false);
      const res = await post(id, cookie).expect(422);
      expect(res.body).toMatchObject({ code: 'registration_closed', message: 'Registration has closed for this event.' });
      expect(await rows(id)).toHaveLength(0);
    });
    // [B] manual close by organiser: the event schema has no manual-close field (D17).
    it.todo('[B] Blocked: no manual_close_at field exists in the events schema (D17)');
    // Registration disabled on the event is treated as closed.
    it('registration disabled -> 422 registration_closed', async () => {
      const id = await seedEvent({ enabled: false });
      const { cookie } = await createUser('ATTENDEE');
      await post(id, cookie).expect(422);
    });
  });

  describe('EVENT-REG-01-BND-1 / EVENT-REG-02-BND-1: registration window instants (injected clock)', () => {
    // Expected: inclusive at open, exclusive at close, driven only by the injected clock.
    it('[A] 1s before open: registrationOpen=false, POST -> 422 MSG-02', async () => {
      const id = await seedEvent({ opens: 0, closes: HOUR });
      const { cookie } = await createUser('ATTENDEE');
      now = at(-1000);
      const detail = await request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie).expect(200);
      expect(detail.body.registrationOpen).toBe(false);
      expect((await post(id, cookie).expect(422)).body.code).toBe('registration_not_open');
    });
    it('[B] exactly at open: registrationOpen=true, POST -> 201', async () => {
      const id = await seedEvent({ opens: 0, closes: HOUR });
      const { cookie } = await createUser('ATTENDEE');
      now = at(0);
      const detail = await request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie).expect(200);
      expect(detail.body.registrationOpen).toBe(true);
      await post(id, cookie).expect(201);
    });
    it('[C] 1 min before close: registrationOpen=true, POST -> 201', async () => {
      const id = await seedEvent({ opens: 0, closes: HOUR });
      const { cookie } = await createUser('ATTENDEE');
      now = at(HOUR - 60_000);
      const detail = await request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie).expect(200);
      expect(detail.body.registrationOpen).toBe(true);
      await post(id, cookie).expect(201);
    });
    it('[D] exactly at close: registrationOpen=false, POST -> 422 MSG-01', async () => {
      const id = await seedEvent({ opens: 0, closes: HOUR });
      const { cookie } = await createUser('ATTENDEE');
      now = at(HOUR);
      const detail = await request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie).expect(200);
      expect(detail.body.registrationOpen).toBe(false);
      expect((await post(id, cookie).expect(422)).body.message).toBe(MESSAGES.closed);
    });
  });

  describe('EVENT-REG-03-A / EVENT-REG-04-A: successful registration (AC3, AC4: "confirmation message")', () => {
    // Expected: 201, MSG-06 with the event name, details stored, status registered.
    it('creates a registration and returns MSG-06', async () => {
      const id = await seedEvent({ name: 'Innovation Expo' });
      const { cookie, uid } = await createUser('ATTENDEE');
      const res = await post(id, cookie).expect(201);
      expect(res.body.message).toBe('Registration successful. You are registered for Innovation Expo.');
      expect(res.body.registration).toMatchObject({ eventId: id, attendeeId: uid, status: 'registered', fullName: 'Alice Tan', email: 'alice@example.com', contactNumber: '91234567', specialRequirements: 'Vegetarian meal' });
      expect(res.body.registration.id).toBeTruthy();
      const stored = await rows(id);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ attendee_id: uid, status: 'Registered', full_name: 'Alice Tan', contact_number: '91234567' });
      // The "me" endpoint now returns the same registration.
      const mine = await request(app.getHttpServer()).get(`/api/events/${id}/registrations/me`).set('Cookie', cookie).expect(200);
      expect(mine.body.registration.id).toBe(res.body.registration.id);
    });
  });

  describe('EVENT-REG-03-B / 03-C: server-side validation (AC3)', () => {
    // Expected: 400 with per-field errors and nothing persisted.
    it.each([
      ['missing name', { email: 'a@example.com' }, 'fullName'],
      ['bad email', { fullName: 'A', email: 'nope' }, 'email'],
      ['bad contact', { fullName: 'A', email: 'a@example.com', contactNumber: 'abc' }, 'contactNumber'],
    ])('%s -> 400 validation_error', async (_name, body, field) => {
      const id = await seedEvent();
      const { cookie } = await createUser('ATTENDEE');
      const res = await post(id, cookie, body).expect(400);
      expect(res.body).toMatchObject({ code: 'validation_error', message: MESSAGES.validation });
      expect(res.body.errors).toHaveProperty(field);
      expect(await rows(id)).toHaveLength(0);
    });
  });

  describe('EVENT-REG-03-D: server-controlled fields are rejected (D15)', () => {
    // Expected: 400 and no row when the client tries to set status or attendee.
    it('body with status/attendeeId -> 400 and nothing stored', async () => {
      const id = await seedEvent();
      const { cookie } = await createUser('ATTENDEE');
      const other = await createUser('ATTENDEE', 'Ben Lim');
      const res = await post(id, cookie, { ...details, status: 'Withdrawn', attendeeId: other.uid }).expect(400);
      expect(res.body.errors).toHaveProperty('status');
      expect(res.body.errors).toHaveProperty('attendeeId');
      expect(await rows(id)).toHaveLength(0);
    });
  });

  describe('EVENT-REG-03-SEC-1: literal storage', () => {
    // Expected: the exact literal string is stored; SQL text does no harm.
    it('stores script and SQL text literally', async () => {
      const id = await seedEvent();
      const { cookie } = await createUser('ATTENDEE');
      const payload = `<script>alert('x')</script>'); DROP TABLE event_registrations;--`;
      await post(id, cookie, { ...details, specialRequirements: payload }).expect(201);
      expect((await rows(id))[0].special_requirements).toBe(payload);
      // Table still exists and holds the row.
      expect(await rows(id)).toHaveLength(1);
    });
  });

  describe('EVENT-REG-05-A: duplicate registration (AC5: "cannot register twice")', () => {
    // Expected: second POST -> 409 MSG-05 and still exactly one row.
    it('second registration -> 409 already_registered (MSG-05)', async () => {
      const id = await seedEvent();
      const { cookie } = await createUser('ATTENDEE');
      await post(id, cookie).expect(201);
      const res = await post(id, cookie).expect(409);
      expect(res.body).toMatchObject({ code: 'already_registered', message: 'You are already registered for this event.' });
      expect(await rows(id)).toHaveLength(1);
    });
  });

  describe('EVENT-REG-05-B: concurrent duplicates (real database)', () => {
    // Expected: exactly one 201, remaining four 409, exactly one Registered row.
    it('five simultaneous POSTs -> one 201 and four 409', async () => {
      const id = await seedEvent();
      const { cookie } = await createUser('ATTENDEE');
      const responses = await Promise.all(Array.from({ length: 5 }, () => post(id, cookie)));
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      const stored = await rows(id);
      expect(stored).toHaveLength(1);
      expect(stored[0].status).toBe('Registered');
    });
  });

  describe('EVENT-REG-05-C: withdrawn and capacity (D16; capacity is a locked hard limit, no waitlist in R1)', () => {
    // Expected: a withdrawn attendee can register again; the same row is reactivated.
    it('re-registration after withdrawal -> 201 reusing the registration id', async () => {
      const id = await seedEvent();
      const { cookie, uid } = await createUser('ATTENDEE');
      const first = await post(id, cookie).expect(201);
      await pool.query(`UPDATE event_registrations SET status='Withdrawn' WHERE event_id=$1 AND attendee_id=$2`, [id, uid]);
      const mineWithdrawn = await request(app.getHttpServer()).get(`/api/events/${id}/registrations/me`).set('Cookie', cookie).expect(200);
      // SPM-120 (06-A reload persistence): /me now returns the latest registration of any
      // status, so a withdrawn one is visible; it was null before. Requirement-driven edit.
      expect(mineWithdrawn.body.registration).toMatchObject({ id: first.body.registration.id, status: 'withdrawn' });
      const second = await post(id, cookie, { ...details, fullName: 'Alice T.' }).expect(201);
      expect(second.body.registration.id).toBe(first.body.registration.id);
      const stored = await rows(id);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ status: 'Registered', full_name: 'Alice T.' });
    });
    // Expected: a full event refuses registration and stores nothing; concurrency cannot overflow.
    it('capacity 2 with 5 concurrent attendees -> exactly 2 succeed, rest 422 registration_full', async () => {
      const id = await seedEvent({ limit: 2 });
      const attendees = await Promise.all(Array.from({ length: 5 }, () => createUser('ATTENDEE')));
      const responses = await Promise.all(attendees.map((a) => post(id, a.cookie)));
      expect(responses.filter((r) => r.status === 201)).toHaveLength(2);
      const refused = responses.filter((r) => r.status === 422);
      expect(refused).toHaveLength(3);
      expect(refused[0].body.code).toBe('registration_full');
      expect(await rows(id)).toHaveLength(2);
    });
  });

  describe('EVENT-REG-05-SEC-1: authentication and roles (cross-cutting)', () => {
    // Expected: no session -> 401.
    it('[A] no session -> 401 and nothing stored', async () => {
      const id = await seedEvent();
      await request(app.getHttpServer()).post(`/api/events/${id}/registrations`).send(details).expect(401);
      expect(await rows(id)).toHaveLength(0);
    });
    // Expected: any non-attendee role -> 403 and nothing stored.
    it.each(['ORGANISER', 'COORDINATOR', 'VENUE_STAFF', 'TECH_SUPPORT'])('[B] %s -> 403', async (role) => {
      const id = await seedEvent();
      const { cookie } = await createUser(role);
      await post(id, cookie).expect(403);
      expect(await rows(id)).toHaveLength(0);
    });
    // Expected: an attendee only sees their own registration through /me.
    it('[C] /me never returns another attendee registration', async () => {
      const id = await seedEvent();
      const alice = await createUser('ATTENDEE');
      const ben = await createUser('ATTENDEE', 'Ben Lim');
      await post(id, alice.cookie).expect(201);
      const res = await request(app.getHttpServer()).get(`/api/events/${id}/registrations/me`).set('Cookie', ben.cookie).expect(200);
      expect(res.body.registration).toBeNull();
    });
    // Expected: an unpublished event is not discoverable by an attendee.
    it('[D] Submitted event -> 404 for an attendee', async () => {
      const id = await seedEvent({ status: 'Submitted' });
      const { cookie } = await createUser('ATTENDEE');
      await post(id, cookie).expect(404);
    });
    // Expected: a malformed event id is a 404, not a server error.
    it('[E] malformed id -> 404', async () => {
      const { cookie } = await createUser('ATTENDEE');
      await post('not-a-uuid', cookie).expect(404);
    });
  });
});
