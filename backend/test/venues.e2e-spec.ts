import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

const databaseUrl = process.env.DATABASE_URL;
const password = 'P@55w0rd';
const staffEmail = 'venue_staff1@connectsphere.test';
const secondStaffEmail = 'venue_staff2@connectsphere.test';
const coordinatorEmail = 'coordinator1@connectsphere.test';
const coordinatorVenueStaffEmail = 'coordinator_venuestaff@connectsphere.test';
const attendeeEmail = 'attendee1@connectsphere.test';
const fixedNow = new Date('2030-01-10T12:00:00.000Z');
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe.skipIf(!databaseUrl)(
  'SPM-50 venue HTTP and PostgreSQL integration',
  () => {
    let app: INestApplication;
    let pool: pg.Pool;
    let ownerMigration: string;
    const venueIds: string[] = [];
    const eventIds: string[] = [];
    const fixtureRunId = randomUUID();
    const uniqueVenueName = (name: string) => `${name} ${fixtureRunId}`;
    const venueInput = {
      name: uniqueVenueName('Orchid Hall Test'),
      location: 'Test Building Level 3',
      capacity: 120,
      facilities: ['AV System', 'Wi-Fi'],
      accessibility: ['Wheelchair access'],
      layouts: ['Classroom', 'Theatre'],
      operatingInformation: 'Closed on public holidays',
      setupTimeMinutes: 30,
      turnaroundTimeMinutes: 45,
      image: {
        name: 'orchid-hall.png',
        type: 'image/png',
        size: 4,
        dataUrl: 'data:image/png;base64,dGVzdA==',
      },
    };

    /** Authenticates a seeded account and preserves its HTTP-only session cookie. */
    async function authenticate(email: string) {
      const client = request.agent(app.getHttpServer());
      await client
        .post('/api/auth/login')
        .send({ email, password })
        .expect(201);
      return client;
    }

    /** Creates an event required by the real booking foreign-key constraint. */
    async function createScheduleEvent(name: string) {
      const result = await pool.query(
        `INSERT INTO events
          (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
           start_date_time, end_date_time, expected_attendance, submission_key)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, gen_random_uuid())
         RETURNING id`,
        [
          'spm-124-test-owner',
          'SPM-124 Test Owner',
          'spm-124-test-owner@example.test',
          name,
          'Schedule test fixture',
          new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000),
          new Date(fixedNow.getTime() + 25 * 60 * 60 * 1000),
          1,
        ],
      );
      const id = result.rows[0].id as string;
      eventIds.push(id);
      return id;
    }

    /** One venue_bookings row a test inserted, with the values written (the oracle for later reads). */
    interface BookingFixture {
      id: string;
      venueId: string;
      eventId: string;
      eventName: string;
      status: string;
      startAt: Date;
      endAt: Date;
    }

    /** Inserts one booking for a new linked event and returns its generated id with the values written. */
    async function insertBooking(
      venueId: string,
      eventName: string,
      status: 'pending' | 'approved' | 'rejected',
      startAt: Date,
      endAt: Date,
    ): Promise<BookingFixture> {
      const eventId = await createScheduleEvent(eventName);
      const result = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [venueId, eventId, startAt, endAt, status],
      );
      return { id: result.rows[0].id, venueId, eventId, eventName, status, startAt, endAt };
    }

    /** Records the booking request link that makes a pending booking count as an active blocker. */
    async function linkBookingRequests(fixtures: BookingFixture[]) {
      for (const fixture of fixtures)
        await pool.query(
          `INSERT INTO venue_booking_requests (event_id, venue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [fixture.eventId, fixture.venueId],
        );
    }

    /** The listing the API must return for these bookings, built from the values written, not from the response. */
    const expectedListing = (fixtures: BookingFixture[]) =>
      fixtures
        .map((f) => ({
          bookingId: f.id,
          eventName: f.eventName,
          start: f.startAt.toISOString(),
          end: f.endAt.toISOString(),
          status: f.status,
        }))
        .sort((a, b) => a.bookingId.localeCompare(b.bookingId));

    /** Reduces a response list to the five listed fields, ordered by booking id, so the exact set can be compared. */
    const actualListing = (list: Array<Record<string, unknown>>) =>
      list
        .map((b) => ({
          bookingId: b.bookingId as string,
          eventName: b.eventName,
          start: b.start,
          end: b.end,
          status: b.status,
        }))
        .sort((a, b) => a.bookingId.localeCompare(b.bookingId));

    /** Re-selects every fixture row and asserts id, venue, event link, status and times are exactly as inserted. */
    async function expectBookingsUnchanged(fixtures: BookingFixture[]) {
      const rows = await pool.query(
        `SELECT id, venue_id, event_id, status, start_at, end_at
           FROM venue_bookings WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [fixtures.map((f) => f.id)],
      );
      expect(rows.rows).toEqual(
        [...fixtures]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((f) => ({
            id: f.id,
            venue_id: f.venueId,
            event_id: f.eventId,
            status: f.status,
            start_at: f.startAt,
            end_at: f.endAt,
          })),
      );
    }

    /** Creates a Planning event assigned to a Coordinator so the Coordinator can submit a booking request for it. */
    async function createCoordinatorEvent(coordinatorId: string, name: string, startAt: Date, endAt: Date) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO events
          (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
           start_date_time, end_date_time, expected_attendance, coordinator_id,
           coordinator_name, submission_key, status)
         VALUES (gen_random_uuid(), 'spm-121-test-owner', 'SPM-121 Test Owner', 'spm-121-test-owner@example.test', $1,
           'SPM-121 availability fixture', $2, $3, 10, $4, 'SPM-121 Coordinator', gen_random_uuid(), 'Planning')
         RETURNING id`,
        [name, startAt, endAt, coordinatorId],
      );
      const id = result.rows[0].id;
      eventIds.push(id);
      return id;
    }

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: databaseUrl });
      await pool.query(
        await readFile(
          new URL('../migrations/005_venues.sql', import.meta.url),
          'utf8',
        ),
      );
      await pool.query(
        await readFile(
          new URL(
            '../migrations/006_venue_operating_information.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await pool.query(
        await readFile(
          new URL(
            '../migrations/007_venue_operating_schedule.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      ownerMigration = await readFile(
        new URL(
          '../migrations/008_venue_owner_user_id.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await pool.query(ownerMigration);
      await pool.query(ownerMigration);
      await pool.query(
        await readFile(
          new URL(
            '../migrations/009_venue_availability.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await pool.query(
        await readFile(
          new URL(
            '../migrations/010_remove_venue_operating_schedule.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      // Replaying 009 no longer narrows the booking check (SPM-170), so 019 is kept as a safeguard: it
      // restores the current constraint so suites that run after this file can still insert those bookings.
      await pool.query(
        await readFile(
          new URL(
            '../migrations/019_spm54_venue_booking_lifecycle.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(CLOCK)
        .useValue({ now: () => fixedNow })
        .compile();
      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      if (pool) {
        if (venueIds.length)
          await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [
            venueIds,
          ]);
        if (eventIds.length)
          await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [
            eventIds,
          ]);
        await pool.end();
      }
    });

    /** SPM-50 / TEST-5: real sessions enforce Venue:create permission. */
    it('authenticates the seeded Coordinator and Venue Staff account with both roles', async () => {
      // Arrange and act: authenticate the fixture that exercises multi-role routing and read access.
      const dualRole = await authenticate(coordinatorVenueStaffEmail);
      const session = await dualRole.get('/api/auth/me').expect(200);

      // Assert: both granted roles are present; the account can read the shared catalogue.
      expect(session.body.roles).toEqual(
        expect.arrayContaining(['COORDINATOR', 'VENUE_STAFF']),
      );
      await dualRole.get('/api/venues').expect(200);
    });

    /** SPM-50 / TEST-5: real sessions enforce Venue:create permission. */
    it('allows seeded Venue Staff to create once and denies anonymous or unauthorized writes', async () => {
      // Arrange one anonymous caller, one seeded coordinator, and one seeded Venue Staff session.
      const anonymous = request(app.getHttpServer());
      const coordinator = await authenticate(coordinatorEmail);
      const staff = await authenticate(staffEmail);

      // Act through actual HTTP middleware, login sessions, RBAC, validation, and persistence.
      await anonymous.post('/api/venues').send(venueInput).expect(401);
      await coordinator.post('/api/venues').send(venueInput).expect(403);
      const created = await staff
        .post('/api/venues')
        .send(venueInput)
        .expect(201);

      // Assert the permitted actor receives a complete record with a server-generated UUID.
      expect(created.body).toEqual({
        venue: { id: expect.stringMatching(uuidPattern), ownerId: expect.stringMatching(uuidPattern), ...venueInput },
        message: 'Venue created successfully.',
      });
      const venueId = created.body.venue.id as string;
      venueIds.push(venueId);
      const owner = await pool.query(
        `SELECT v.owner_user_id, u.email
         FROM venues v JOIN users u ON u.id = v.owner_user_id
         WHERE v.id = $1`,
        [venueId],
      );
      expect(owner.rows).toEqual([
        {
          owner_user_id: expect.stringMatching(uuidPattern),
          email: staffEmail,
        },
      ]);
      expect(
        (
          await pool.query(
            'SELECT accessibility_id FROM venue_accessibility WHERE venue_id = $1',
            [venueId],
          )
        ).rows,
      ).toEqual([{ accessibility_id: 'wheelchair-access' }]);
      expect(
        (
          await pool.query(
            'SELECT venue_id FROM venue_facilities WHERE venue_id = $1',
            [venueId],
          )
        ).rowCount,
      ).toBe(2);
      expect(
        (
          await pool.query(
            'SELECT venue_id FROM venue_layouts WHERE venue_id = $1',
            [venueId],
          )
        ).rowCount,
      ).toBe(2);
      expect(
        (
          await pool.query(
            'SELECT venue_id FROM venue_images WHERE venue_id = $1',
            [venueId],
          )
        ).rowCount,
      ).toBe(1);
    });

    /** SPM-50 correction: legacy schedule fields are absent from schema and every API representation. */
    it('discards legacy schedule fields and exposes operating information without schedule properties', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: uniqueVenueName('SPM-50 No Hours Venue'),
          operatingDays: ['Monday'],
          operatingStartTime: '09:00',
          operatingEndTime: '18:00',
        })
        .expect(201);

      const venueId = created.body.venue.id as string;
      venueIds.push(venueId);
      expect(created.body).toMatchObject({
        venue: {
          id: expect.stringMatching(uuidPattern),
          operatingInformation: venueInput.operatingInformation,
        },
        message: 'Venue created successfully.',
      });
      for (const key of ['operatingDays', 'operatingStartTime', 'operatingEndTime'])
        expect(created.body.venue).not.toHaveProperty(key);
      const persisted = await pool.query(
        `SELECT operating_information FROM venues WHERE id = $1`,
        [venueId],
      );
      expect(persisted.rows).toEqual([
        {
          operating_information: venueInput.operatingInformation,
        },
      ]);
      const columns = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'venues'
           AND column_name = ANY($1::text[])`,
        [['operating_days', 'operating_start_time', 'operating_end_time']],
      );
      expect(columns.rows).toEqual([]);

      const detail = await staff.get(`/api/venues/${venueId}`).expect(200);
      for (const key of ['operatingDays', 'operatingStartTime', 'operatingEndTime'])
        expect(detail.body).not.toHaveProperty(key);
      const listing = await staff.get('/api/venues').expect(200);
      const listedVenue = (listing.body as Array<Record<string, unknown>>)
        .find((item) => item.id === venueId);
      expect(listedVenue).toBeDefined();
      for (const key of ['operatingDays', 'operatingStartTime', 'operatingEndTime'])
        expect(listedVenue).not.toHaveProperty(key);
    });

    /** SPM-50: a venue owner comes from the verified staff session. */
    it('uses the verified second staff identity despite spoofed owner fields', async () => {
      // Arrange a second seeded Venue Staff account and client-controlled owner values.
      const staff = await authenticate(secondStaffEmail);
      const created = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: uniqueVenueName('Orchid Hall Second Staff'),
          owner_user_id: '00000000-0000-4000-8000-000000000001',
          ownerUserId: '00000000-0000-4000-8000-000000000001',
        })
        .expect(201);

      // Assert no owner is accepted from or exposed to the client; the database has the session owner.
      const venueId = created.body.venue.id as string;
      venueIds.push(venueId);
      expect(created.body.venue).not.toHaveProperty('ownerUserId');
      expect(created.body.venue).not.toHaveProperty('owner_user_id');
      expect(
        (
          await pool.query(
            `SELECT u.email FROM venues v
             JOIN users u ON u.id = v.owner_user_id WHERE v.id = $1`,
            [venueId],
          )
        ).rows,
      ).toEqual([{ email: secondStaffEmail }]);
    });

    /** SPM-50: the owner column is a UUID foreign key with an index. */
    it('has one owner foreign key and an index after repeatable migration', async () => {
      // Read the initialized and migrated schema directly.
      const column = await pool.query(
        `SELECT data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'venues'
           AND column_name = 'owner_user_id'`,
      );
      const constraint = await pool.query(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'venues'::regclass
           AND confrelid = 'users'::regclass
           AND conname = 'venues_owner_user_id_fkey'`,
      );
      const required = await pool.query(
        `SELECT conname, convalidated FROM pg_constraint
         WHERE conrelid = 'venues'::regclass
           AND conname = 'venues_owner_user_id_required'`,
      );
      const index = await pool.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'venues'
           AND indexname = 'venues_owner_user_id_idx'`,
      );

      // Fresh schemas reject ownerless rows; repeating the migration creates no duplicate constraint.
      expect(column.rows).toEqual([{ data_type: 'uuid', is_nullable: 'NO' }]);
      expect(constraint.rows).toEqual([
        { conname: 'venues_owner_user_id_fkey' },
      ]);
      expect(required.rows).toEqual([
        { conname: 'venues_owner_user_id_required', convalidated: false },
      ]);
      expect(index.rows).toEqual([{ indexname: 'venues_owner_user_id_idx' }]);
    });

    /** SPM-50: legacy ownership remains unknown and future rows require an owner. */
    it('upgrades a legacy venue without assigning it to an arbitrary user', async () => {
      // Isolate a pre-owner venue table in a rollback-only session.
      const client = await pool.connect();
      const legacyId = 'e7b67ff0-877c-42db-8a69-6d70244ed222';
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL search_path TO pg_temp');
        await client.query('CREATE TEMP TABLE users (id uuid PRIMARY KEY)');
        await client.query('CREATE TEMP TABLE venues (id uuid PRIMARY KEY)');
        await client.query('INSERT INTO venues (id) VALUES ($1)', [legacyId]);

        // Reapply the migration to prove it is safe on an existing schema.
        await client.query(ownerMigration);
        await client.query(ownerMigration);
        const legacy = await client.query(
          'SELECT owner_user_id FROM venues WHERE id = $1',
          [legacyId],
        );
        expect(legacy.rows).toEqual([{ owner_user_id: null }]);

        // A new row without a verified owner is rejected by the future-row check.
        await expect(
          client.query('INSERT INTO venues (id) VALUES ($1)', [
            '7d273a39-1795-4fe2-908c-9d97e6bbb113',
          ]),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });

    /** SPM-50: an absent or nonexistent user cannot own a new venue. */
    it.each([
      [null, '23502'],
      ['00000000-0000-4000-8000-000000000001', '23503'],
    ])(
      'rejects direct SQL inserts with owner %s',
      async (ownerUserId, code) => {
        // Arrange otherwise valid venue columns, then bypass the API to exercise database constraints.
        const insert = pool.query(
          `INSERT INTO venues
           (owner_user_id, name, location, capacity, operating_information,
            setup_time_minutes, turnaround_time_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            ownerUserId,
            `Invalid Owner ${code}`,
            'Test Building Level 3',
            venueInput.capacity,
            venueInput.operatingInformation,
            venueInput.setupTimeMinutes,
            venueInput.turnaroundTimeMinutes,
          ],
        );

        // Assert the database refuses the write before it can become a venue record.
        await expect(insert).rejects.toMatchObject({ code });
      },
    );

    /** SPM-50: a valid venue can persist without accessibility selections. */
    it('creates a venue with no accessibility selection', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: uniqueVenueName('Orchid Hall Without Accessibility'),
          accessibility: [],
        })
        .expect(201);

      const venueId = created.body.venue.id as string;
      venueIds.push(venueId);
      expect(created.body.venue.accessibility).toEqual([]);
      expect(
        (
          await pool.query(
            'SELECT venue_id FROM venue_accessibility WHERE venue_id = $1',
            [venueId],
          )
        ).rowCount,
      ).toBe(0);
    });

    /** SPM-50: normalized case and whitespace cannot create a duplicate venue. */
    it('rejects a normalized duplicate name and location', async () => {
      const staff = await authenticate(staffEmail);
      const baseline = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: uniqueVenueName('Duplicate Prevention Venue'),
          location: uniqueVenueName('Duplicate Prevention Location'),
        })
        .expect(201);
      venueIds.push(baseline.body.venue.id as string);

      const response = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: `  ${uniqueVenueName('Duplicate Prevention Venue').toUpperCase()}  `,
          location: `  ${uniqueVenueName('Duplicate Prevention Location').toUpperCase()}  `,
        })
        .expect(409);

      expect(response.body).toMatchObject({
        message: 'A venue with this name and location already exists.',
        errors: {
          name: 'Use a different venue name or location.',
          location: 'Use a different venue name or location.',
        },
      });
    });

    /** SPM-124: reads expose the shared catalogue and session-scoped My venues. */
    it('reads shared venue schedules and supports My venues with active, expired and buffer-only records', async () => {
      // Arrange: create two owners' venues and all schedule variants around the injected clock.
      const staff = await authenticate(staffEmail);
      const otherStaff = await authenticate(secondStaffEmail);
      const coordinator = await authenticate(coordinatorEmail);
      const attendee = await authenticate(attendeeEmail);
      const mine = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: uniqueVenueName('SPM-124 Schedule Owner Venue'),
          image: undefined,
        })
        .expect(201);
      const other = await otherStaff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: uniqueVenueName('SPM-124 Schedule Other Venue'),
          image: undefined,
        })
        .expect(201);
      const setupCurrent = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: uniqueVenueName('SPM-124 Setup Current Venue'),
          image: undefined,
        })
        .expect(201);
      const mineId = mine.body.venue.id as string;
      const otherId = other.body.venue.id as string;
      const setupCurrentId = setupCurrent.body.venue.id as string;
      venueIds.push(mineId, otherId, setupCurrentId);
      const currentEvent = await createScheduleEvent('Current booking');
      const activeHoldEvent = await createScheduleEvent('Active hold');
      const setupEvent = await createScheduleEvent('Setup-buffer booking');
      const turnaroundEvent = await createScheduleEvent(
        'Turnaround-buffer booking',
      );
      const setupCurrentEvent = await createScheduleEvent(
        'Setup-current booking',
      );
      const at = (hours: number, minutes = 0) =>
        new Date(Date.UTC(2030, 0, 10, hours, minutes));
      await pool.query(
        `INSERT INTO venue_bookings
          (venue_id, event_id, start_at, end_at, status, hold_expires_at)
         VALUES
          ($1, $2, $3, $4, 'approved', NULL),
          ($1, $5, $6, $7, 'pending', $8),
          ($1, $5, $9, $10, 'pending', $11),
          ($1, $12, $13, $14, 'approved', NULL),
          ($1, $15, $16, $17, 'approved', NULL)`,
        [
          mineId,
          currentEvent,
          at(11),
          at(13),
          activeHoldEvent,
          at(14),
          at(15),
          at(13),
          at(16),
          at(17),
          at(11),
          setupEvent,
          at(18),
          at(19),
          turnaroundEvent,
          at(20),
          at(21),
        ],
      );
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason)
         VALUES
          ($1, $2, $3, 'blocked', 'Active maintenance'),
          ($1, $4, $5, 'blocked', 'Scheduled maintenance'),
          ($1, $6, $7, 'blocked', 'Expired maintenance'),
          ($1, $8, $9, 'blocked', 'Setup-only blockout'),
          ($1, $10, $11, 'blocked', 'Turnaround-only blockout')`,
        [
          mineId,
          at(10),
          at(13),
          at(22),
          at(23),
          at(8),
          at(9),
          at(17, 40),
          at(17, 45),
          at(21, 15),
          at(21, 45),
        ],
      );
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, 'approved')`,
        [setupCurrentId, setupCurrentEvent, at(12, 30), at(13)],
      );

      // Act: read anonymously, as a denied attendee, and through shared and My venues staff views.
      await request(app.getHttpServer()).get('/api/venues').expect(401);
      await attendee.get('/api/venues').expect(403);
      const staffList = await staff.get('/api/venues').expect(200);
      const staffMineList = await staff
        .get('/api/venues?mine=true')
        .expect(200);
      const coordinatorList = await coordinator.get('/api/venues').expect(200);
      const detail = await staff.get(`/api/venues/${mineId}`).expect(200);
      const setupCurrentDetail = await staff
        .get(`/api/venues/${setupCurrentId}`)
        .expect(200);
      await staff.get(`/api/venues/${otherId}`).expect(200);
      await staff
        .get('/api/venues/00000000-0000-4000-8000-000000000999')
        .expect(404);

      // Assert: the catalogue is shared by default; My venues alone is restricted by the server session.
      expect(
        staffList.body.some((record: { id: string }) => record.id === mineId),
      ).toBe(true);
      expect(
        staffList.body.some((record: { id: string }) => record.id === otherId),
      ).toBe(true);
      expect(
        staffMineList.body.some(
          (record: { id: string }) => record.id === mineId,
        ),
      ).toBe(true);
      expect(
        staffMineList.body.some(
          (record: { id: string }) => record.id === otherId,
        ),
      ).toBe(false);
      expect(
        coordinatorList.body.map((record: { id: string }) => record.id),
      ).toEqual(expect.arrayContaining([mineId, otherId]));
      expect(detail.body).toMatchObject({
        id: mineId,
        availabilityStatus: 'unavailable',
        unavailablePeriods: expect.arrayContaining([
          expect.objectContaining({ reason: 'Active maintenance' }),
          expect.objectContaining({ reason: 'Scheduled maintenance' }),
          expect.objectContaining({ reason: 'Setup-only blockout' }),
          expect.objectContaining({ reason: 'Turnaround-only blockout' }),
        ]),
        reservations: expect.arrayContaining([
          expect.objectContaining({
            eventName: 'Current booking',
            status: 'booked',
          }),
          expect.objectContaining({
            eventName: 'Active hold',
            status: 'tentative',
          }),
          expect.objectContaining({
            eventName: 'Setup-buffer booking',
            affectedByUnavailablePeriod: true,
          }),
          expect.objectContaining({
            eventName: 'Turnaround-buffer booking',
            affectedByUnavailablePeriod: true,
          }),
        ]),
      });
      expect(setupCurrentDetail.body).toMatchObject({
        availabilityStatus: 'unavailable',
        reservations: expect.arrayContaining([
          expect.objectContaining({
            eventName: 'Setup-current booking',
            status: 'booked',
          }),
        ]),
      });
      expect(
        detail.body.unavailablePeriods.map(
          (period: { reason: string }) => period.reason,
        ),
      ).not.toContain('Expired maintenance');
      expect(
        detail.body.reservations.map(
          (reservation: { start: string }) => reservation.start,
        ),
      ).not.toContain(at(16).toISOString());
    });

    /** SPM-124 AC5: venue reads sort by name, then ID for matching names. */
    it('orders venue reads by name and ID despite opposite insertion order', async () => {
      // Arrange: IDs and insertion order deliberately disagree with the required order.
      const ids = [randomUUID(), randomUUID(), randomUUID()].sort();
      const owner = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [staffEmail],
      );
      const names = [
        uniqueVenueName('SPM-124 Order Zulu'),
        uniqueVenueName('SPM-124 Order Alpha'),
        uniqueVenueName('SPM-124 Order Alpha'),
      ];
      const inserted = [
        {
          id: ids[0],
          name: names[0],
          location: uniqueVenueName('Order Location 1'),
        },
        {
          id: ids[2],
          name: names[1],
          location: uniqueVenueName('Order Location 2'),
        },
        {
          id: ids[1],
          name: names[2],
          location: uniqueVenueName('Order Location 3'),
        },
      ];
      for (const row of inserted) {
        await pool.query(
          `INSERT INTO venues (id, owner_user_id, name, location, capacity,
             operating_information, setup_time_minutes, turnaround_time_minutes)
           VALUES ($1, $2, $3, $4, 10, 'Order test', 0, 0)`,
          [row.id, owner.rows[0].id, row.name, row.location],
        );
        venueIds.push(row.id);
      }

      // Act: read through the authenticated HTTP API and retain these three fixtures.
      const coordinator = await authenticate(coordinatorEmail);
      const response = await coordinator.get('/api/venues').expect(200);
      const orderedIds = response.body
        .filter((record: { id: string }) => ids.includes(record.id))
        .map((record: { id: string }) => record.id);

      // Assert: Alpha rows use ID order; Zulu follows both regardless of its lower ID.
      expect(orderedIds).toEqual([ids[1], ids[2], ids[0]]);
    });

    /** SPM-122 / VEN-UNAVAIL-04/06/07/08: blockouts preserve booked events. */
    it('saves staff unavailability and lists setup and turnaround conflicts without mutating bookings', async () => {
      // Arrange one venue with three distinct existing event bookings.
      const staff = await authenticate(staffEmail);
      const coordinator = await authenticate(coordinatorEmail);
      const created = await staff
        .post('/api/venues')
        .send({ ...venueInput, name: uniqueVenueName('SPM-122 Conflict Venue') })
        .expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const setupEvent = await createScheduleEvent('Setup affected event');
      const turnaroundEvent = await createScheduleEvent(
        'Turnaround affected event',
      );
      const outsideEvent = await createScheduleEvent('Outside event');
      const at = (hour: number, minute = 0) =>
        new Date(Date.UTC(2030, 0, 12, hour, minute));
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1,$2,$5,$6,'approved'), ($1,$3,$7,$8,'approved'), ($1,$4,$9,$10,'approved')`,
        [
          id,
          setupEvent,
          turnaroundEvent,
          outsideEvent,
          at(13),
          at(14),
          at(10),
          at(11),
          at(15, 30),
          at(16, 30),
        ],
      );
      const before = await pool.query(
        'SELECT id, event_id, start_at, end_at, status FROM venue_bookings WHERE venue_id = $1 ORDER BY id',
        [id],
      );
      const originalEvents = await pool.query(
        'SELECT id, event_name, start_date_time, end_date_time, organiser_id, coordinator_id FROM events WHERE id = ANY($1::uuid[]) ORDER BY id',
        [[setupEvent, turnaroundEvent, outsideEvent]],
      );
      const payload = {
        start: at(12, 15).toISOString(),
        end: at(12, 45).toISOString(),
        reason: 'Air-conditioning inspection',
      };

      // Act: denied users cannot save, while staff can despite the booking.
      await coordinator
        .post(`/api/venues/${id}/unavailable-periods`)
        .send(payload)
        .expect(403);
      const saved = await staff
        .post(`/api/venues/${id}/unavailable-periods`)
        .send(payload)
        .expect(201);
      const turnaround = await staff
        .post(`/api/venues/${id}/unavailable-periods`)
        .send({
          start: at(11, 15).toISOString(),
          end: at(11, 30).toISOString(),
          reason: 'Cleaning',
        })
        .expect(201);
      const detail = await staff.get(`/api/venues/${id}`).expect(200);

      // Assert setup-only and turnaround-only matches, no false positive, and unchanged originals.
      expect(saved.body.period).toMatchObject({
        start: payload.start,
        end: payload.end,
        reason: payload.reason,
      });
      expect(
        saved.body.affectedBookings.map(
          (item: { eventId: string }) => item.eventId,
        ),
      ).toEqual([setupEvent]);
      expect(
        turnaround.body.affectedBookings.map(
          (item: { eventId: string }) => item.eventId,
        ),
      ).toEqual([turnaroundEvent]);
      expect(detail.body.unavailablePeriods).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ reason: payload.reason }),
        ]),
      );
      expect(
        (
          await pool.query(
            'SELECT id, event_id, start_at, end_at, status FROM venue_bookings WHERE venue_id = $1 AND status = $2 ORDER BY id',
            [id, 'approved'],
          )
        ).rows,
      ).toEqual(before.rows);
      expect(
        (
          await pool.query(
            'SELECT id, event_name, start_date_time, end_date_time, organiser_id, coordinator_id FROM events WHERE id = ANY($1::uuid[]) ORDER BY id',
            [[setupEvent, turnaroundEvent, outsideEvent]],
          )
        ).rows,
      ).toEqual(originalEvents.rows);
    });

    /** SPM-122 / VEN-UNAVAIL-07-C: exact boundary touches are not conflicts. */
    it('lists one-minute setup and turnaround overlaps but excludes exact boundary touches', async () => {
      // Arrange four bookings around both ends of the proposed unavailable period.
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({ ...venueInput, name: uniqueVenueName('SPM-122 Boundary Venue') }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const events = await Promise.all([
        createScheduleEvent('Turnaround boundary'),
        createScheduleEvent('Turnaround overlap'),
        createScheduleEvent('Setup boundary'),
        createScheduleEvent('Setup overlap'),
      ]);
      const at = (hour: number, minute: number) => new Date(Date.UTC(2030, 0, 12, hour, minute));
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1,$2,$6,$7,'approved'), ($1,$3,$6,$8,'approved'),
                ($1,$4,$9,$10,'approved'), ($1,$5,$11,$10,'approved')`,
        [id, ...events, at(11, 0), at(11, 45), at(11, 46), at(13, 15), at(14, 0), at(13, 14)],
      );

      // Act through the HTTP endpoint and the real overlap query.
      const saved = await staff.post(`/api/venues/${id}/unavailable-periods`).send({
        start: at(12, 30).toISOString(), end: at(12, 45).toISOString(), reason: 'Safety inspection',
      }).expect(201);

      // Assert strict overlap at both occupied-period boundaries.
      expect(saved.body.affectedBookings.map((booking: { eventId: string }) => booking.eventId)).toEqual([events[1], events[3]]);
    });

    /** SPM-122 / VEN-UNAVAIL-04-A/07-C: only live bookings on an existing venue are affected. */
    it('rejects a missing venue and excludes expired tentative holds from the affected list', async () => {
      // Arrange an active hold and an expired hold with the same effective overlap.
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({ ...venueInput, name: uniqueVenueName('SPM-122 Hold Venue') }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const activeEvent = await createScheduleEvent('Active hold event');
      const expiredEvent = await createScheduleEvent('Expired hold event');
      const at = (hour: number) => new Date(Date.UTC(2030, 0, 12, hour));
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, hold_expires_at)
         VALUES ($1,$2,$4,$5,'pending',$6), ($1,$3,$4,$5,'pending',$7)`,
        [id, activeEvent, expiredEvent, at(13), at(14), new Date(fixedNow.getTime() + 60_000), new Date(fixedNow.getTime() - 60_000)],
      );
      const payload = { start: at(13).toISOString(), end: at(14).toISOString(), reason: 'Inspection' };

      // Act and assert a missing venue cannot receive a period.
      await staff.post(`/api/venues/${randomUUID()}/unavailable-periods`).send(payload).expect(404);
      const saved = await staff.post(`/api/venues/${id}/unavailable-periods`).send(payload).expect(201);

      // Assert only the live tentative hold is listed, with its real event identity.
      expect(saved.body.affectedBookings).toEqual([
        expect.objectContaining({ eventId: activeEvent, eventName: 'Active hold event', status: 'tentative' }),
      ]);
    });

    /** SPM-122 AC1/04/07: elapsed periods fail and past bookings are not conflicts. */
    it('rejects elapsed periods and lists only live bookings for an active period', async () => {
      // Arrange two approved bookings, with only one still occupying the venue at the fixed clock.
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({ ...venueInput, name: uniqueVenueName('SPM-122 Current Booking Venue') }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const historicalEvent = await createScheduleEvent('Past affected event');
      const liveEvent = await createScheduleEvent('Upcoming affected event');
      const at = (offsetHours: number) => new Date(fixedNow.getTime() + offsetHours * 60 * 60 * 1000).toISOString();
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1,$2,$4,$5,'approved'), ($1,$3,$6,$7,'approved')`,
        [id, historicalEvent, liveEvent, at(-3), at(-1), at(1), at(2)],
      );

      // Act: a fully past interval is refused, while one still active is saved.
      const past = await staff.post(`/api/venues/${id}/unavailable-periods`).send({
        start: at(-2), end: fixedNow.toISOString(), reason: 'Maintenance',
      }).expect(400);
      expect(past.body).toMatchObject({ errors: { end: 'End date and time must be in the future.' } });
      const saved = await staff.post(`/api/venues/${id}/unavailable-periods`).send({
        start: at(-4), end: at(3), reason: 'Maintenance',
      }).expect(201);

      // Assert the past write did not persist and only the still-current booking is listed.
      expect(saved.body.affectedBookings.map((booking: { eventId: string }) => booking.eventId)).toEqual([liveEvent]);
      const blockouts = await pool.query('SELECT id FROM venue_bookings WHERE venue_id = $1 AND status = $2', [id, 'blocked']);
      expect(blockouts.rows).toHaveLength(1);
    });

    /** SPM-122 / VEN-UNAVAIL-05-A/B: ending one period preserves another. */
    it('restores one active period early while leaving a second period intact', async () => {
      // Arrange a venue with two blockouts.
      const staff = await authenticate(staffEmail);
      const coordinator = await authenticate(coordinatorEmail);
      const created = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: uniqueVenueName('SPM-122 Early End Venue'),
        })
        .expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const at = (day: number, hour: number) =>
        new Date(Date.UTC(2030, 0, day, hour)).toISOString();
      const active = await staff
        .post(`/api/venues/${id}/unavailable-periods`)
        .send({ start: at(10, 11), end: at(10, 13), reason: 'Maintenance' })
        .expect(201);
      const unrelated = await staff
        .post(`/api/venues/${id}/unavailable-periods`)
        .send({ start: at(12, 11), end: at(12, 13), reason: 'Renovation' })
        .expect(201);
      const otherVenue = await staff.post('/api/venues').send({ ...venueInput, name: uniqueVenueName('SPM-122 Other Venue') }).expect(201);
      venueIds.push(otherVenue.body.venue.id as string);
      const beforeDetail = await staff.get(`/api/venues/${id}`).expect(200);
      expect(beforeDetail.body.availabilityStatus).toBe('unavailable');
      expect(beforeDetail.body.unavailablePeriods).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: active.body.period.id, current: true }),
        expect.objectContaining({ id: unrelated.body.period.id, current: false }),
      ]));
      // An unrelated user, future period, or wrong venue must not end the active period.
      await coordinator.post(`/api/venues/${id}/unavailable-periods/${active.body.period.id}/end`).expect(403);
      await staff.post(`/api/venues/${id}/unavailable-periods/${unrelated.body.period.id}/end`).expect(404);
      await staff.post(`/api/venues/${otherVenue.body.venue.id}/unavailable-periods/${active.body.period.id}/end`).expect(404);
      // Act: end only the active period.
      const ended = await staff
        .post(
          `/api/venues/${id}/unavailable-periods/${active.body.period.id}/end`,
        )
        .expect(201);
      await staff.post(`/api/venues/${id}/unavailable-periods/${active.body.period.id}/end`).expect(404);
      const afterDetail = await staff.get(`/api/venues/${id}`).expect(200);
      const periods = await pool.query(
        'SELECT id, end_at, reason FROM venue_bookings WHERE venue_id = $1 AND status = $2 ORDER BY id',
        [id, 'blocked'],
      );

      // Assert the active period ends at the fixed clock and unrelated future period is unchanged.
      expect(
        periods.rows.find((row) => row.id === active.body.period.id),
      ).toMatchObject({ end_at: fixedNow, reason: 'Maintenance' });
      expect(ended.body.period).toMatchObject({ id: active.body.period.id, start: at(10, 11), end: fixedNow.toISOString(), reason: 'Maintenance' });
      expect(afterDetail.body.availabilityStatus).toBe('available');
      expect(afterDetail.body.unavailablePeriods).toEqual([
        expect.objectContaining({ id: unrelated.body.period.id, current: false }),
      ]);
      expect(
        periods.rows.find((row) => row.id === unrelated.body.period.id),
      ).toMatchObject({ end_at: new Date(at(12, 13)), reason: 'Renovation' });
    });

    /** SPM-122 / VEN-UNAVAIL-05-A/B: another active period keeps the venue unavailable. */
    it('keeps the venue unavailable while a second overlapping period remains active', async () => {
      // Arrange two independently persisted blockouts that both contain the fixed clock.
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({ ...venueInput, name: uniqueVenueName('SPM-122 Overlapping Early End Venue') }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const at = (hour: number) => new Date(Date.UTC(2030, 0, 10, hour)).toISOString();
      const first = await staff.post(`/api/venues/${id}/unavailable-periods`)
        .send({ start: at(10), end: at(14), reason: 'Lighting repair' }).expect(201);
      const second = await staff.post(`/api/venues/${id}/unavailable-periods`)
        .send({ start: at(11), end: at(15), reason: 'Audio repair' }).expect(201);
      const before = await staff.get(`/api/venues/${id}`).expect(200);
      expect(before.body.unavailablePeriods.filter((period: { current: boolean }) => period.current)).toHaveLength(2);

      // Act: end only the first period through the real authenticated HTTP route.
      await staff.post(`/api/venues/${id}/unavailable-periods/${first.body.period.id}/end`).expect(201);
      const after = await staff.get(`/api/venues/${id}`).expect(200);
      const persisted = await pool.query(
        'SELECT id, end_at FROM venue_bookings WHERE venue_id = $1 AND status = $2',
        [id, 'blocked'],
      );

      // Assert the second period still controls the venue's availability and retains its end.
      expect(after.body.availabilityStatus).toBe('unavailable');
      expect(after.body.unavailablePeriods).toEqual([
        expect.objectContaining({ id: second.body.period.id, current: true, end: at(15) }),
      ]);
      expect(persisted.rows.find((row) => row.id === first.body.period.id)?.end_at).toEqual(fixedNow);
      expect(persisted.rows.find((row) => row.id === second.body.period.id)?.end_at).toEqual(new Date(at(15)));
    });

    /**
     * SPM-121 AC9 VEN-UPD-09-A: changing venue capacity returns exactly the pending and approved bookings in
     * capacityBookings (by booking id); every booking stays recorded and unchanged.
     */
    it('VEN-UPD-09-E2E-A: lists pending and approved bookings when capacity changes and leaves them intact', async () => {
      // Arrange: one venue with one pending and one approved booking, plus one rejected that must be excluded.
      const staff = await authenticate(staffEmail);
      const created = await staff
        .post('/api/venues')
        .send({ ...venueInput, capacity: 50, name: uniqueVenueName('SPM-121 AC9 Capacity Venue') })
        .expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const at = (day: number) => new Date(Date.UTC(2030, 2, day, 10));
      const pending = await insertBooking(id, 'SPM-121 AC9 pending event', 'pending', at(1), at(2));
      const approved = await insertBooking(id, 'SPM-121 AC9 approved event', 'approved', at(3), at(4));
      const rejected = await insertBooking(id, 'SPM-121 AC9 rejected event', 'rejected', at(5), at(6));

      // Act: reduce capacity so it changes.
      const response = await staff
        .patch(`/api/venues/${id}`)
        .send({ ...venueInput, capacity: 30, name: uniqueVenueName('SPM-121 AC9 Capacity Venue') })
        .expect(200);

      // Assert: capacityBookings is exactly the pending and approved rows (same ids, names, times, statuses).
      expect(actualListing(response.body.capacityBookings)).toEqual(expectedListing([pending, approved]));
      expect(response.body.capacityBookings.map((b: { bookingId: string }) => b.bookingId)).not.toContain(rejected.id);

      // All three bookings are still in the database, unchanged.
      await expectBookingsUnchanged([pending, approved, rejected]);
    });

    /** SPM-121 AC9 VEN-UPD-09-D: an update that leaves capacity unchanged returns no capacity booking list. */
    it('VEN-UPD-09-E2E-B: capacityBookings is empty when capacity is unchanged', async () => {
      // Arrange: one venue with a booking.
      const staff = await authenticate(staffEmail);
      const created = await staff
        .post('/api/venues')
        .send({ ...venueInput, capacity: 80, name: uniqueVenueName('SPM-121 AC9 No-Change Venue') })
        .expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const at = (day: number) => new Date(Date.UTC(2030, 3, day, 10));
      const booking = await insertBooking(id, 'SPM-121 AC9 no-change event', 'approved', at(1), at(2));

      // Act: update name only — capacity stays at 80.
      const response = await staff
        .patch(`/api/venues/${id}`)
        .send({ ...venueInput, capacity: 80, name: uniqueVenueName('SPM-121 AC9 No-Change Venue Updated') })
        .expect(200);

      expect(response.body.capacityBookings).toEqual([]);
      await expectBookingsUnchanged([booking]);
    });

    /** SPM-121 AC7 VEN-UPD-07-SEC-1: a non-owner Venue Staff member cannot edit another staff member's venue. */
    it('VEN-UPD-07-E2E-A: returns 403 when a second Venue Staff tries to PATCH a venue they do not own', async () => {
      const owner = await authenticate(staffEmail);
      const created = await owner
        .post('/api/venues')
        .send({ ...venueInput, name: uniqueVenueName('SPM-121 AC7 Owner Venue') })
        .expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      const otherStaff = await authenticate(secondStaffEmail);
      await otherStaff
        .patch(`/api/venues/${id}`)
        .send({ ...venueInput, name: uniqueVenueName('SPM-121 AC7 Attempted Rename') })
        .expect(403);
    });

    /** SPM-121 AC4 VEN-UPD-04-A: updating a venue to a duplicate name+location returns 409. */
    it('VEN-UPD-04-E2E-A: returns 409 when PATCH would create a duplicate name+location', async () => {
      const staff = await authenticate(staffEmail);
      const nameA = uniqueVenueName('SPM-121 AC4 Venue A');
      const nameB = uniqueVenueName('SPM-121 AC4 Venue B');
      const location = 'Block Z Level 9';

      const createdA = await staff.post('/api/venues').send({ ...venueInput, name: nameA, location }).expect(201);
      venueIds.push(createdA.body.venue.id as string);
      const createdB = await staff.post('/api/venues').send({ ...venueInput, name: nameB, location }).expect(201);
      const idB = createdB.body.venue.id as string;
      venueIds.push(idB);

      // Rename B to A's name at the same location → duplicate
      const response = await staff
        .patch(`/api/venues/${idB}`)
        .send({ ...venueInput, name: nameA, location })
        .expect(409);

      expect(response.body.message).toMatch(/already exists/i);
    });

    /** SPM-121 AC6 VEN-UPD-06-A: a GET after PATCH reflects the updated venue values. */
    it('VEN-UPD-06-E2E-A: GET after PATCH returns the updated venue fields', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff
        .post('/api/venues')
        .send({ ...venueInput, name: uniqueVenueName('SPM-121 AC6 Before Update') })
        .expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      const newName = uniqueVenueName('SPM-121 AC6 After Update');
      await staff
        .patch(`/api/venues/${id}`)
        .send({ ...venueInput, name: newName, capacity: 55 })
        .expect(200);

      const get = await staff.get(`/api/venues/${id}`).expect(200);
      expect(get.body.name).toBe(newName);
      expect(get.body.capacity).toBe(55);
    });

    /** SPM-121 AC6 VEN-UPD-06-B: after a location update, the venue list returns the new location. */
    it('VEN-UPD-06-E2E-B: venue list reflects updated location and not the old one', async () => {
      const staff = await authenticate(staffEmail);
      const oldLocation = 'Old Wing Level 99';
      const newLocation = 'East Wing Level 5';
      const name = uniqueVenueName('SPM-121 AC6-B Location');
      const created = await staff.post('/api/venues').send({ ...venueInput, name, location: oldLocation }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      await staff.patch(`/api/venues/${id}`).send({ ...venueInput, name, location: newLocation }).expect(200);

      const list = await staff.get('/api/venues').expect(200);
      const found = list.body.find((v: { id: string }) => v.id === id);
      expect(found.location).toBe(newLocation);
    });

    /** SPM-121 AC6 VEN-UPD-06-C: a Coordinator reading the venue after a timing update sees the new setup/turnaround. */
    it('VEN-UPD-06-E2E-C: Coordinator sees updated setup and turnaround times after Staff edits', async () => {
      const staff = await authenticate(staffEmail);
      const name = uniqueVenueName('SPM-121 AC6-C Timing');
      const created = await staff.post('/api/venues').send({ ...venueInput, name, setupTimeMinutes: 30, turnaroundTimeMinutes: 45 }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      await staff.patch(`/api/venues/${id}`).send({ ...venueInput, name, setupTimeMinutes: 45, turnaroundTimeMinutes: 60 }).expect(200);

      const coord = await authenticate(coordinatorEmail);
      const get = await coord.get(`/api/venues/${id}`).expect(200);
      expect(get.body.setupTimeMinutes).toBe(45);
      expect(get.body.turnaroundTimeMinutes).toBe(60);
    });

    /**
     * SPM-121 AC6 VEN-UPD-06-C: after Venue Staff raise setup to 45 and turnaround to 60, a 10:00-12:00 booking
     * (Asia/Singapore) occupies exactly 09:15-13:00, not the original 09:30-12:45, for availability and conflict
     * calculations. The approval conflict list is the only API that exposes the occupied interval; the Coordinator's
     * booking-request availability check uses the same widened window.
     */
    it('VEN-UPD-06-C-AVAIL-E2E: updated setup and turnaround move the occupied interval to 09:15-13:00', async () => {
      // Arrange: venue with the original 30/45 buffers, a 10:00-12:00 SGT approved booking, and the seeded Coordinator.
      const staff = await authenticate(staffEmail);
      const coordinator = await authenticate(coordinatorEmail);
      const coordinatorId = (await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [coordinatorEmail])).rows[0].id;
      const name = uniqueVenueName('SPM-121 AC6-C Availability');
      const created = await staff.post('/api/venues').send({ ...venueInput, name, setupTimeMinutes: 30, turnaroundTimeMinutes: 45 }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      // Asia/Singapore is UTC+8 with no daylight saving: 10:00 SGT on 2030-05-20 is 02:00Z.
      const sgt = (hour: number, minute = 0) => new Date(Date.UTC(2030, 4, 20, hour - 8, minute));
      const booked = await insertBooking(id, 'SPM-121 AC6-C booked', 'approved', sgt(10), sgt(12));

      // Act: Venue Staff change the buffers to 45 and 60.
      await staff.patch(`/api/venues/${id}`).send({ ...venueInput, name, setupTimeMinutes: 45, turnaroundTimeMinutes: 60 }).expect(200);

      // Assert 1: the Coordinator reads the latest buffers and the unchanged 10:00-12:00 booking.
      const detail = await coordinator.get(`/api/venues/${id}`).expect(200);
      expect(detail.body).toMatchObject({ setupTimeMinutes: 45, turnaroundTimeMinutes: 60 });
      expect(detail.body.reservations).toEqual([
        expect.objectContaining({ eventName: 'SPM-121 AC6-C booked', start: sgt(10).toISOString(), end: sgt(12).toISOString() }),
      ]);

      // Assert 2: the Coordinator's availability check uses the new window. An event at 13:30-14:30 SGT is refused:
      // under the original 30/45 buffers it would clear 12:45 and be accepted. One at 13:45-14:45 sits exactly on the
      // new boundary (12:00 + 60 + 45) and is accepted (touching intervals do not conflict).
      const blockedEvent = await createCoordinatorEvent(coordinatorId, 'SPM-121 AC6-C blocked probe', sgt(13, 30), sgt(14, 30));
      const refused = await coordinator
        .post(`/api/venues/${id}/booking-requests`)
        .send({ eventId: blockedEvent, start: sgt(13, 30).toISOString(), end: sgt(14, 30).toISOString() })
        .expect(409);
      expect(refused.body.message).toContain('SPM-121 AC6-C booked');
      const edgeEvent = await createCoordinatorEvent(coordinatorId, 'SPM-121 AC6-C edge probe', sgt(13, 45), sgt(14, 45));
      await coordinator
        .post(`/api/venues/${id}/booking-requests`)
        .send({ eventId: edgeEvent, start: sgt(13, 45).toISOString(), end: sgt(14, 45).toISOString() })
        .expect(201);

      // Assert 3: the occupied interval of the 10:00-12:00 booking is exactly 09:15-13:00 SGT.
      const challenger = await insertBooking(id, 'SPM-121 AC6-C challenger', 'pending', sgt(12, 30), sgt(13, 30));
      const approval = await staff.post(`/api/venues/bookings/${challenger.id}/approve`).expect(409);
      const window = approval.body.conflicts.find((c: { id: string }) => c.id === booked.id);
      expect(window).toMatchObject({
        id: booked.id,
        kind: 'booking',
        start: sgt(10).toISOString(),
        end: sgt(12).toISOString(),
        occupiedStart: sgt(9, 15).toISOString(),
        occupiedEnd: sgt(13).toISOString(),
      });
      // The refused approval changed nothing: the challenger is still pending and the booked row is untouched.
      await expectBookingsUnchanged([booked, challenger]);
    });

    /** SPM-121 AC6 VEN-UPD-06-D: a Coordinator does not see obsolete venue details after a successful update. */
    it('VEN-UPD-06-E2E-D: Coordinator does not see stale location or timing after update', async () => {
      const staff = await authenticate(staffEmail);
      const name = uniqueVenueName('SPM-121 AC6-D Stale');
      const created = await staff.post('/api/venues').send({ ...venueInput, name, location: 'Stale Wing', setupTimeMinutes: 10 }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      await staff.patch(`/api/venues/${id}`).send({ ...venueInput, name, location: 'Fresh Wing', setupTimeMinutes: 40 }).expect(200);

      const coord = await authenticate(coordinatorEmail);
      const get = await coord.get(`/api/venues/${id}`).expect(200);
      expect(get.body.location).not.toBe('Stale Wing');
      expect(get.body.location).toBe('Fresh Wing');
      expect(get.body.setupTimeMinutes).not.toBe(10);
      expect(get.body.setupTimeMinutes).toBe(40);
    });

    /** SPM-121 AC8 VEN-UPD-08-A: changing setup/turnaround time returns affected bookings in affectedBookings. */
    it('VEN-UPD-08-E2E-A: returns affected bookings in affectedBookings when setup/turnaround time changes', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff
        .post('/api/venues')
        .send({ ...venueInput, name: uniqueVenueName('SPM-121 AC8 Timing Venue'), setupTimeMinutes: 0, turnaroundTimeMinutes: 0 })
        .expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      // Two consecutive one-hour bookings with no gap (they do not conflict with 0/0 timing).
      const slot1Start = new Date(fixedNow.getTime() + 2 * 24 * 60 * 60 * 1000);
      const slot1End = new Date(slot1Start.getTime() + 60 * 60 * 1000);
      const slot2End = new Date(slot1End.getTime() + 60 * 60 * 1000);
      const first = await insertBooking(id, 'SPM-121 AC8 event 1', 'pending', slot1Start, slot1End);
      const second = await insertBooking(id, 'SPM-121 AC8 event 2', 'pending', slot1End, slot2End);
      await linkBookingRequests([first, second]);

      // Increasing turnaround to 90 minutes makes the widened windows overlap.
      const response = await staff
        .patch(`/api/venues/${id}`)
        .send({ ...venueInput, name: uniqueVenueName('SPM-121 AC8 Timing Venue'), setupTimeMinutes: 0, turnaroundTimeMinutes: 90 })
        .expect(200);

      // Exactly the two overlapping bookings are listed, with their linked event names and times.
      expect(actualListing(response.body.affectedBookings)).toEqual(expectedListing([first, second]));
      // Both stay recorded with the same event link, status and times.
      await expectBookingsUnchanged([first, second]);
    });

    /** SPM-121 AC8 VEN-UPD-08-B: increasing turnaround time displays newly affected bookings without removing them. */
    it('VEN-UPD-08-B-E2E: turnaround increase shows newly affected bookings and preserves them', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff
        .post('/api/venues')
        .send({ ...venueInput, name: uniqueVenueName('SPM-121 AC8-B Turnaround Venue'), setupTimeMinutes: 0, turnaroundTimeMinutes: 30 })
        .expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      // A=10:00–12:00, B=12:35–14:00 (future day); with turnaround=30m A occupies 10:00–12:30, gap to B at 12:35
      const day = new Date(fixedNow.getTime() + 3 * 24 * 60 * 60 * 1000);
      const at = (h: number, m = 0) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m));
      const bookingA = await insertBooking(id, 'SPM-121 AC8-B event A', 'approved', at(10), at(12));
      const bookingB = await insertBooking(id, 'SPM-121 AC8-B event B', 'approved', at(12, 35), at(14));
      await linkBookingRequests([bookingA, bookingB]);

      // Increase turnaround from 30m to 40m: A now occupies 10:00–12:40, overlapping B at 12:35
      const response = await staff
        .patch(`/api/venues/${id}`)
        .send({ ...venueInput, name: uniqueVenueName('SPM-121 AC8-B Turnaround Venue'), setupTimeMinutes: 0, turnaroundTimeMinutes: 40 })
        .expect(200);

      // Both parties of the new overlap are listed by id, and both rows are preserved unchanged.
      expect(actualListing(response.body.affectedBookings)).toEqual(expectedListing([bookingA, bookingB]));
      await expectBookingsUnchanged([bookingA, bookingB]);
    });

    /** SPM-121 AC8 VEN-UPD-08-C: changing timing without creating new conflicts does not falsely list bookings. */
    it('VEN-UPD-08-C-E2E: no bookings listed as affected when timing change causes no new overlap', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff
        .post('/api/venues')
        .send({ ...venueInput, name: uniqueVenueName('SPM-121 AC8-C No Conflict Venue'), setupTimeMinutes: 30, turnaroundTimeMinutes: 45 })
        .expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      // A=10:00–12:00, B=16:00–17:00 on a future day; wide gap so timing changes won't cause overlap
      const day = new Date(fixedNow.getTime() + 3 * 24 * 60 * 60 * 1000);
      const at = (h: number, m = 0) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m));
      const bookingA = await insertBooking(id, 'SPM-121 AC8-C event A', 'approved', at(10), at(12));
      const bookingB = await insertBooking(id, 'SPM-121 AC8-C event B', 'approved', at(16), at(17));
      await linkBookingRequests([bookingA, bookingB]);

      // Increase setup 30→45 and turnaround 45→60; A occupies 09:15–13:00, B occupies 15:15–18:00 — no overlap
      const response = await staff
        .patch(`/api/venues/${id}`)
        .send({ ...venueInput, name: uniqueVenueName('SPM-121 AC8-C No Conflict Venue'), setupTimeMinutes: 45, turnaroundTimeMinutes: 60 })
        .expect(200);

      expect(response.body.affectedBookings).toEqual([]);
      // Both bookings remain exactly as inserted (event link, status and times).
      await expectBookingsUnchanged([bookingA, bookingB]);
    });

    /** SPM-121 AC4 VEN-UPD-04-B: same name at a different location is NOT a duplicate. */
    it('VEN-UPD-04-E2E-B: allows a name that exists at a different location', async () => {
      const staff = await authenticate(staffEmail);
      const nameA = uniqueVenueName('SPM-121 AC4-B Shared Name');
      const createdA = await staff.post('/api/venues').send({ ...venueInput, name: nameA, location: 'East Wing Level 1' }).expect(201);
      venueIds.push(createdA.body.venue.id as string);
      const createdB = await staff.post('/api/venues').send({ ...venueInput, name: uniqueVenueName('SPM-121 AC4-B Probe'), location: 'West Wing Level 9' }).expect(201);
      const idB = createdB.body.venue.id as string;
      venueIds.push(idB);

      const response = await staff
        .patch(`/api/venues/${idB}`)
        .send({ ...venueInput, name: nameA, location: 'West Wing Level 9' })
        .expect(200);
      expect(response.body.venue.name).toBe(nameA);
    });

    /** SPM-121 AC4 VEN-UPD-04-C: case-insensitive and whitespace-padded duplicates are still rejected. */
    it('VEN-UPD-04-E2E-C: rejects case-insensitive duplicate name at the same location', async () => {
      const staff = await authenticate(staffEmail);
      const nameA = uniqueVenueName('SPM-121 AC4-C Original');
      const location = 'Block Q Level 7';
      const createdA = await staff.post('/api/venues').send({ ...venueInput, name: nameA, location }).expect(201);
      venueIds.push(createdA.body.venue.id as string);
      const createdB = await staff.post('/api/venues').send({ ...venueInput, name: uniqueVenueName('SPM-121 AC4-C Probe'), location }).expect(201);
      const idB = createdB.body.venue.id as string;
      venueIds.push(idB);

      const response = await staff
        .patch(`/api/venues/${idB}`)
        .send({ ...venueInput, name: nameA.toLowerCase(), location })
        .expect(409);
      expect(response.body.message).toMatch(/already exists/i);
    });

    /** SPM-121 AC5 VEN-UPD-05-C: repeating the same save does not duplicate the venue row. */
    it('VEN-UPD-05-E2E-B: repeated save does not duplicate the venue', async () => {
      const staff = await authenticate(staffEmail);
      const name = uniqueVenueName('SPM-121 AC5-C Repeat Save');
      const created = await staff.post('/api/venues').send({ ...venueInput, name }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      const newName = uniqueVenueName('SPM-121 AC5-C Repeat After');
      await staff.patch(`/api/venues/${id}`).send({ ...venueInput, name: newName }).expect(200);
      await staff.patch(`/api/venues/${id}`).send({ ...venueInput, name: newName }).expect(200);

      const count = await pool.query('SELECT count(*) FROM venues WHERE id = $1', [id]);
      expect(Number(count.rows[0].count)).toBe(1);
    });

    /** SPM-121 AC9 VEN-UPD-09-C: rejected, blocked, and other-venue bookings are excluded from the capacity list. */
    it('VEN-UPD-09-E2E-C: capacityBookings excludes rejected, blocked and other-venue bookings', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({ ...venueInput, capacity: 100, name: uniqueVenueName('SPM-121 AC9-C Filter Venue') }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const other = await staff.post('/api/venues').send({ ...venueInput, capacity: 100, name: uniqueVenueName('SPM-121 AC9-C Other Venue') }).expect(201);
      const otherId = other.body.venue.id as string;
      venueIds.push(otherId);

      const at = (day: number) => new Date(Date.UTC(2030, 4, day, 10));
      const pending = await insertBooking(id, 'SPM-121 AC9-C pending', 'pending', at(1), at(2));
      const rejected = await insertBooking(id, 'SPM-121 AC9-C rejected', 'rejected', at(3), at(4));
      const otherVenue = await insertBooking(otherId, 'SPM-121 AC9-C other venue', 'approved', at(5), at(6));
      // A blocked (unavailable) period at the edited venue is not a booking and must not be listed either.
      const blocked = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason)
         VALUES ($1, $2, $3, 'blocked', 'SPM-121 AC9-C maintenance') RETURNING id`,
        [id, at(7), at(8)],
      );

      const response = await staff
        .patch(`/api/venues/${id}`)
        .send({ ...venueInput, capacity: 50, name: uniqueVenueName('SPM-121 AC9-C Filter Venue') })
        .expect(200);

      // Exactly the pending booking of this venue is listed; the rejected, blocked and other-venue rows are not.
      expect(actualListing(response.body.capacityBookings)).toEqual(expectedListing([pending]));
      const listedIds = response.body.capacityBookings.map((b: { bookingId: string }) => b.bookingId);
      expect(listedIds).not.toContain(rejected.id);
      expect(listedIds).not.toContain(otherVenue.id);
      expect(listedIds).not.toContain(blocked.rows[0].id);
      await expectBookingsUnchanged([pending, rejected, otherVenue]);
    });

    /** SPM-121 AC9 VEN-UPD-09-D: capacity change on a venue with no eligible bookings returns an empty list. */
    it('VEN-UPD-09-E2E-D: capacityBookings is empty when the venue has no pending or approved bookings', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({ ...venueInput, capacity: 100, name: uniqueVenueName('SPM-121 AC9-D Empty Venue') }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      const response = await staff
        .patch(`/api/venues/${id}`)
        .send({ ...venueInput, capacity: 50, name: uniqueVenueName('SPM-121 AC9-D Empty Venue') })
        .expect(200);

      expect(response.body.capacityBookings).toEqual([]);
    });

    /** SPM-121 AC9 VEN-UPD-09-VAR-1: successive capacity changes list correct bookings each time without duplication. */
    it('VEN-UPD-09-VAR-1-E2E: successive capacity changes list bookings correctly without duplication', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({ ...venueInput, capacity: 120, name: uniqueVenueName('SPM-121 AC9-VAR Repeat Venue') }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const at = (day: number) => new Date(Date.UTC(2030, 5, day, 10));
      const booking = await insertBooking(id, 'SPM-121 AC9-VAR event', 'approved', at(1), at(2));

      // Each capacity change lists the same single booking by id, and never adds a copy.
      const r1 = await staff.patch(`/api/venues/${id}`).send({ ...venueInput, capacity: 100, name: uniqueVenueName('SPM-121 AC9-VAR Repeat Venue') }).expect(200);
      expect(actualListing(r1.body.capacityBookings)).toEqual(expectedListing([booking]));

      const r2 = await staff.patch(`/api/venues/${id}`).send({ ...venueInput, capacity: 90, name: uniqueVenueName('SPM-121 AC9-VAR Repeat Venue') }).expect(200);
      expect(actualListing(r2.body.capacityBookings)).toEqual(expectedListing([booking]));

      const count = await pool.query('SELECT count(*) FROM venue_bookings WHERE venue_id = $1', [id]);
      expect(Number(count.rows[0].count)).toBe(1);
      await expectBookingsUnchanged([booking]);
    });

    /** SPM-121 AC2 VEN-UPD-02-B: changing one field preserves all other fields. */
    it('VEN-UPD-02-E2E-B: updating one field does not erase unrelated venue details', async () => {
      const staff = await authenticate(staffEmail);
      const name = uniqueVenueName('SPM-121 AC2-B Partial Update');
      const created = await staff.post('/api/venues').send({
        ...venueInput, name, location: 'North Annex Level 3', capacity: 200,
        setupTimeMinutes: 15, turnaroundTimeMinutes: 20,
      }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      await staff.patch(`/api/venues/${id}`).send({
        ...venueInput, name, location: 'South Annex Level 1', capacity: 200,
        setupTimeMinutes: 15, turnaroundTimeMinutes: 20,
      }).expect(200);

      const get = await staff.get(`/api/venues/${id}`).expect(200);
      expect(get.body.location).toBe('South Annex Level 1');
      expect(get.body.capacity).toBe(200);
      expect(get.body.setupTimeMinutes).toBe(15);
      expect(get.body.turnaroundTimeMinutes).toBe(20);
      expect(get.body.name).toBe(name);
    });

    /**
     * SPM-121 AC2 VEN-UPD-02-C: uploading image A, replacing it with a distinct image B and reloading shows image B,
     * and every other venue field keeps its value.
     */
    it('VEN-UPD-02-C-E2E: replacing image A with image B persists B and leaves other fields unchanged', async () => {
      const staff = await authenticate(staffEmail);
      const name = uniqueVenueName('SPM-121 AC2-C Image Replace');
      const withoutImage = { ...venueInput, name, image: undefined };
      const created = await staff.post('/api/venues').send(withoutImage).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);
      const imageA = { name: 'image-a.png', type: 'image/png', size: 7, dataUrl: 'data:image/png;base64,aW1hZ2UtYQ==' };
      const imageB = { name: 'image-b.png', type: 'image/png', size: 7, dataUrl: 'data:image/png;base64,aW1hZ2UtYg==' };
      // The two data URLs decode to "image-a" and "image-b": distinct payloads of the declared size.
      expect(Buffer.from(imageA.dataUrl.split(',')[1], 'base64').toString()).toBe('image-a');
      expect(Buffer.from(imageB.dataUrl.split(',')[1], 'base64').toString()).toBe('image-b');

      // Upload image A, then reload.
      await staff.patch(`/api/venues/${id}`).send({ ...withoutImage, image: imageA }).expect(200);
      const afterA = await staff.get(`/api/venues/${id}`).expect(200);
      expect(afterA.body.image).toEqual(imageA);

      // Replace it with image B, then reload: B is stored, A is gone, and all other fields are as originally saved.
      await staff.patch(`/api/venues/${id}`).send({ ...withoutImage, image: imageB }).expect(200);
      const afterB = await staff.get(`/api/venues/${id}`).expect(200);
      expect(afterB.body.image).toEqual(imageB);
      expect(afterB.body.image.dataUrl).not.toBe(imageA.dataUrl);
      expect(afterB.body).toMatchObject({
        id,
        name,
        location: venueInput.location,
        capacity: venueInput.capacity,
        facilities: venueInput.facilities,
        accessibility: venueInput.accessibility,
        layouts: venueInput.layouts,
        operatingInformation: venueInput.operatingInformation,
        setupTimeMinutes: venueInput.setupTimeMinutes,
        turnaroundTimeMinutes: venueInput.turnaroundTimeMinutes,
      });
    });

    /** SPM-121 AC8 VEN-UPD-08-D: multiple bookings affected while unrelated one is excluded. */
    it('VEN-UPD-08-D-E2E: lists A, B, C as affected but excludes unrelated D', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({
        ...venueInput, name: uniqueVenueName('SPM-121 AC8-D Multi'), setupTimeMinutes: 0, turnaroundTimeMinutes: 0,
      }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      const d = (h: number, m = 0) => new Date(Date.UTC(2030, 5, 15, h, m));
      const bookingA = await insertBooking(id, 'AC8-D A', 'approved', d(8, 0), d(9, 0));
      const bookingB = await insertBooking(id, 'AC8-D B', 'approved', d(9, 20), d(10, 0));
      const bookingC = await insertBooking(id, 'AC8-D C', 'approved', d(10, 20), d(11, 0));
      const bookingD = await insertBooking(id, 'AC8-D D', 'approved', d(15, 0), d(16, 0));
      await linkBookingRequests([bookingA, bookingB, bookingC, bookingD]);

      // Setup 0→30: B (from 08:50) overlaps A's end at 09:00, and C (from 09:50) overlaps B's end at 10:00; D is far away.
      const response = await staff.patch(`/api/venues/${id}`).send({
        ...venueInput, name: uniqueVenueName('SPM-121 AC8-D Multi'), setupTimeMinutes: 30, turnaroundTimeMinutes: 0,
      }).expect(200);

      // Exactly A, B and C are listed (by id); D is excluded; all four rows are preserved.
      expect(actualListing(response.body.affectedBookings)).toEqual(expectedListing([bookingA, bookingB, bookingC]));
      await expectBookingsUnchanged([bookingA, bookingB, bookingC, bookingD]);
    });

    /** SPM-121 AC8 VEN-UPD-08-BND-1: endpoint-contact bookings are not listed as affected (half-open intervals). */
    it('VEN-UPD-08-BND-1-E2E: bookings touching at exactly one endpoint are not affected', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({
        ...venueInput, name: uniqueVenueName('SPM-121 AC8-BND1'), setupTimeMinutes: 15, turnaroundTimeMinutes: 0,
      }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      const d = (h: number, m = 0) => new Date(Date.UTC(2030, 5, 20, h, m));
      // A=09:00-10:00, B=10:30-11:30; with setup=15m they don't overlap (gap 15m)
      const bookingA = await insertBooking(id, 'AC8-BND1 A', 'approved', d(9, 0), d(10, 0));
      const bookingB = await insertBooking(id, 'AC8-BND1 B', 'approved', d(10, 30), d(11, 30));
      await linkBookingRequests([bookingA, bookingB]);

      // Increase setup to 30m: A occupied=08:30-10:00, B occupied=10:00-11:30 — they touch at 10:00 only
      const response = await staff.patch(`/api/venues/${id}`).send({
        ...venueInput, name: uniqueVenueName('SPM-121 AC8-BND1'), setupTimeMinutes: 30, turnaroundTimeMinutes: 0,
      }).expect(200);

      expect(response.body.affectedBookings).toEqual([]);
      await expectBookingsUnchanged([bookingA, bookingB]);
    });

    /** SPM-121 AC9 VEN-UPD-09-B: capacity increase also lists pending and approved bookings. */
    it('VEN-UPD-09-B-E2E: capacity increase lists all pending and approved bookings', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({
        ...venueInput, capacity: 120, name: uniqueVenueName('SPM-121 AC9-B Increase'),
      }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      const at = (day: number) => new Date(Date.UTC(2030, 6, day, 10));
      const pending = await insertBooking(id, 'AC9-B pending', 'pending', at(1), at(2));
      const approved = await insertBooking(id, 'AC9-B approved', 'approved', at(3), at(4));

      const response = await staff.patch(`/api/venues/${id}`).send({
        ...venueInput, capacity: 160, name: uniqueVenueName('SPM-121 AC9-B Increase'),
      }).expect(200);

      // Exactly the two bookings are listed, identified by id, and both are unchanged afterwards.
      expect(actualListing(response.body.capacityBookings)).toEqual(expectedListing([pending, approved]));
      await expectBookingsUnchanged([pending, approved]);
    });

    /** SPM-121 AC9 VEN-UPD-09-BND-1: bookings listed regardless of attendance relative to capacity. */
    it('VEN-UPD-09-BND-1-E2E: lists bookings with attendance below, equal, and above updated capacity', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff.post('/api/venues').send({
        ...venueInput, capacity: 120, name: uniqueVenueName('SPM-121 AC9-BND1'),
      }).expect(201);
      const id = created.body.venue.id as string;
      venueIds.push(id);

      const at = (day: number) => new Date(Date.UTC(2030, 7, day, 10));
      const below = await insertBooking(id, 'AC9-BND1 below', 'pending', at(1), at(2));
      const equal = await insertBooking(id, 'AC9-BND1 equal', 'approved', at(3), at(4));
      const above = await insertBooking(id, 'AC9-BND1 above', 'approved', at(5), at(6));
      await pool.query(
        `UPDATE events SET expected_attendance = CASE id
           WHEN $1::uuid THEN 99 WHEN $2::uuid THEN 100 WHEN $3::uuid THEN 101 END
         WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
        [below.eventId, equal.eventId, above.eventId],
      );

      const response = await staff.patch(`/api/venues/${id}`).send({
        ...venueInput, capacity: 100, name: uniqueVenueName('SPM-121 AC9-BND1'),
      }).expect(200);

      // All three bookings are listed (attendance 99, 100, 101 against capacity 100) and none is changed.
      expect(actualListing(response.body.capacityBookings)).toEqual(expectedListing([below, equal, above]));
      await expectBookingsUnchanged([below, equal, above]);
    });
  },
);
