import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  CURRENT_USER_REQUEST_KEY,
  type AuthenticatedUser,
} from '../src/auth/types/auth.models.js';
import { DatabaseService } from '../src/database/database.service.js';
import { EventPlanningController } from '../src/events/planning/event-planning.controller.js';
import { TURNAROUND_MINUTES } from '../src/events/planning/helpers/event-impact.js';
import { EventPlanningRepository } from '../src/events/planning/event-planning.repository.js';
import { EventPlanningService } from '../src/events/planning/event-planning.service.js';

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
    let app: INestApplication;
    let service: EventPlanningService;
    let repository: EventPlanningRepository;
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
           setup_time_minutes, turnaround_time_minutes)
         VALUES ($1,$2,$3,$4,'Open weekdays',0,0)
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
      status: 'pending' | 'approved' = 'approved',
      holdExpiresAt: string | null = null,
    ) {
      const result = await db.query<{ id: string }>(
        `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [event, venueId, start, end, status, holdExpiresAt],
      );
      return result.rows[0].id;
    }

    async function insertBlockout(venueId: string, start: string, end: string) {
      await db.query(
        `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason)
         VALUES ($1,$2,$3,'blocked','Maintenance')`,
        [venueId, start, end],
      );
    }

    beforeAll(async () => {
      // DatabaseService reads DATABASE_URL; point it at the same database as this suite.
      process.env.DATABASE_URL = database;
      db = new pg.Pool({ connectionString: database });
      for (const file of [
        '001_schema.sql',
        // SPM-156: direct updates are recorded in event_flagged_changes.
        '026_spm156_direct_update_history.sql',
      ]) {
        const schemaPath = process.env.SPM51_DATABASE_INIT_DIR
          ? join(process.env.SPM51_DATABASE_INIT_DIR, file)
          : new URL(`../../database/postgresql/init/${file}`, import.meta.url);
        await db.query(await readFile(schemaPath, 'utf8'));
      }
      const module = await Test.createTestingModule({
        controllers: [EventPlanningController],
        providers: [
          DatabaseService,
          EventPlanningRepository,
          EventPlanningService,
        ],
      }).compile();
      app = module.createNestApplication();
      app.use((req: Request, _res: Response, next: NextFunction) => {
        req[CURRENT_USER_REQUEST_KEY] = organiser;
        next();
      });
      await app.init();
      service = module.get(EventPlanningService);
      repository = module.get(EventPlanningRepository);
      const owner = await db.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
         VALUES ($1,'E2E Venue Staff','not-a-real-hash') RETURNING id`,
        [`venue-staff-${randomUUID()}@example.test`],
      );
      venueOwnerId = owner.rows[0].id;
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
      }
      await app?.close();
      await db?.end();
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

    // VEN-BKG-11-VAR-1: the planning HTTP projection applies both venue buffers while preserving event and booking history.
    it('VEN-BKG-11-VAR-1 projects setup and turnaround blockouts but ignores non-overlapping blockouts through the planning HTTP endpoint', async () => {
      const venueId = (
        await db.query<{ venue_id: string }>(
          'SELECT venue_id FROM venue_bookings WHERE id = $1',
          [hallA],
        )
      ).rows[0].venue_id;
      await db.query(
        'UPDATE venues SET setup_time_minutes = 30, turnaround_time_minutes = 45 WHERE id = $1',
        [venueId],
      );
      // The blockout ends before the event starts, but intersects its 30-minute setup window.
      await insertBlockout(venueId, at(START, -29), at(START, -20));

      const turnaroundVenueId = (
        await db.query<{ venue_id: string }>(
          'SELECT venue_id FROM venue_bookings WHERE id = $1',
          [hallB],
        )
      ).rows[0].venue_id;
      await db.query(
        'UPDATE venues SET setup_time_minutes = 30, turnaround_time_minutes = 45 WHERE id = $1',
        [turnaroundVenueId],
      );
      await insertBlockout(turnaroundVenueId, at(END, 20), at(END, 30));

      const nonOverlappingVenueId = await insertVenue('Hall C', 60);
      const nonOverlappingBooking = await insertBooking(
        eventId,
        nonOverlappingVenueId,
        START,
        END,
      );
      await db.query(
        'UPDATE venues SET setup_time_minutes = 30, turnaround_time_minutes = 45 WHERE id = $1',
        [nonOverlappingVenueId],
      );
      await insertBlockout(nonOverlappingVenueId, at(END, 46), at(END, 55));

      const response = await request(app.getHttpServer())
        .get(`/api/events/${eventId}/planning`)
        .expect(200);
      expect(response.body.venueBookings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: hallA,
            status: 'Unavailable',
            requestStatus: 'approved',
            capacity: 200,
          }),
          expect.objectContaining({
            id: hallB,
            status: 'Unavailable',
            requestStatus: 'approved',
          }),
          expect.objectContaining({
            id: nonOverlappingBooking,
            status: 'Booked',
            requestStatus: 'approved',
          }),
        ]),
      );
      const retained = await db.query(
        `SELECT e.status AS event_status, b.status AS booking_status
           FROM events e JOIN venue_bookings b ON b.event_id = e.id
          WHERE e.id = $1 AND b.id = $2`,
        [eventId, hallA],
      );
      expect(retained.rows[0]).toEqual({
        event_status: 'Planning',
        booking_status: 'approved',
      });
      const turnaroundHistory = await db.query(
        'SELECT status FROM venue_bookings WHERE id = $1',
        [hallB],
      );
      expect(turnaroundHistory.rows[0].status).toBe('approved');
    });

    /** VEN-BKG-11-VAR-1: a blockout ending exactly at the setup-buffer start leaves the confirmed booking Booked. Kills: SPM54-BE-AC11-BLOCKOUT-SETUP-INCLUSIVE. */
    it('VEN-BKG-11-VAR-1 keeps a booking Booked when a blockout ends at the setup-buffer boundary', async () => {
      const venueId = (
        await db.query<{ venue_id: string }>(
          'SELECT venue_id FROM venue_bookings WHERE id = $1',
          [hallA],
        )
      ).rows[0].venue_id;
      await db.query(
        'UPDATE venues SET setup_time_minutes = 30, turnaround_time_minutes = 45 WHERE id = $1',
        [venueId],
      );
      await insertBlockout(venueId, at(START, -40), at(START, -30));

      const response = await request(app.getHttpServer())
        .get(`/api/events/${eventId}/planning`)
        .expect(200);
      expect(response.body.venueBookings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: hallA, status: 'Booked' }),
        ]),
      );
    });

    /** VEN-BKG-11-VAR-1: a blockout starting exactly at the turnaround-buffer end leaves the confirmed booking Booked. Kills: SPM54-BE-AC11-BLOCKOUT-TURNAROUND-INCLUSIVE. */
    it('VEN-BKG-11-VAR-1 keeps a booking Booked when a blockout starts at the turnaround-buffer boundary', async () => {
      const venueId = (
        await db.query<{ venue_id: string }>(
          'SELECT venue_id FROM venue_bookings WHERE id = $1',
          [hallA],
        )
      ).rows[0].venue_id;
      await db.query(
        'UPDATE venues SET setup_time_minutes = 30, turnaround_time_minutes = 45 WHERE id = $1',
        [venueId],
      );
      await insertBlockout(venueId, at(END, 45), at(END, 55));

      const response = await request(app.getHttpServer())
        .get(`/api/events/${eventId}/planning`)
        .expect(200);
      expect(response.body.venueBookings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: hallA, status: 'Booked' }),
        ]),
      );
    });

    /** SPM-51 AC10: only pending rows with a future hold expiry are Booked; expired and unbounded requests are Cancelled. Kills: B13, B14. */
    it('maps pending venue rows by explicit hold expiry and preserves approved bookings', async () => {
      const venueId = (
        await db.query<{ venue_id: string }>(
          'SELECT venue_id FROM venue_bookings WHERE id = $1',
          [hallA],
        )
      ).rows[0].venue_id;
      const unboundedRequest = await insertBooking(
        eventId,
        venueId,
        at(START, 360),
        at(END, 360),
        'pending',
      );
      const expiredHold = await insertBooking(
        eventId,
        venueId,
        at(START, 720),
        at(END, 720),
        'pending',
        null,
      );
      await db.query(
        "UPDATE venue_bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1",
        [expiredHold],
      );
      const activeHold = await insertBooking(
        eventId,
        venueId,
        at(START, 1080),
        at(END, 1080),
        'pending',
        null,
      );
      await db.query(
        "UPDATE venue_bookings SET hold_expires_at = now() + interval '60 minutes' WHERE id = $1",
        [activeHold],
      );
      const exactExpiryHold = await insertBooking(
        eventId,
        venueId,
        at(START, 1440),
        at(END, 1440),
        'pending',
        null,
      );
      // PostgreSQL now() is deliberately used here: the repository under test
      // compares expiry with PostgreSQL's now() in the same statement. Setting
      // both through one DB clock proves the exact-expiry boundary without a
      // wall-clock race between JavaScript and PostgreSQL.
      await db.query(
        'UPDATE venue_bookings SET hold_expires_at = now() WHERE id = $1',
        [exactExpiryHold],
      );

      const bookings = await repository.listVenueBookings(eventId);
      const byId = new Map(
        bookings.map((booking) => [booking.id, booking.status]),
      );

      expect(byId.get(unboundedRequest)).toBe('Cancelled');
      expect(byId.get(expiredHold)).toBe('Cancelled');
      expect(byId.get(exactExpiryHold)).toBe('Cancelled');
      expect(byId.get(activeHold)).toBe('Booked');
      expect(byId.get(hallA)).toBe('Booked');
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
      // SPM-94 D6: a non-owning organiser is refused with 403 (no data), not 404.
      await expect(
        service.changeHistory(
          { uid: 'someone-else', roles: ['ORGANISER'] },
          eventId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // SPM-156 EVENT-UPDATE-07-A: on an Approved event (nothing booked yet) every
    // update applies immediately and is stored as an Applied history row.
    it('EVENT-UPDATE-07-A records an update on an Approved event in change history', async () => {
      const approved = await insertEvent({ name: 'Approved Evening' });
      await db.query("UPDATE events SET status = 'Approved' WHERE id = $1", [
        approved,
      ]);
      const result = await service.updateEvent(coordinator, approved, {
        name: 'Approved Night',
        accessibility: ['Hearing loop'],
        expectedAttendance: 90,
      });
      expect(result.flagged).toEqual([]);

      const rows = await db.query(
        `SELECT kind, field, original_value, proposed_value, status, proposed_by_id,
                resolved_by, resolved_by_id, resolved_at, impacts
           FROM event_flagged_changes WHERE event_id = $1 ORDER BY field`,
        [approved],
      );
      expect(rows.rows).toHaveLength(3);
      for (const row of rows.rows)
        expect(row).toMatchObject({
          kind: 'direct_update',
          status: 'Applied',
          proposed_by_id: coordinator.uid,
          resolved_by: 'E2E Coordinator',
          resolved_by_id: coordinator.uid,
          impacts: [],
        });
      // History and "Last updated" (SPM-49 AC6) carry the same instant.
      expect(rows.rows[0].resolved_at.toISOString()).toBe(result.updatedAt);

      // Both the assigned coordinator and the owning organiser can read it.
      for (const viewer of [coordinator, organiser]) {
        const history = await service.changeHistory(viewer, approved);
        expect(
          history
            .map((h) => [h.kind, h.field, h.originalValue, h.resolvedValue])
            .sort(),
        ).toEqual(
          [
            [
              'direct_update',
              'accessibility',
              ['Wheelchair ramps'],
              ['Hearing loop'],
            ],
            ['direct_update', 'expectedAttendance', 80, 90],
            ['direct_update', 'name', 'Approved Evening', 'Approved Night'],
          ].sort(),
        );
      }
      const view = await service.getPlanningView(coordinator, approved);
      expect(view.lastUpdatedAt).toBe(result.updatedAt);
    });

    // SPM-156 EVENT-UPDATE-07-B: on a Planning event with bookings, the
    // compatible change is recorded directly and the flagged one only once
    // it is resolved.
    it('EVENT-UPDATE-07-B records direct and reviewed changes on a Planning event', async () => {
      const { flagged } = await service.updateEvent(coordinator, eventId, {
        description: 'New description',
        expectedAttendance: 150,
      });
      let history = await service.changeHistory(coordinator, eventId);
      expect(history.map((h) => [h.kind, h.field, h.status])).toEqual([
        ['direct_update', 'description', 'Applied'],
      ]);
      await service.resolveChange(coordinator, eventId, flagged[0].id, {
        decision: 'confirm',
      });
      history = await service.changeHistory(coordinator, eventId);
      expect(history.map((h) => [h.kind, h.field, h.status])).toEqual([
        ['booking_conflict', 'expectedAttendance', 'Applied'],
        ['direct_update', 'description', 'Applied'],
      ]);
    });

    // SPM-156: the database refuses a direct update or change request that is
    // not Applied, and a flagged change to a field that can never affect a booking.
    it('EVENT-UPDATE-07-SEC-1 rejects malformed history rows in the database', async () => {
      const insert = (kind: string, field: string, status: string) =>
        db.query(
          `INSERT INTO event_flagged_changes
             (id, event_id, kind, field, original_value, proposed_value, status, proposed_by, proposed_by_id)
           VALUES ($1,$2,$3,$4,'1'::jsonb,'2'::jsonb,$5,'X','x')`,
          [randomUUID(), eventId, kind, field, status],
        );
      await expect(
        insert('direct_update', 'name', 'Needs Review'),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        insert('booking_conflict', 'name', 'Needs Review'),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        insert('change_request', 'name', 'Needs Review'),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        insert('other', 'name', 'Needs Review'),
      ).rejects.toMatchObject({ code: '23514' });
    });

    /**
     * EVENT-UPDATE-07-A (SPM-156): the direct-update history write runs in the
     * same transaction as the event update. When the history insert fails, the
     * event row and its "Last updated" time stay as they were and nothing is recorded.
     */
    it('EVENT-UPDATE-07-A rolls the event update back when the history insert fails', async () => {
      const approved = await insertEvent({ name: 'Rollback Evening' });
      await db.query("UPDATE events SET status = 'Approved' WHERE id = $1", [
        approved,
      ]);
      const before = await db.query(
        'SELECT event_name, updated_at FROM events WHERE id = $1',
        [approved],
      );
      // A trigger that refuses history rows for this event only (the real write path fails).
      const fn = `spm156_refuse_${approved.replace(/-/g, '')}`;
      await db.query(
        `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
           BEGIN
             IF NEW.event_id = '${approved}'::uuid THEN
               RAISE EXCEPTION 'history insert refused';
             END IF;
             RETURN NEW;
           END $$`,
      );
      await db.query(
        `CREATE TRIGGER ${fn} BEFORE INSERT ON event_flagged_changes
           FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
      );
      try {
        await expect(
          service.updateEvent(coordinator, approved, {
            name: 'Rollback Night',
          }),
        ).rejects.toThrow('history insert refused');
      } finally {
        await db.query(`DROP TRIGGER ${fn} ON event_flagged_changes`);
        await db.query(`DROP FUNCTION ${fn}()`);
      }
      const after = await db.query(
        'SELECT event_name, updated_at FROM events WHERE id = $1',
        [approved],
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
      expect(after.rows[0].event_name).toBe('Rollback Evening');
      const history = await db.query(
        'SELECT count(*)::int AS n FROM event_flagged_changes WHERE event_id = $1',
        [approved],
      );
      expect(history.rows[0].n).toBe(0);
    });

    /**
     * EVENT-UPDATE-07-A (SPM-156): entries saved by one update share their time and are
     * listed by field name. The rows are inserted in editable-field order (name before
     * description), so only the field tie-break gives description first.
     */
    it('EVENT-UPDATE-07-A lists entries saved by one update in a stable field order', async () => {
      const approved = await insertEvent({ name: 'Order Evening' });
      await db.query("UPDATE events SET status = 'Approved' WHERE id = $1", [
        approved,
      ]);
      await service.updateEvent(coordinator, approved, {
        name: 'Order Night',
        description: 'Order description',
      });
      const history = await service.changeHistory(coordinator, approved);
      expect(history.map((h) => h.field)).toEqual(['description', 'name']);
    });
  },
);
