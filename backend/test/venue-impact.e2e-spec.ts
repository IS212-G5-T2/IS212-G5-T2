import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

/*
 * SPM-125 Manage Venue Unavailability Impact, History and Notifications: integration cases through the real API and
 * PostgreSQL. Users are the seeded accounts in the test database and sign in through the real login route
 * (/api/auth/login); the server clock is fixed at 10 Jan 2030, 8:00 pm Singapore time. Needs DATABASE_URL with
 * database/postgresql/init 001 to 030 applied.
 */

const databaseUrl = process.env.DATABASE_URL;
const password = 'P@55w0rd';
const fixedNow = new Date('2030-01-10T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

describe.skipIf(!databaseUrl)(
  'SPM-125 venue unavailability impact, history and notifications',
  () => {
    let app: INestApplication;
    let pool: pg.Pool;
    const run = randomUUID().slice(0, 8);
    const venueName = `Impact Hall ${run}`;
    const eventIds: string[] = [];
    let venueId = '';
    const users: Record<string, string> = {};
    const agents: Record<string, ReturnType<typeof request.agent>> = {};
    const bookings: Record<string, string> = {};
    const venueBody = {
      name: venueName,
      location: `Impact Block ${run}`,
      capacity: 120,
      facilities: ['Wi-Fi'],
      accessibility: [],
      layouts: ['Theatre'],
      operatingInformation: 'Weekdays',
      setupTimeMinutes: 30,
      turnaroundTimeMinutes: 45,
    };
    // The first unavailable period: 12 Jan 2030, 11:00 am to 3:00 pm Singapore time.
    const period = {
      start: '2030-01-12T03:00:00.000Z',
      end: '2030-01-12T07:00:00.000Z',
      reason: 'Electrical safety inspection',
    };

    async function signIn(key: string, email: string) {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email, password }).expect(201);
      agents[key] = agent;
      const row = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [email],
      );
      users[key] = row.rows[0].id;
    }

    /** An event assigned to a Coordinator (or none), in the given status and time. */
    async function createEvent(
      name: string,
      coordinator: string | null,
      start: string,
      end: string,
      status = 'Planning',
    ) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO events
         (id, organiser_id, organiser_name, organiser_email, event_name, purpose, start_date_time, end_date_time,
          expected_attendance, coordinator_id, coordinator_name, submission_key, status)
       VALUES (gen_random_uuid(), 'spm-125-owner', 'SPM-125 Owner', 'spm-125-owner@example.test', $1, 'SPM-125 fixture',
               $2, $3, 10, $4, $5, gen_random_uuid(), $6)
       RETURNING id`,
        [
          `${name} ${run}`,
          at(start),
          at(end),
          coordinator,
          coordinator ? 'Coordinator' : null,
          status,
        ],
      );
      eventIds.push(result.rows[0].id);
      return result.rows[0].id;
    }

    /** A booking row for an event, as earlier stories store it. */
    async function insertBooking(
      key: string,
      eventId: string,
      start: string,
      end: string,
      status: string,
      extra: {
        requestKind?: string;
        holdExpiresAt?: string;
        linkRequest?: boolean;
      } = {},
    ) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          venueId,
          eventId,
          at(start),
          at(end),
          status,
          extra.requestKind ?? 'booking',
          extra.holdExpiresAt ? at(extra.holdExpiresAt) : null,
        ],
      );
      if (extra.linkRequest)
        await pool.query(
          'INSERT INTO venue_booking_requests (event_id, venue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [eventId, venueId],
        );
      bookings[key] = result.rows[0].id;
      return result.rows[0].id;
    }

    /** The caller's notifications about this suite's bookings (other suites share the database). */
    async function venueNotices(key: string) {
      const response = await agents[key].get('/api/notifications').expect(200);
      const ours = new Set(Object.values(bookings));
      return (response.body as Array<Record<string, unknown>>).filter((n) =>
        ours.has(n.relatedBookingId as string),
      );
    }

    /** How many notifications are stored for a user (Venue Staff must never receive one for their own change). */
    async function storedNoticeCount(key: string) {
      const result = await pool.query<{ count: string }>(
        'SELECT count(*) FROM notifications WHERE recipient_id = $1',
        [users[key]],
      );
      return Number(result.rows[0].count);
    }

    async function bookingSnapshot() {
      const rows = await pool.query(
        `SELECT id, event_id, status, start_at, end_at, request_kind, hold_expires_at FROM venue_bookings
        WHERE venue_id = $1 AND status <> 'blocked' ORDER BY id`,
        [venueId],
      );
      return rows.rows;
    }

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: databaseUrl });
      // Other suites re-apply older venue migrations that narrow the booking statuses; restore the SPM-54 statuses
      // (init 019) and make sure the SPM-137 booking link (init 029) and the SPM-125 schema (init 030) are present. All
      // three files are idempotent.
      for (const file of [
        '019_spm54_venue_booking_lifecycle.sql',
        '029_spm137_booking_decision_notification.sql',
        '030_spm125_venue_unavailability_history.sql',
      ])
        await pool.query(
          await readFile(
            new URL(`../../database/postgresql/init/${file}`, import.meta.url),
            'utf8',
          ),
        );
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(CLOCK)
        .useValue({ now: () => fixedNow })
        .compile();
      app = moduleFixture.createNestApplication();
      await app.init();
      await signIn('staff', 'venue_staff1@connectsphere.test');
      await signIn('staff2', 'venue_staff2@connectsphere.test');
      await signIn('coordinator1', 'coordinator1@connectsphere.test');
      await signIn('coordinator2', 'coordinator2@connectsphere.test');
      await signIn('coordinator3', 'coordinator3@connectsphere.test');

      const created = await agents.staff
        .post('/api/venues')
        .send(venueBody)
        .expect(201);
      venueId = created.body.venue?.id ?? created.body.id;

      // Inside the period: a confirmed booking (Coordinator 1), an active approved hold (Coordinator 2), a pending
      // booking request (Coordinator 2) and a confirmed booking of an event with no Coordinator.
      await insertBooking(
        'confirmed',
        await createEvent(
          'Confirmed Gala',
          users.coordinator1,
          '2030-01-12T04:00:00Z',
          '2030-01-12T05:00:00Z',
        ),
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'approved',
      );
      await insertBooking(
        'hold',
        await createEvent(
          'Held Workshop',
          users.coordinator2,
          '2030-01-12T05:30:00Z',
          '2030-01-12T06:00:00Z',
        ),
        '2030-01-12T05:30:00Z',
        '2030-01-12T06:00:00Z',
        'approved',
        {
          requestKind: 'tentative_hold',
          holdExpiresAt: '2030-01-20T00:00:00Z',
        },
      );
      await insertBooking(
        'pending',
        await createEvent(
          'Pending Talk',
          users.coordinator2,
          '2030-01-12T04:00:00Z',
          '2030-01-12T05:00:00Z',
        ),
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'pending',
        { linkRequest: true },
      );
      await insertBooking(
        'unassigned',
        await createEvent(
          'Unassigned Fair',
          null,
          '2030-01-12T05:00:00Z',
          '2030-01-12T05:30:00Z',
        ),
        '2030-01-12T05:00:00Z',
        '2030-01-12T05:30:00Z',
        'approved',
      );
      // History only: a past confirmed booking and a cancelled one.
      await insertBooking(
        'past',
        await createEvent(
          'Past Seminar',
          users.coordinator1,
          '2029-12-01T02:00:00Z',
          '2029-12-01T03:00:00Z',
          'Completed',
        ),
        '2029-12-01T02:00:00Z',
        '2029-12-01T03:00:00Z',
        'approved',
      );
      await insertBooking(
        'cancelled',
        await createEvent(
          'Cancelled Meetup',
          users.coordinator1,
          '2030-01-15T02:00:00Z',
          '2030-01-15T03:00:00Z',
        ),
        '2030-01-15T02:00:00Z',
        '2030-01-15T03:00:00Z',
        'cancelled',
      );
      // Clear of the period until setup grows (AC8): 12 Jan 2030, 5:00 pm to 6:00 pm Singapore time. Every booking
      // above ends, with the 45-minute turnaround, before 3:00 pm so the AC4 boundary case below is only about the period.
      await insertBooking(
        'later',
        await createEvent(
          'Evening Forum',
          users.coordinator1,
          '2030-01-12T09:00:00Z',
          '2030-01-12T10:00:00Z',
        ),
        '2030-01-12T09:00:00Z',
        '2030-01-12T10:00:00Z',
        'approved',
      );
    });

    afterAll(async () => {
      await app?.close();
      if (pool) {
        if (venueId) {
          // Notifications are removed with their events below (related_event_id cascades).
          await pool.query('DELETE FROM venues WHERE id = $1', [venueId]);
        }
        if (eventIds.length)
          await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [
            eventIds,
          ]);
        await pool.end();
      }
    });

    /**
     * VEN-IMPACT-06-STATE-1 (AC6): a period that fails validation is not saved, writes no history entry and notifies
     * nobody.
     */
    it('VEN-IMPACT-06-STATE-1 saves nothing and notifies nobody when the period is invalid', async () => {
      await agents.staff
        .post(`/api/venues/${venueId}/unavailable-periods`)
        .send({ start: period.end, end: period.start, reason: period.reason })
        .expect(400);

      const history = await pool.query(
        'SELECT 1 FROM venue_unavailability_history WHERE venue_id = $1',
        [venueId],
      );
      expect(history.rowCount).toBe(0);
      const notices = await pool.query(
        'SELECT 1 FROM notifications WHERE related_booking_id = ANY($1::uuid[])',
        [Object.values(bookings)],
      );
      expect(notices.rowCount).toBe(0);
    });

    /**
     * VEN-IMPACT-06-D (AC6, AC7): saving the period notifies, once each, the Coordinators of the confirmed booking and
     * the active hold it affects; the pending request's Coordinator and a bystander get nothing; the save result marks
     * each notified booking, which is how Venue Staff see who was notified; Venue Staff themselves get no notice
     * (SC-SPM125-01); no booking row changes.
     */
    it('VEN-IMPACT-06-D notifies exactly the Coordinators of the affected bookings and shows Venue Staff they were notified', async () => {
      const before = await bookingSnapshot();
      const staffNoticesBefore = await storedNoticeCount('staff');

      const saved = await agents.staff
        .post(`/api/venues/${venueId}/unavailable-periods`)
        .send(period)
        .expect(201);

      expect(
        saved.body.affectedBookings.map((b: Record<string, unknown>) => [
          b.id,
          b.coordinatorNotified,
        ]),
      ).toEqual([
        [bookings.confirmed, true],
        [bookings.unassigned, undefined],
        [bookings.hold, true],
      ]);
      const first = await venueNotices('coordinator1');
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({
        type: 'venue_unavailable_impact',
        audienceRole: 'coordinator',
        relatedBookingId: bookings.confirmed,
        read: false,
      });
      const second = await venueNotices('coordinator2');
      expect(second.map((n) => [n.type, n.relatedBookingId])).toEqual([
        ['venue_unavailable_impact', bookings.hold],
      ]);
      expect(await venueNotices('coordinator3')).toEqual([]);
      // The Venue Staff member who saved gets no notice and, as before SPM-125, has no notification feed.
      expect(await storedNoticeCount('staff')).toBe(staffNoticesBefore);
      await agents.staff.get('/api/notifications').expect(403);
      expect(await bookingSnapshot()).toEqual(before);
    });

    /**
     * VEN-IMPACT-07-G (AC7): the Coordinator's notice names the event, the venue, the period and the reason, links to
     * the event and the booking, and once marked read stays read after signing in again.
     */
    it('VEN-IMPACT-07-G gives the event, venue, period and reason and stays read after signing in again', async () => {
      const [notice] = await venueNotices('coordinator1');
      expect(notice.message).toBe(
        `${venueName} is unavailable from 12 Jan 2030, 11:00 am – 3:00 pm (reason: Electrical safety inspection). ` +
          `Alternative arrangements are required for your booking for "Confirmed Gala ${run}" (12 Jan 2030, 12:00 pm – 1:00 pm).`,
      );
      expect(notice.relatedEventName).toBe(`Confirmed Gala ${run}`);

      await agents.coordinator1
        .post(`/api/notifications/${notice.id}/read`)
        .expect(201);
      // Another Coordinator cannot mark it read.
      await agents.coordinator2
        .post(`/api/notifications/${notice.id}/read`)
        .expect(404);
      await signIn('coordinator1', 'coordinator1@connectsphere.test');
      const [again] = await venueNotices('coordinator1');
      expect(again).toMatchObject({ id: notice.id, read: true });
    });

    /**
     * VEN-IMPACT-01-J (AC1): the history shows the period saved by Venue Staff 1; ending a current period early (by
     * Venue Staff 2) adds an 'ended_early' entry with the new end, the end it replaced, the person and the time;
     * entries are newest first.
     */
    it('VEN-IMPACT-01-J records who created and who ended a period early, with the period, reason and time', async () => {
      // A current period: 10 Jan 2030, 6:00 pm to 11 Jan 2030, 2:00 am Singapore time.
      const current = await agents.staff
        .post(`/api/venues/${venueId}/unavailable-periods`)
        .send({
          start: '2030-01-10T10:00:00.000Z',
          end: '2030-01-10T18:00:00.000Z',
          reason: 'Burst pipe',
        })
        .expect(201);
      await agents.staff2
        .post(
          `/api/venues/${venueId}/unavailable-periods/${current.body.period.id}/end`,
        )
        .expect(201);

      const history = await agents.staff
        .get(`/api/venues/${venueId}/unavailability-history`)
        .expect(200);

      expect(history.body).toHaveLength(3);
      expect(history.body[0]).toMatchObject({
        periodId: current.body.period.id,
        action: 'ended_early',
        start: '2030-01-10T10:00:00.000Z',
        end: fixedNow.toISOString(),
        previousEnd: '2030-01-10T18:00:00.000Z',
        reason: 'Burst pipe',
        changedBy: 'Venue Staff 2',
        changedAt: fixedNow.toISOString(),
      });
      expect(
        history.body
          .slice(1)
          .map((e: Record<string, unknown>) => [
            e.action,
            e.reason,
            e.changedBy,
          ]),
      ).toEqual(
        expect.arrayContaining([
          ['created', 'Burst pipe', 'Venue Staff 1'],
          ['created', 'Electrical safety inspection', 'Venue Staff 1'],
        ]),
      );
      const created = history.body.find(
        (e: Record<string, unknown>) => e.reason === period.reason,
      );
      expect(created).toMatchObject({ start: period.start, end: period.end });
      expect(created).not.toHaveProperty('previousEnd');
    });

    /** VEN-IMPACT-01-SEC-3, VEN-IMPACT-05-SEC-3 (AC1, AC5): a Coordinator or no session cannot read either history. */
    it('VEN-IMPACT-01-SEC-3 VEN-IMPACT-05-SEC-3 refuses the histories to a Coordinator and to no session', async () => {
      await agents.coordinator1
        .get(`/api/venues/${venueId}/unavailability-history`)
        .expect(403);
      await agents.coordinator1
        .get(`/api/venues/${venueId}/booking-history`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/venues/${venueId}/unavailability-history`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/api/venues/${venueId}/booking-history`)
        .expect(401);
    });

    /**
     * VEN-IMPACT-01-STATE-1 (AC1): history entries cannot be edited or deleted through the API, and a second early end
     * of the same period is refused without a new entry.
     */
    it('VEN-IMPACT-01-STATE-1 offers no way to change history and refuses a repeated early end', async () => {
      const before = await agents.staff
        .get(`/api/venues/${venueId}/unavailability-history`)
        .expect(200);
      const entryId = before.body[0].id as string;
      await agents.staff
        .delete(`/api/venues/${venueId}/unavailability-history/${entryId}`)
        .expect(404);
      await agents.staff
        .patch(`/api/venues/${venueId}/unavailability-history/${entryId}`)
        .send({ reason: 'x' })
        .expect(404);
      await agents.staff
        .post(
          `/api/venues/${venueId}/unavailable-periods/${before.body[0].periodId}/end`,
        )
        .expect(404);

      const after = await agents.staff
        .get(`/api/venues/${venueId}/unavailability-history`)
        .expect(200);
      expect(after.body).toEqual(before.body);
    });

    /**
     * VEN-IMPACT-05-B (AC5): after the venue is marked unavailable and a period is ended early, Venue Staff still see
     * every booking at the venue (past, cancelled, pending, held and confirmed) with its stored status, and which ones
     * overlap an unavailable period.
     */
    it('VEN-IMPACT-05-B keeps every past and future booking visible after the venue was marked unavailable', async () => {
      const response = await agents.staff
        .get(`/api/venues/${venueId}/booking-history`)
        .expect(200);

      const byId = new Map(
        (response.body as Array<Record<string, unknown>>).map((b) => [b.id, b]),
      );
      expect([...byId.keys()].sort()).toEqual(Object.values(bookings).sort());
      expect(byId.get(bookings.past)).toMatchObject({
        status: 'approved',
        coordinatorName: 'Coordinator 1',
        affectedByUnavailablePeriod: false,
      });
      expect(byId.get(bookings.cancelled)).toMatchObject({
        status: 'cancelled',
      });
      expect(byId.get(bookings.pending)).toMatchObject({
        status: 'pending',
        affectedByUnavailablePeriod: true,
      });
      expect(byId.get(bookings.hold)).toMatchObject({
        status: 'approved',
        requestKind: 'tentative_hold',
        holdExpiresAt: '2030-01-20T00:00:00.000Z',
      });
      expect(byId.get(bookings.confirmed)).toMatchObject({
        status: 'approved',
        affectedByUnavailablePeriod: true,
      });
      expect(byId.get(bookings.unassigned)).toMatchObject({
        coordinatorName: null,
      });
      // Latest slot first.
      const starts = (response.body as Array<{ start: string }>).map(
        (b) => b.start,
      );
      expect(starts).toEqual([...starts].sort().reverse());
    });

    /**
     * VEN-IMPACT-03-A (AC3): during the period the venue is still listed with its unavailable period and reason, but a
     * booking request overlapping the period is refused and creates no booking.
     */
    it('VEN-IMPACT-03-A keeps the venue searchable but refuses a booking inside the unavailable period', async () => {
      const list = await agents.coordinator1.get('/api/venues').expect(200);
      const listed = (list.body as Array<Record<string, unknown>>).find(
        (v) => v.id === venueId,
      ) as { unavailablePeriods: Array<Record<string, unknown>> };
      expect(listed).toBeDefined();
      expect(listed.unavailablePeriods).toContainEqual(
        expect.objectContaining({
          start: period.start,
          end: period.end,
          reason: period.reason,
        }),
      );

      const eventId = await createEvent(
        'Clashing Launch',
        users.coordinator1,
        '2030-01-12T05:00:00Z',
        '2030-01-12T06:00:00Z',
      );
      const refused = await agents.coordinator1
        .post(`/api/venues/${venueId}/booking-requests`)
        .send({
          eventId,
          start: '2030-01-12T05:00:00.000Z',
          end: '2030-01-12T06:00:00.000Z',
        })
        .expect(409);
      expect(refused.body.message).toContain(period.reason);
      const rows = await pool.query(
        'SELECT 1 FROM venue_bookings WHERE event_id = $1',
        [eventId],
      );
      expect(rows.rowCount).toBe(0);
    });

    /**
     * VEN-IMPACT-04-A (AC4): a booking whose occupied period (start minus 30 minutes' setup) starts exactly when the
     * period ends is accepted; one starting a minute earlier is refused.
     */
    it('VEN-IMPACT-04-A accepts a booking whose occupied period starts exactly when the period ends', async () => {
      const touching = await createEvent(
        'Touching Launch',
        users.coordinator1,
        '2030-01-12T07:30:00Z',
        '2030-01-12T07:45:00Z',
      );
      const early = await createEvent(
        'Early Launch',
        users.coordinator1,
        '2030-01-12T07:29:00Z',
        '2030-01-12T07:45:00Z',
      );

      const accepted = await agents.coordinator1
        .post(`/api/venues/${venueId}/booking-requests`)
        .send({
          eventId: touching,
          start: '2030-01-12T07:30:00.000Z',
          end: '2030-01-12T07:45:00.000Z',
        })
        .expect(201);
      expect(accepted.body).toMatchObject({
        status: 'pending',
        start: '2030-01-12T07:30:00.000Z',
      });
      await agents.coordinator1
        .post(`/api/venues/${venueId}/booking-requests`)
        .send({
          eventId: early,
          start: '2030-01-12T07:29:00.000Z',
          end: '2030-01-12T07:45:00.000Z',
        })
        .expect(409);
      bookings.touching = accepted.body.id;
    });

    /**
     * VEN-IMPACT-08-C (AC8): raising the setup time makes the evening booking (and the touching request) conflict with
     * the period; the edit result marks them notified, and their Coordinator gets one `venue_timing_impact` notice
     * each, linked to the booking; the Venue Staff member who edited the venue gets none.
     */
    it('VEN-IMPACT-08-C notifies the Coordinators of bookings a setup change makes conflict', async () => {
      const staffNoticesBefore = await storedNoticeCount('staff');
      const updated = await agents.staff
        .patch(`/api/venues/${venueId}`)
        .send({ ...venueBody, setupTimeMinutes: 150 })
        .expect(200);

      const affected = updated.body.affectedBookings as Array<
        Record<string, unknown>
      >;
      const affectedIds = affected.map((b) => b.bookingId as string);
      expect(affectedIds).toEqual(
        expect.arrayContaining([bookings.later, bookings.touching]),
      );
      // Every listed booking with an assigned Coordinator is marked notified; the unassigned event's is not.
      for (const listed of affected)
        expect([listed.bookingId, listed.coordinatorNotified]).toEqual([
          listed.bookingId,
          listed.bookingId === bookings.unassigned ? undefined : true,
        ]);
      const coordinatorOneBookings = [
        bookings.confirmed,
        bookings.later,
        bookings.touching,
      ];
      const timing = (await venueNotices('coordinator1')).filter(
        (n) => n.type === 'venue_timing_impact',
      );
      expect(timing.map((n) => n.relatedBookingId).sort()).toEqual(
        affectedIds.filter((id) => coordinatorOneBookings.includes(id)).sort(),
      );
      expect(
        timing.find((n) => n.relatedBookingId === bookings.later)?.message,
      ).toBe(
        `The setup or turnaround time of ${venueName} changed, so your booking for "Evening Forum ${run}" ` +
          '(12 Jan 2030, 5:00 pm – 6:00 pm) now conflicts with another booking or unavailable period. ' +
          'Review the booking and arrange an alternative if needed.',
      );
      expect(await storedNoticeCount('staff')).toBe(staffNoticesBefore);
    });

    /**
     * VEN-IMPACT-09-C (AC9): lowering the capacity notifies the Coordinators of the upcoming pending and approved
     * bookings with the old and new capacity; the past booking is still listed but not notified.
     */
    it('VEN-IMPACT-09-C notifies upcoming bookings of a capacity change and leaves the past booking un-notified', async () => {
      const updated = await agents.staff
        .patch(`/api/venues/${venueId}`)
        .send({ ...venueBody, setupTimeMinutes: 150, capacity: 80 })
        .expect(200);

      const listed = new Map(
        (updated.body.capacityBookings as Array<Record<string, unknown>>).map(
          (b) => [b.bookingId, b],
        ),
      );
      expect(listed.get(bookings.past)).toBeDefined();
      expect(listed.get(bookings.past)).not.toHaveProperty(
        'coordinatorNotified',
      );
      expect(listed.get(bookings.confirmed)).toMatchObject({
        coordinatorNotified: true,
      });
      expect(updated.body.affectedBookings).toEqual([]);
      const capacity = (await venueNotices('coordinator1')).filter(
        (n) => n.type === 'venue_capacity_impact',
      );
      expect(capacity.map((n) => n.relatedBookingId)).not.toContain(
        bookings.past,
      );
      expect(
        capacity.find((n) => n.relatedBookingId === bookings.confirmed)
          ?.message,
      ).toBe(
        `The capacity of ${venueName} changed from 120 to 80. Check that your booking for "Confirmed Gala ${run}" ` +
          '(12 Jan 2030, 12:00 pm – 1:00 pm) still suits your expected attendance.',
      );
      const pending = (await venueNotices('coordinator2')).filter(
        (n) => n.type === 'venue_capacity_impact',
      );
      expect(pending.map((n) => n.relatedBookingId).sort()).toEqual(
        [bookings.hold, bookings.pending].sort(),
      );
    });
  },
);
