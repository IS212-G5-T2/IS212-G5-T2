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
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [
        eventIds,
      ]);
    }
    if (userIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        userIds,
      ]);
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

  async function addRegistration(
    eventId: string,
    status: 'Registered' | 'Withdrawn',
  ) {
    await pool.query(
      `INSERT INTO event_registrations (id, event_id, attendee_id, status)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), eventId, await createUser(), status],
    );
  }

  async function availabilityFor(eventId: string): Promise<number | undefined> {
    const events = await service.list(attendee);
    return events.find((event) => event.id === eventId)
      ?.availableRegistrationSpots;
  }

  async function createEvent(registrationLimit: number): Promise<string> {
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
         now() + interval '1 day', now() + interval '1 day 1 hour', 120, $2,
         'Confirmed', $1
       )`,
      [eventId, registrationLimit],
    );
    return eventId;
  }

  // EVENT-VIEW-02-A: no active registrations leaves the full limit available.
  it('shows every configured spot when no one is registered', async () => {
    const eventId = await createEvent(45);

    expect(await availabilityFor(eventId)).toBe(45);
  });

  // EVENT-VIEW-02-B: Withdrawn registrations do not consume capacity.
  it('subtracts only Registered rows from the configured limit', async () => {
    const eventId = await createEvent(45);

    await addRegistration(eventId, 'Registered');
    await addRegistration(eventId, 'Registered');
    await addRegistration(eventId, 'Withdrawn');
    expect(await availabilityFor(eventId)).toBe(43);
  });

  // EVENT-VIEW-02-C: one remaining spot must still be available.
  it('shows one spot when two of three places are registered', async () => {
    const eventId = await createEvent(3);

    await addRegistration(eventId, 'Registered');
    await addRegistration(eventId, 'Registered');
    expect(await availabilityFor(eventId)).toBe(1);
  });

  // EVENT-VIEW-02-D: a full event reports zero, including overbooked data.
  it('clamps availability at zero when the limit is consumed', async () => {
    const eventId = await createEvent(3);

    await addRegistration(eventId, 'Registered');
    await addRegistration(eventId, 'Registered');
    await addRegistration(eventId, 'Registered');
    expect(await availabilityFor(eventId)).toBe(0);

    await addRegistration(eventId, 'Registered');
    expect(await availabilityFor(eventId)).toBe(0);
  });
});
