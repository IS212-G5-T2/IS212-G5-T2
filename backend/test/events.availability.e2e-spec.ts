/*
 * PostgreSQL integration evidence for SPM-99 availability. The calculation
 * lives in the EventsService query, so this suite deliberately uses a real
 * database rather than checking SQL text in the unit suite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { AuthenticatedUser } from '../src/auth/models/auth.models.js';
import { EventsService } from '../src/events/events.service.js';

const database = process.env.DATABASE_URL;

describe.skipIf(!database)('SPM-99 attendee availability (PostgreSQL)', () => {
  let pool: pg.Pool;
  let service: EventsService;
  const eventIds: string[] = [];
  const userIds: string[] = [];

  const attendee: AuthenticatedUser = {
    uid: 'availability-attendee',
    roles: ['ATTENDEE'],
    email: 'availability-attendee@example.test',
    name: 'Availability Attendee',
  };

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
    service = new EventsService({
      query: <T extends pg.QueryResultRow>(text: string, values?: unknown[]) =>
        pool.query<T>(text, values),
    } as never);
  });

  afterAll(async () => {
    if (eventIds.length) {
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    }
    if (userIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    }
    await pool.end();
  });

  async function createUser(): Promise<string> {
    const id = randomUUID();
    userIds.push(id);
    await pool.query(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1, $2, 'Availability fixture', 'not-used-by-this-test')`,
      [id, `availability-${id}@example.test`],
    );
    return id;
  }

  async function addRegistration(eventId: string, status: 'Registered' | 'Withdrawn') {
    await pool.query(
      `INSERT INTO event_registrations (id, event_id, attendee_id, status)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), eventId, await createUser(), status],
    );
  }

  async function availabilityFor(eventId: string): Promise<number | undefined> {
    const events = await service.list(attendee);
    return events.find((event) => event.id === eventId)?.availableRegistrationSpots;
  }

  // EVENT-VIEW-03-A/B/C: verify the real PostgreSQL calculation, not its SQL
  // formatting. The registration limit is 3 while venue capacity is 120.
  it('uses registered attendees and clamps availability at zero', async () => {
    const eventId = randomUUID();
    eventIds.push(eventId);
    await pool.query(
      `INSERT INTO events (
         id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         description, start_date_time, end_date_time, expected_attendance,
         registration_limit, status, submission_key
       ) VALUES (
         $1, 'availability-organiser', 'Availability Organiser',
         'availability-organiser@example.test', 'Availability Event', 'Testing', '',
         now() + interval '1 day', now() + interval '1 day 1 hour', 120, 3,
         'Confirmed', $1
       )`,
      [eventId],
    );

    await addRegistration(eventId, 'Registered');
    await addRegistration(eventId, 'Registered');
    await addRegistration(eventId, 'Withdrawn');
    expect(await availabilityFor(eventId)).toBe(1);

    await addRegistration(eventId, 'Registered');
    expect(await availabilityFor(eventId)).toBe(0);

    await addRegistration(eventId, 'Registered');
    expect(await availabilityFor(eventId)).toBe(0);
  });
});
