import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.CI)
  throw new Error('SPM-54 migration upgrade test requires DATABASE_URL.');

describe.skipIf(!databaseUrl)('SPM-54 venue booking request migration upgrade', () => {
  const schema = `spm54_upgrade_${randomUUID().replaceAll('-', '')}`;
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let eventId: string;
  let venueId: string;
  let bookingIds: string[];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query(`CREATE SCHEMA ${schema}`);
    client = await pool.connect();
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query(`
      CREATE TABLE events (id uuid PRIMARY KEY);
      CREATE TABLE venues (id uuid PRIMARY KEY);
      CREATE TABLE venue_bookings (
        id uuid PRIMARY KEY,
        event_id uuid REFERENCES events(id),
        venue_id uuid NOT NULL REFERENCES venues(id),
        start_at timestamptz NOT NULL,
        end_at timestamptz NOT NULL,
        status text NOT NULL,
        reason text,
        hold_expires_at timestamptz,
        special_requests text,
        created_at timestamptz NOT NULL,
        CONSTRAINT venue_bookings_special_requests_check
          CHECK (special_requests IS NULL OR length(special_requests) <= 2000),
        CONSTRAINT venue_bookings_kind_check CHECK (
          (status = 'blocked' AND event_id IS NULL
            AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500
            AND hold_expires_at IS NULL AND special_requests IS NULL)
          OR (status IN ('pending', 'approved', 'rejected', 'cancelled')
            AND event_id IS NOT NULL AND reason IS NULL)
        )
      );
    `);
    eventId = randomUUID();
    venueId = randomUUID();
    bookingIds = [randomUUID(), randomUUID()];
    await client.query('INSERT INTO events (id) VALUES ($1)', [eventId]);
    await client.query('INSERT INTO venues (id) VALUES ($1)', [venueId]);
    await client.query(
      `INSERT INTO venue_bookings
         (id, event_id, venue_id, start_at, end_at, status, created_at, special_requests)
       VALUES
         ($1, $3, $4, '2030-01-12T04:00:00Z', '2030-01-12T05:00:00Z', 'pending', '2030-01-01T00:00:00Z', 'First legacy note'),
         ($2, $3, $4, '2030-01-12T04:00:00Z', '2030-01-12T05:00:00Z', 'cancelled', '2030-01-02T00:00:00Z', 'Second legacy note')`,
      [bookingIds[0], bookingIds[1], eventId, venueId],
    );

    await client.query(
      await readFile(
        new URL('../migrations/012_spm54_event_venue_request_key.sql', import.meta.url),
        'utf8',
      ),
    );
  });

  afterAll(async () => {
    if (client) {
      client.release();
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
    await pool?.end();
  });

  /** SPM-54 data model: migration preserves every legacy booking and deterministically combines notes into the composite request. */
  it('preserves legacy booking history and combines notes in creation order', async () => {
    const requests = await client.query(
      'SELECT event_id, venue_id, special_request FROM venue_booking_requests',
    );
    expect(requests.rows).toEqual([{
      event_id: eventId,
      venue_id: venueId,
      special_request: 'First legacy note\n\nSecond legacy note',
    }]);

    const bookings = await client.query(
      'SELECT id, status FROM venue_bookings ORDER BY created_at, id',
    );
    expect(bookings.rows).toEqual([
      { id: bookingIds[0], status: 'pending' },
      { id: bookingIds[1], status: 'cancelled' },
    ]);
  });
});
