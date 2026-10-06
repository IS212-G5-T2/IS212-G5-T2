/*
 * SPM-80 integration coverage through the real Nest HTTP pipeline, session
 * middleware and PostgreSQL. The unit suite proves the service's SQL text; these
 * cases prove the saved value, the untouched event assignments and the HTTP
 * status codes against a real database.
 * Test cases: COOR-AVAIL-01-SEC-3, 02-F, 02-SEC-2, 03-O, 03-P.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../app.module.js';

const route = '/api/coordinators/me/availability';

describe('Coordinator availability (SPM-80 e2e)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let createdUserIds: string[];
  let createdEventIds: string[];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // A fresh app and fixture lists per test; every row a test creates is removed afterwards.
    createdUserIds = [];
    createdEventIds = [];
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    if (createdEventIds.length) {
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    }
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  // AC2 at database level: unavailable is saved and assigned events keep their coordinator.
  it('COOR-AVAIL-02-F saves unavailable and leaves the coordinator\'s assigned events with them', async () => {
    // Arrange: a signed-in coordinator with one submitted and one approved event.
    const coordinator = await createDatabaseUser('COORDINATOR', 'Availability E2E Coordinator');
    const submitted = await createAssignedEvent(coordinator, 'Submitted');
    const approved = await createAssignedEvent(coordinator, 'Approved');

    // Act: mark unavailable through the API.
    const saved = await request(app.getHttpServer())
      .put(route)
      .set('Cookie', coordinator.cookie)
      .send({ available: false })
      .expect(200);

    // Assert: the flag is stored, both events still belong to the coordinator, and they still see them.
    expect(saved.body).toEqual({ available: false });
    expect(await storedAvailability(coordinator.id)).toBe(false);
    const events = await pool.query<{ id: string; coordinator_id: string; coordinator_name: string }>(
      'SELECT id, coordinator_id, coordinator_name FROM events WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[submitted, approved]],
    );
    expect(events.rows).toEqual(
      [submitted, approved].sort().map((id) => ({
        id,
        coordinator_id: coordinator.id,
        coordinator_name: 'Availability E2E Coordinator',
      })),
    );
    const listed = await request(app.getHttpServer())
      .get('/api/events')
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(listed.body.map((event: { id: string }) => event.id).sort()).toEqual(
      [submitted, approved].sort(),
    );
  });

  // AC3 at database level: the saved value is what later reads return, in both directions.
  it('COOR-AVAIL-03-O reads back each saved value, including switching back to available', async () => {
    // Arrange: a signed-in coordinator, available by default.
    const coordinator = await createDatabaseUser('COORDINATOR', 'Availability E2E Switcher');
    const initial = await request(app.getHttpServer())
      .get(route)
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(initial.body).toEqual({ available: true });

    // Act: save unavailable and read; then save available and read.
    await request(app.getHttpServer()).put(route).set('Cookie', coordinator.cookie).send({ available: false }).expect(200);
    const afterUnavailable = await request(app.getHttpServer()).get(route).set('Cookie', coordinator.cookie).expect(200);
    await request(app.getHttpServer()).put(route).set('Cookie', coordinator.cookie).send({ available: true }).expect(200);
    const afterAvailable = await request(app.getHttpServer()).get(route).set('Cookie', coordinator.cookie).expect(200);

    // Assert: each read matches the last save, and the database agrees.
    expect(afterUnavailable.body).toEqual({ available: false });
    expect(afterAvailable.body).toEqual({ available: true });
    expect(await storedAvailability(coordinator.id)).toBe(true);
  });

  // AC3 validation through HTTP: text "false" is refused and nothing is saved.
  it('COOR-AVAIL-03-P refuses a non-boolean availability with 400 and saves nothing', async () => {
    // Arrange: a signed-in, available coordinator.
    const coordinator = await createDatabaseUser('COORDINATOR', 'Availability E2E Validator');

    // Act: send the string "false".
    const response = await request(app.getHttpServer())
      .put(route)
      .set('Cookie', coordinator.cookie)
      .send({ available: 'false' })
      .expect(400);

    // Assert: the validation message is returned and the stored value is unchanged.
    expect(response.body.message).toBe('Availability must be true or false.');
    expect(await storedAvailability(coordinator.id)).toBe(true);
  });

  // AC2 data safety: naming another coordinator in the body never changes them.
  it('COOR-AVAIL-02-SEC-2 refuses a body that names another coordinator and changes neither account', async () => {
    // Arrange: two available coordinators; the first is signed in.
    const caller = await createDatabaseUser('COORDINATOR', 'Availability E2E Caller');
    const other = await createDatabaseUser('COORDINATOR', 'Availability E2E Other');

    // Act: try to mark the other coordinator unavailable.
    await request(app.getHttpServer())
      .put(route)
      .set('Cookie', caller.cookie)
      .send({ available: false, userId: other.id })
      .expect(400);

    // Assert: both accounts are still available.
    expect(await storedAvailability(caller.id)).toBe(true);
    expect(await storedAvailability(other.id)).toBe(true);
  });

  // AC1 access through the real middleware: only signed-in coordinators get in.
  it('COOR-AVAIL-01-SEC-3 returns 403 to an organiser and 401 without a session, saving nothing', async () => {
    // Arrange: a signed-in organiser.
    const organiser = await createDatabaseUser('ORGANISER', 'Availability E2E Organiser');

    // Act + Assert: an organiser is forbidden for both reading and saving.
    const forbiddenRead = await request(app.getHttpServer()).get(route).set('Cookie', organiser.cookie).expect(403);
    expect(forbiddenRead.body.message).toBe('Coordinator access required.');
    await request(app.getHttpServer()).put(route).set('Cookie', organiser.cookie).send({ available: false }).expect(403);
    expect(await storedAvailability(organiser.id)).toBe(true);

    // Act + Assert: without a session the middleware refuses both.
    await request(app.getHttpServer()).get(route).expect(401);
    await request(app.getHttpServer()).put(route).send({ available: false }).expect(401);
  });

  async function storedAvailability(userId: string): Promise<boolean> {
    const result = await pool.query<{ is_available: boolean }>(
      'SELECT is_available FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0].is_available;
  }

  async function createAssignedEvent(
    coordinator: { id: string },
    status: 'Submitted' | 'Approved',
  ): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         start_date_time, end_date_time, expected_attendance, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1, 'availability-e2e-organiser', 'E2E Organiser', 'organiser@example.test',
         $2, 'Availability integration test', '2027-06-01 10:00:00+08', '2027-06-01 12:00:00+08',
         20, $3, $4, 'Availability E2E Coordinator', $5)`,
      [id, `SPM-80 ${status} event`, status, coordinator.id, randomUUID()],
    );
    createdEventIds.push(id);
    return id;
  }

  async function createDatabaseUser(
    role: string,
    name: string,
  ): Promise<{ id: string; cookie: string }> {
    const email = `availability-e2e-${randomUUID()}@example.com`;
    const password = 'password123';
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id`,
      [email, name, password],
    );
    createdUserIds.push(created.rows[0].id);
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
      [created.rows[0].id, role],
    );
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    // supertest types set-cookie as a string, but it is a list of header values.
    const setCookie = login.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = setCookie?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a PostgreSQL authentication session cookie');
    return { id: created.rows[0].id, cookie: cookie.split(';', 1)[0] };
  }
});
