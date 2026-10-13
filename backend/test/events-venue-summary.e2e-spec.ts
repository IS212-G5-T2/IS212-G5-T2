import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/*
 * VENUE-SUMMARY: the venue text an event shows everywhere (GET /api/events and GET /api/events/:id) is
 * built in SQL from its venue bookings (src/events/venue-summary.ts). The SQL runs for real here; nothing
 * is mocked. Labels: an approved booking not blocked for its window is the plain venue name, a pending
 * request is "(pending)", a rejected or window-blocked booking is "(unavailable)", several bookings are
 * joined with ", " in start order. Needs TEST_DATABASE_URL (or DATABASE_URL) with
 * database/postgresql/init 001 to 016 applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('VENUE-SUMMARY tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';
const LATER_START = '2026-11-05T05:00:00.000Z';
const LATER_END = '2026-11-05T07:00:00.000Z';

type Session = { uid: string; cookie: string };

describe.skipIf(!database)('VENUE-SUMMARY: the venue text on event list and detail (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let coordinator: Session;
  let organiser: Session;
  let owner: Session;
  let createdEventIds: string[];
  let createdVenueIds: string[];
  let createdUserIds: string[];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
  });
  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdVenueIds = [];
    createdUserIds = [];
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    coordinator = await createSession('COORDINATOR', 'Coordinator 1');
    organiser = await createSession('ORGANISER', 'Organiser 1');
    owner = await createSession('VENUE_STAFF', 'Venue Staff 1');
  });

  afterEach(async () => {
    await app.close();
    if (createdEventIds.length)
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdVenueIds.length)
      await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [createdVenueIds]);
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  const http = () => request(app.getHttpServer());

  async function createSession(role: string, name: string): Promise<Session> {
    const email = `e2e-venue-summary-${randomUUID()}@example.com`;
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

  /** A Planning event owned by the organiser and assigned to the coordinator; it has no bookings yet. */
  async function seedEvent() {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'Organiser 1','organiser@example.test','Venue Summary Event','Purpose','Description',
               '2026-11-05T02:00:00Z','2026-11-05T04:00:00Z',80,'Banquet',ARRAY['Catering'],ARRAY[]::text[],'',
               'Planning',$3,'Coordinator 1',$4)`,
      [id, organiser.uid, coordinator.uid, randomUUID()],
    );
    createdEventIds.push(id);
    return id;
  }

  async function seedVenue(name: string) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         operating_days, operating_start_time, operating_end_time, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1,$2,$3,200,'Open weekdays',ARRAY['Thursday'],'08:00','22:00',0,0) RETURNING id`,
      [owner.uid, name, `Level 1 ${randomUUID()}`],
    );
    createdVenueIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  async function addBooking(
    eventId: string,
    venueId: string,
    status: 'pending' | 'approved' | 'rejected',
    start = SLOT_START,
    end = SLOT_END,
  ) {
    await pool.query(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1,$2,$3,$4,$5)`,
      [eventId, venueId, start, end, status],
    );
  }

  /** A venue-wide block over the slot; it makes an approved booking at that venue unavailable. */
  async function blockVenueWindow(venueId: string, start = SLOT_START, end = SLOT_END) {
    await pool.query(
      `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason) VALUES ($1,$2,$3,'blocked','Maintenance')`,
      [venueId, start, end],
    );
  }

  /** The venue text as the coordinator's list and the detail page receive it. */
  async function venueTextFor(eventId: string, session: Session = coordinator) {
    const list = await http().get('/api/events').set('Cookie', session.cookie).expect(200);
    const listed = list.body.find((event: { id: string }) => event.id === eventId);
    const detail = await http().get(`/api/events/${eventId}`).set('Cookie', session.cookie).expect(200);
    return { listed: listed?.venueName, detail: detail.body.venueName };
  }

  /**
   * An approved booking whose venue is not blocked for its window shows the plain venue name, in both the
   * list and the detail response, for the assigned coordinator.
   */
  it('VENUE-SUMMARY-01: an approved, unblocked booking shows the plain venue name', async () => {
    // Arrange
    const eventId = await seedEvent();
    await addBooking(eventId, await seedVenue('Main Hall'), 'approved');

    // Act + Assert
    expect(await venueTextFor(eventId)).toEqual({ listed: 'Main Hall', detail: 'Main Hall' });
  });

  /** The organiser who submitted the event sees the same venue text on the list. */
  it('VENUE-SUMMARY-01 (organiser view): the submitting organiser sees the same plain venue name', async () => {
    // Arrange
    const eventId = await seedEvent();
    await addBooking(eventId, await seedVenue('Main Hall'), 'approved');

    // Act + Assert
    expect(await venueTextFor(eventId, organiser)).toEqual({ listed: 'Main Hall', detail: 'Main Hall' });
  });

  /** A pending venue request is labelled "(pending)" so the coordinator knows it is not yet approved. */
  it('VENUE-SUMMARY-02: a pending booking shows "(pending)" after the venue name', async () => {
    // Arrange
    const eventId = await seedEvent();
    await addBooking(eventId, await seedVenue('Breakout Room 1'), 'pending');

    // Act + Assert
    expect(await venueTextFor(eventId)).toEqual({
      listed: 'Breakout Room 1 (pending)',
      detail: 'Breakout Room 1 (pending)',
    });
  });

  /** A rejected venue request is labelled "(unavailable)" so the coordinator knows to replace it. */
  it('VENUE-SUMMARY-03: a rejected booking shows "(unavailable)" after the venue name', async () => {
    // Arrange
    const eventId = await seedEvent();
    await addBooking(eventId, await seedVenue('Seminar Room B'), 'rejected');

    // Act + Assert
    expect(await venueTextFor(eventId)).toEqual({
      listed: 'Seminar Room B (unavailable)',
      detail: 'Seminar Room B (unavailable)',
    });
  });

  /** An approved booking blocked for its window at the same venue shows "(unavailable)". */
  it('VENUE-SUMMARY-04: an approved booking blocked for its window shows "(unavailable)"', async () => {
    // Arrange: approved, but the venue is blocked over the same slot
    const eventId = await seedEvent();
    const venueId = await seedVenue('Main Hall');
    await addBooking(eventId, venueId, 'approved');
    await blockVenueWindow(venueId);

    // Act + Assert
    expect(await venueTextFor(eventId)).toEqual({
      listed: 'Main Hall (unavailable)',
      detail: 'Main Hall (unavailable)',
    });
  });

  /**
   * Two bookings are joined with ", " in start order. The earlier approved booking is plain and the
   * later pending one carries its label.
   */
  it('VENUE-SUMMARY-05: two bookings are joined with ", " in start order', async () => {
    // Arrange: Main Hall starts first (approved); Breakout Room 1 starts later (pending)
    const eventId = await seedEvent();
    await addBooking(eventId, await seedVenue('Main Hall'), 'approved', SLOT_START, SLOT_END);
    await addBooking(eventId, await seedVenue('Breakout Room 1'), 'pending', LATER_START, LATER_END);

    // Act + Assert
    expect(await venueTextFor(eventId)).toEqual({
      listed: 'Main Hall, Breakout Room 1 (pending)',
      detail: 'Main Hall, Breakout Room 1 (pending)',
    });
  });

  /**
   * An event with no venue booking has no venue text: the field is absent from the response, and the
   * event card shows its "Not booked" fallback.
   */
  it('VENUE-SUMMARY-06: an event with no venue booking has no venue name', async () => {
    // Arrange
    const eventId = await seedEvent();

    // Act + Assert
    const { listed, detail } = await venueTextFor(eventId);
    expect(listed).toBeUndefined();
    expect(detail).toBeUndefined();
  });

  /**
   * A venue-wide block only affects bookings at that same venue. A window blocked at a different venue over
   * the same slot does not make this approved booking unavailable.
   */
  it('VENUE-SUMMARY-07: a block at a different venue over the same slot does not flag this venue', async () => {
    // Arrange: Main Hall is approved and free; Other Hall is blocked over the same slot
    const eventId = await seedEvent();
    await addBooking(eventId, await seedVenue('Main Hall'), 'approved');
    await blockVenueWindow(await seedVenue('Other Hall'));

    // Act + Assert
    expect(await venueTextFor(eventId)).toEqual({ listed: 'Main Hall', detail: 'Main Hall' });
  });

  /**
   * A block that only touches the slot (ends exactly when the slot starts, or starts exactly when it ends)
   * does not overlap it, so the approved booking keeps its plain name.
   */
  it('VENUE-SUMMARY-08: blocks that only touch the slot edges do not flag the approved booking', async () => {
    // Arrange: the same venue is blocked just before and just after the slot
    const eventId = await seedEvent();
    const venueId = await seedVenue('Main Hall');
    await addBooking(eventId, venueId, 'approved');
    await blockVenueWindow(venueId, '2026-11-05T00:00:00.000Z', SLOT_START);
    await blockVenueWindow(venueId, SLOT_END, '2026-11-05T06:00:00.000Z');

    // Act + Assert
    expect(await venueTextFor(eventId)).toEqual({ listed: 'Main Hall', detail: 'Main Hall' });
  });

  /**
   * A block that starts before the booking and ends inside it (01:00 to 03:00 against 02:00 to 04:00)
   * overlaps the booking, so the approved booking shows "(unavailable)". Only a true overlap check
   * catches this; an equality or containment check would not.
   */
  it('VENUE-SUMMARY (partial overlap): a block that starts before the booking and ends inside it shows "(unavailable)"', async () => {
    // Arrange: approved booking 02:00 to 04:00; the venue is blocked 01:00 to 03:00
    const eventId = await seedEvent();
    const venueId = await seedVenue('Main Hall');
    await addBooking(eventId, venueId, 'approved');
    await blockVenueWindow(venueId, '2026-11-05T01:00:00.000Z', '2026-11-05T03:00:00.000Z');

    // Act + Assert
    expect(await venueTextFor(eventId)).toEqual({
      listed: 'Main Hall (unavailable)',
      detail: 'Main Hall (unavailable)',
    });
  });

  /**
   * A block that starts inside the booking and ends after it (03:00 to 05:00 against 02:00 to 04:00)
   * overlaps the booking, so the approved booking shows "(unavailable)". Only a true overlap check
   * catches this; an equality or containment check would not.
   */
  it('VENUE-SUMMARY (partial overlap): a block that starts inside the booking and ends after it shows "(unavailable)"', async () => {
    // Arrange: approved booking 02:00 to 04:00; the venue is blocked 03:00 to 05:00
    const eventId = await seedEvent();
    const venueId = await seedVenue('Main Hall');
    await addBooking(eventId, venueId, 'approved');
    await blockVenueWindow(venueId, '2026-11-05T03:00:00.000Z', '2026-11-05T05:00:00.000Z');

    // Act + Assert
    expect(await venueTextFor(eventId)).toEqual({
      listed: 'Main Hall (unavailable)',
      detail: 'Main Hall (unavailable)',
    });
  });
});
