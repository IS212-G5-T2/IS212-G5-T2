import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { CLOCK } from '../registrations/clock.js';

const databaseUrl = process.env.DATABASE_URL;
const password = 'P@55w0rd';
const staffEmail = 'venue_staff1@connectsphere.test';
const secondStaffEmail = 'venue_staff2@connectsphere.test';
const coordinatorEmail = 'coordinator1@connectsphere.test';
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
    const venueInput = {
      name: 'Orchid Hall Test',
      location: 'Test Building Level 3',
      capacity: 120,
      facilities: ['AV System', 'Wi-Fi'],
      accessibility: ['Wheelchair access'],
      layouts: ['Classroom', 'Theatre'],
      operatingInformation: 'Closed on public holidays',
      operatingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      operatingStartTime: '08:00',
      operatingEndTime: '22:00',
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

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: databaseUrl });
      await pool.query(
        await readFile(
          new URL('../../migrations/005_venues.sql', import.meta.url),
          'utf8',
        ),
      );
      await pool.query(
        await readFile(
          new URL(
            '../../migrations/006_venue_operating_information.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await pool.query(
        await readFile(
          new URL(
            '../../migrations/007_venue_operating_schedule.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      ownerMigration = await readFile(
        new URL(
          '../../migrations/008_venue_owner_user_id.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await pool.query(ownerMigration);
      await pool.query(ownerMigration);
      await pool.query(
        await readFile(
          new URL(
            '../../migrations/009_venue_availability.sql',
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

    // SPM-50 / TEST-5: the production HTTP stack requires a real persisted session and Venue:create permission.
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
        venue: { id: expect.stringMatching(uuidPattern), ...venueInput },
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

    // SPM-50 owner rule: another staff member owns only the venue created through their own session.
    it('uses the verified second staff identity despite spoofed owner fields', async () => {
      // Arrange a second seeded Venue Staff account and client-controlled owner values.
      const staff = await authenticate(secondStaffEmail);
      const created = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: 'Orchid Hall Second Staff',
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

    // SPM-50 schema rule: the owner column is a UUID foreign key, not free-form client data.
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

    // SPM-50 upgrade rule: legacy records keep unknown ownership, while the migration protects future rows.
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

    // SPM-50 schema rule: neither an absent nor a nonexistent user may own a new venue.
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
            operating_days, operating_start_time, operating_end_time,
            setup_time_minutes, turnaround_time_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            ownerUserId,
            `Invalid Owner ${code}`,
            'Test Building Level 3',
            venueInput.capacity,
            venueInput.operatingInformation,
            venueInput.operatingDays,
            venueInput.operatingStartTime,
            venueInput.operatingEndTime,
            venueInput.setupTimeMinutes,
            venueInput.turnaroundTimeMinutes,
          ],
        );

        // Assert the database refuses the write before it can become a venue record.
        await expect(insert).rejects.toMatchObject({ code });
      },
    );

    // SPM-50 business rule: accessibility is optional, so a valid venue can persist with no accessibility links.
    it('creates a venue with no accessibility selection', async () => {
      const staff = await authenticate(staffEmail);
      const created = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: 'Orchid Hall Without Accessibility',
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

    // SPM-50 duplicate prevention: case and surrounding whitespace cannot create the same named venue twice.
    it('rejects a normalized duplicate name and location', async () => {
      const staff = await authenticate(staffEmail);

      const response = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: `  ${venueInput.name.toUpperCase()}  `,
          location: `  ${venueInput.location.toUpperCase()}  `,
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

    // SPM-124 read contract: real SQL supplies the shared catalogue, with an explicit session-derived My venues filter.
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
          name: 'SPM-124 Schedule Owner Venue',
          image: undefined,
        })
        .expect(201);
      const other = await otherStaff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: 'SPM-124 Schedule Other Venue',
          image: undefined,
        })
        .expect(201);
      const setupCurrent = await staff
        .post('/api/venues')
        .send({
          ...venueInput,
          name: 'SPM-124 Setup Current Venue',
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

    // SPM-124 AC5: API ordering uses venue name, then ID for identical names.
    it('orders venue reads by name and ID despite opposite insertion order', async () => {
      // Arrange: IDs and insertion order deliberately disagree with the required order.
      const ids = [randomUUID(), randomUUID(), randomUUID()].sort();
      const owner = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [staffEmail],
      );
      const names = [
        'SPM-124 Order Zulu',
        'SPM-124 Order Alpha',
        'SPM-124 Order Alpha',
      ];
      const inserted = [
        { id: ids[0], name: names[0], location: 'Order Location 1' },
        { id: ids[2], name: names[1], location: 'Order Location 2' },
        { id: ids[1], name: names[2], location: 'Order Location 3' },
      ];
      for (const row of inserted) {
        await pool.query(
          `INSERT INTO venues (id, owner_user_id, name, location, capacity,
             operating_information, operating_days, operating_start_time,
             operating_end_time, setup_time_minutes, turnaround_time_minutes)
           VALUES ($1, $2, $3, $4, 10, 'Order test', ARRAY['Monday'],
             '09:00', '18:00', 0, 0)`,
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
  },
);
