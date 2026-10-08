import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { TURNAROUND_MINUTES } from './event-impact.js';
import { EventPlanningRepository } from './event-planning.repository.js';
import { EventPlanningService } from './event-planning.service.js';

/**
 * SPM-97 / SPM-49 / SPM-85 against real PostgreSQL: proves the repository SQL
 * (neighbour lookup, JSONB per-booking decisions, one-pending-per-field index,
 * transactions) behaves as the mocked unit suite assumes.
 *
 * Uses TEST_DATABASE_URL when set (a dedicated local test database), otherwise
 * DATABASE_URL, which the Backend E2E CI job provides. Locally the suite is
 * skipped when neither is set; in CI a missing database fails the run instead,
 * so a green pipeline can never hide these tests being skipped.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error(
    'SPM-49 planning PostgreSQL tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.',
  );
const MINUTE = 60_000;
const START = '2030-03-10T10:00:00.000Z';
const END = '2030-03-10T13:00:00.000Z';
const at = (base: string, minutes: number) =>
  new Date(Date.parse(base) + minutes * MINUTE).toISOString();

describe.skipIf(!database)(
  'SPM-97/49/85 event planning with PostgreSQL',
  () => {
    let db: pg.Pool;
    let service: EventPlanningService;
    let databaseService: DatabaseService;
    const eventIds: string[] = [];
    let eventId: string;
    let hallA: string;
    let hallB: string;
    const organiser: AuthenticatedUser = {
      uid: `org-${randomUUID()}`,
      roles: ['ORGANISER'],
      name: 'E2E Organiser',
    };
    const coordinator: AuthenticatedUser = {
      uid: `coord-${randomUUID()}`,
      roles: ['COORDINATOR'],
      name: 'E2E Coordinator',
    };

    async function insertEvent(
      overrides: {
        organiserId?: string;
        coordinatorId?: string;
        name?: string;
      } = {},
    ) {
      const id = randomUUID();
      eventIds.push(id);
      await db.query(
        `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'E2E Organiser','org@example.test',$3,'Purpose','Description',$4,$5,80,'Banquet',
               ARRAY['Catering'],ARRAY['Wheelchair ramps'],'Two microphones','Planning',$6,'E2E Coordinator',$7)`,
        [
          id,
          overrides.organiserId ?? organiser.uid,
          overrides.name ?? 'Welcome Evening',
          START,
          END,
          overrides.coordinatorId ?? coordinator.uid,
          randomUUID(),
        ],
      );
      return id;
    }

    // Venues and bookings use SPM-124's schema (venues + venue_bookings).
    let venueOwnerId: string;
    const venueIds: string[] = [];

    async function insertVenue(name: string, capacity: number) {
      const result = await db.query<{ id: string }>(
        `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
           operating_days, operating_start_time, operating_end_time,
           setup_time_minutes, turnaround_time_minutes)
         VALUES ($1,$2,$3,$4,'Open weekdays',ARRAY['Monday'],'08:00','22:00',0,0)
         RETURNING id`,
        [venueOwnerId, name, `E2E ${randomUUID()}`, capacity],
      );
      venueIds.push(result.rows[0].id);
      return result.rows[0].id;
    }

    async function insertBooking(
      event: string,
      venueId: string,
      start: string,
      end: string,
    ) {
      const result = await db.query<{ id: string }>(
        `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status)
       VALUES ($1,$2,$3,$4,'approved') RETURNING id`,
        [event, venueId, start, end],
      );
      return result.rows[0].id;
    }

    beforeAll(async () => {
      // DatabaseService reads DATABASE_URL; point it at the same database as this suite.
      process.env.DATABASE_URL = database;
      db = new pg.Pool({ connectionString: database });
      for (const file of [
        '001_schema.sql',
        '007_spm124_venue_schedule.sql',
        '007_spm49_spm85_spm97_event_planning.sql',
      ])
        await db.query(
          await readFile(
            new URL(
              `../../../database/postgresql/init/${file}`,
              import.meta.url,
            ),
            'utf8',
          ),
        );
      const module = await Test.createTestingModule({
        providers: [
          DatabaseService,
          EventPlanningRepository,
          EventPlanningService,
        ],
      }).compile();
      service = module.get(EventPlanningService);
      const owner = await db.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
         VALUES ($1,'E2E Venue Staff','not-a-real-hash') RETURNING id`,
        [`venue-staff-${randomUUID()}@example.test`],
      );
      venueOwnerId = owner.rows[0].id;
      databaseService = module.get(DatabaseService);
    });

    beforeEach(async () => {
      // A fresh event with two venue bookings; another event sits next to Hall B.
      eventId = await insertEvent();
      const venueA = await insertVenue('Hall A', 200);
      const venueB = await insertVenue('Hall B', 100);
      hallA = await insertBooking(eventId, venueA, START, END);
      hallB = await insertBooking(eventId, venueB, START, END);
      const other = await insertEvent({
        organiserId: 'someone-else',
        coordinatorId: 'someone-else',
        name: 'Chemistry Workshop',
      });
      await insertBooking(
        other,
        venueB,
        at(END, TURNAROUND_MINUTES + 30),
        at(END, 300),
      );
      await db.query(
        `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1,'Projector',2,'Reserved')`,
        [eventId],
      );
    });

    afterAll(async () => {
      // Remove only records created by this suite; child rows cascade.
      if (db) {
        await db.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [
          eventIds,
        ]);
        await db.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [
          venueIds,
        ]);
        if (venueOwnerId)
          await db.query('DELETE FROM users WHERE id = $1', [venueOwnerId]);
        await db.end();
      }
      await databaseService?.onModuleDestroy();
    });

    // SPM-97 AC1/AC2/AC4: the organiser sees live bookings and equipment, read-only.
    it('EVENT-VIEW-02-A organiser sees bookings and equipment from the database, read-only', async () => {
      const view = await service.getPlanningView(organiser, eventId);
      expect(view.readOnly).toBe(true);
      expect(view.venueBookings.map((b) => b.venueName)).toEqual([
        'Hall A',
        'Hall B',
      ]);
      expect(view.equipmentArrangements).toEqual([
        expect.objectContaining({
          name: 'Projector',
          quantity: 2,
          status: 'Reserved',
        }),
      ]);
    });

    // SPM-49 AC3 + SPM-85 AC1/AC2/AC6: direct field applies, booking field is flagged per venue.
    it('EVENT-FLAG-06-A applies the name, flags the end time and finds the Hall B turnaround clash', async () => {
      const result = await service.updateEvent(coordinator, eventId, {
        name: 'Renamed Evening',
        endDateTime: at(END, 60),
      });
      expect(result.applied).toEqual(['name']);
      const stored = await db.query(
        'SELECT event_name, end_date_time FROM events WHERE id = $1',
        [eventId],
      );
      expect(stored.rows[0].event_name).toBe('Renamed Evening');
      expect(stored.rows[0].end_date_time.toISOString()).toBe(END);

      const [change] = result.flagged;
      expect(change).toMatchObject({
        field: 'endDateTime',
        status: 'Needs Review',
      });
      const impacts = (
        change as {
          impacts: Array<{
            bookingId: string;
            impacted: boolean;
            conflicts: Array<{ kind: string }>;
          }>;
        }
      ).impacts;
      // Each hall is assessed on its own: both bookings end at the old end
      // time and must be extended ('window'), but only Hall B also runs into
      // the next event's setup time.
      expect(
        impacts.map((i) => [
          i.bookingId,
          i.impacted,
          i.conflicts.map((c) => c.kind),
        ]),
      ).toEqual([
        [hallA, true, ['window']],
        [hallB, true, ['window', 'turnaround']],
      ]);
    });

    // SPM-49 AC3/AC5: a change that stays compatible with every booking and
    // arrangement is applied immediately even though bookings exist.
    it('EVENT-UPDATE-05-B applies a lower attendance and an earlier end immediately despite existing bookings', async () => {
      const result = await service.updateEvent(coordinator, eventId, {
        // 70 fits both Hall A (200) and Hall B (100).
        expectedAttendance: 70,
        // Ending earlier stays inside both bookings and the equipment period.
        endDateTime: at(END, -30),
      });
      expect([...result.applied].sort()).toEqual([
        'endDateTime',
        'expectedAttendance',
      ]);
      expect(result.flagged).toEqual([]);
      const stored = await db.query(
        'SELECT expected_attendance, end_date_time FROM events WHERE id = $1',
        [eventId],
      );
      expect(stored.rows[0].expected_attendance).toBe(70);
      expect(stored.rows[0].end_date_time.toISOString()).toBe(at(END, -30));
      const pending = await db.query(
        "SELECT count(*)::int AS n FROM event_flagged_changes WHERE event_id = $1 AND status = 'Needs Review'",
        [eventId],
      );
      expect(pending.rows[0].n).toBe(0);
    });

    // SPM-85: the partial unique index allows one pending change per field.
    it('EVENT-FLAG-01-A refuses a second pending change to the same field', async () => {
      await service.updateEvent(coordinator, eventId, {
        expectedAttendance: 150,
      });
      await expect(
        service.updateEvent(coordinator, eventId, { expectedAttendance: 160 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // SPM-85 AC7 + AC3 + AC5: per-booking decisions are stored independently; a reject closes the change.
    it('EVENT-FLAG-07-A records per-booking decisions and closes the change once all are decided', async () => {
      const { flagged } = await service.updateEvent(coordinator, eventId, {
        expectedAttendance: 150,
      });
      const changeId = flagged[0].id;
      // A layout change asks the coordinator to re-check both venues, so both need a decision.
      const partial = await service.updateEvent(coordinator, eventId, {
        layout: 'Theatre',
      });
      expect(partial.flagged).toHaveLength(1);

      const layoutId = partial.flagged[0].id;
      const first = await service.resolveChange(
        coordinator,
        eventId,
        layoutId,
        { decision: 'confirm', bookingId: hallA },
      );
      expect(first.closed).toBe(false);
      const stored = await db.query(
        'SELECT status, impacts FROM event_flagged_changes WHERE id = $1',
        [layoutId],
      );
      expect(stored.rows[0].status).toBe('Needs Review');
      expect(
        stored.rows[0].impacts.map(
          (i: { decision?: string }) => i.decision ?? null,
        ),
      ).toEqual(['Applied', null]);

      const second = await service.resolveChange(
        coordinator,
        eventId,
        layoutId,
        { decision: 'reject', bookingId: hallB },
      );
      expect(second.closed).toBe(true);
      expect(second.event.venueRequirements.layout).toBe('Banquet');

      const confirmed = await service.resolveChange(
        coordinator,
        eventId,
        changeId,
        { decision: 'confirm' },
      );
      expect(confirmed.event.expectedAttendance).toBe(150);

      const history = await service.changeHistory(coordinator, eventId);
      expect(
        history.map((h) => [h.field, h.status, h.resolvedValue, h.resolvedBy]),
      ).toEqual([
        ['expectedAttendance', 'Applied', 150, 'E2E Coordinator'],
        ['layout', 'Rejected', 'Banquet', 'E2E Coordinator'],
      ]);
      const cleared = await db.query(
        'SELECT impacts FROM event_flagged_changes WHERE id = $1',
        [layoutId],
      );
      expect(cleared.rows[0].impacts).toEqual([]);
    });

    // SPM-97 AC3 + AC5: an unavailable venue surfaces as needing a replacement on the next read.
    it('EVENT-VIEW-03-B shows a replacement venue requirement once a booking becomes unavailable', async () => {
      await db.query(
        // SPM-124 'rejected' = the venue was lost, so a replacement is needed.
        `UPDATE venue_bookings SET status = 'rejected' WHERE id = $1`,
        [hallA],
      );
      const view = await service.getPlanningView(organiser, eventId);
      expect(view.pendingChanges).toEqual([
        expect.objectContaining({
          kind: 'replacement_venue_required',
          bookingId: hallA,
          venueName: 'Hall A',
        }),
      ]);
    });

    // SPM-85 AC4: two simultaneous confirms apply and record the decision once; the loser is refused.
    it('EVENT-FLAG-04-SEC-2 applies and records a simultaneous double confirm exactly once', async () => {
      const { flagged } = await service.updateEvent(coordinator, eventId, {
        expectedAttendance: 150,
      });
      const outcomes = await Promise.allSettled([
        service.resolveChange(coordinator, eventId, flagged[0].id, {
          decision: 'confirm',
        }),
        service.resolveChange(coordinator, eventId, flagged[0].id, {
          decision: 'confirm',
        }),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      const refused = outcomes.find(
        (o): o is PromiseRejectedResult => o.status === 'rejected',
      );
      expect(refused?.reason).toBeInstanceOf(ConflictException);

      const stored = await db.query(
        'SELECT expected_attendance FROM events WHERE id = $1',
        [eventId],
      );
      expect(stored.rows[0].expected_attendance).toBe(150);
      const history = await service.changeHistory(coordinator, eventId);
      expect(history.map((h) => [h.field, h.status])).toEqual([
        ['expectedAttendance', 'Applied'],
      ]);
    });

    // SPM-97 AC1/AC4: a Confirmed event is still viewable, but read-only for everyone.
    it('EVENT-VIEW-01-C shows a Confirmed event read-only and refuses edits', async () => {
      await db.query(`UPDATE events SET status = 'Confirmed' WHERE id = $1`, [
        eventId,
      ]);
      for (const user of [organiser, coordinator]) {
        const view = await service.getPlanningView(user, eventId);
        expect(view.readOnly).toBe(true);
        expect(view.editableFields).toEqual([]);
      }
      await expect(
        service.updateEvent(coordinator, eventId, { name: 'Too late' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // SPM-97 AC3: the organiser learns a change is pending, never which other events caused the clash.
    it('EVENT-VIEW-03-A keeps other events out of what the organiser reads', async () => {
      const { flagged } = await service.updateEvent(coordinator, eventId, {
        endDateTime: at(END, 60),
      });
      // The coordinator sees the clash with the neighbouring event...
      expect(JSON.stringify(flagged[0])).toContain('Chemistry Workshop');
      // ...the organiser sees only that a change is pending.
      const view = await service.getPlanningView(organiser, eventId);
      expect(view.pendingChanges).toEqual([
        expect.objectContaining({
          field: 'endDateTime',
          status: 'Needs Review',
        }),
      ]);
      expect(JSON.stringify(view)).not.toContain('Chemistry Workshop');
    });

    // SPM-85 AC1: bookings that were cancelled or released hold nothing, so changes apply directly.
    it('EVENT-FLAG-01-D applies changes directly once every booking is cancelled or released', async () => {
      await db.query(
        // An expired SPM-124 pending hold no longer holds the venue.
        `UPDATE venue_bookings SET status = 'pending', hold_expires_at = now() - interval '1 hour' WHERE event_id = $1`,
        [eventId],
      );
      await db.query(
        `UPDATE equipment_reservations SET status = 'Released' WHERE event_id = $1`,
        [eventId],
      );
      const result = await service.updateEvent(coordinator, eventId, {
        expectedAttendance: 150,
      });
      expect(result.applied).toEqual(['expectedAttendance']);
      expect(result.flagged).toEqual([]);
      const stored = await db.query(
        'SELECT expected_attendance FROM events WHERE id = $1',
        [eventId],
      );
      expect(stored.rows[0].expected_attendance).toBe(150);
    });

    // SPM-85 AC4: a date move is confirmed in an order that never leaves the end before the start.
    it('EVENT-FLAG-04-B refuses a start that would pass the stored end until the end has moved', async () => {
      const nextStart = at(START, 24 * 60);
      const nextEnd = at(END, 24 * 60);
      const { flagged } = await service.updateEvent(coordinator, eventId, {
        startDateTime: nextStart,
        endDateTime: nextEnd,
      });
      const byField = Object.fromEntries(flagged.map((c) => [c.field, c.id]));

      await expect(
        service.resolveChange(coordinator, eventId, byField.startDateTime, {
          decision: 'confirm',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      // The refusal left everything as it was and the change still awaits review.
      const pending = await db.query(
        `SELECT field FROM event_flagged_changes WHERE event_id = $1 AND status = 'Needs Review' ORDER BY field`,
        [eventId],
      );
      expect(pending.rows.map((r) => r.field)).toEqual([
        'endDateTime',
        'startDateTime',
      ]);

      await service.resolveChange(coordinator, eventId, byField.endDateTime, {
        decision: 'confirm',
      });
      await service.resolveChange(coordinator, eventId, byField.startDateTime, {
        decision: 'confirm',
      });
      const stored = await db.query(
        'SELECT start_date_time, end_date_time FROM events WHERE id = $1',
        [eventId],
      );
      expect(stored.rows[0].start_date_time.toISOString()).toBe(nextStart);
      expect(stored.rows[0].end_date_time.toISOString()).toBe(nextEnd);
    });

    // SPM-85 AC5: the owning organiser can read the history; another organiser cannot.
    it('EVENT-FLAG-05-B lets the owning organiser read the history but not another organiser', async () => {
      const { flagged } = await service.updateEvent(coordinator, eventId, {
        expectedAttendance: 150,
      });
      await service.resolveChange(coordinator, eventId, flagged[0].id, {
        decision: 'reject',
      });
      const history = await service.changeHistory(organiser, eventId);
      expect(history.map((h) => [h.field, h.status, h.resolvedValue])).toEqual([
        ['expectedAttendance', 'Rejected', 80],
      ]);
      await expect(
        service.changeHistory(
          { uid: 'someone-else', roles: ['ORGANISER'] },
          eventId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  },
);
