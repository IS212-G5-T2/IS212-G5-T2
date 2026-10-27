/*
 * Story: SPM-139 Configure Event Registration Period and Capacity (backend half).
 * Cases implemented here: the resolved oracle table in the SPM-139 request (2.6), by ID: 01-A to 01-E, 02-A, 02-B, 02-D,
 * 03-C, 04-E, 05-C, 05-D, 06-A, 06-D, 06-E, 06-F, 07-B, 07-C, 08-A, 08-D, 08-E, 08-I, 09-B, 09-C, 09-D, 10-A, 12-A.
 * Not here: 07-E and 08-F to 08-H (concurrency, injected fault and bulk) and the frontend cases.
 *
 * Real Nest pipeline, session login and PostgreSQL. Requires database/postgresql/init 001 to 024. Time comes only from
 * the injected CLOCK. Every test builds its own users and events with random ids, so no run depends on another's data.
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
      registrationOpensAt: 'Set the registration period and capacity before enabling registration.',
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

  // 02-B: an opening time in the past is valid and opens registration at once.
  it('CONFIG-REG-02-B: an opening time before now is accepted', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 02B');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await put(eventId, coordinator, {
      ...SET_OK,
      registrationOpensAt: '2026-10-18T11:00:00+08:00',
      version: 0,
    }).expect(200);
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

  // 04-E: the closing time is checked on the server too, and nothing changes when it is refused.
  it.each([
    ['equal to the opening time', { registrationClosesAt: '2026-10-19T09:00:00+08:00' }, 'Registration closing time must be after the opening time.'],
    ['after the event start', { registrationClosesAt: '2026-11-07T18:30:00+08:00' }, 'Registration must close on or before the event start time.'],
  ])('CONFIG-REG-04-E: a closing time %s is refused with INVALID_PERIOD', async (_label, change, message) => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 04E');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Planning' });
    await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(200);
    const refused = await put(eventId, coordinator, { ...change, version: 1 }).expect(422);
    expect(refused.body.code).toBe('INVALID_PERIOD');
    expect(refused.body.message).toBe(message);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({
      registrationClosesAt: '2026-10-28T15:59:00.000Z',
      version: 1,
    });
  });

  // 05-C: capacity must be a JSON whole number; a numeric string is refused (F6).
  it.each([0, -1, 2.5, '10', null])('CONFIG-REG-05-C: capacity %j is refused with INVALID_CAPACITY', async (capacity) => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 05C');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    const refused = await put(eventId, coordinator, { capacity, version: 0 }).expect(422);
    expect(refused.body.code).toBe('INVALID_CAPACITY');
    expect(refused.body.message).toBe('Capacity must be a positive whole number.');
    expect((await get(eventId, coordinator).expect(200)).body.capacity).toBe(10);
  });

  // 05-D: the upper bound is the column maximum; a value above it is refused, never a server error.
  it('CONFIG-REG-05-D: 2147483648 is refused with CAPACITY_TOO_LARGE and 2147483647 is accepted', async () => {
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
  it('CONFIG-REG-06-D: a closing time moved into the past removes the waiting list without a notification', async () => {
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
  it('CONFIG-REG-06-E: extending the closing time does not restore the removed entries', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 06E');
    const removed = await user(['ATTENDEE'], 'Removed 06E');
    now = new Date('2026-10-24T12:00:00+08:00');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-23T15:59:00Z', limit: 2 });
    await seedRow(eventId, await user(['ATTENDEE'], 'Confirmed 06E 1'), 'Registered');
    await seedRow(eventId, await user(['ATTENDEE'], 'Confirmed 06E 2'), 'Registered');
    await seedRow(eventId, removed, 'Removed');

    await put(eventId, coordinator, { registrationClosesAt: '2026-10-29T15:59:00+08:00', version: 0 }).expect(200);

    expect(await statusOf(eventId, removed)).toBe('Removed');
  });

  // 06-F: a stale version is refused with SETTINGS_CONFLICT and nothing is saved.
  it('CONFIG-REG-06-F: a save with a stale version is refused with SETTINGS_CONFLICT', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 06F');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    await put(eventId, coordinator, { capacity: 12, version: 0 }).expect(200);
    const refused = await put(eventId, coordinator, { registrationClosesAt: '2026-11-02T15:59:00+08:00', version: 0 }).expect(409);
    expect(refused.body.code).toBe('SETTINGS_CONFLICT');
    expect(refused.body.message).toBe('These settings were changed elsewhere. Reload and try again.');
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 12, registrationClosesAt: '2026-10-28T15:59:00.000Z', version: 1 });
  });

  // 07-B: capacity below the Confirmed count is refused and the typed value does not reach the database.
  it('CONFIG-REG-07-B: capacity below the Confirmed count is refused with CAPACITY_BELOW_CONFIRMED', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 07B');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 07B ${n}`), 'Registered');
    const refused = await put(eventId, coordinator, { capacity: 4, version: 0 }).expect(422);
    expect(refused.body.code).toBe('CAPACITY_BELOW_CONFIRMED');
    expect(refused.body.message).toBe('Capacity cannot be lower than the number of Confirmed registrations (5).');
    expect((await get(eventId, coordinator).expect(200)).body.capacity).toBe(10);
  });

  // 07-C: Withdrawn entries do not count against the minimum.
  it('CONFIG-REG-07-C: withdrawn entries do not count against the minimum', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 07C');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    for (let n = 0; n < 5; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 07C ${n}`), 'Registered');
    for (let n = 0; n < 2; n++) await seedRow(eventId, await user(['ATTENDEE'], `Withdrawn 07C ${n}`), 'Withdrawn');
    await put(eventId, coordinator, { capacity: 5, version: 0 }).expect(200);
    await put(eventId, coordinator, { capacity: 4, version: 1 }).expect(422);
  });

  // 08-A and 08-E: raising capacity promotes the earliest waiting entries, one notification each, in the same save.
  it('CONFIG-REG-08-A/E: raising capacity promotes the earliest waiting entries with one notification each', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 08A');
    const first = await user(['ATTENDEE'], 'Waiter 08A 1');
    const second = await user(['ATTENDEE'], 'Waiter 08A 2');
    const third = await user(['ATTENDEE'], 'Waiter 08A 3');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 2 });
    for (let n = 0; n < 2; n++) await seedRow(eventId, await user(['ATTENDEE'], `Confirmed 08A ${n}`), 'Registered');
    await seedRow(eventId, first, 'Waitlisted', new Date('2026-10-18T10:00:00Z'));
    await seedRow(eventId, second, 'Waitlisted', new Date('2026-10-18T10:05:00Z'));
    await seedRow(eventId, third, 'Waitlisted', new Date('2026-10-18T10:10:00Z'));

    await put(eventId, coordinator, { capacity: 4, version: 0 }).expect(200);

    expect(await statusOf(eventId, first)).toBe('Registered');
    expect(await statusOf(eventId, second)).toBe('Registered');
    expect(await statusOf(eventId, third)).toBe('Waitlisted');
    for (const promoted of [first, second]) {
      const notes = await pool.query<{ type: string; message: string }>(
        'SELECT type, message FROM notifications WHERE recipient_id = $1',
        [promoted.uid],
      );
      expect(notes.rows).toEqual([
        { type: 'WaitlistPromoted', message: 'A spot opened up. You are now registered for Registration Settings Night.' },
      ]);
    }
    const none = await pool.query('SELECT 1 FROM notifications WHERE recipient_id = $1', [third.uid]);
    expect(none.rowCount).toBe(0);
  });

  // 08-I: a disabled event promotes nobody; its waiting list is removed by the save (D3).
  it('CONFIG-REG-08-I: raising capacity on a disabled event removes the waiting list and promotes nobody', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 08I');
    const waiter = await user(['ATTENDEE'], 'Waiter 08I');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: false, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 1 });
    await seedRow(eventId, waiter, 'Waitlisted');

    await put(eventId, coordinator, { capacity: 3, version: 0 }).expect(200);

    expect(await statusOf(eventId, waiter)).toBe('Removed');
  });

  // 09-B and 09-C: a cancelled or rejected event refuses configuration (409) and stays as saved.
  it.each([
    ['Cancelled', 'Registration cannot be configured for a cancelled or rejected event.'],
    ['Rejected', 'Registration cannot be configured for a cancelled or rejected event.'],
  ])('CONFIG-REG-09-B/C: a %s event refuses saves with EVENT_NOT_CONFIGURABLE', async (status, message) => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09BC');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    const refused = await put(eventId, coordinator, { capacity: 20, version: 0 }).expect(409);
    expect(refused.body).toMatchObject({ code: 'EVENT_NOT_CONFIGURABLE', message });
    expect((await get(eventId, coordinator).expect(200)).body.capacity).toBe(10);
  });

  // 09-D: a completed event refuses saves (D4).
  it('CONFIG-REG-09-D: a completed event refuses saves with EVENT_NOT_CONFIGURABLE', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 09D');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, status: 'Completed', start: '2026-10-17T18:00:00+08:00' });
    const refused = await put(eventId, coordinator, { ...SET_OK, version: 0 }).expect(409);
    expect(refused.body).toMatchObject({
      code: 'EVENT_NOT_CONFIGURABLE',
      message: 'Registration cannot be configured for a completed event.',
    });
  });

  // 10-A: saved settings drive what an attendee can do. Before opening, the attendee is refused; after it, they register.
  it('CONFIG-REG-10-A: the saved window decides whether an attendee can register', async () => {
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
  it('CONFIG-REG-12-A: client-supplied counts, status and event id are refused with 400 and nothing changes', async () => {
    const coordinator = await user(['COORDINATOR'], 'Coordinator 12A');
    const eventId = await seedEvent({ coordinatorId: coordinator.uid, enabled: true, opens: '2026-10-17T01:00:00Z', closes: '2026-10-28T15:59:00Z', limit: 10 });
    await put(eventId, coordinator, { confirmedCount: 0, status: 'Cancelled', eventId: 'EVT-911', capacity: 3, version: 0 }).expect(400);
    expect((await get(eventId, coordinator).expect(200)).body).toMatchObject({ capacity: 10, version: 0 });
  });

  // 07-E: a capacity cut to the Confirmed count and a registration race for the last place. Both lock the event row,
  // so exactly one wins in every run and Registered never exceeds the saved capacity. Run 20 times (Phase 4).
  it('CONFIG-REG-07-E: a capacity cut and a registration racing for the last place never both succeed', async () => {
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
});
