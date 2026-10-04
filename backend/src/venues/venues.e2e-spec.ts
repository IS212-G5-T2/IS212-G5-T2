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
const coordinatorEmail = 'coordinator1@connectsphere.test';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe.skipIf(!databaseUrl)(
  'SPM-50 venue HTTP and PostgreSQL integration',
  () => {
    let app: INestApplication;
    let pool: pg.Pool;
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
      expect(
        (await pool.query('SELECT id FROM venues WHERE id = $1', [venueId]))
          .rowCount,
      ).toBe(1);
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
