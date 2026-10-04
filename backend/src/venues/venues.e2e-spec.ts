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
    let venueId: string | undefined;
    const venueInput = {
      name: 'Orchid Hall Test',
      location: 'Test Building Level 3',
      capacity: 120,
      facilities: ['AV System', 'Wi-Fi'],
      accessibility: ['Wheelchair access'],
      layouts: ['Classroom', 'Theatre'],
      operatingHours: '08:00–22:00',
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
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      if (pool) {
        if (venueId)
          await pool.query('DELETE FROM venues WHERE id = $1', [venueId]);
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
      venueId = created.body.venue.id as string;
      expect(
        (await pool.query('SELECT id FROM venues WHERE id = $1', [venueId]))
          .rowCount,
      ).toBe(1);
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
