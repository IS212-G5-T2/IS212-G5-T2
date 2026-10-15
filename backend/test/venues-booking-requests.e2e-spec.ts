import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

const databaseUrl = process.env.DATABASE_URL;
const fixedNow = new Date('2030-01-10T12:00:00.000Z');
if (!databaseUrl && process.env.CI)
  throw new Error(
    'SPM-51 venue booking PostgreSQL tests must run in CI: set DATABASE_URL.',
  );

describe.skipIf(!databaseUrl)(
  'SPM-51 booking request HTTP and PostgreSQL',
  () => {
    let app: INestApplication;
    let pool: pg.Pool;
    const venueIds: string[] = [];
    const eventIds: string[] = [];
    const userIds: string[] = [];

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: databaseUrl });
      for (const migration of [
        '005_venues.sql',
        '006_venue_operating_information.sql',
        '007_venue_operating_schedule.sql',
        '008_venue_owner_user_id.sql',
        '009_venue_availability.sql',
        '010_remove_venue_operating_schedule.sql',
      ])
        await pool.query(
          await readFile(
            new URL(`../migrations/${migration}`, import.meta.url),
            'utf8',
          ),
        );

      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CLOCK)
        .useValue({ now: () => fixedNow })
        .compile();
      app = module.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      if (!pool) return;
      if (venueIds.length)
        await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [
          venueIds,
        ]);
      if (eventIds.length)
        await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [
          eventIds,
        ]);
      if (userIds.length)
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
          userIds,
        ]);
      await pool.end();
    });

    async function createUser(role: 'COORDINATOR' | 'VENUE_STAFF') {
      const email = `spm51-${randomUUID()}@example.test`;
      const result = await pool.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, 'SPM-51 Integration User', crypt('password123', gen_salt('bf', 4)))
       RETURNING id`,
        [email],
      );
      const id = result.rows[0].id;
      userIds.push(id);
      await pool.query(
        'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
        [id, role],
      );
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'password123' })
        .expect(201);
      const cookie = login.headers['set-cookie']?.find((value) =>
        value.startsWith('connectsphere_session='),
      );
      if (!cookie)
        throw new Error('Expected an authenticated test session cookie');
      return { id, cookie: cookie.split(';', 1)[0] };
    }

    async function createVenue(
      ownerId: string,
      buffers = { setupTimeMinutes: 0, turnaroundTimeMinutes: 0 },
    ) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO venues
       (id, owner_user_id, name, location, capacity, operating_information,
        setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, $3, 'SPM-51 Test Location', 100, 'Integration fixture',
        $4, $5)`,
        [
          id,
          ownerId,
          `SPM-51 ${id}`,
          buffers.setupTimeMinutes,
          buffers.turnaroundTimeMinutes,
        ],
      );
      venueIds.push(id);
      return id;
    }

    async function createAssignedEvent(coordinatorId: string, name: string) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
        start_date_time, end_date_time, expected_attendance, coordinator_id,
        coordinator_name, submission_key, status)
       VALUES ($1, 'spm51-test', 'SPM-51 Organiser', 'spm51@example.test', $2,
        'Venue availability integration', $3, $4, 10, $5, 'SPM-51 Coordinator', $1, 'Planning')`,
        [
          id,
          name,
          new Date('2030-01-12T04:00:00.000Z'),
          new Date('2030-01-12T05:00:00.000Z'),
          coordinatorId,
        ],
      );
      eventIds.push(id);
      return id;
    }

    async function addBooking(
      venueId: string,
      eventId: string,
      options: {
        start: string;
        end: string;
        status?: string;
        expires?: Date | null;
      },
    ) {
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, hold_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          venueId,
          eventId,
          new Date(options.start),
          new Date(options.end),
          options.status ?? 'approved',
          options.expires ?? null,
        ],
      );
    }

    async function addBlockout(
      venueId: string,
      start: string,
      end: string,
      reason: string,
    ) {
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason)
         VALUES ($1, $2, $3, 'blocked', $4)`,
        [venueId, new Date(start), new Date(end), reason],
      );
    }

    async function expectConflictWithoutRequest(
      venueId: string,
      coordinatorCookie: string,
      eventId: string,
      start: string,
      end: string,
      reason: string,
    ) {
      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinatorCookie)
        .send({ eventId, start, end })
        .expect(409);
      expect(response.body.message).toContain(reason);
      const candidateRows = await pool.query(
        'SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(candidateRows.rows).toEqual([]);
    }

    /** VEN-AVL-06-A: assigned coordinator requests are persisted by the real HTTP/API path. */
    it('creates a pending request for an assigned coordinator event', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        coordinator.id,
        'SPM-51 clear request',
      );

      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId,
          start: '2030-01-12T06:00:00.000Z',
          end: '2030-01-12T07:00:00.000Z',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        eventId,
        venueId,
        status: 'pending',
      });
      expect(response.body.bookingReference).toMatch(/^VB-[A-F0-9]{8}$/);
      const persisted = await pool.query(
        'SELECT status FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(persisted.rows).toEqual([{ status: 'pending' }]);
    });

    /** SPM-51 local seed regression: the sample catalogue and event set stays assigned to the seeded coordinator. */
    it('contains the SPM-51 sample venues and coordinator-assigned events', async () => {
      const seedCoordinator = await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email = 'coordinator1@connectsphere.test'",
      );
      expect(seedCoordinator.rows).toHaveLength(1);
      const seededEvents = await pool.query<{ id: string; event_name: string }>(
        `SELECT id, event_name FROM events
         WHERE id BETWEEN $2::uuid AND $3::uuid AND coordinator_id = $1::text`,
        [
          seedCoordinator.rows[0].id,
          '00000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000205',
        ],
      );
      const seededVenues = await pool.query<{ id: string }>(
        `SELECT id FROM venues WHERE id BETWEEN $1::uuid AND $2::uuid`,
        [
          '00000000-0000-4000-8000-000000000301',
          '00000000-0000-4000-8000-000000000324',
        ],
      );
      const seededVenueImages = await pool.query<{
        id: string;
        file_name: string | null;
        mime_type: string | null;
        byte_size: number | null;
        data_url: string | null;
      }>(
        `SELECT v.id, image.file_name, image.mime_type, image.byte_size, image.data_url
         FROM venues v LEFT JOIN venue_images image ON image.venue_id = v.id
         WHERE v.id BETWEEN $1::uuid AND $2::uuid ORDER BY v.id`,
        [
          '00000000-0000-4000-8000-000000000301',
          '00000000-0000-4000-8000-000000000324',
        ],
      );
      expect(seededEvents.rows).toHaveLength(5);
      expect(
        seededEvents.rows.every(
          ({ event_name }) => !event_name.startsWith('SPM-51 Seed:'),
        ),
      ).toBe(true);
      expect(seededVenues.rows).toHaveLength(24);
      expect(seededVenueImages.rows).toHaveLength(24);
      expect(
        new Set(seededVenueImages.rows.map(({ data_url }) => data_url)).size,
      ).toBe(24);
      expect(
        seededVenueImages.rows.every((image) => {
          if (
            !image.file_name ||
            image.file_name !== `sample-venue-${image.id.slice(-3)}.svg` ||
            image.mime_type !== 'image/svg+xml' ||
            !image.byte_size ||
            image.byte_size > 5 * 1024 * 1024 ||
            !image.data_url
          )
            return false;
          const prefix = 'data:image/svg+xml;base64,';
          return (
            image.data_url.startsWith(prefix) &&
            Buffer.from(image.data_url.slice(prefix.length), 'base64')
              .toString('utf8')
              .startsWith('<svg ')
          );
        }),
      ).toBe(true);
    });

    /** VEN-AVL-06-B: only the event's assigned coordinator can create its booking request. */
    it('rejects an unassigned coordinator without persisting a request', async () => {
      const owner = await createUser('VENUE_STAFF');
      const assigned = await createUser('COORDINATOR');
      const otherCoordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        assigned.id,
        'Assigned elsewhere',
      );

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', otherCoordinator.cookie)
        .send({
          eventId,
          start: '2030-01-12T06:00:00Z',
          end: '2030-01-12T07:00:00Z',
        })
        .expect(404);
      const rows = await pool.query(
        'SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(rows.rows).toEqual([]);
    });

    /** SPM-54 AC5 / SPM-51 AC7: a pending request without Venue Staff hold expiry is not a tentative blocker. Kills: unbounded pending request treated as an active hold (B11). */
    it('keeps a pending request without expiry out of holds and conflict checks', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const firstEvent = await createAssignedEvent(
        coordinator.id,
        'Pending request without hold',
      );
      const secondEvent = await createAssignedEvent(
        coordinator.id,
        'Second pending request',
      );
      const period = {
        start: '2030-01-12T06:00:00Z',
        end: '2030-01-12T07:00:00Z',
      };

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId: firstEvent, ...period })
        .expect(201);

      const persisted = await pool.query(
        'SELECT status, hold_expires_at FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, firstEvent],
      );
      expect(persisted.rows).toEqual([
        { status: 'pending', hold_expires_at: null },
      ]);
      const schedule = await request(app.getHttpServer())
        .get(`/api/venues/${venueId}`)
        .set('Cookie', coordinator.cookie)
        .expect(200);
      expect(schedule.body.reservations).toEqual([]);

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId: secondEvent, ...period })
        .expect(201);
    });

    /** VEN-AVL-02-C: pending requests are tentative, not confirmed; rejected requests are absent. The schema supports rejected, not cancelled. */
    it('does not expose pending or rejected requests as confirmed venue bookings', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const pendingEvent = await createAssignedEvent(
        coordinator.id,
        'Pending schedule request',
      );
      const rejectedEvent = await createAssignedEvent(
        coordinator.id,
        'Rejected schedule request',
      );
      const period = {
        start: '2030-01-12T06:00:00Z',
        end: '2030-01-12T07:00:00Z',
      };

      await addBooking(venueId, pendingEvent, {
        ...period,
        status: 'pending',
        expires: new Date('2030-01-11T12:00:00.000Z'),
      });
      await addBooking(venueId, rejectedEvent, {
        ...period,
        status: 'rejected',
      });

      const schedule = await request(app.getHttpServer())
        .get(`/api/venues/${venueId}`)
        .set('Cookie', coordinator.cookie)
        .expect(200);

      expect(schedule.body.reservations).toEqual([
        expect.objectContaining({
          eventName: 'Pending schedule request',
          status: 'tentative',
        }),
      ]);
      expect(schedule.body.reservations).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventName: 'Rejected schedule request',
          }),
        ]),
      );
    });

    /** VEN-AVL-07-SEC-1: a fresh confirmed-booking conflict returns 409 and records no request. Kills: conflict result ignored before insert (B09). */
    it('rejects a fresh confirmed-booking conflict without persisting a request', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const candidateEvent = await createAssignedEvent(
        coordinator.id,
        'SPM-51 blocked request',
      );
      const existingEvent = await createAssignedEvent(
        coordinator.id,
        'Confirmed conflict',
      );
      await addBooking(venueId, existingEvent, {
        start: '2030-01-12T04:00:00Z',
        end: '2030-01-12T05:00:00Z',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId: candidateEvent,
          start: '2030-01-12T04:00:00Z',
          end: '2030-01-12T05:00:00Z',
        })
        .expect(409);

      expect(response.body.message).toContain('Confirmed conflict');
      const rows = await pool.query(
        `SELECT status FROM venue_bookings WHERE venue_id = $1
       AND (event_id = $2 OR event_id = $3) ORDER BY status`,
        [venueId, candidateEvent, existingEvent],
      );
      expect(rows.rows).toEqual([{ status: 'approved' }]);
    });

    /** SPM-51 AC1/AC7: the API rejects equal start and end and writes no request. Kills: equal start and end accepted (B06). */
    it('rejects equal start and end without recording a request', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        coordinator.id,
        'Zero duration request',
      );
      const instant = '2030-01-12T04:00:00Z';

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId, start: instant, end: instant })
        .expect(400);

      const rows = await pool.query(
        'SELECT status FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(rows.rows).toEqual([]);
    });

    /** SPM-51 AC10: only holds expiring after server now are returned and conflict with submission. Kills: exact-expiry hold remains active (B10). */
    it('filters expired and exact-expiry holds while active holds remain blockers', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const expiredCandidate = await createAssignedEvent(
        coordinator.id,
        'Expired hold available',
      );
      const exactCandidate = await createAssignedEvent(
        coordinator.id,
        'Exact expiry available',
      );
      const activeCandidate = await createAssignedEvent(
        coordinator.id,
        'Active hold blocked',
      );
      const expiredEvent = await createAssignedEvent(
        coordinator.id,
        'Expired hold',
      );
      const exactEvent = await createAssignedEvent(
        coordinator.id,
        'Exact expiry hold',
      );
      const activeEvent = await createAssignedEvent(
        coordinator.id,
        'Active hold',
      );
      await addBooking(venueId, expiredEvent, {
        start: '2030-01-12T04:00:00Z',
        end: '2030-01-12T05:00:00Z',
        status: 'pending',
        expires: new Date(fixedNow.getTime() - 1),
      });
      await addBooking(venueId, exactEvent, {
        start: '2030-01-12T06:00:00Z',
        end: '2030-01-12T07:00:00Z',
        status: 'pending',
        expires: fixedNow,
      });
      await addBooking(venueId, activeEvent, {
        start: '2030-01-12T08:00:00Z',
        end: '2030-01-12T09:00:00Z',
        status: 'pending',
        expires: new Date(fixedNow.getTime() + 1),
      });

      const schedule = await request(app.getHttpServer())
        .get(`/api/venues/${venueId}`)
        .set('Cookie', coordinator.cookie)
        .expect(200);
      expect(
        schedule.body.reservations.map(
          (row: { eventName: string }) => row.eventName,
        ),
      ).toEqual(['Active hold']);
      expect(schedule.body.reservations[0].status).toBe('tentative');

      for (const [eventId, start] of [
        [expiredCandidate, '2030-01-12T04:00:00Z'],
        [exactCandidate, '2030-01-12T06:00:00Z'],
      ])
        await request(app.getHttpServer())
          .post(`/api/venues/${venueId}/booking-requests`)
          .set('Cookie', coordinator.cookie)
          .send({
            eventId,
            start,
            end: new Date(Date.parse(start) + 60 * 60_000).toISOString(),
          })
          .expect(201);

      const activeConflict = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId: activeCandidate,
          start: '2030-01-12T08:00:00Z',
          end: '2030-01-12T09:00:00Z',
        })
        .expect(409);
      expect(activeConflict.body.message).toContain('Active hold');
    });

    /** VEN-AVL-08-A/VAR-1: a candidate after a booking conflicts when only turnaround occupancy overlaps. */
    it('rejects a candidate after a booking when turnaround occupancy overlaps', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, {
        setupTimeMinutes: 0,
        turnaroundTimeMinutes: 45,
      });
      const candidate = await createAssignedEvent(
        coordinator.id,
        'After buffer conflict',
      );
      const existing = await createAssignedEvent(
        coordinator.id,
        'Existing earlier event',
      );
      await addBooking(venueId, existing, {
        start: '2030-01-12T04:00:00Z',
        end: '2030-01-12T05:00:00Z',
      });

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidate,
        '2030-01-12T05:20:00Z',
        '2030-01-12T06:00:00Z',
        'Existing earlier event',
      );
    });

    /** VEN-AVL-08-A/B/VAR-1: a candidate before a booking conflicts when only setup occupancy overlaps. Kills: B12-A. */
    it('rejects a candidate before a booking when setup occupancy overlaps', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, {
        setupTimeMinutes: 30,
        turnaroundTimeMinutes: 0,
      });
      const candidate = await createAssignedEvent(
        coordinator.id,
        'Before buffer conflict',
      );
      const existing = await createAssignedEvent(
        coordinator.id,
        'Existing later event',
      );
      await addBooking(venueId, existing, {
        start: '2030-01-12T05:20:00Z',
        end: '2030-01-12T06:00:00Z',
      });

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidate,
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'Existing later event',
      );
    });

    /** VEN-AVL-07-C: a Maintenance blockout rejects a request, reports its reason, and inserts no booking. */
    it('rejects a request inside a Maintenance blockout without persisting it', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const candidate = await createAssignedEvent(
        coordinator.id,
        'Maintenance blockout candidate',
      );
      await addBlockout(
        venueId,
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'Maintenance',
      );

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidate,
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'Maintenance',
      );
    });

    /** VEN-AVL-08-A/B/BND-1/VAR-1: setup and turnaround blockout intersections both reject without insertion. Kills: setup or turnaround occupancy omitted for blockouts (B12-B, B12-C). */
    it('rejects setup-only and turnaround-only blockout conflicts without insertion', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const setupVenueId = await createVenue(owner.id, {
        setupTimeMinutes: 30,
        turnaroundTimeMinutes: 0,
      });
      const turnaroundVenueId = await createVenue(owner.id, {
        setupTimeMinutes: 0,
        turnaroundTimeMinutes: 45,
      });
      const setupCandidate = await createAssignedEvent(
        coordinator.id,
        'Setup blockout candidate',
      );
      const turnaroundCandidate = await createAssignedEvent(
        coordinator.id,
        'Turnaround blockout candidate',
      );
      await addBlockout(
        setupVenueId,
        '2030-01-12T03:45:00Z',
        '2030-01-12T03:55:00Z',
        'Setup cleaning',
      );
      await addBlockout(
        turnaroundVenueId,
        '2030-01-12T07:20:00Z',
        '2030-01-12T07:30:00Z',
        'Turnaround maintenance',
      );

      await expectConflictWithoutRequest(
        setupVenueId,
        coordinator.cookie,
        setupCandidate,
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'Setup cleaning',
      );
      await expectConflictWithoutRequest(
        turnaroundVenueId,
        coordinator.cookie,
        turnaroundCandidate,
        '2030-01-12T06:00:00Z',
        '2030-01-12T07:00:00Z',
        'Turnaround maintenance',
      );
    });
  },
);
