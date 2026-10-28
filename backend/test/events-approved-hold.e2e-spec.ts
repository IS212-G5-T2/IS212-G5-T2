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
import { EventPlanningRepository } from '../src/events/planning/event-planning.repository.js';

/*
 * SPM-159 review correction: an approved tentative hold (status 'approved', request_kind 'tentative_hold',
 * hold_expires_at set) is a Hold, or Hold expired, and is never a confirmed or Booked venue anywhere in the events
 * module. Real Nest pipeline, real PostgreSQL. Needs DATABASE_URL (or TEST_DATABASE_URL) with
 * database/postgresql/init 001 to 024 applied.
 *
 * Time: the planning, summary and event-list SQL use now(), so holds are seeded with a far-future (active) or far-past
 * (expired) expiry that no real run can cross. Events are in 2031.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-159 events tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const PASSWORD = 'password123';
/** Far-future and far-past expiries: the SQL now() and the real clock can never reach or pass them during a run. */
const ACTIVE_EXPIRY = () => new Date('2999-01-01T00:00:00.000Z');
const EXPIRED_EXPIRY = () => new Date('2000-01-01T00:00:00.000Z');

type User = { uid: string; cookie: string; name: string };
type HoldKind = 'active' | 'expired' | 'standard';

describe.skipIf(!database)('SPM-159 approved tentative holds across the events module (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let eventIds: string[];
  let userIds: string[];
  let venueIds: string[];
  let coordinator: User;
  let staff: User;
  let dayOffset: number;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: database });
    for (const file of [
      '019_spm54_venue_booking_lifecycle.sql',
      '024_spm159_tentative_hold_requests.sql',
      '025_spm159_approved_hold_expiry.sql',
    ])
      await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  });
  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    eventIds = [];
    userIds = [];
    venueIds = [];
    dayOffset = 0;
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    coordinator = await createUser('COORDINATOR');
    staff = await createUser('VENUE_STAFF');
  });

  afterEach(async () => {
    await app.close();
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (venueIds.length) await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venueIds]);
    if (userIds.length) {
      await pool.query('DELETE FROM notifications WHERE recipient_id = ANY($1::text[])', [userIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    }
  });

  const http = () => app.getHttpServer();

  async function createUser(role: string): Promise<User> {
    const email = `spm159-events-${randomUUID()}@example.test`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, 'SPM-159 Events User', crypt($2, gen_salt('bf', 4))) RETURNING id`,
      [email, PASSWORD],
    );
    const uid = created.rows[0].id;
    userIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const login = await request(http()).post('/api/auth/login').send({ email, password: PASSWORD }).expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((value) =>
      value.startsWith('connectsphere_session='),
    );
    return { uid, cookie: cookie!.split(';', 1)[0], name: 'SPM-159 Events User' };
  }

  async function seedVenue(name: string): Promise<string> {
    const created = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
                           setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, 'SPM-159 Location', 200, 'Fixture', 0, 0) RETURNING id`,
      [staff.uid, name],
    );
    venueIds.push(created.rows[0].id);
    return created.rows[0].id;
  }

  /** An event assigned to the coordinator, in Planning, on its own 2031 day (or the given day). */
  async function seedEvent(name: string, day?: number) {
    const id = randomUUID();
    dayOffset += 1;
    const start = new Date(Date.UTC(2031, 0, day ?? dayOffset, 2, 0, 0));
    const end = new Date(start.getTime() + 2 * 3_600_000);
    await pool.query(
      `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name,
        attachments, status, submission_key, equipment_confirmed_at)
       VALUES ($1,$2,'SPM-159 Organiser','org@example.test',$3,'Testing','Hold fixture',
        $4,$5,40,$6,'SPM-159 Coordinator','[]','Planning',$1,now())`,
      [id, coordinator.uid, name, start, end, coordinator.uid],
    );
    eventIds.push(id);
    return { id, start, end };
  }

  /** The booking row of the event: a standard approved booking, or an approved tentative hold (active or expired). */
  async function seedApproved(
    event: { id: string; start: Date; end: Date },
    venueId: string,
    kind: HoldKind,
  ): Promise<string> {
    const created = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
       VALUES ($1, $2, $3, $4, 'approved', $5, $6) RETURNING id`,
      [
        venueId,
        event.id,
        event.start,
        event.end,
        kind === 'standard' ? 'booking' : 'tentative_hold',
        kind === 'active' ? ACTIVE_EXPIRY() : kind === 'expired' ? EXPIRED_EXPIRY() : null,
      ],
    );
    return created.rows[0].id;
  }

  const asCoordinator = (path: string) => request(http()).get(path).set('Cookie', coordinator.cookie);

  /** SPM-159: the venue name on the event list and detail reads "(hold)" or "(hold expired)", and the hold state is surfaced. */
  it.each([
    ['active', 'SPM159 Hall Active (hold)', 'Hold'],
    ['expired', 'SPM159 Hall Expired (hold expired)', 'Hold expired'],
    ['standard', 'SPM159 Hall Standard', null],
  ] as const)('VEN-HOLD-04-SUP-EVENTS event list: a %s approved booking reads %s', async (kind, venueName, holdState) => {
    const venueId = await seedVenue(`SPM159 Hall ${kind[0].toUpperCase()}${kind.slice(1)}`);
    const event = await seedEvent(`SPM159 list ${kind}`);
    await seedApproved(event, venueId, kind);

    const list = await asCoordinator('/api/events').expect(200);
    const row = (list.body as Array<Record<string, unknown>>).find((item) => item.id === event.id);

    expect(row).toMatchObject({ venueName, venueRequestStatus: 'approved', venueHoldState: holdState });
    if (kind !== 'standard') expect(row).toMatchObject({ venueRequestKind: 'tentative_hold' });
    else expect(row).toMatchObject({ venueRequestKind: 'booking', venueHoldExpiresAt: null });
  });

  /** SPM-159 migration invariant: approved tentative holds require expiry; ordinary approvals and pending holds may keep NULL. */
  it('SPM-159 migration 025 rejects invalid approved holds and preserves allowed NULL expiry rows', async () => {
    const venueId = await seedVenue('SPM159 Constraint venue');
    const pendingEvent = await seedEvent('SPM159 Constraint pending');
    const ordinaryEvent = await seedEvent('SPM159 Constraint ordinary');
    const validHoldEvent = await seedEvent('SPM159 Constraint valid hold');

    const insert = async (eventId: string, status: string, kind: string, expiry: Date | null) =>
      pool.query(
        `INSERT INTO venue_bookings
           (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [venueId, eventId, new Date('2031-02-01T10:00:00Z'), new Date('2031-02-01T11:00:00Z'), status, kind, expiry],
      );

    await insert(pendingEvent.id, 'pending', 'tentative_hold', null);
    await insert(ordinaryEvent.id, 'approved', 'booking', null);
    await insert(validHoldEvent.id, 'approved', 'tentative_hold', ACTIVE_EXPIRY());

    const invalidEvent = await seedEvent('SPM159 Constraint invalid insert');
    await expect(insert(invalidEvent.id, 'approved', 'tentative_hold', null)).rejects.toMatchObject({
      code: '23514',
      constraint: 'venue_bookings_approved_tentative_hold_expiry_check',
    });

    const pendingRow = await pool.query<{ id: string }>(
      `SELECT id FROM venue_bookings WHERE event_id = $1`,
      [pendingEvent.id],
    );
    await expect(
      pool.query(`UPDATE venue_bookings SET status = 'approved' WHERE id = $1`, [pendingRow.rows[0].id]),
    ).rejects.toMatchObject({ code: '23514' });
    const unchanged = await pool.query<{ status: string; hold_expires_at: Date | null }>(
      'SELECT status, hold_expires_at FROM venue_bookings WHERE id = $1',
      [pendingRow.rows[0].id],
    );
    expect(unchanged.rows[0]).toEqual({ status: 'pending', hold_expires_at: null });

    const allowed = await pool.query<{ status: string; request_kind: string; hold_expires_at: Date | null }>(
      'SELECT status, request_kind, hold_expires_at FROM venue_bookings WHERE event_id = ANY($1::uuid[]) ORDER BY event_id',
      [[pendingEvent.id, ordinaryEvent.id, validHoldEvent.id]],
    );
    expect(allowed.rows).toHaveLength(3);
    expect(allowed.rows).toEqual(
      expect.arrayContaining([
        { status: 'pending', request_kind: 'tentative_hold', hold_expires_at: null },
        { status: 'approved', request_kind: 'booking', hold_expires_at: null },
        { status: 'approved', request_kind: 'tentative_hold', hold_expires_at: ACTIVE_EXPIRY() },
      ]),
    );

    // Simulate pre-migration bad data in this isolated fixture and verify migration 025 refuses to guess its expiry.
    const legacyEvent = await seedEvent('SPM159 Constraint legacy bad row');
    await pool.query('ALTER TABLE venue_bookings DROP CONSTRAINT venue_bookings_approved_tentative_hold_expiry_check');
    try {
      await insert(legacyEvent.id, 'approved', 'tentative_hold', null);
      const migration = await readFile(new URL('../migrations/025_spm159_approved_hold_expiry.sql', import.meta.url), 'utf8');
      await expect(pool.query(migration)).rejects.toThrow(/approved tentative hold row\(s\) have NULL hold_expires_at/);
    } finally {
      await pool.query(`UPDATE venue_bookings SET status = 'pending' WHERE event_id = $1`, [legacyEvent.id]);
      await pool.query(
        await readFile(new URL('../migrations/025_spm159_approved_hold_expiry.sql', import.meta.url), 'utf8'),
      );
    }
  });

  /**
   * SPM-159: readiness. An active or expired approved hold does not satisfy "Venue booking approval" and is never
   * confirmed in the checklist; a standard approved booking does. Safety is approved for the event so the venue is the
   * only open item.
   */
  it.each([
    ['active', 'Hold', 'pending'],
    ['expired', 'Hold expired', 'unavailable'],
  ] as const)('VEN-HOLD-04-SUP-EVENTS arrangements: a %s approved hold is %s and not confirmed', async (kind, label, itemStatus) => {
    const venueId = await seedVenue(`SPM159 Ready ${kind}`);
    const event = await seedEvent(`SPM159 ready ${kind}`);
    await seedApproved(event, venueId, kind);

    const result = await asCoordinator(`/api/events/${event.id}/arrangements-status`).expect(200);

    expect(result.body.ready).toBe(false);
    expect(result.body.outstanding).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'venue', state: label, detail: `SPM159 Ready ${kind} (${label})` }),
      ]),
    );
    expect(result.body.checklist.venue.status).toBe(itemStatus);
    expect(result.body.checklist.venue.items[0]).toMatchObject({ status: itemStatus, holdState: label });
    expect(result.body.checklist.canRequestSafetyCheck).toBe(false);
  });

  /** SPM-159: an ordinary approved booking keeps satisfying the venue item and shows no hold label. */
  it('VEN-HOLD-04-SUP-EVENTS arrangements: a standard approved booking stays confirmed', async () => {
    const venueId = await seedVenue('SPM159 Ready standard');
    const event = await seedEvent('SPM159 ready standard');
    await seedApproved(event, venueId, 'standard');

    const result = await asCoordinator(`/api/events/${event.id}/arrangements-status`).expect(200);

    expect(result.body.outstanding.filter((item: { type: string }) => item.type === 'venue')).toEqual([]);
    expect(result.body.checklist.venue.status).toBe('confirmed');
    expect(result.body.checklist.venue.items[0]).not.toHaveProperty('holdState');
  });

  /** SPM-159: Confirm is refused while the only venue is an approved hold, whether it is running or expired. */
  it.each(['active', 'expired'] as const)('VEN-HOLD-04-SUP-EVENTS confirm: blocked while the only venue is a %s approved hold', async (kind) => {
    const venueId = await seedVenue(`SPM159 Confirm ${kind}`);
    const event = await seedEvent(`SPM159 confirm ${kind}`);
    await seedApproved(event, venueId, kind);
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
       VALUES ($1, 'approved', now(), 'SPM-159') ON CONFLICT (event_id) DO UPDATE SET status = 'approved'`,
      [event.id],
    );

    const response = await request(http())
      .post(`/api/events/${event.id}/status-change`)
      .set('Cookie', coordinator.cookie)
      .send({ targetStatus: 'Confirmed' });

    expect(response.status).toBeGreaterThanOrEqual(400);
    const stored = await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [event.id]);
    expect(stored.rows[0].status).toBe('Planning');
  });

  /** SPM-159: the planning page reads an approved hold as Hold or Hold expired, never Booked; a standard booking is Booked. */
  it.each([
    ['active', 'Hold'],
    ['expired', 'Hold expired'],
    ['standard', 'Booked'],
  ] as const)('VEN-HOLD-04-SUP-EVENTS planning: a %s approved booking is labelled %s', async (kind, label) => {
    const venueId = await seedVenue(`SPM159 Plan ${kind}`);
    const event = await seedEvent(`SPM159 plan ${kind}`);
    await seedApproved(event, venueId, kind);

    const view = await asCoordinator(`/api/events/${event.id}/planning`).expect(200);

    expect(view.body.venueBookings).toEqual([expect.objectContaining({ status: label, requestStatus: 'approved' })]);
  });

  /**
   * SPM-159: another event's approved hold is a clashing neighbour only while it runs. Both events use the same
   * window at one venue; the expired hold of the other event is not listed, its active hold is, and a standard booking is.
   */
  it.each([
    ['active', 1],
    ['expired', 0],
    ['standard', 1],
  ] as const)('VEN-HOLD-04-SUP-EVENTS neighbours: another event\'s %s approved booking gives %i clashing neighbour(s)', async (kind, count) => {
    const venueId = await seedVenue(`SPM159 Neighbour ${kind}`);
    const mine = await seedEvent(`SPM159 neighbour mine ${kind}`, 20);
    const other = await seedEvent(`SPM159 neighbour other ${kind}`, 20);
    await seedApproved(mine, venueId, 'standard');
    await seedApproved(other, venueId, kind);

    const repository = app.get(EventPlanningRepository, { strict: false });
    const rows = await repository.listVenueBookings(mine.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].neighbours).toHaveLength(count);
  });

  /** SPM-159 (SPM-48 AC8, AC9): the queue lists approved holds with their state; only an active hold raises the venue-unavailable flag. */
  it.each([
    ['active', 'ACTIVE', ['SPM159 Queue active'], []],
    ['expired', 'EXPIRED', [], ['HOLD_EXPIRED']],
  ] as const)('VEN-HOLD-04-SUP-EVENTS queue: a %s approved hold is listed as %s', async (kind, state, unavailable, actions) => {
    const venueId = await seedVenue(`SPM159 Queue ${kind}`);
    const event = await seedEvent(`SPM159 queue ${kind}`);
    await seedApproved(event, venueId, kind);
    // A Venue Staff blockout over the booking's window makes the venue unavailable for it (SPM-122).
    await pool.query(
      `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason)
       VALUES ($1, $2, $3, 'blocked', 'Maintenance')`,
      [venueId, event.start, event.end],
    );

    const queue = await asCoordinator('/api/coordinator/queue').expect(200);
    const row = (queue.body as Array<{ id: string; queue: Record<string, unknown> }>).find((item) => item.id === event.id);

    expect(row?.queue).toMatchObject({
      holds: [{ venueName: `SPM159 Queue ${kind}`, state }],
      unavailableVenues: [...unavailable],
      actions: [...(unavailable.length ? ['VENUE_UNAVAILABLE'] : []), ...actions],
    });
  });
});
