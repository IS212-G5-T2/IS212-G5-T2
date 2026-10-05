import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';

const databaseUrl = process.env.DATABASE_URL;
const password = 'P@55w0rd';
const staffEmail = 'venue_staff1@connectsphere.test';
const secondStaffEmail = 'venue_staff2@connectsphere.test';
const coordinatorEmail = 'coordinator1@connectsphere.test';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe.skipIf(!databaseUrl)(
  'SPM-50 venue HTTP and PostgreSQL integration',
  () => {
    let app: INestApplication;
    let pool: pg.Pool;
    let ownerMigration: string;
    const venueIds: string[] = [];
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
          new URL('../../migrations/006_venue_operating_information.sql', import.meta.url),
          'utf8',
        ),
      );
      await pool.query(
        await readFile(
          new URL('../../migrations/007_venue_operating_schedule.sql', import.meta.url),
          'utf8',
        ),
      );
      ownerMigration = await readFile(
        new URL('../../migrations/008_venue_owner_user_id.sql', import.meta.url),
        'utf8',
      );
      await pool.query(ownerMigration);
      await pool.query(ownerMigration);
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      if (pool) {
        if (venueIds.length)
          await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venueIds]);
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
        { owner_user_id: expect.stringMatching(uuidPattern), email: staffEmail },
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
      expect(constraint.rows).toEqual([{ conname: 'venues_owner_user_id_fkey' }]);
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
    ])('rejects direct SQL inserts with owner %s', async (ownerUserId, code) => {
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
    });

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
  },
);
