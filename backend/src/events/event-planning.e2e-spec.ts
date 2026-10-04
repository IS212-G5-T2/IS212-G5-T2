import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
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
 * transactions) behaves as the mocked unit suite assumes. Run with
 * TEST_DATABASE_URL and `npm run test:e2e`; skipped otherwise.
 */

const database = process.env.TEST_DATABASE_URL;
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

    async function insertBooking(
      event: string,
      venueId: string,
      venueName: string,
      start: string,
      end: string,
      capacity = 200,
    ) {
      const result = await db.query<{ id: string }>(
        `INSERT INTO venue_bookings (event_id, venue_id, venue_name, venue_capacity, start_date_time, end_date_time)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [event, venueId, venueName, capacity, start, end],
      );
      return result.rows[0].id;
    }

    beforeAll(async () => {
      // Use only the explicitly configured test database, never the application URL by default.
      process.env.DATABASE_URL = database;
      db = new pg.Pool({ connectionString: database });
      for (const file of [
        '001_schema.sql',
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
      databaseService = module.get(DatabaseService);
    });

    beforeEach(async () => {
      // A fresh event with two venue bookings; another event sits next to Hall B.
      eventId = await insertEvent();
      const venueA = `venue-a-${randomUUID()}`;
      const venueB = `venue-b-${randomUUID()}`;
      hallA = await insertBooking(eventId, venueA, 'Hall A', START, END);
      hallB = await insertBooking(eventId, venueB, 'Hall B', START, END, 100);
      const other = await insertEvent({
        organiserId: 'someone-else',
        coordinatorId: 'someone-else',
        name: 'Chemistry Workshop',
      });
      await insertBooking(
        other,
        venueB,
        'Hall B',
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
      expect(impacts.map((i) => [i.bookingId, i.impacted])).toEqual([
        [hallA, false],
        [hallB, true],
      ]);
      expect(impacts[1].conflicts.map((c) => c.kind)).toEqual(['turnaround']);
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
        `UPDATE venue_bookings SET status = 'Unavailable' WHERE id = $1`,
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
  },
);
