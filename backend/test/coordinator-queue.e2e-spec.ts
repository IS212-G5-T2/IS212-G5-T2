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
import { CLOCK, type Clock } from '../src/common/clock.js';

/*
 * SPM-48 Monitor Workspace Queue & Status (Coordinator). Real Nest pipeline, real PostgreSQL.
 * Needs TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 023 applied
 * (023 allows the 'rejected' safety state, SPM-48 AC7).
 *
 * Test cases: MONITOR-QUEUE-01-A to 01-F, 02-A, 02-B, 03-A, 03-B, 04-A, 04-B, 06-A, 06-B, 07-A to 07-C,
 * 08-A, 08-B, 09-A, 09-B (Confluence "Monitor Workspace Queue & Status Matrix"). 05-A and 05-B are
 * visual and live in the frontend tests; 05-B's action-needed set is asserted here too, as `queue.actions`.
 *
 * Fixtures follow the Confluence test data: EVT-401 to EVT-415, COO-01 to COO-03, LEAD-01, ORG-01,
 * ATT-01 and VS-01. The Safety Officer stories (SPM-129 to SPM-131) are not built, so a Safety Officer
 * outcome is written to event_safety_checks directly (the same rows SPM-130 will write).
 *
 * Time comes from a fixed CLOCK. 08-B's hold expires 2026-11-10 12:00:00 SGT (04:00:00Z).
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-48 tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const PASSWORD = 'password123';
/** 2026-11-10 11:00:00 SGT; every event below starts in December 2026. */
const DEFAULT_NOW = new Date('2026-11-10T03:00:00.000Z');
/** MONITOR-QUEUE-08-A: T+2d 12:00 SGT. */
const ACTIVE_HOLD_EXPIRY = new Date('2026-11-12T04:00:00.000Z');
/** MONITOR-QUEUE-08-B subtest C: expired T-1d. */
const EXPIRED_HOLD_EXPIRY = new Date('2026-11-09T04:00:00.000Z');
/** MONITOR-QUEUE-08-B subtests A and B: H1 expires 2026-11-10 12:00:00 SGT. */
const H1_EXPIRY = new Date('2026-11-10T04:00:00.000Z');

type User = { uid: string; cookie: string; name: string };
type QueueRow = {
  id: string;
  name: string;
  status: string;
  coordinatorId?: string;
  reassignedFrom?: { coordinatorName: string; reassignedAt: string };
  venueName?: string;
  venueRequestStatus?: string | null;
  queue: {
    safety: string | null;
    holds: { venueName: string; expiresAt: string; state: string }[];
    unavailableVenues: string[];
    actions: string[];
    needsAction: boolean;
  };
};

describe.skipIf(!database)('SPM-48 Monitor Workspace Queue & Status (coordinator, e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let now: Date;
  const clock: Clock = { now: () => now };
  let createdEventIds: string[];
  let createdDraftIds: string[];
  let createdUserIds: string[];
  let createdVenueIds: string[];
  let coo1: User;
  let coo2: User;
  let coo3: User;
  let lead: User;
  let org1: User;
  let att1: User;
  let vs1: User;
  let dayOffset: number;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: database });
    // Idempotent migrations this suite relies on, so it can run first on a fresh database. 019 restores the
    // 'cancelled' booking status after suites that re-apply migration 011 (as venues-booking-requests does).
    for (const file of ['001_event_drafts.sql', '019_spm54_venue_booking_lifecycle.sql', '023_spm48_safety_rejected.sql'])
      await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    now = DEFAULT_NOW;
    dayOffset = 0;
    createdEventIds = [];
    createdDraftIds = [];
    createdUserIds = [];
    createdVenueIds = [];
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    coo1 = await createUser('COORDINATOR', 'COO-01 Coordinator');
    coo2 = await createUser('COORDINATOR', 'COO-02 Coordinator');
    coo3 = await createUser('COORDINATOR', 'COO-03 Coordinator');
    lead = await createUser('COORDINATOR_LEAD', 'LEAD-01 Lead');
    org1 = await createUser('ORGANISER', 'ORG-01 Organiser');
    att1 = await createUser('ATTENDEE', 'ATT-01 Attendee');
    vs1 = await createUser('VENUE_STAFF', 'VS-01 Venue Staff');
  });

  afterEach(async () => {
    await app.close();
    if (createdDraftIds.length)
      await pool.query('DELETE FROM event_drafts WHERE id = ANY($1::uuid[])', [createdDraftIds]);
    if (createdEventIds.length)
      await pool.query('DELETE FROM event_drafts WHERE event_id = ANY($1::uuid[])', [createdEventIds]);
    if (createdEventIds.length)
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdVenueIds.length)
      await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [createdVenueIds]);
    if (createdUserIds.length) {
      await pool.query('DELETE FROM notifications WHERE recipient_id = ANY($1::text[])', [createdUserIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  const http = () => app.getHttpServer();

  async function createUser(role: string, name: string): Promise<User> {
    const email = `spm48-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 4))) RETURNING id`, // cost 4: fixtures only
      [email, name, PASSWORD],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const response = await request(http()).post('/api/auth/login').send({ email, password: PASSWORD }).expect(201);
    const cookie = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) =>
      value.startsWith('connectsphere_session='),
    );
    if (!cookie) throw new Error('Expected a PostgreSQL authentication session cookie');
    return { uid, cookie: cookie.split(';', 1)[0], name };
  }

  /** Each event gets its own December day so no two fixtures share a venue window by accident. */
  function nextWindow() {
    dayOffset += 1;
    const start = new Date(Date.UTC(2026, 11, dayOffset, 2, 0, 0));
    return { start, end: new Date(start.getTime() + 2 * 3_600_000) };
  }

  async function seedEvent(options: {
    name: string;
    status: string;
    coordinator?: User | null;
    equipmentConfirmed?: boolean;
  }): Promise<{ id: string; start: Date; end: Date }> {
    const id = randomUUID();
    const { start, end } = nextWindow();
    await pool.query(
      `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name,
        attachments, status, submission_key, rejection_reason, equipment_confirmed_at)
       VALUES ($1,$2,'ORG-01 Organiser','org1@example.test',$3,'Testing','Queue fixture',
        $4,$5,40,$6,$7,'[]',$8,$1,$9,$10)`,
      [
        id,
        org1.uid,
        options.name,
        start,
        end,
        options.coordinator?.uid ?? null,
        options.coordinator?.name ?? null,
        options.status,
        options.status === 'Rejected' ? 'Not suitable for this programme' : null,
        options.equipmentConfirmed ? DEFAULT_NOW : null,
      ],
    );
    createdEventIds.push(id);
    return { id, start, end };
  }

  async function seedVenue(name: string, buffers = { setup: 0, turnaround: 0 }): Promise<string> {
    const created = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
                           setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, 'Level 1', 200, 'Weekdays 08:00 to 22:00', $3, $4) RETURNING id`,
      [vs1.uid, name, buffers.setup, buffers.turnaround],
    );
    createdVenueIds.push(created.rows[0].id);
    return created.rows[0].id;
  }

  async function seedBooking(
    event: { id: string; start: Date; end: Date },
    venueId: string,
    status: 'pending' | 'approved',
    holdExpiresAt: Date | null = null,
  ): Promise<string> {
    const created = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, hold_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [venueId, event.id, event.start, event.end, status, holdExpiresAt],
    );
    return created.rows[0].id;
  }

  /** Written after the bookings: a booking change resets the safety check (SPM-135 trigger). */
  async function setSafety(eventId: string, status: 'pending' | 'changes_needed' | 'approved' | 'rejected') {
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
       VALUES ($1, $2, $3, 'COO-01 Coordinator')
       ON CONFLICT (event_id) DO UPDATE SET status = EXCLUDED.status`,
      [eventId, status, DEFAULT_NOW],
    );
  }

  /** VS-01 marks a venue unavailable through the SPM-122 route. */
  async function markUnavailable(venueId: string, start: Date, end: Date): Promise<string> {
    const response = await request(http())
      .post(`/api/venues/${venueId}/unavailable-periods`)
      .set('Cookie', vs1.cookie)
      .send({ start: start.toISOString(), end: end.toISOString(), reason: 'Maintenance' })
      .expect(201);
    return response.body.period.id as string;
  }

  async function seedDraft(name: string): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO event_drafts (id, organiser_id, fields, status, version) VALUES ($1, $2, $3, 'Draft', 0)`,
      [id, org1.uid, JSON.stringify({ name })],
    );
    createdDraftIds.push(id);
    return id;
  }

  const queue = (user: User, query = '') =>
    request(http()).get(`/api/coordinator/queue${query}`).set('Cookie', user.cookie);

  async function queueRows(user: User, query = ''): Promise<QueueRow[]> {
    return (await queue(user, query).expect(200)).body as QueueRow[];
  }

  const byName = (rows: QueueRow[], name: string) => rows.find((row) => row.name === name);

  /** The Confluence fixture set (MONITOR-QUEUE-01-A pre-conditions). */
  async function seedStandardFixtures() {
    const venueA = await seedVenue('SPM48 Hall A');
    const venueB = await seedVenue('SPM48 Hall B');
    const events: Record<string, { id: string; start: Date; end: Date }> = {};
    events['EVT-401'] = await seedEvent({ name: 'EVT-401', status: 'Submitted' });
    events['EVT-402'] = await seedEvent({ name: 'EVT-402', status: 'Submitted' });
    events['EVT-403'] = await seedEvent({ name: 'EVT-403', status: 'Submitted', coordinator: coo1 });
    events['EVT-404'] = await seedEvent({ name: 'EVT-404', status: 'Planning', coordinator: coo1, equipmentConfirmed: true });
    await seedBooking(events['EVT-404'], venueA, 'approved');
    await setSafety(events['EVT-404'].id, 'pending');
    events['EVT-405'] = await seedEvent({ name: 'EVT-405', status: 'Planning', coordinator: coo1, equipmentConfirmed: true });
    await seedBooking(events['EVT-405'], venueA, 'approved');
    await setSafety(events['EVT-405'].id, 'changes_needed');
    events['EVT-406'] = await seedEvent({ name: 'EVT-406', status: 'Confirmed', coordinator: coo1, equipmentConfirmed: true });
    await seedBooking(events['EVT-406'], venueA, 'approved');
    await setSafety(events['EVT-406'].id, 'approved');
    events['EVT-407'] = await seedEvent({ name: 'EVT-407', status: 'Planning', coordinator: coo1 });
    await seedBooking(events['EVT-407'], venueA, 'pending', ACTIVE_HOLD_EXPIRY);
    events['EVT-408'] = await seedEvent({ name: 'EVT-408', status: 'Planning', coordinator: coo1 });
    await seedBooking(events['EVT-408'], venueB, 'approved');
    await markUnavailable(venueB, events['EVT-408'].start, events['EVT-408'].end);
    events['EVT-409'] = await seedEvent({ name: 'EVT-409', status: 'Approved', coordinator: coo1 });
    events['EVT-410'] = await seedEvent({ name: 'EVT-410', status: 'Completed', coordinator: coo1 });
    events['EVT-411'] = await seedEvent({ name: 'EVT-411', status: 'Cancelled', coordinator: coo1 });
    events['EVT-412'] = await seedEvent({ name: 'EVT-412', status: 'Rejected', coordinator: coo1 });
    events['EVT-413'] = await seedEvent({ name: 'EVT-413', status: 'Planning', coordinator: coo2 });
    const draft = await seedDraft('EVT-414');
    events['EVT-415'] = await seedEvent({ name: 'EVT-415', status: 'Planning', coordinator: coo1 });
    await seedBooking(events['EVT-415'], venueA, 'pending', EXPIRED_HOLD_EXPIRY);
    return { events, draft, venueA, venueB };
  }

  const COO1_EVENTS = [
    'EVT-403', 'EVT-404', 'EVT-405', 'EVT-406', 'EVT-407', 'EVT-408',
    'EVT-409', 'EVT-410', 'EVT-411', 'EVT-412', 'EVT-415',
  ];

  describe('AC1: events assigned to me only', () => {
    /** MONITOR-QUEUE-01-A: COO-01's queue holds exactly their 11 assigned events; unassigned EVT-401 and EVT-402 are absent. */
    it('MONITOR-QUEUE-01-A lists all and only the coordinator’s assigned events', async () => {
      await seedStandardFixtures();
      const response = await queue(coo1).expect(200);
      const names = (response.body as QueueRow[]).map((row) => row.name).sort();
      expect(names).toEqual([...COO1_EVENTS].sort());
      expect((response.body as QueueRow[]).every((row) => row.coordinatorId === coo1.uid)).toBe(true);
      // AC4 / 04-A: served with no cache.
      expect(response.headers['cache-control']).toBe('no-store');
    });

    /** MONITOR-QUEUE-01-B: another coordinator’s event and a draft are not in the queue, and opening EVT-413 directly returns no data. */
    it('MONITOR-QUEUE-01-B excludes another coordinator’s event and refuses a direct open', async () => {
      const { events } = await seedStandardFixtures();
      const names = (await queueRows(coo1)).map((row) => row.name);
      expect(names).not.toContain('EVT-413');
      expect(names).not.toContain('EVT-414');
      const direct = await request(http()).get(`/api/events/${events['EVT-413'].id}`).set('Cookie', coo1.cookie);
      // The event detail route answers a coordinator who never held the event with 404 and no event data
      // (SPM-38 AC4: existence is not leaked); the test case's "403" is recorded as a spec conflict (SC-SPM48-01).
      expect(direct.status).toBe(404);
      expect(direct.body).not.toHaveProperty('name');
    });

    /** MONITOR-QUEUE-01-C: nothing assigned gives an empty list (HTTP 200), even while unassigned Submitted requests exist. */
    it('MONITOR-QUEUE-01-C returns an empty queue when nothing is assigned', async () => {
      await seedStandardFixtures();
      const response = await queue(coo3).expect(200);
      expect(response.body).toEqual([]);
    });

    /** MONITOR-QUEUE-01-D: organisers and attendees get 403, a request with no session gets 401. */
    it('MONITOR-QUEUE-01-D lets only coordinators read the queue', async () => {
      await queue(att1).expect(403);
      const organiser = await queue(org1).expect(403);
      expect(organiser.body.message).toBe('Coordinator access required.');
      await queue(lead).expect(403);
      await request(http()).get('/api/coordinator/queue').expect(401);
    });

    /** MONITOR-QUEUE-01-E: a Submitted request joins the queue once LEAD-01 assigns it to COO-01. */
    it('MONITOR-QUEUE-01-E shows a request after the Lead assigns it', async () => {
      const event = await seedEvent({ name: 'EVT-401 clone', status: 'Submitted' });
      expect((await queueRows(coo1)).map((row) => row.name)).not.toContain('EVT-401 clone');
      await request(http())
        .post(`/api/lead/queue/${event.id}/assign`)
        .set('Cookie', lead.cookie)
        .send({ coordinatorId: coo1.uid })
        .expect(201);
      const row = byName(await queueRows(coo1), 'EVT-401 clone');
      expect(row).toMatchObject({ status: 'submitted', coordinatorId: coo1.uid });
    });

    /** MONITOR-QUEUE-01-F: after LEAD-01 reassigns EVT-409 to COO-02, it leaves COO-01’s queue and shows as Reassigned for COO-02. */
    it('MONITOR-QUEUE-01-F moves a reassigned event between queues', async () => {
      const event = await seedEvent({ name: 'EVT-409 clone', status: 'Approved', coordinator: coo1 });
      await request(http())
        .post(`/api/lead/events/${event.id}/reassign`)
        .set('Cookie', lead.cookie)
        .send({ coordinatorId: coo2.uid, currentCoordinatorId: coo1.uid })
        .expect(201);
      expect((await queueRows(coo1)).map((row) => row.name)).not.toContain('EVT-409 clone');
      const moved = byName(await queueRows(coo2), 'EVT-409 clone');
      expect(moved).toMatchObject({ status: 'approved', reassignedFrom: { coordinatorName: 'COO-01 Coordinator' } });
    });
  });

  describe('AC2: standard status terms', () => {
    /** MONITOR-QUEUE-02-A: each fixture's status reads as its standard term. */
    it('MONITOR-QUEUE-02-A reports each event’s status by its standard term', async () => {
      await seedStandardFixtures();
      const rows = await queueRows(coo1);
      const expected: Record<string, string> = {
        'EVT-403': 'submitted',
        'EVT-409': 'approved',
        'EVT-404': 'planning',
        'EVT-406': 'confirmed',
        'EVT-410': 'completed',
        'EVT-411': 'cancelled',
        'EVT-412': 'rejected',
      };
      for (const [name, status] of Object.entries(expected)) expect(byName(rows, name)?.status).toBe(status);
    });

    /** MONITOR-QUEUE-02-B: every status value is one of the seven terms; Under Review, Pending and Draft never appear. */
    it('MONITOR-QUEUE-02-B never returns a status outside the seven terms', async () => {
      await seedStandardFixtures();
      const statuses = new Set((await queueRows(coo1)).map((row) => row.status));
      expect([...statuses].sort()).toEqual(
        ['approved', 'cancelled', 'completed', 'confirmed', 'planning', 'rejected', 'submitted'],
      );
    });

    /** Supporting (MONITOR-QUEUE-01-SUP-FILTER, AC1/AC2): the optional status filter narrows the queue; an unknown status is refused. */
    it('MONITOR-QUEUE-01-SUP-FILTER filters by status and refuses an unknown status', async () => {
      await seedStandardFixtures();
      const planning = (await queueRows(coo1, '?status=Planning')).map((row) => row.name).sort();
      expect(planning).toEqual(['EVT-404', 'EVT-405', 'EVT-407', 'EVT-408', 'EVT-415']);
      const two = (await queueRows(coo1, '?status=submitted,approved')).map((row) => row.name).sort();
      expect(two).toEqual(['EVT-403', 'EVT-409']);
      expect(await queueRows(coo3, '?status=planning')).toEqual([]);
      const unknown = await queue(coo1, '?status=Under%20Review').expect(400);
      expect(unknown.body.message).toBe('Unknown status filter: Under Review.');
      await queue(coo1, '?status=draft').expect(400);
    });
  });

  describe('AC3: drafts are not in the queue', () => {
    /** MONITOR-QUEUE-03-A: ORG-01's draft is in no queue response, and the event route has no event with its id. */
    it('MONITOR-QUEUE-03-A hides a draft from the coordinator in every route', async () => {
      const { draft } = await seedStandardFixtures();
      const rows = await queueRows(coo1);
      expect(rows.map((row) => row.id)).not.toContain(draft);
      expect(rows.map((row) => row.name)).not.toContain('EVT-414');
      const direct = await request(http()).get(`/api/events/${draft}`).set('Cookie', coo1.cookie);
      expect(direct.status).toBe(404);
      expect(direct.body).not.toHaveProperty('name');
    });

    /** MONITOR-QUEUE-03-B: a submitted draft stays out of the queue until LEAD-01 assigns it, then shows as Submitted. */
    it('MONITOR-QUEUE-03-B shows a draft only once it is submitted and assigned', async () => {
      const id = randomUUID();
      createdEventIds.push(id);
      await request(http())
        .put(`/api/requests/${id}`)
        .set('Cookie', org1.cookie)
        .send({
          fields: { name: 'EVT-414 clone', purpose: 'Testing', description: 'Queue draft', expectedAttendance: '25', layout: 'Theatre' },
          version: 0,
          operationId: randomUUID(),
        })
        .expect(200);
      expect((await queueRows(coo1)).map((row) => row.id)).not.toContain(id);
      await request(http())
        .post(`/api/requests/${id}/submit`)
        .set('Cookie', org1.cookie)
        .send({ version: 1, startDateTime: '2026-12-20T02:00:00.000Z', endDateTime: '2026-12-20T04:00:00.000Z' })
        .expect(201);
      // After step 1: submitted but unassigned, so still not in the queue.
      expect((await queueRows(coo1)).map((row) => row.id)).not.toContain(id);
      await request(http())
        .post(`/api/lead/queue/${id}/assign`)
        .set('Cookie', lead.cookie)
        .send({ coordinatorId: coo1.uid })
        .expect(201);
      const row = (await queueRows(coo1)).find((item) => item.id === id);
      expect(row).toMatchObject({ name: 'EVT-414 clone', status: 'submitted' });
    });
  });

  describe('AC4: latest status on refresh or revisit', () => {
    /** MONITOR-QUEUE-04-A: a status change made elsewhere shows on the next read, which is never cacheable. */
    it('MONITOR-QUEUE-04-A shows a status change on refresh', async () => {
      const event = await seedEvent({ name: 'EVT-404 clone', status: 'Planning', coordinator: coo1 });
      expect(byName(await queueRows(coo1), 'EVT-404 clone')?.status).toBe('planning');
      // Another session changes the status (the Confirm route itself is covered by SPM-135).
      await pool.query(`UPDATE events SET status = 'Confirmed' WHERE id = $1`, [event.id]);
      const refreshed = await queue(coo1).expect(200);
      expect(byName(refreshed.body as QueueRow[], 'EVT-404 clone')?.status).toBe('confirmed');
      expect(refreshed.headers['cache-control']).toBe('no-store');
    });

    /** MONITOR-QUEUE-04-B: on revisit the queue has the newly assigned request and the new status of EVT-403. */
    it('MONITOR-QUEUE-04-B shows new requests and status changes on revisit', async () => {
      const evt403 = await seedEvent({ name: 'EVT-403 clone', status: 'Submitted', coordinator: coo1 });
      expect((await queueRows(coo1)).map((row) => row.name)).toEqual(['EVT-403 clone']);
      const fresh = await seedEvent({ name: 'New request', status: 'Submitted' });
      await request(http())
        .post(`/api/lead/queue/${fresh.id}/assign`)
        .set('Cookie', lead.cookie)
        .send({ coordinatorId: coo1.uid })
        .expect(201);
      await request(http()).post(`/api/events/${evt403.id}/approve`).set('Cookie', coo1.cookie).expect(201);
      const rows = await queueRows(coo1);
      expect(byName(rows, 'New request')?.status).toBe('submitted');
      expect(byName(rows, 'EVT-403 clone')?.status).toBe('approved');
    });
  });

  describe('AC5: what needs action', () => {
    /** MONITOR-QUEUE-05-B (data): the four action-needed fixtures carry action reasons; EVT-406, EVT-410 and EVT-411 carry none. */
    it('MONITOR-QUEUE-05-B marks exactly the action-needed events', async () => {
      await seedStandardFixtures();
      const rows = await queueRows(coo1);
      expect(byName(rows, 'EVT-403')?.queue.actions).toEqual(['AWAITING_REVIEW']);
      expect(byName(rows, 'EVT-405')?.queue.actions).toEqual(['SAFETY_CHANGES_REQUESTED']);
      expect(byName(rows, 'EVT-408')?.queue.actions).toEqual(['VENUE_UNAVAILABLE']);
      expect(byName(rows, 'EVT-415')?.queue.actions).toEqual(['HOLD_EXPIRED']);
      for (const name of ['EVT-406', 'EVT-410', 'EVT-411'])
        expect(byName(rows, name)?.queue).toMatchObject({ actions: [], needsAction: false });
      expect(byName(rows, 'EVT-403')?.queue.needsAction).toBe(true);
    });
  });

  describe('AC6 and AC7: safety check', () => {
    /** MONITOR-QUEUE-06-A: EVT-404 awaits the Safety Officer; EVT-406 and EVT-405 do not. */
    it('MONITOR-QUEUE-06-A identifies events awaiting a Safety Officer check', async () => {
      await seedStandardFixtures();
      const rows = await queueRows(coo1);
      expect(byName(rows, 'EVT-404')?.queue.safety).toBe('AWAITING_CHECK');
      // Confirmed with an approved check shows no safety label (owner decision, 18 Oct 2026).
      expect(byName(rows, 'EVT-406')?.queue.safety).toBeNull();
      expect(byName(rows, 'EVT-405')?.queue.safety).toBe('CHANGES_REQUESTED');
    });

    /**
     * MONITOR-QUEUE-06-B: approving ORG-01's change resets the safety check, so the queue shows it must be
     * re-requested (status Planning); once COO-01 re-requests it, the event awaits the Safety Officer.
     */
    it('MONITOR-QUEUE-06-B shows the safety check reset after an approved change, then awaiting once re-requested', async () => {
      const venue = await seedVenue('SPM48 Hall C');
      const event = await seedEvent({ name: 'EVT-406 clone', status: 'Confirmed', coordinator: coo1, equipmentConfirmed: true });
      await seedBooking(event, venue, 'approved');
      await setSafety(event.id, 'approved');
      expect(byName(await queueRows(coo1), 'EVT-406 clone')?.queue).toMatchObject({ safety: null, needsAction: false });

      const change = await request(http())
        .post(`/api/events/${event.id}/change-requests`)
        .set('Cookie', org1.cookie)
        .send({ changes: { description: 'Revised programme.' } })
        .expect(201);
      await request(http())
        .post(`/api/events/${event.id}/change-requests/${change.body.id}/approve`)
        .set('Cookie', coo1.cookie)
        .send({})
        .expect(200);
      const reset = byName(await queueRows(coo1), 'EVT-406 clone');
      expect(reset).toMatchObject({ status: 'planning', queue: { safety: 'RESET', actions: ['SAFETY_RESET'] } });

      await request(http()).post(`/api/events/${event.id}/safety-check/request`).set('Cookie', coo1.cookie).expect(200);
      const awaiting = byName(await queueRows(coo1), 'EVT-406 clone');
      expect(awaiting?.queue).toMatchObject({ safety: 'AWAITING_CHECK', actions: [], needsAction: false });
    });

    /** MONITOR-QUEUE-07-A: EVT-405 shows safety changes requested; EVT-404 does not. */
    it('MONITOR-QUEUE-07-A identifies events with safety changes requested', async () => {
      await seedStandardFixtures();
      const rows = await queueRows(coo1);
      expect(byName(rows, 'EVT-405')?.queue.safety).toBe('CHANGES_REQUESTED');
      expect(byName(rows, 'EVT-404')?.queue.safety).toBe('AWAITING_CHECK');
    });

    /** MONITOR-QUEUE-07-B: resubmitting removes the changes-requested flag (awaiting shows); approval removes both. */
    it('MONITOR-QUEUE-07-B clears the flags on resubmission and approval', async () => {
      const venue = await seedVenue('SPM48 Hall D');
      const event = await seedEvent({ name: 'EVT-405 clone', status: 'Planning', coordinator: coo1, equipmentConfirmed: true });
      await seedBooking(event, venue, 'approved');
      await setSafety(event.id, 'changes_needed');
      await request(http()).post(`/api/events/${event.id}/safety-check/request`).set('Cookie', coo1.cookie).expect(200);
      expect(byName(await queueRows(coo1), 'EVT-405 clone')?.queue.safety).toBe('AWAITING_CHECK');
      // SAF-01 approves (SPM-130 not built: the outcome row is written directly).
      await setSafety(event.id, 'approved');
      const approved = byName(await queueRows(coo1), 'EVT-405 clone');
      expect(approved?.queue).toMatchObject({ safety: 'CLEARED', actions: [], needsAction: false });
    });

    /** MONITOR-QUEUE-07-C: a rejected arrangement is flagged, no longer awaiting, and distinct from changes requested. */
    it('MONITOR-QUEUE-07-C identifies events whose safety arrangement was rejected', async () => {
      const { events } = await seedStandardFixtures();
      // SAF-01 rejects EVT-404's arrangement (SPM-130 not built).
      await setSafety(events['EVT-404'].id, 'rejected');
      const rows = await queueRows(coo1);
      expect(byName(rows, 'EVT-404')).toMatchObject({
        status: 'planning',
        queue: { safety: 'REJECTED', actions: ['SAFETY_REJECTED'], needsAction: true },
      });
      expect(byName(rows, 'EVT-405')?.queue.safety).toBe('CHANGES_REQUESTED');
    });
  });

  describe('AC8: tentative venue holds', () => {
    /** MONITOR-QUEUE-08-A: EVT-407's hold is active with its expiry instant, and is not reported as an approved booking. */
    it('MONITOR-QUEUE-08-A shows an active hold with its expiry', async () => {
      await seedStandardFixtures();
      const row = byName(await queueRows(coo1), 'EVT-407');
      expect(row?.queue.holds).toEqual([
        { venueName: 'SPM48 Hall A', expiresAt: '2026-11-12T04:00:00.000Z', state: 'ACTIVE' },
      ]);
      expect(row?.queue.needsAction).toBe(false);
      // Not an approved booking: the request is still pending and the venue reads as pending.
      expect(row).toMatchObject({ venueRequestStatus: 'pending', venueName: 'SPM48 Hall A (pending)' });
    });

    /** MONITOR-QUEUE-08-B: H1 is active at 11:59:59 SGT and expired at 12:00:00 SGT; EVT-415's past hold is expired. */
    it('MONITOR-QUEUE-08-B flips a hold to expired exactly at its expiry', async () => {
      const venue = await seedVenue('SPM48 Hall E');
      const h1 = await seedEvent({ name: 'H1 event', status: 'Planning', coordinator: coo1 });
      await seedBooking(h1, venue, 'pending', H1_EXPIRY);
      now = new Date('2026-11-10T03:59:59.000Z');
      expect(byName(await queueRows(coo1), 'H1 event')?.queue.holds[0].state).toBe('ACTIVE');
      now = new Date('2026-11-10T04:00:00.000Z');
      const expired = byName(await queueRows(coo1), 'H1 event');
      expect(expired?.queue.holds[0].state).toBe('EXPIRED');
      expect(expired?.queue.actions).toEqual(['HOLD_EXPIRED']);

      now = DEFAULT_NOW;
      const evt415 = await seedEvent({ name: 'EVT-415 clone', status: 'Planning', coordinator: coo1 });
      await seedBooking(evt415, venue, 'pending', EXPIRED_HOLD_EXPIRY);
      const row = byName(await queueRows(coo1), 'EVT-415 clone');
      expect(row?.queue.holds).toEqual([
        { venueName: 'SPM48 Hall E', expiresAt: '2026-11-09T04:00:00.000Z', state: 'EXPIRED' },
      ]);
      // An expired hold is never shown as a confirmed booking: the request stays pending and needs action.
      expect(row).toMatchObject({ venueRequestStatus: 'pending', queue: { actions: ['HOLD_EXPIRED'], needsAction: true } });
    });
  });

  describe('AC9: venue became unavailable', () => {
    /** MONITOR-QUEUE-09-A: EVT-408 is flagged, not cancelled, with its booking kept; EVT-406 is not flagged. */
    it('MONITOR-QUEUE-09-A flags events whose venue was marked unavailable', async () => {
      const { events } = await seedStandardFixtures();
      const rows = await queueRows(coo1);
      expect(byName(rows, 'EVT-408')).toMatchObject({
        status: 'planning',
        queue: { unavailableVenues: ['SPM48 Hall B'], actions: ['VENUE_UNAVAILABLE'] },
      });
      expect(byName(rows, 'EVT-406')?.queue.unavailableVenues).toEqual([]);
      // The original booking is preserved (SPM-122 AC8).
      const booking = await pool.query('SELECT status FROM venue_bookings WHERE event_id = $1', [events['EVT-408'].id]);
      expect(booking.rows).toEqual([{ status: 'approved' }]);
    });

    /**
     * MONITOR-QUEUE-09-A boundary: overlap is exclusive at both ends (venue-unavailable.ts). With no setup or
     * turnaround time, a period that ends exactly when the booking starts, or starts exactly when it ends, does not
     * flag it; a one-minute overlap does.
     */
    it('MONITOR-QUEUE-09-A does not flag an unavailable period that only touches the booking window', async () => {
      const MINUTE = 60_000;
      const before = await seedVenue('SPM48 Hall J');
      const after = await seedVenue('SPM48 Hall K');
      const overlap = await seedVenue('SPM48 Hall L');
      const touching = await seedEvent({ name: 'Touching periods', status: 'Planning', coordinator: coo1 });
      await seedBooking(touching, before, 'approved');
      await seedBooking(touching, after, 'approved');
      await markUnavailable(before, new Date(touching.start.getTime() - 60 * MINUTE), touching.start);
      await markUnavailable(after, touching.end, new Date(touching.end.getTime() + 60 * MINUTE));
      expect(byName(await queueRows(coo1), 'Touching periods')?.queue).toMatchObject({
        unavailableVenues: [],
        actions: [],
      });

      const overlapping = await seedEvent({ name: 'Overlapping period', status: 'Planning', coordinator: coo1 });
      await seedBooking(overlapping, overlap, 'approved');
      await markUnavailable(overlap, new Date(overlapping.end.getTime() - MINUTE), new Date(overlapping.end.getTime() + 60 * MINUTE));
      expect(byName(await queueRows(coo1), 'Overlapping period')?.queue.unavailableVenues).toEqual(['SPM48 Hall L']);
    });

    /**
     * MONITOR-QUEUE-09-A buffers (owner decision, 23 Oct 2026; SPM-122 AC7, SPM-54 AC2): the booking's window is
     * widened by the venue's setup time before it and turnaround time after it. A period inside the setup or
     * turnaround time flags the booking in the queue, the venue label and Confirm readiness alike; a period that
     * only touches the widened window does not.
     */
    it('MONITOR-QUEUE-09-A counts the venue setup and turnaround time', async () => {
      const MINUTE = 60_000;
      const buffers = { setup: 30, turnaround: 15 };
      const inSetup = await seedVenue('SPM48 Hall M', buffers);
      const inTurnaround = await seedVenue('SPM48 Hall N', buffers);
      const touchingSetup = await seedVenue('SPM48 Hall O', buffers);
      const touchingTurnaround = await seedVenue('SPM48 Hall P', buffers);
      // TR-05: one buffer non-zero at a time, so each side is shown to use its own column.
      const setupOnly = await seedVenue('SPM48 Hall Q', { setup: 30, turnaround: 0 });
      const turnaroundOnly = await seedVenue('SPM48 Hall R', { setup: 0, turnaround: 30 });
      const event = await seedEvent({ name: 'Buffered venues', status: 'Planning', coordinator: coo1 });
      const venues = [inSetup, inTurnaround, touchingSetup, touchingTurnaround, setupOnly, turnaroundOnly];
      for (const venue of venues) await seedBooking(event, venue, 'approved');
      const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * MINUTE);
      // Ends 20 minutes before the start: inside the 30-minute setup time, outside the 15-minute turnaround time.
      await markUnavailable(inSetup, at(event.start, -120), at(event.start, -20));
      // Starts 10 minutes after the end: inside the 15-minute turnaround time.
      await markUnavailable(inTurnaround, at(event.end, 10), at(event.end, 120));
      // Ends exactly when setup begins, and starts exactly when turnaround ends: touching only.
      await markUnavailable(touchingSetup, at(event.start, -120), at(event.start, -30));
      await markUnavailable(touchingTurnaround, at(event.end, 15), at(event.end, 120));
      // Setup only (30, 0): ends 20 minutes before the start. Turnaround only (0, 30): starts 20 minutes after the end.
      await markUnavailable(setupOnly, at(event.start, -120), at(event.start, -20));
      await markUnavailable(turnaroundOnly, at(event.end, 20), at(event.end, 120));

      const row = byName(await queueRows(coo1), 'Buffered venues');
      expect(row?.queue).toMatchObject({
        unavailableVenues: ['SPM48 Hall M', 'SPM48 Hall N', 'SPM48 Hall Q', 'SPM48 Hall R'],
        actions: ['VENUE_UNAVAILABLE'],
        needsAction: true,
      });
      // The summary orders bookings by start time only; these all share one, so compare as a set.
      expect(row?.venueName?.split(', ').sort()).toEqual([
        'SPM48 Hall M (unavailable)',
        'SPM48 Hall N (unavailable)',
        'SPM48 Hall O',
        'SPM48 Hall P',
        'SPM48 Hall Q (unavailable)',
        'SPM48 Hall R (unavailable)',
      ]);
      const readiness = await request(http())
        .get(`/api/events/${event.id}/arrangements-status`)
        .set('Cookie', coo1.cookie)
        .expect(200);
      expect(readiness.body.ready).toBe(false);
      expect(
        (readiness.body.outstanding as Array<{ type: string; state: string; name?: string }>)
          .filter((item) => item.state === 'Venue unavailable').length,
      ).toBe(4);
    });

    /**
     * MONITOR-QUEUE-09-B: an approved replacement alone keeps the flag; it clears once COO-01 cancels the affected
     * booking (decided 23 Oct 2026). A multi-venue event names only the affected venue, and ending the period early clears it.
     */
    it('MONITOR-QUEUE-09-B clears the flag when the affected booking stops being active', async () => {
      const blocked = await seedVenue('SPM48 Hall F');
      const replacement = await seedVenue('SPM48 Hall G');
      const event = await seedEvent({ name: 'EVT-408 clone', status: 'Planning', coordinator: coo1 });
      const affected = await seedBooking(event, blocked, 'approved');
      await markUnavailable(blocked, event.start, event.end);
      await seedBooking(event, replacement, 'approved');
      expect(byName(await queueRows(coo1), 'EVT-408 clone')?.queue.unavailableVenues).toEqual(['SPM48 Hall F']);
      await request(http())
        .post(`/api/venues/bookings/${affected}/cancel`)
        .set('Cookie', coo1.cookie)
        .send({ confirmed: true })
        .expect(201);
      expect(byName(await queueRows(coo1), 'EVT-408 clone')?.queue).toMatchObject({ unavailableVenues: [], actions: [] });

      // Multi-venue event: only the affected venue is named; ending the unavailable period early clears the flag.
      const hallH = await seedVenue('SPM48 Hall H');
      const hallI = await seedVenue('SPM48 Hall I');
      const multi = await seedEvent({ name: 'Multi-venue', status: 'Planning', coordinator: coo1 });
      await seedBooking(multi, hallH, 'approved');
      await seedBooking(multi, hallI, 'approved');
      const period = await markUnavailable(hallH, new Date(now.getTime() - 3_600_000), multi.end);
      expect(byName(await queueRows(coo1), 'Multi-venue')?.queue.unavailableVenues).toEqual(['SPM48 Hall H']);
      await request(http())
        .post(`/api/venues/${hallH}/unavailable-periods/${period}/end`)
        .set('Cookie', vs1.cookie)
        .expect(201);
      expect(byName(await queueRows(coo1), 'Multi-venue')?.queue.unavailableVenues).toEqual([]);
    });
  });
});
