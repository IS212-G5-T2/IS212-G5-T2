import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

/*
 * SPM-135 Confirm an Event against the REAL safety source. Unlike events-confirm.e2e-spec.ts, nothing
 * overrides SAFETY_OUTCOME_SOURCE: the gate reads the real event_safety_checks row that the production
 * wiring (EventSafetyCheckSource) reads. Only the clock is frozen, as in the other confirm suite.
 * Needs TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 016 applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-135 safety-source confirm tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const T0 = '2026-10-12T04:00:00.000Z';
const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';

type Session = { uid: string; cookie: string };

describe.skipIf(!database)('SPM-135 Confirm gate against the real safety source (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let createdEventIds: string[];
  let createdUserIds: string[];
  let createdVenueIds: string[];
  let coordinator: Session;
  let organiser: Session;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
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
  const confirm = (session: Session, eventId: string) =>
    http().post(`/api/events/${eventId}/status-change`).set('Cookie', session.cookie).send({ targetStatus: 'Confirmed' });

  async function createSession(role: string, name: string): Promise<Session> {
    const email = `e2e-safety-source-${randomUUID()}@example.com`;
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

  /**
   * A Planning event whose venue is Approved and whose Projector is Reserved, so the only
   * outstanding item can be the safety check. No safety row is written here.
   */
  async function seedReadyEvent() {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'Organiser 1','organiser@example.test','Safety Source Event','Purpose','Description',
               '2026-11-05T02:00:00Z','2026-11-05T04:00:00Z',80,'Banquet',ARRAY['Catering'],ARRAY[]::text[],'',
               'Planning',$3,'Coordinator 1',$4)`,
      [id, organiser.uid, coordinator.uid, randomUUID()],
    );
    createdEventIds.push(id);
    await pool.query("UPDATE events SET equipment_needs = 'Projector x1' WHERE id = $1", [id]);
    const owner = await createSession('VENUE_STAFF', 'Venue Staff 1');
    const venue = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         operating_days, operating_start_time, operating_end_time, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1,'Main Hall',$2,200,'Open weekdays',ARRAY['Thursday'],'08:00','22:00',0,0) RETURNING id`,
      [owner.uid, `Level 1 ${randomUUID()}`],
    );
    createdVenueIds.push(venue.rows[0].id);
    await pool.query(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1,$2,$3,$4,'approved')`,
      [id, venue.rows[0].id, SLOT_START, SLOT_END],
    );
    await pool.query(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1,'Projector',1,'Reserved')`,
      [id],
    );
    return id;
  }

  /** Writes the safety check row the Safety Officer side would hold for the event. */
  async function writeSafetyRow(eventId: string, status: 'pending' | 'changes_needed' | 'approved') {
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, decided_at)
       VALUES ($1, $2, now(), $3, $4, $5)`,
      [
        eventId,
        status,
        coordinator.uid,
        status === 'approved' ? 'Safety Officer 1' : null,
        status === 'approved' ? new Date() : null,
      ],
    );
  }

  async function statusOf(eventId: string) {
    return (await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status;
  }

  /**
   * A pending safety check is a real row, so the readiness gate reports the safety item as
   * "Awaiting Check" and refuses Confirmed with 422 CONFIRM_BLOCKED. The event stays in Planning.
   */
  it('SAFETY-SOURCE-01: a real pending safety check blocks Confirmed with 422 CONFIRM_BLOCKED', async () => {
    // Arrange: venue and equipment ready; the safety check is pending
    const eventId = await seedReadyEvent();
    await writeSafetyRow(eventId, 'pending');

    // Act
    const response = await confirm(coordinator, eventId).expect(422);

    // Assert
    expect(response.body.code).toBe('CONFIRM_BLOCKED');
    expect(response.body.outstanding).toEqual([
      { type: 'safety', label: 'Safety Officer approval', detail: 'Awaiting check', state: 'Awaiting Check' },
    ]);
    expect(await statusOf(eventId)).toBe('Planning');
  });

  /**
   * A real changes_needed safety check is an unresolved outcome, so the gate refuses Confirmed with
   * 422 CONFIRM_BLOCKED and reports the state "Changes Requested". The event stays in Planning.
   */
  it('SAFETY-SOURCE-02: a real changes_needed safety check blocks Confirmed with 422 CONFIRM_BLOCKED', async () => {
    // Arrange
    const eventId = await seedReadyEvent();
    await writeSafetyRow(eventId, 'changes_needed');

    // Act
    const response = await confirm(coordinator, eventId).expect(422);

    // Assert
    expect(response.body.code).toBe('CONFIRM_BLOCKED');
    expect(response.body.outstanding).toEqual([
      { type: 'safety', label: 'Safety Officer approval', detail: 'Changes requested', state: 'Changes Requested' },
    ]);
    expect(await statusOf(eventId)).toBe('Planning');
  });

  /**
   * With no safety row at all the gate fails closed: the item is "No record" and Confirmed is refused.
   */
  it('SAFETY-SOURCE-03: with no real safety check row Confirmed is refused with 422 CONFIRM_BLOCKED', async () => {
    // Arrange: no safety row written
    const eventId = await seedReadyEvent();

    // Act
    const response = await confirm(coordinator, eventId).expect(422);

    // Assert
    expect(response.body.code).toBe('CONFIRM_BLOCKED');
    expect(response.body.outstanding).toEqual([
      { type: 'safety', label: 'Safety Officer approval', detail: 'Awaiting check', state: 'No record' },
    ]);
    expect(await statusOf(eventId)).toBe('Planning');
  });

  /**
   * Positive control: the same ready event with an approved real safety row is confirmed, which shows
   * the refusals above are caused by the safety state and not by the fixture.
   */
  it('SAFETY-SOURCE-04: a real approved safety check lets the same event be confirmed (200)', async () => {
    // Arrange
    const eventId = await seedReadyEvent();
    await writeSafetyRow(eventId, 'approved');

    // Act
    const response = await confirm(coordinator, eventId).expect(200);

    // Assert
    expect(response.body).toMatchObject({ eventId, status: 'Confirmed' });
    expect(await statusOf(eventId)).toBe('Confirmed');
  });
});
