/*
 * Story: SPM-139 Configure Event Registration Period and Capacity (backend half).
 * Case IDs are the v2.0 IDs in docs/specs/SPM-139-test-cases.md (CONFIG-REG-01-A to 11-C). Cases that have no v2.0 ID
 * (the closing time passing, extending it, a stale version and the disabled-capacity increase) are CONFIG-REG-X-01 to X-04
 * and sit outside the v2.0 document. Frontend cases are in the colocated .test.tsx files.
 *
 * Real Nest pipeline, session login and PostgreSQL. Requires database/postgresql/init 001 to 024. Time comes only from the
 * injected CLOCK. Every test builds its own users and events with random ids, so no run depends on another's data.
 * Suite clock: T0 = 2026-10-18T12:00:00+08:00. Event start 2026-11-07 18:00 SGT unless a test says otherwise.
 *
 * ASSUMPTION index: the wording and the code names of the ASSUMED messages come from backend/src/registrations/settings;
 * these tests assert the code and the text there.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

const database = process.env.DATABASE_URL;
const PASSWORD = 'password123';
const HOUR = 3_600_000;
const T0 = new Date('2026-10-18T12:00:00+08:00');
const START = '2026-11-07T18:00:00+08:00';
const NAME = 'Registration Settings Night';

/** SET-OK from the resolved oracle (2.6): enabled, opens 19 Oct 09:00 SGT, closes 28 Oct 23:59 SGT, capacity 50. */
const SET_OK = {
  registrationEnabled: true,
  registrationOpensAt: '2026-10-19T09:00:00+08:00',
  registrationClosesAt: '2026-10-28T23:59:00+08:00',
  capacity: 50,
};

interface Who {
  uid: string;
  cookie: string;
}

describe.skipIf(!database)('SPM-139 registration settings (e2e, PostgreSQL)', () => {
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
    await app.listen(0);
  });
  afterEach(async () => {
    await app?.close();
    await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds.splice(0)]);
    // Venues owned by test users (11-B) must go before their owners.
    await pool.query('DELETE FROM venue_bookings WHERE venue_id IN (SELECT id FROM venues WHERE owner_user_id::text = ANY($1::text[]))', [userIds]);
    await pool.query('DELETE FROM venues WHERE owner_user_id::text = ANY($1::text[])', [userIds]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds.splice(0)]);
  });

  async function user(roles: string[], name: string): Promise<Who> {
    const email = `spm139-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES (gen_random_uuid(), $1, $2, crypt($3, gen_salt('bf', 4))) RETURNING id`,
      [email, name, PASSWORD],
    );
    const uid = created.rows[0].id;
    userIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = ANY($2::text[])', [
      uid,
      roles,
    ]);
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: PASSWORD }).expect(201);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('connectsphere_session='))!;
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  /** An event with the given status and assigned coordinator. Registration starts disabled unless a test enables it. */
  async function seedEvent(options: {
    coordinatorId: string;
    status?: string;
    enabled?: boolean;
    opens?: string | null;
    closes?: string | null;
    limit?: number;
    start?: string;
  }) {
    const id = randomUUID();
    eventIds.push(id);
    const start = new Date(options.start ?? START);
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         start_date_time, end_date_time, expected_attendance, registration_enabled, registration_limit,
         registration_opens_at, registration_closes_at, status, submission_key, coordinator_id, coordinator_name,
         rejection_reason)
       VALUES ($1,'organiser-x','Organiser','o@example.com',$2,'Purpose',$3,$4,50,$5,$6,$7,$8,$9,$1,$10,'Coordinator',$11)`,
      [
        id,
        NAME,
        start,
        new Date(start.getTime() + 2 * HOUR),
        options.enabled ?? false,
        options.limit ?? 5,
        options.opens ?? null,
        options.closes ?? null,
        options.status ?? 'Confirmed',
        options.coordinatorId,
        // events_rejection_reason_check requires a 10 to 500 character reason for a Rejected event.
        options.status === 'Rejected' ? 'Venue is not available on this date' : null,
      ],
    );
    return id;
  }

  /** A registration row with the given stored status: Registered, Waitlisted, Removed or Withdrawn. */
  async function seedRow(eventId: string, attendee: Who, status: string, joinedAt = T0) {
    await pool.query(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, contact_number, joined_at, waitlist_seq)
       VALUES ($1,$2,$3,'Attendee','a@example.com','91234567',$4, nextval('event_registrations_waitlist_seq'))`,
      [eventId, attendee.uid, status, joinedAt],
    );
  }

  const get = (eventId: string, who?: Who) => {
    const req = request(app.getHttpServer()).get(`/api/events/${eventId}/registration-settings`);
    return who ? req.set('Cookie', who.cookie) : req;
  };
  const put = (eventId: string, who: Who | undefined, body: object) => {
    const req = request(app.getHttpServer()).put(`/api/events/${eventId}/registration-settings`);
    return (who ? req.set('Cookie', who.cookie) : req).send(body);
  };
  const statusOf = async (eventId: string, attendee: Who) =>
    (await pool.query<{ status: string }>('SELECT status FROM event_registrations WHERE event_id = $1 AND attendee_id = $2', [
      eventId,
      attendee.uid,
    ])).rows[0]?.status;

  // Oracles below are literals from the resolved table; a version is 0 until a save happens (D5, 2.6).

  // 01-A: the coordinator enables registration and saves SET-OK; the settings persist and the version increases.
  it('CONFIG-REG-01-A: saving SET-OK persists the settings and bumps the version to 1', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator A');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });

    const saved = await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(200);
    expect(saved.body.message).toBe('Registration settings saved.');

    const read = await get(eventId, coordinator).expect(200);
    expect(read.body).toMatchObject({
      registrationEnabled: true,
      registrationOpensAt: '2026-10-19T01:00:00.000Z',
      registrationClosesAt: '2026-10-28T15:59:00.000Z',
      capacity: 50,
      version: 1,
    });
  });

  // 01-B: disabling keeps the saved values, and a direct registration is refused with REGISTRATION_DISABLED.
  it('CONFIG-REG-01-B: disabling keeps the values and refuses registration with REGISTRATION_DISABLED', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator B');
    const attendee = await user(['ATTENDEE'], 'Attendee B');
    const eventId = await seedEvent({
      coordinatorId: coordinator.uid,
      enabled: true,
      opens: '2026-10-17T01:00:00Z',
      closes: '2026-11-02T15:59:00Z',
      limit: 10,
    });
    for (const label of ['1', '2', '3', '4', '5']) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed ${label}`), 'Registered');

    await put(eventId, coordinator, { registrationEnabled: false, version: 0 }).expect(200);

    const read = await get(eventId, coordinator).expect(200);
    expect(read.body).toMatchObject({
      registrationEnabled: false,
      registrationOpensAt: '2026-10-17T01:00:00.000Z',
      registrationClosesAt: '2026-11-02T15:59:00.000Z',
      capacity: 10,
    });
    const refused = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/registrations`)
      .set('Cookie', attendee.cookie)
      .send({ fullName: 'Attendee B', email: 'b@example.com', contactNumber: '91234567' })
      .expect(422);
    expect(refused.body.code).toBe('REGISTRATION_DISABLED');
    expect(refused.body.message).toBe('Registration is not available for this event.');
  });

  // 01-C: an event never configured reads as disabled.
  it('CONFIG-REG-01-C: a never-enabled event reads as disabled with version 0', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator C');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid });
    const read = await get(eventId, coordinator).expect(200);
    expect(read.body).toMatchObject({ registrationEnabled: false, version: 0 });
  });

  // 01-D: only the assigned coordinator reads or changes the settings; no token is 401.
  it.each([
    ['another coordinator', ['COORDINATOR'], 'Other Coordinator'],
    ['a lead who is not assigned', ['COORDINATOR_LEAD'], 'Lead'],
    ['an organiser', ['ORGANISER'], 'Organiser'],
    ['an attendee', ['ATTENDEE'], 'Attendee'],
  ])('CONFIG-REG-01-D: %s gets 403 on GET and PUT', async (_label, roles, name) => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator D');
    const other = await user(roles, name);
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await get(eventId, other).expect(403);
    await put(eventId, other, { ...SET_OK, version: 0 }).expect(403);
    const read = await get(eventId, coordinator).expect(200);
    expect(read.body).toMatchObject({ registrationEnabled: false, version: 0 });
  });

  it('CONFIG-REG-01-D: a request without a session is 401', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator D2');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid });
    await get(eventId).expect(401);
    await put(eventId, undefined, { ...SET_OK, version: 0 }).expect(401);
  });

  // 01-E: enabling needs all three values; omitted fields keep their saved values (F1).
  it('CONFIG-REG-01-E: enabling without an opening time is refused with SETTINGS_INCOMPLETE', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator E');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    const refused = await put(eventId, coordinator, {
      registrationEnabled: true,
      registrationClosesAt: SET_OK.registrationClosesAt,
      capacity: 50,
      version: 0,
    }).expect(422);
    expect(refused.body.code).toBe('SETTINGS_INCOMPLETE');
    expect(refused.body.errors).toEqual({
      registrationOpensAt: 'Set the registration period and capacity before turning registration on.',
    });
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ registrationEnabled: false, version: 0 });
  });

  it('CONFIG-REG-01-E: disabling with nothing else is accepted', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator E2');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await put(eventId, coordinator, { registrationEnabled: false, version: 0 }).expect(200);
  });

  // 02-A: the times round-trip as UTC instants; the closing time is before the event start.
  it('CONFIG-REG-02-A: stored times round-trip to the same instants in UTC', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 02A');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(200);
    const row = await pool.query<{ opens: Date; closes: Date }>(
      'SELECT registration_opens_at AS opens, registration_closes_at AS closes FROM events WHERE id = $1',
      [eventId],
    );
    expect(row.rows[0].opens.toISOString()).toBe('2026-10-19T01:00:00.000Z');
    expect(row.rows[0].closes.toISOString()).toBe('2026-10-28T15:59:00.000Z');
  });


  // 02-C: an opening time in the past is valid and reads back as the same instant.
  it('CONFIG-REG-02-C: an opening time before now is accepted and reads back', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 02C');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await put(eventId, coordinator, { ...SET_OK, registrationOpensAt: '2026-10-18T11:00:00+08:00', version: 0 }).expect(200);
    expect((await get(eventId, coordinator).expect(200)).body.registrationOpensAt).toBe('2026-10-18T03:00:00.000Z');
  });

  // 02-D: date-times without an offset or with invalid parts are refused before anything is saved.
  it.each([
    ['no offset', '2026-10-19T09:00:00'],
    ['invalid calendar', '2026-13-45T25:61'],
    ['not a date', 'not-a-date'],
  ])('CONFIG-REG-02-D: a %s opening time is refused with INVALID_DATETIME', async (_label, value) => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 02D');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    const refused = await put(eventId, coordinator, { ...SET_OK, registrationOpensAt: value, version: 0 }).expect(400);
    expect(refused.body.code).toBe('INVALID_DATETIME');
    expect(refused.body.errors).toHaveProperty('registrationOpensAt');
    expect((await get(eventId, coordinator).expect(200)).body.version).toBe(0);
  });

  // 03-C: a refused save changes nothing, including the fields that were valid in the same request.
  it('CONFIG-REG-03-C: a refused period leaves the capacity and the closing time unchanged', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 03C');
    const eventId = await seedEvent({
      coordinatorId: coordinator.uid,
      enabled: true,
      opens: '2026-10-17T01:00:00Z',
      closes: '2026-10-28T15:59:00Z',
      limit: 10,
    });
    await put(eventId, coordinator, {
      registrationOpensAt: '2026-10-23T09:00:00+08:00',
      registrationClosesAt: '2026-10-23T09:00:00+08:00',
      capacity: 80,
      version: 0,
    }).expect(422);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({
      capacity: 10,
      registrationClosesAt: '2026-10-28T15:59:00.000Z',
      version: 0,
    });
  });


  // 05-C (equal to the opening time) and 06-D (after the event start): both refused with INVALID_PERIOD, nothing saved.
  it.each([
    ['CONFIG-REG-05-C', 'equal to the opening time', { registrationClosesAt: '2026-10-19T09:00:00+08:00' }, 'Registration closing time must be after the opening time.'],
    ['CONFIG-REG-06-D', 'after the event start', { registrationClosesAt: '2026-11-07T18:30:00+08:00' }, 'Registration must close on or before the event start time.'],
  ])('CONFIG-REG-05-C / CONFIG-REG-06-D: a closing time %s is refused with INVALID_PERIOD (%s)', async (_id, _label, change, message) => {
    const coordinator = await user(['COORDINATOR'], `Coordinator ${_id}`);
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(200);
    const refused = await put(eventId, coordinator, { ...change, version: 1 }).expect(422);
    expect(refused.body.code).toBe('INVALID_PERIOD');
    expect(refused.body.message).toBe(message);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ registrationClosesAt: '2026-10-28T15:59:00.000Z', version: 1 });
  });

  // 05-C: capacity must be a JSON whole number; a numeric string is refused (F6).
  it.each([0, -1, 2.5, '10', null])('CONFIG-REG-07-C: capacity %j is refused with INVALID_CAPACITY', async (capacity) => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 05C');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    const refused = await put(eventId, coordinator, { capacity, version: 0 }).expect(422);
    expect(refused.body.code).toBe('INVALID_CAPACITY');
    expect(refused.body.message).toBe('Capacity must be a positive whole number.');
    expect((await get(eventId, coordinator).expect(200)).body.capacity).toBe(10);
  });

  // 05-D: the upper bound is the column maximum; a value above it is refused, never a server error.
  it('CONFIG-REG-07-D: 2147483648 is refused with CAPACITY_TOO_LARGE and 2147483647 is accepted', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 05D');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    const refused = await put(eventId, coordinator, { capacity: 2147483648, version: 0 }).expect(422);
    expect(refused.body.code).toBe('CAPACITY_TOO_LARGE');
    await put(eventId, coordinator, { capacity: 2147483647, version: 0 }).expect(200);
  });

  // 06-A: changing the closing time after saving it.
  it('CONFIG-REG-06-A: a later closing time is saved and shown', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 06A');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    await put(eventId, coordinator, { registrationClosesAt: '2026-11-02T15:59:00+08:00', version: 0 }).expect(200);
    expect((await get(eventId, coordinator).expect(200)).body.registrationClosesAt).toBe('2026-11-02T07:59:00.000Z');
  });

  // 06-D: a shortened closing time that has already passed removes the waiting list (D3) and tells nobody.
  it('CONFIG-REG-X-01: a closing time moved into the past removes the waiting list without a notification', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 06D');
    const waiter = await user(['ATTENDEE'], 'Waiter 06D');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 1 });
    await seedRow(eventId, await user(['ATTENDEE'], 'Confirmed 06D'), 'Registered');
    await seedRow(eventId, waiter, 'Waitlisted');

    await put(eventId, coordinator, { registrationClosesAt: '2026-10-18T11:55:00+08:00', version: 0 }).expect(200);

    expect(await statusOf(eventId, waiter)).toBe('Removed');
    const notified = await pool.query('SELECT 1 FROM notifications WHERE recipient_id = $1', [waiter.uid]);
    expect(notified.rowCount).toBe(0);
  });

  // 06-E: extending a passed closing time reopens registration but never restores removed entries (M17, M18).
  it('CONFIG-REG-X-02: extending the closing time does not restore the removed entries', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 06E');
    const removed = await user(['ATTENDEE'], 'Removed 06E');
    now = new Date('2026-10-24T12:00:00+08:00');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-23T15:59:00Z', limit: 2 });
    await seedRow(eventId, await user(['ATTENDEE'], 'Confirmed 06E 1'), 'Registered');
    await seedRow(eventId, await user(['ATTENDEE'], 'Confirmed 06E 2'), 'Registered');
    await seedRow(eventId, removed, 'Removed');
    // Stale entry: still Waitlisted in the table although the old closing time has passed (no job has run yet).
    const stale = await user(['ATTENDEE'], 'Stale 06E');
    await seedRow(eventId, stale, 'Waitlisted', new Date('2026-10-20T10:00:00Z'));

    await put(eventId, coordinator, { registrationClosesAt: '2026-10-29T15:59:00+08:00', version: 0 }).expect(200);

    // The old window is settled first, so the stale entry is removed, and the extension does not restore it.
    expect(await statusOf(eventId, stale)).toBe('Removed');
    expect(await statusOf(eventId, removed)).toBe('Removed');
  });

  // 06-F: a stale version is refused with SETTINGS_CONFLICT and nothing is saved.
  it('CONFIG-REG-X-03: a save with a stale version is refused with SETTINGS_CONFLICT', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 06F');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    await put(eventId, coordinator, { capacity: 12, version: 0 }).expect(200);
    const refused = await put(eventId, coordinator, { registrationClosesAt: '2026-11-02T15:59:00+08:00', version: 0 }).expect(409);
    expect(refused.body.code).toBe('SETTINGS_CONFLICT');
    expect(refused.body.message).toBe('These settings were changed elsewhere. Reload and try again.');
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 12, registrationClosesAt: '2026-10-28T15:59:00.000Z', version: 1 });
  });

  // 07-B: capacity below the Confirmed count is refused and the typed value does not reach the database.
  it('CONFIG-REG-08-C: capacity below the Confirmed count is refused with CAPACITY_BELOW_CONFIRMED', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 07B');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 07B ${n}`), 'Registered');
    const refused = await put(eventId, coordinator, { capacity: 4, version: 0 }).expect(422);
    expect(refused.body.code).toBe('CAPACITY_BELOW_CONFIRMED');
    expect(refused.body.message).toBe('Capacity cannot be lower than the number of Confirmed registrations (5).');
    expect((await get(eventId, coordinator).expect(200)).body.capacity).toBe(10);
  });

  // 07-C: Withdrawn entries do not count against the minimum.
  it('CONFIG-REG-08-A: withdrawn entries do not count against the minimum', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 07C');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 07C ${n}`), 'Registered');
    for (let n = 0; n < 2; n++) await seedRow(eventId, await user(['ATTENDEE'], `Withdrawn 07C ${n}`), 'Withdrawn');
    await put(eventId, coordinator, { capacity: 5, version: 0 }).expect(200);
    await put(eventId, coordinator, { capacity: 4, version: 1 }).expect(422);
  });


  // 09-A and 09-E: raising capacity promotes the earliest waiting entries, one notification each, in join order.
  it('CONFIG-REG-09-A/E: raising capacity promotes the earliest waiting entries with one notification each', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09A');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 2 });
    for (let n = 0; n < 2; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 09A ${n}`), 'Registered');
    const waiters = [await user(['ATTENDEE'], 'Waiter 09A 1'), await user(['ATTENDEE'], 'Waiter 09A 2'), await user(['ATTENDEE'], 'Waiter 09A 3')];
    // Join order is the reverse of attendee id order, so a promotion ordered by id would pick the wrong people.
    const [latest, next, earliest] = [...waiters].sort((a, b) => (a.uid < b.uid ? -1 : 1));
    await seedRow(eventId, earliest, 'Waitlisted', new Date('2026-10-18T10:00:00Z'));
    await seedRow(eventId, next, 'Waitlisted', new Date('2026-10-18T10:05:00Z'));
    await seedRow(eventId, latest, 'Waitlisted', new Date('2026-10-18T10:10:00Z'));

    await put(eventId, coordinator, { capacity: 4, version: 0 }).expect(200);

    expect(await statusOf(eventId, earliest)).toBe('Registered');
    expect(await statusOf(eventId, next)).toBe('Registered');
    expect(await statusOf(eventId, latest)).toBe('Waitlisted');
    for (const promoted of [earliest, next]) {
      const notes = await pool.query<{ type: string; message: string }>('SELECT type, message FROM notifications WHERE recipient_id = $1', [promoted.uid]);
      expect(notes.rows).toEqual([{ type: 'WaitlistPromoted', message: 'A spot opened up. You are now registered for Registration Settings Night.' }]);
    }
    const none = await pool.query('SELECT 1 FROM notifications WHERE recipient_id = $1', [latest.uid]);
    expect(none.rowCount).toBe(0);
  });

  // 08-I: a disabled event promotes nobody; its waiting list is removed by the save (D3).
  it('CONFIG-REG-X-04: raising capacity on a disabled event removes the waiting list and promotes nobody', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 08I');
    const waiter = await user(['ATTENDEE'], 'Waiter 08I');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: false, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 1 });
    await seedRow(eventId, waiter, 'Waitlisted');

    await put(eventId, coordinator, { capacity: 3, version: 0 }).expect(200);

    expect(await statusOf(eventId, waiter)).toBe('Removed');
  });

  // 10-A: saved settings drive what an attendee can do. Before opening, the attendee is refused; after it, they register.
  it('CONFIG-REG-11-A: the saved window decides whether an attendee can register', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 10A');
    const attendee = await user(['ATTENDEE'], 'Attendee 10A');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Confirmed' });
    await put(eventId, coordinator, {
      registrationEnabled: true,
      registrationOpensAt: '2026-10-18T13:00:00+08:00',
      registrationClosesAt: '2026-10-28T23:59:00+08:00',
      capacity: 2,
      version: 0,
    }).expect(200);
    const details = { fullName: 'Attendee 10A', email: 'a10@example.com', contactNumber: '91234567' };

    now = new Date('2026-10-18T12:30:00+08:00');
    await request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', attendee.cookie).send(details).expect(422);

    now = new Date('2026-10-18T14:00:00+08:00');
    await request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', attendee.cookie).send(details).expect(201);
  });

  // 12-A: the request is strict: counts, status and the event id from the client are refused, and nothing changes.
  it('CONFIG-REG-11-C: client-supplied counts, status and event id are refused with 400 and nothing changes', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 12A');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    await put(eventId, coordinator, { confirmedCount: 0, status: 'Cancelled', eventId: 'EVT-911', capacity: 3, version: 0 }).expect(400);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 10, version: 0 });
  });

  // 07-E: a capacity cut to the Confirmed count and a registration race for the last place. Both lock the event row,
  // so exactly one wins in every run and Registered never exceeds the saved capacity. Run 20 times (Phase 4).
  it('CONFIG-REG-08-D: a capacity cut and a registration racing for the last place never both succeed', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 07E');
    const attendee = await user(['ATTENDEE'], 'Attendee 07E');
    const details = { fullName: 'Attendee 07E', email: 'a07e@example.com', contactNumber: '91234567' };
    for (let run = 0; run < 20; run++) {
      const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
      // Five Confirmed of capacity 10 (EVT-902 clone): a cut to 5 is allowed, and the registration needs a place.
      for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 07E ${run}-${n}`), 'Registered');

      const [save, register] = await Promise.all([
        put(eventId, coordinator, { capacity: 5, version: 0 }),
        request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', attendee.cookie).send(details),
      ]);

      const saveWon = save.status === 200 && register.status === 422 && register.body.code === 'registration_full';
      const registerWon = register.status === 201 && save.status === 422 && save.body.code === 'CAPACITY_BELOW_CONFIRMED';
      expect(saveWon || registerWon, `run ${run}: save ${save.status}, register ${register.status}`).toBe(true);
      const saved = (await get(eventId, coordinator).expect(200)).body;
      expect(saved.confirmedCount).toBeLessThanOrEqual(saved.capacity);
    }
  });
  // 04-A (v2.0): registration details can be set in each of the three allowed statuses.
  it.each(['Approved', 'Planning', 'Confirmed'])('CONFIG-REG-04-A: a %s event accepts the settings', async (status) => {
    const coordinator = await user(['COORDINATOR'], `Coordinator 04A ${status}`);
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status });
    await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(200);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ registrationEnabled: true, capacity: 50, version: 1 });
  });

  // 04-E: the backend enforces the status rule when the UI is bypassed: a Completed event refuses a PUT and keeps its settings.
  it('CONFIG-REG-04-E: a PUT on a Completed event with the UI bypassed is refused and the settings are unchanged', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 04E');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Completed', enabled: true, opens: '2026-09-01T01:00:00Z', closes: '2026-10-08T15:59:00Z', limit: 50, start: '2026-10-10T18:00:00+08:00' });
    const before = (await get(eventId, coordinator).expect(200)).body;
    const refused = await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(409);
    expect(refused.body.code).toBe('EVENT_NOT_CONFIGURABLE');
    expect((await get(eventId, coordinator).expect(200)).body).toEqual(before);
  });

  // 04-B (v2.0): a Submitted event refuses the settings (plain case, so the status allowlist can be mutated).
  it('CONFIG-REG-04-B: a Submitted event refuses the settings', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 04B submitted');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Submitted' });
    const refused = await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(409);
    expect(refused.body.code).toBe('EVENT_NOT_CONFIGURABLE');
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ registrationEnabled: false, version: 0 });
  });

  // 04-B (v2.0): every other status refuses registration details with one message, and nothing is saved.
  it.each(['Submitted', 'Completed', 'Cancelled', 'Rejected'])('CONFIG-REG-04-B: a %s event refuses the settings', async (status) => {
    const coordinator = await user(['COORDINATOR'], `Coordinator 04B ${status}`);
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status, start: status === 'Completed' ? '2026-10-10T18:00:00+08:00' : START });
    const refused = await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(409);
    expect(refused.body).toMatchObject({
      code: 'EVENT_NOT_CONFIGURABLE',
      message: 'Registration details can only be set while the event is Approved, Planning or Confirmed.',
    });
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ registrationEnabled: false, version: 0 });
  });
  // ---- v2.0 cases (docs/specs/SPM-139-test-cases.md) -------------------------------------------------------------

  // 01-F: turning registration back on restores the saved values.
  it('CONFIG-REG-01-F: switching off and back on keeps the saved period and capacity', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 01F');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    const before = (await get(eventId, coordinator).expect(200)).body;
    await put(eventId, coordinator, { registrationEnabled: false, version: 0 }).expect(200);
    await put(eventId, coordinator, { registrationEnabled: true, version: 1 }).expect(200);
    const after = (await get(eventId, coordinator).expect(200)).body;
    expect(after).toMatchObject({ registrationEnabled: true, registrationOpensAt: before.registrationOpensAt, registrationClosesAt: before.registrationClosesAt, capacity: 10, version: 2 });
  });


  // 03-B: the smallest and a very large valid capacity are saved and read back.
  it('CONFIG-REG-03-B: capacities 1 and 100000 are saved and read back', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 03B');
    const one = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await put(one, coordinator, { capacity: 1, version: 0 }).expect(200);
    expect((await get(one, coordinator).expect(200)).body.capacity).toBe(1);
    const big = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await put(big, coordinator, { capacity: 100000, version: 0 }).expect(200);
    expect((await get(big, coordinator).expect(200)).body.capacity).toBe(100000);
  });

  // 03-B: a capacity of 1 fills after one registration; the second attendee sees the event full.
  it('CONFIG-REG-03-B: a capacity of 1 fills after one registration', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 03B fill');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 1 });
    const first = await user(['ATTENDEE'], 'First 03B');
    const second = await user(['ATTENDEE'], 'Second 03B');
    await put(eventId, coordinator, { capacity: 1, version: 0 }).expect(200);
    await request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', first.cookie)
      .send({ fullName: 'First 03B', email: 'f03b@example.com', contactNumber: '91234567' }).expect(201);
    const full = await request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', second.cookie)
      .send({ fullName: 'Second 03B', email: 's03b@example.com', contactNumber: '91234567' }).expect(422);
    expect(full.body.code).toBe('registration_full');
  });

  // 06-C: the closing boundary at the event start: 17:59 and 18:00 are accepted; 18:01 is refused.
  it.each([
    ['2026-11-07T17:59:00+08:00', '2026-11-07T09:59:00.000Z'],
    ['2026-11-07T18:00:00+08:00', '2026-11-07T10:00:00.000Z'],
  ])('CONFIG-REG-06-C: closing %s is accepted and reads back as %s', async (closes, readBack) => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 06C');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await put(eventId, coordinator, { registrationOpensAt: '2026-10-19T09:00:00+08:00', registrationClosesAt: closes, capacity: 50, version: 0 }).expect(200);
    expect((await get(eventId, coordinator).expect(200)).body.registrationClosesAt).toBe(readBack);
  });

  it('CONFIG-REG-06-C: closing 18:01 is refused with INVALID_PERIOD and nothing is saved', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 06C late');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    const refused = await put(eventId, coordinator, { registrationOpensAt: '2026-10-19T09:00:00+08:00', registrationClosesAt: '2026-11-07T18:01:00+08:00', capacity: 50, version: 0 }).expect(422);
    expect(refused.body).toMatchObject({ code: 'INVALID_PERIOD', message: 'Registration must close on or before the event start time.' });
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ registrationClosesAt: null, version: 0 });
  });


  // 04-C: the period can change after saving, in Planning and in Confirmed; the existing registrations are unchanged.
  it('CONFIG-REG-04-C: a Planning closing time and a Confirmed capacity change are saved and read back', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 04C');
    const planning = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning', enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 50 });
    await put(planning, coordinator, { registrationClosesAt: '2026-11-02T15:59:00+08:00', version: 0 }).expect(200);
    expect((await get(planning, coordinator).expect(200)).body).toMatchObject({ registrationClosesAt: '2026-11-02T07:59:00.000Z', version: 1 });

    const confirmed = await seedEvent({ coordinatorId: coordinator.uid, status: 'Confirmed', enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 50 });
    const holder = await user(['ATTENDEE'], 'Holder 04C');
    await seedRow(confirmed, holder, 'Registered');
    await put(confirmed, coordinator, { capacity: 60, version: 0 }).expect(200);
    expect((await get(confirmed, coordinator).expect(200)).body).toMatchObject({ capacity: 60, confirmedCount: 1, version: 1 });
    expect(await statusOf(confirmed, holder)).toBe('Registered');
  });

  // 04-D: an event cancelled before the save cannot be configured; the save is refused and nothing changes.
  it('CONFIG-REG-04-D: a save after the event is cancelled is refused with EVENT_NOT_CONFIGURABLE', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 04D');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning', enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 50 });
    await pool.query("UPDATE events SET status = 'Cancelled', rejection_reason = NULL WHERE id = $1", [eventId]);
    const refused = await put(eventId, coordinator, { capacity: 60, version: 0 }).expect(409);
    expect(refused.body.code).toBe('EVENT_NOT_CONFIGURABLE');
    expect((await get(eventId, coordinator).expect(200)).body.capacity).toBe(50);
  });

  // 08-D (lock): a save waits for a registration that holds the event row lock, then counts the place that registration took.
  // The wait is bounded: the test polls pg_locks for a waiting request (200 tries, 50 ms apart) and fails if none appears.
  it('CONFIG-REG-08-D: a save waits for a registration that holds the event row lock, then counts its place', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 08D lock');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    for (let n = 0; n < 4; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 08D lock ${n}`), 'Registered');
    const taker = await user(['ATTENDEE'], 'Taker 08D lock');
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
      await holder.query(
        `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, contact_number)
         VALUES ($1, $2, 'Registered', 'Taker 08D lock', 't08dlock@example.com', '91234567')`,
        [eventId, taker.uid],
      );
      const save = put(eventId, coordinator, { capacity: 4, version: 0 }).then((response) => response);
      for (let attempt = 0; ; attempt++) {
        const waiting = await pool.query(
          `SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
            WHERE NOT l.granted AND a.query ILIKE '%events%'`,
        );
        if (waiting.rows[0].count > 0) break;
        if (attempt >= 200) throw new Error('the save never waited for the event row lock');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await holder.query('COMMIT');
      const refused = await save;
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe('CAPACITY_BELOW_CONFIRMED');
      expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 10, confirmedCount: 5 });
    } finally {
      holder.release();
    }
  });

  // 08-B: the capacity cannot go below the Confirmed count; Waitlisted entries do not count toward it.
  it('CONFIG-REG-08-B: 4 is refused below the 5 Confirmed; 5 is accepted and the waiting list is unchanged', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 08B');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 08B ${n}`), 'Registered');
    const waiters = [await user(['ATTENDEE'], 'Waiter 08B 1'), await user(['ATTENDEE'], 'Waiter 08B 2'), await user(['ATTENDEE'], 'Waiter 08B 3')];
    for (const [i, w] of waiters.entries()) await seedRow(eventId, w, 'Waitlisted', new Date(Date.parse('2026-10-18T10:00:00Z') + i * 60_000));

    const refused = await put(eventId, coordinator, { capacity: 4, version: 0 }).expect(422);
    expect(refused.body).toMatchObject({ code: 'CAPACITY_BELOW_CONFIRMED', message: 'Capacity cannot be lower than the number of Confirmed registrations (5).' });
    await put(eventId, coordinator, { capacity: 5, version: 0 }).expect(200);
    for (const w of waiters) expect(await statusOf(eventId, w)).toBe('Waitlisted');
  });

  // 08-E: the minimum follows the live Confirmed count after a withdrawal.
  it('CONFIG-REG-08-E: after one withdrawal the minimum is 4, not 5', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 08E');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    const leaver = await user(['ATTENDEE'], 'Withdrawn 08E');
    await seedRow(eventId, leaver, 'Registered');
    for (let n = 0; n < 4; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 08E ${n}`), 'Registered');
    await pool.query("UPDATE event_registrations SET status = 'Withdrawn' WHERE event_id = $1 AND attendee_id = $2", [eventId, leaver.uid]);
    await put(eventId, coordinator, { capacity: 4, version: 0 }).expect(200);
    const refused = await put(eventId, coordinator, { capacity: 3, version: 1 }).expect(422);
    expect(refused.body.message).toBe('Capacity cannot be lower than the number of Confirmed registrations (4).');
  });

  // 09-B: a capacity larger than the waiting list moves everyone in; the spare place is open to a direct registrant.
  it('CONFIG-REG-09-B: raising 5 to 12 moves all three waiting entries in and leaves a place for a direct registrant', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09B');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 09B ${n}`), 'Registered');
    const waiters = [await user(['ATTENDEE'], 'Waiter 09B 1'), await user(['ATTENDEE'], 'Waiter 09B 2'), await user(['ATTENDEE'], 'Waiter 09B 3')];
    for (const [i, w] of waiters.entries()) await seedRow(eventId, w, 'Waitlisted', new Date(Date.parse('2026-10-18T10:00:00Z') + i * 60_000));
    await put(eventId, coordinator, { capacity: 12, version: 0 }).expect(200);
    for (const w of waiters) expect(await statusOf(eventId, w)).toBe('Registered');
    const direct = await user(['ATTENDEE'], 'Direct 09B');
    await request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', direct.cookie)
      .send({ fullName: 'Direct 09B', email: 'd09b@example.com', contactNumber: '91234567' }).expect(201);
  });

  // 09-C: an empty waiting list promotes nobody and notifies nobody.
  it('CONFIG-REG-09-C: raising capacity with an empty waiting list promotes and notifies nobody', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09C');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    for (let n = 0; n < 3; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 09C ${n}`), 'Registered');
    await put(eventId, coordinator, { capacity: 8, version: 0 }).expect(200);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 8, confirmedCount: 3 });
    const notes = await pool.query('SELECT count(*)::int AS count FROM notifications WHERE related_event_id = $1', [eventId]);
    expect(notes.rows[0].count).toBe(0);
  });


  // 09-D: spots go to the waiting list in join order, not attendee id order.
  it('CONFIG-REG-09-D: the first to join is promoted first, whatever the attendee ids', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09D');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 09D ${n}`), 'Registered');
    const people = [await user(['ATTENDEE'], 'Person 09D 1'), await user(['ATTENDEE'], 'Person 09D 2'), await user(['ATTENDEE'], 'Person 09D 3')];
    // Join order is the reverse of attendee id order, so an id-ordered promotion would pick a different person.
    const [latest, next, earliest] = [...people].sort((a, b) => (a.uid < b.uid ? -1 : 1));
    await seedRow(eventId, earliest, 'Waitlisted', new Date('2026-10-18T10:00:00Z'));
    await seedRow(eventId, next, 'Waitlisted', new Date('2026-10-18T10:05:00Z'));
    await seedRow(eventId, latest, 'Waitlisted', new Date('2026-10-18T10:10:00Z'));
    await put(eventId, coordinator, { capacity: 6, version: 0 }).expect(200);
    expect(await statusOf(eventId, earliest)).toBe('Registered');
    expect(await statusOf(eventId, next)).toBe('Waitlisted');
    expect(await statusOf(eventId, latest)).toBe('Waitlisted');
  });

  // 09-F: a failure during promotion rolls the capacity change back; the retry succeeds.
  it('CONFIG-REG-09-F: a fault during promotion leaves capacity and the waiting list unchanged, and the retry succeeds', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09F');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 09F ${n}`), 'Registered');
    const [w1, w2] = [await user(['ATTENDEE'], 'Waiter 09F 1'), await user(['ATTENDEE'], 'Waiter 09F 2')];
    await seedRow(eventId, w1, 'Waitlisted', new Date('2026-10-18T10:00:00Z'));
    await seedRow(eventId, w2, 'Waitlisted', new Date('2026-10-18T10:05:00Z'));
    await pool.query(`CREATE OR REPLACE FUNCTION spm139_fault_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected fault'; END; $$`);
    await pool.query(`CREATE TRIGGER spm139_fault BEFORE INSERT ON notifications FOR EACH ROW
      WHEN (NEW.type = 'WaitlistPromoted') EXECUTE FUNCTION spm139_fault_fn()`);
    try {
      await put(eventId, coordinator, { capacity: 7, version: 0 }).expect(500);
      expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 5, version: 0 });
      expect(await statusOf(eventId, w1)).toBe('Waitlisted');
      expect(await statusOf(eventId, w2)).toBe('Waitlisted');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS spm139_fault ON notifications');
      await pool.query('DROP FUNCTION IF EXISTS spm139_fault_fn()');
    }
    await put(eventId, coordinator, { capacity: 7, version: 0 }).expect(200);
    expect(await statusOf(eventId, w1)).toBe('Registered');
    expect(await statusOf(eventId, w2)).toBe('Registered');
  });

  // 09-G: a direct registrant racing a capacity increase never jumps the waiting list.
  // The Promise.all order is not controlled; both orders must give the same outcome, so every run asserts it. The
  // deterministic path is the sequential case below.
  it('CONFIG-REG-09-G: a direct registrant racing a capacity increase is refused and the waiting list gets the spots', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09G');
    const direct = await user(['ATTENDEE'], 'Direct 09G');
    const details = { fullName: 'Direct 09G', email: 'd09g@example.com', contactNumber: '91234567' };
    for (let run = 0; run < 5; run++) {
      const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
      for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 09G ${run}-${n}`), 'Registered');
      const [w1, w2] = [await user(['ATTENDEE'], `Waiter 09G ${run} 1`), await user(['ATTENDEE'], `Waiter 09G ${run} 2`)];
      await seedRow(eventId, w1, 'Waitlisted', new Date('2026-10-18T10:00:00Z'));
      await seedRow(eventId, w2, 'Waitlisted', new Date('2026-10-18T10:05:00Z'));
      const [save, register] = await Promise.all([
        put(eventId, coordinator, { capacity: 7, version: 0 }),
        request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', direct.cookie).send(details),
      ]);
      expect(save.status, `run ${run}`).toBe(200);
      expect(register.status, `run ${run}`).toBe(422);
      expect(register.body.code).toBe('registration_full');
      expect(await statusOf(eventId, w1)).toBe('Registered');
      expect(await statusOf(eventId, w2)).toBe('Registered');
      expect(await statusOf(eventId, direct)).toBeUndefined();
    }
  });

  // 09-G (sequential): a registration sent after the capacity save returns is refused; the waiting list keeps the spots.
  it('CONFIG-REG-09-G (sequential): a registration sent after the save returns is refused and the waiting list keeps the spots', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09G seq');
    const direct = await user(['ATTENDEE'], 'Direct 09G seq');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 09G seq ${n}`), 'Registered');
    const [w1, w2] = [await user(['ATTENDEE'], 'Waiter 09G seq 1'), await user(['ATTENDEE'], 'Waiter 09G seq 2')];
    await seedRow(eventId, w1, 'Waitlisted', new Date('2026-10-18T10:00:00Z'));
    await seedRow(eventId, w2, 'Waitlisted', new Date('2026-10-18T10:05:00Z'));
    await put(eventId, coordinator, { capacity: 7, version: 0 }).expect(200);
    const refused = await request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', direct.cookie)
      .send({ fullName: 'Direct 09G seq', email: 'd09gs@example.com', contactNumber: '91234567' }).expect(422);
    expect(refused.body.code).toBe('registration_full');
    expect(await statusOf(eventId, w1)).toBe('Registered');
    expect(await statusOf(eventId, w2)).toBe('Registered');
    expect(await statusOf(eventId, direct)).toBeUndefined();
  });

  // 09-H: a 500-entry waiting list moves in join order when capacity rises to 505, one notification each.
  it('CONFIG-REG-09-H: 500 waiting entries are all promoted with one notification each', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09H');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 09H ${n}`), 'Registered');
    const bulk = await pool.query<{ id: string }>(
      `INSERT INTO users (id, email, display_name, password_hash)
       SELECT gen_random_uuid(), 'spm139-bulk-' || g || '-' || $1 || '@example.test', 'Bulk ' || g, 'x'
         FROM generate_series(100, 599) AS g RETURNING id`,
      [randomUUID()],
    );
    userIds.push(...bulk.rows.map((r) => r.id));
    await pool.query(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, contact_number, joined_at, waitlist_seq)
       SELECT $1, g.id, 'Waitlisted', 'Bulk', 'bulk@example.test', '91234567',
              timestamptz '2026-10-18 10:00:00+08' + make_interval(secs => g.n), nextval('event_registrations_waitlist_seq')
         FROM (SELECT id, row_number() OVER (ORDER BY id) - 1 AS n FROM users WHERE id = ANY($2::uuid[])) g`,
      [eventId, bulk.rows.map((r) => r.id)],
    );
    await put(eventId, coordinator, { capacity: 505, version: 0 }).expect(200);
    const counts = await pool.query<{ registered: number; waiting: number; notified: number }>(
      `SELECT count(*) FILTER (WHERE status = 'Registered')::int AS registered,
              count(*) FILTER (WHERE status = 'Waitlisted')::int AS waiting,
              (SELECT count(*)::int FROM notifications WHERE related_event_id = $1 AND type = 'WaitlistPromoted') AS notified
         FROM event_registrations WHERE event_id = $1`,
      [eventId],
    );
    expect(counts.rows[0]).toEqual({ registered: 505, waiting: 0, notified: 500 });
    const recipients = await pool.query<{ count: number }>(
      `SELECT count(DISTINCT recipient_id)::int AS count FROM notifications WHERE related_event_id = $1 AND type = 'WaitlistPromoted'`,
      [eventId],
    );
    expect(recipients.rows[0].count).toBe(500);
  });

  // 09-I: a closed event with no waiting list promotes nobody when capacity rises.
  it('CONFIG-REG-09-I: raising capacity on a closed event with no waiting list promotes nobody', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09I');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-10T01:00:00Z', closes: '2026-10-17T15:59:00Z', limit: 5 });
    await put(eventId, coordinator, { capacity: 8, version: 0 }).expect(200);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 8, confirmedCount: 0 });
    const notes = await pool.query('SELECT count(*)::int AS count FROM notifications WHERE related_event_id = $1', [eventId]);
    expect(notes.rows[0].count).toBe(0);
  });

  // 09-I (switched off): raising capacity removes the waiting list and promotes nobody.
  it('CONFIG-REG-09-I (switched off): raising capacity on a switched-off event removes the waiting list and promotes nobody', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09I off');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: false, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    const waiters = [await user(['ATTENDEE'], 'Waiter 09I off 1'), await user(['ATTENDEE'], 'Waiter 09I off 2')];
    for (const [i, w] of waiters.entries()) await seedRow(eventId, w, 'Waitlisted', new Date(Date.parse('2026-10-18T10:00:00Z') + i * 60_000));
    await put(eventId, coordinator, { capacity: 7, version: 0 }).expect(200);
    for (const w of waiters) expect(await statusOf(eventId, w)).toBe('Removed');
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 7, confirmedCount: 0 });
  });

  // 10-A: switching off keeps the Confirmed attendees and removes every waiting entry.
  it('CONFIG-REG-10-A: switching off keeps the Confirmed places and removes the waiting entries', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 10A');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    const confirmed = [await user(['ATTENDEE'], 'Confirmed 10A 1'), await user(['ATTENDEE'], 'Confirmed 10A 2')];
    for (const c of confirmed) await seedRow(eventId, c, 'Registered');
    const waiters = [await user(['ATTENDEE'], 'Waiter 10A 1'), await user(['ATTENDEE'], 'Waiter 10A 2')];
    for (const [i, w] of waiters.entries()) await seedRow(eventId, w, 'Waitlisted', new Date(Date.parse('2026-10-18T10:00:00Z') + i * 60_000));
    await put(eventId, coordinator, { registrationEnabled: false, version: 0 }).expect(200);
    for (const c of confirmed) expect(await statusOf(eventId, c)).toBe('Registered');
    for (const w of waiters) expect(await statusOf(eventId, w)).toBe('Removed');
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ registrationEnabled: false, confirmedCount: 2 });
  });

  // 10-B: entries removed by switching off are not restored on switch-on; a new join waits as Waitlisted.
  it('CONFIG-REG-10-B: a removed entry is not restored on switch-on, and a new join waits as Waitlisted', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 10B');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 10B ${n}`), 'Registered');
    const removed = await user(['ATTENDEE'], 'Removed 10B');
    await seedRow(eventId, removed, 'Waitlisted');
    await put(eventId, coordinator, { registrationEnabled: false, version: 0 }).expect(200);
    await put(eventId, coordinator, { registrationEnabled: true, version: 1 }).expect(200);
    expect(await statusOf(eventId, removed)).toBe('Removed');
    await request(app.getHttpServer()).post(`/api/events/${eventId}/waitlist`).set('Cookie', removed.cookie).send({}).expect(201);
    expect(await statusOf(eventId, removed)).toBe('Waitlisted');
  });

  // 10-C: switching off notifies nobody and leaves a Withdrawn record unchanged.
  it('CONFIG-REG-10-C: switching off notifies nobody and leaves a Withdrawn record unchanged', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 10C');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 5 });
    const withdrawn = await user(['ATTENDEE'], 'Withdrawn 10C');
    await seedRow(eventId, withdrawn, 'Withdrawn');
    const waiter = await user(['ATTENDEE'], 'Waiter 10C');
    await seedRow(eventId, waiter, 'Waitlisted');
    await put(eventId, coordinator, { registrationEnabled: false, version: 0 }).expect(200);
    expect(await statusOf(eventId, withdrawn)).toBe('Withdrawn');
    const notes = await pool.query('SELECT count(*)::int AS count FROM notifications WHERE recipient_id = $1', [waiter.uid]);
    expect(notes.rows[0].count).toBe(0);
  });


  // 11-B: registration capacity is not checked against venue capacity: 500 and 5 are saved with a 100-place venue booked.
  it('CONFIG-REG-11-B: registration capacity 500 and 5 are saved and read back with a venue of capacity 100 booked', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 11B');
    const owner = await user(['VENUE_STAFF'], 'Venue Staff 11B');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    const venue = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, 'Main Hall 11B', $2, 100, 'Open weekdays', 0, 0) RETURNING id`,
      [owner.uid, `Level 1 ${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
       SELECT $1, id, start_date_time, end_date_time, 'approved' FROM events WHERE id = $2`,
      [venue.rows[0].id, eventId],
    );
    await put(eventId, coordinator, { capacity: 500, version: 0 }).expect(200);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 500, version: 1 });
    await put(eventId, coordinator, { capacity: 5, version: 1 }).expect(200);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 5, version: 2 });
  });

  // 02-B: an opening time entered in SGT is stored in UTC and read back as the same instant across a date boundary.
  it('CONFIG-REG-02-B: an SGT opening time is stored in UTC and read back across the date boundary', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 02B');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning', start: '2026-12-01T18:00:00+08:00' });
    await put(eventId, coordinator, { registrationOpensAt: '2026-11-11T00:30:00+08:00', registrationClosesAt: '2026-11-20T23:59:00+08:00', capacity: 50, version: 0 }).expect(200);
    const row = await pool.query<{ opens: Date }>('SELECT registration_opens_at AS opens FROM events WHERE id = $1', [eventId]);
    expect(row.rows[0].opens.toISOString()).toBe('2026-11-10T16:30:00.000Z');
    expect((await get(eventId, coordinator).expect(200)).body.registrationOpensAt).toBe('2026-11-10T16:30:00.000Z');
  });

  // 03-A: the saved capacity is returned, and an Attendee sees it as the registration limit with every place available.
  it('CONFIG-REG-03-A: the saved capacity is returned and an Attendee sees it as the limit with every place available', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 03A');
    const attendee = await user(['ATTENDEE'], 'Attendee 03A');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Confirmed' });
    await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(200);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 50, confirmedCount: 0 });
    const view = await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', attendee.cookie).expect(200);
    expect(view.body).toMatchObject({ registrationLimit: 50, availableSpots: 50 });
  });

  it('an event id that is not a UUID is refused with 404', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 404 malformed');
    await get('not-a-uuid', coordinator).expect(404);
  });

  it('an unknown event id is refused with 404', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 404 unknown');
    await get(randomUUID(), coordinator).expect(404);
  });

  // 09-E: only the moved Attendees get a notification, once each; the Attendee left waiting gets none.
  // No mail transport exists in the backend (see SPM-138 A-MAIL), so the check is on in-app notifications only.
  it('CONFIG-REG-09-E: only the moved Attendees get one notification each, and the one left waiting gets none', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09E');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 2 });
    for (let n = 0; n < 2; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 09E ${n}`), 'Registered');
    const waiters = [await user(['ATTENDEE'], 'Waiter 09E 1'), await user(['ATTENDEE'], 'Waiter 09E 2'), await user(['ATTENDEE'], 'Waiter 09E 3')];
    for (const [i, w] of waiters.entries()) await seedRow(eventId, w, 'Waitlisted', new Date(Date.parse('2026-10-18T10:00:00Z') + i * 60_000));
    await put(eventId, coordinator, { capacity: 4, version: 0 }).expect(200);
    const count = async (who: Who) => (await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM notifications WHERE recipient_id = $1 AND type = $2', [who.uid, 'WaitlistPromoted'])).rows[0].count;
    expect(await count(waiters[0])).toBe(1);
    expect(await count(waiters[1])).toBe(1);
    expect(await count(waiters[2])).toBe(0);
    const total = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM notifications WHERE related_event_id = $1', [eventId]);
    expect(total.rows[0].count).toBe(2);
  });
});
