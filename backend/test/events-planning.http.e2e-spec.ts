/*
 * SPM-49 / SPM-85 / SPM-97 through the real HTTP pipeline: AppModule, the
 * PostgreSQL-backed AuthenticationMiddleware (session cookies from
 * /api/auth/login) and EventPlanningController, against real PostgreSQL.
 *
 * src/events/event-planning.e2e-spec.ts proves the service + repository SQL;
 * this suite proves the routes are wired to it with the authenticated identity
 * taken from the session, never from the request body. Mirrors the fixture
 * pattern of test/events-assign.e2e-spec.ts.
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

describe('SPM-49 event planning over HTTP (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let createdEventIds: string[];
  let createdUserIds: string[];
  let createdVenueIds: string[];

  let organiser: DatabaseUser;
  let coordinator: DatabaseUser;
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

    organiser = await createDatabaseUser('ORGANISER', 'HTTP Organiser');
    coordinator = await createDatabaseUser('COORDINATOR', 'HTTP Coordinator');
    eventId = await seedPlanningEvent(organiser.uid, coordinator.uid);
  });

  afterEach(async () => {
    await app.close();
    // Child rows (bookings, flagged changes, reservations) cascade with the event.
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

  const planningUrl = () => `/api/events/${eventId}/planning`;

  // SPM-49 AC1/AC2 + SPM-97 AC4: the middleware rejects anonymous requests on every route.
  it('EVENT-UPDATE-HTTP-01 returns 401 for every planning route without a session', async () => {
    const server = app.getHttpServer();
    await request(server).get(planningUrl()).expect(401);
    await request(server)
      .patch(planningUrl())
      .send({ name: 'Anonymous' })
      .expect(401);
    await request(server).get(`${planningUrl()}/history`).expect(401);
    await request(server)
      .post(`${planningUrl()}/changes/${randomUUID()}/resolve`)
      .send({ decision: 'confirm' })
      .expect(401);
    expect(await storedName()).toBe('HTTP Welcome Evening');
  });

  // SPM-49 AC1/AC3/AC6: the assigned coordinator edits through PATCH, the save
  // is immediate, and the next GET shows the new value and a later lastUpdatedAt.
  it('EVENT-UPDATE-HTTP-02 applies an assigned coordinator PATCH and the GET reflects it', async () => {
    const before = await request(app.getHttpServer())
      .get(planningUrl())
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(before.body.readOnly).toBe(false);
    expect(before.body.editableFields.length).toBeGreaterThan(0);

    const patched = await request(app.getHttpServer())
      .patch(planningUrl())
      .set('Cookie', coordinator.cookie)
      .send({ name: 'HTTP Renamed Evening' })
      .expect(200);
    expect(patched.body.applied).toEqual(['name']);
    expect(patched.body.flagged).toEqual([]);

    const after = await request(app.getHttpServer())
      .get(planningUrl())
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(after.body.event.name).toBe('HTTP Renamed Evening');
    expect(Date.parse(after.body.lastUpdatedAt)).toBeGreaterThan(
      Date.parse(before.body.lastUpdatedAt),
    );
    expect(await storedName()).toBe('HTTP Renamed Evening');
  });

  // SPM-97 AC4: the owning organiser can read but the write route refuses them.
  it('EVENT-UPDATE-HTTP-03 gives the organiser a read-only view and 403 on PATCH', async () => {
    const view = await request(app.getHttpServer())
      .get(planningUrl())
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(view.body.readOnly).toBe(true);
    expect(view.body.editableFields).toEqual([]);

    await request(app.getHttpServer())
      .patch(planningUrl())
      .set('Cookie', organiser.cookie)
      .send({ name: 'Organiser edit' })
      .expect(403);
    expect(await storedName()).toBe('HTTP Welcome Evening');
  });

  // SPM-49 AC1: a coordinator not assigned to the event cannot see or edit it.
  it('EVENT-UPDATE-HTTP-04 returns 404 to a coordinator who is not assigned', async () => {
    const other = await createDatabaseUser(
      'COORDINATOR',
      'HTTP Other Coordinator',
    );
    await request(app.getHttpServer())
      .get(planningUrl())
      .set('Cookie', other.cookie)
      .expect(404);
    await request(app.getHttpServer())
      .patch(planningUrl())
      .set('Cookie', other.cookie)
      .send({ name: 'Hijacked' })
      .expect(404);
    expect(await storedName()).toBe('HTTP Welcome Evening');
  });

  // The identity comes from the session: a body naming another coordinator is
  // refused as invalid input and nothing is saved.
  it('EVENT-UPDATE-HTTP-05 refuses identity fields in the body with 400 and saves nothing', async () => {
    const other = await createDatabaseUser(
      'COORDINATOR',
      'HTTP Other Coordinator',
    );
    await request(app.getHttpServer())
      .patch(planningUrl())
      .set('Cookie', coordinator.cookie)
      .send({ name: 'Spoofed', coordinatorId: other.uid })
      .expect(400);
    expect(await storedName()).toBe('HTTP Welcome Evening');
  });

  // SPM-49 AC3/AC5 + SPM-85 AC1/AC3/AC5 end to end over HTTP: a compatible
  // change applies immediately despite a booking, an incompatible one is
  // flagged, the resolve route confirms it, and history records it.
  it('EVENT-UPDATE-HTTP-06 applies compatible changes, flags incompatible ones and resolves them over HTTP', async () => {
    // 100-seat venue booked for the event's whole window.
    await seedBooking(eventId, await seedVenue(100));

    const compatible = await request(app.getHttpServer())
      .patch(planningUrl())
      .set('Cookie', coordinator.cookie)
      .send({ expectedAttendance: 70 })
      .expect(200);
    expect(compatible.body.applied).toEqual(['expectedAttendance']);
    expect(compatible.body.flagged).toEqual([]);

    const incompatible = await request(app.getHttpServer())
      .patch(planningUrl())
      .set('Cookie', coordinator.cookie)
      .send({ expectedAttendance: 150 })
      .expect(200);
    expect(incompatible.body.applied).toEqual([]);
    expect(incompatible.body.flagged).toEqual([
      expect.objectContaining({
        field: 'expectedAttendance',
        status: 'Needs Review',
      }),
    ]);
    const changeId = incompatible.body.flagged[0].id as string;

    // The flagged value is not applied yet.
    const pending = await pool.query<{ expected_attendance: number }>(
      'SELECT expected_attendance FROM events WHERE id = $1',
      [eventId],
    );
    expect(pending.rows[0].expected_attendance).toBe(70);

    const resolved = await request(app.getHttpServer())
      .post(`${planningUrl()}/changes/${changeId}/resolve`)
      .set('Cookie', coordinator.cookie)
      .send({ decision: 'confirm' })
      .expect(201);
    expect(resolved.body.event.expectedAttendance).toBe(150);

    const history = await request(app.getHttpServer())
      .get(`${planningUrl()}/history`)
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(
      (
        history.body as Array<{
          field: string;
          status: string;
          resolvedValue: unknown;
        }>
      ).map((h) => [h.field, h.status, h.resolvedValue]),
    ).toEqual([['expectedAttendance', 'Applied', 150]]);
  });

  async function storedName(): Promise<string> {
    const result = await pool.query<{ event_name: string }>(
      'SELECT event_name FROM events WHERE id = $1',
      [eventId],
    );
    return result.rows[0].event_name;
  }

  async function seedPlanningEvent(organiserId: string, coordinatorId: string) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'HTTP Organiser','organiser@example.test','HTTP Welcome Evening','Purpose','Description',
               $3,$4,80,'Banquet',ARRAY['Catering'],ARRAY['Wheelchair ramps'],'Two microphones',
               'Planning',$5,'HTTP Coordinator',$6)`,
      [id, organiserId, START, END, coordinatorId, randomUUID()],
    );
    createdEventIds.push(id);
    return id;
  }

  async function seedVenue(capacity: number) {
    const owner = await createDatabaseUser('VENUE_STAFF', 'HTTP Venue Staff');
    const result = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         operating_days, operating_start_time, operating_end_time,
         setup_time_minutes, turnaround_time_minutes)
       VALUES ($1,'HTTP Hall',$2,$3,'Open weekdays',ARRAY['Monday'],'08:00','22:00',0,0)
       RETURNING id`,
      [owner.uid, `HTTP ${randomUUID()}`, capacity],
    );
    createdVenueIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  async function seedBooking(event: string, venueId: string) {
    await pool.query(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status)
       VALUES ($1,$2,$3,$4,'approved')`,
      [event, venueId, START, END],
    );
  }

  async function createDatabaseUser(
    role: string,
    name: string,
  ): Promise<DatabaseUser> {
    const email = `e2e-planning-${randomUUID()}@example.com`;
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
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const cookie = response.headers['set-cookie']?.find((value: string) =>
      value.startsWith('connectsphere_session='),
    );
    if (!cookie)
      throw new Error('Expected a PostgreSQL authentication session cookie');
    return { uid, name, cookie: cookie.split(';', 1)[0] };
  }
});
