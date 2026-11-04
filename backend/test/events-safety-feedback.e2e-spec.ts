import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/*
 * SAFETY-FEEDBACK: when the Safety Officer requests changes, each feedback item is resolved by the
 * coordinator, and re-requesting needs every item resolved. Real PostgreSQL, real AppModule.
 * Needs TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 031 applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SAFETY-STALE tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';

describe.skipIf(!database)('SAFETY-FEEDBACK: coordinator resolves Safety Officer feedback (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let coordinator: { uid: string; cookie: string };
  let createdEventIds: string[];
  let createdVenueIds: string[];
  let createdUserIds: string[];
  let createdEquipmentIds: string[];

  beforeAll(() => {
    process.env.DATABASE_URL = database;
    pool = new pg.Pool({ connectionString: database });
    pool.on('error', (err) => { console.error('[pool-idle-error]', err.message); });
  });
  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdVenueIds = [];
    createdUserIds = [];
    createdEquipmentIds = [];
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    coordinator = await createSession('COORDINATOR', 'Coordinator 1');
  });

  afterEach(async () => {
    await app.close();
    if (createdEventIds.length)
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdVenueIds.length)
      await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [createdVenueIds]);
    if (createdEquipmentIds.length)
      await pool.query('DELETE FROM equipment WHERE id = ANY($1::uuid[])', [createdEquipmentIds]);
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  const http = () => request(app.getHttpServer());

  async function createSession(role: string, name: string) {
    const email = `e2e-safety-${randomUUID()}@example.com`;
    const client = await pool.connect();
    let uid!: string;
    try {
      const result = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
        [email, name],
      );
      uid = result.rows[0].id;
      createdUserIds.push(uid);
      await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    } finally {
      client.release();
    }
    const response = await http().post('/api/auth/login').send({ email, password: 'password123' });
    if (response.status !== 201) throw new Error(`Coordinator login failed (${response.status}): ${response.text}`);
    const cookie = response.headers['set-cookie']?.find((value: string) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  /** A Planning event that is ready except for the safety check, which is approved. */
  async function seedApprovedEvent() {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1, 'org-1', 'Organiser 1', 'organiser@example.test', 'Stale Check Event', 'Purpose', 'Description',
               '2026-11-05T02:00:00Z', '2026-11-05T04:00:00Z', 80, 'Theatre', ARRAY['Projector'], ARRAY[]::text[],
               'Projector x1', 'Planning', $2, 'Coordinator 1', $3)`,
      [id, coordinator.uid, randomUUID()],
    );
    createdEventIds.push(id);
    const equipmentName = `Safety Feedback Projector ${id}`;
    await pool.query(
      `INSERT INTO equipment (id, equipment_name, equipment_type, quantity, maintenance_status,
         active_quantity, under_maintenance_quantity, retired_quantity, location)
       VALUES ($1, $2, 'Visual', 5, 'Active', 5, 0, 0, 'E2E Store')`,
      [id, equipmentName],
    );
    createdEquipmentIds.push(id);
    const venue = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         setup_time_minutes, turnaround_time_minutes)
       SELECT id, 'Stale Hall', $1, 200, 'Open weekdays', 0, 0
         FROM users WHERE id = $2 RETURNING id`,
      [`Level 9 ${randomUUID()}`, coordinator.uid],
    );
    createdVenueIds.push(venue.rows[0].id);
    const bookingId = (await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1, $2, $3, $4, 'approved') RETURNING id`,
      [id, venue.rows[0].id, SLOT_START, SLOT_END],
    )).rows[0].id;
    const equipmentRequestId = (await pool.query<{ id: string }>(
      `INSERT INTO equipment_requests (event_id, requested_by, status) VALUES ($1, $2, 'Reserved') RETURNING id`,
      [id, coordinator.uid],
    )).rows[0].id;
    const itemId = (await pool.query<{ id: string }>(
      `INSERT INTO equipment_request_items (request_id, equipment_name, equipment_type, quantity)
       VALUES ($1, $2, 'Visual', 1) RETURNING id`,
      [equipmentRequestId, equipmentName],
    )).rows[0].id;
    const reservationId = (await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status, equipment_request_item_id)
       VALUES ($1, $2, 1, 'Reserved', $3) RETURNING id`,
      [id, equipmentName, itemId],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, decided_at)
       VALUES ($1, 'approved', now(), $2, 'Safety Officer 1', now())`,
      [id, coordinator.uid],
    );
    return { id, venueId: venue.rows[0].id, bookingId, equipmentRequestId, itemId, reservationId, equipmentName };
  }

  /** The safety record, or undefined once it has been reset to "not requested". */
  async function safetyOf(eventId: string) {
    const row = await pool.query<{ status: string }>('SELECT status FROM event_safety_checks WHERE event_id = $1', [eventId]);
    return row.rows[0]?.status;
  }

  async function seedChangesNeededEvent() {
    const { id, venueId, bookingId, equipmentRequestId, itemId, reservationId, equipmentName } = await seedApprovedEvent();
    await pool.query(
      "UPDATE event_safety_checks SET status = 'changes_needed', approver_name = 'Safety Officer 1', decided_at = now() WHERE event_id = $1",
      [id],
    );
    const itemIds = [randomUUID(), randomUUID()];
    await pool.query(
      `INSERT INTO safety_check_feedback_items (id, event_id, feedback_text, requested_at)
       VALUES ($1, $3, 'Add a fire exit plan.', now()), ($2, $3, 'Confirm occupancy.', now())`,
      [itemIds[0], itemIds[1], id],
    );
    return { id, itemIds, venueId, bookingId, equipmentRequestId, itemId, reservationId, equipmentName };
  }

  /** Resolving a safety feedback item marks it as handled, and unresolving it clears that mark. */
  it('SAFETY-FEEDBACK-01: resolving an item marks it, and unresolving clears it', async () => {
    // Arrange
    const { id, itemIds } = await seedChangesNeededEvent();

    // Act: resolve the first item
    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[0]}/resolve`).set('Cookie', coordinator.cookie).expect(200);

    // Assert: the checklist shows the first item resolved and the second not
    let status = await http().get(`/api/events/${id}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    const feedback = status.body.checklist.safetyCheck.feedback as { id: string; resolvedByCoordinatorAt?: string }[];
    expect(!!feedback.find((item) => item.id === itemIds[0])?.resolvedByCoordinatorAt).toBe(true);
    expect(!!feedback.find((item) => item.id === itemIds[1])?.resolvedByCoordinatorAt).toBe(false);

    // Act: unresolve it again
    await http().delete(`/api/events/${id}/safety-check/feedback/${itemIds[0]}/resolve`).set('Cookie', coordinator.cookie).expect(200);

    // Assert
    status = await http().get(`/api/events/${id}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(status.body.checklist.safetyCheck.feedback.every((item: { resolvedByCoordinatorAt?: string }) => !item.resolvedByCoordinatorAt)).toBe(true);
  });

  /** SAFETY-OUTCOME-06: revise equipment after feedback, restore its reservation, and re-request safety review. */
  it('SAFETY-OUTCOME-06 SAFETY-FEEDBACK-02: re-requests safety review after revising equipment and restoring readiness', async () => {
    // Arrange
    const { id, itemIds, equipmentRequestId, equipmentName } = await seedChangesNeededEvent();
    const support = await createSession('TECH_SUPPORT', 'Technical Support 1');
    const officer = await createSession('SAFETY_OFFICER', 'Safety Officer 1');
    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[0]}/resolve`).set('Cookie', coordinator.cookie).expect(200);

    // Act + Assert: one item still open
    const blocked = await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(422);
    expect(blocked.body.code).toBe('SAFETY_FEEDBACK_UNRESOLVED');
    expect(await pool.query('SELECT status FROM event_safety_checks WHERE event_id = $1', [id]).then((r) => r.rows[0].status)).toBe('changes_needed');

    // Coordinator resolves the remaining feedback before updating the plan.
    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[1]}/resolve`).set('Cookie', coordinator.cookie).expect(200);

    // Revise the actual equipment arrangement through the Coordinator flow.
    await http().put(`/api/equipment/requests/${equipmentRequestId}`).set('Cookie', coordinator.cookie)
      .send({ eventId: id, items: [{ equipmentName, equipmentType: 'Visual', quantity: 2 }] }).expect(200);
    expect(await safetyOf(id)).toBeUndefined();
    expect((await pool.query('SELECT id FROM safety_check_feedback_items WHERE event_id = $1', [id])).rows).toEqual([]);
    expect((await pool.query('SELECT status, quantity FROM equipment_reservations WHERE event_id = $1', [id])).rows)
      .toEqual([{ status: 'Requested', quantity: 2 }]);

    // Technical Support approves the revised quantity before re-request.
    await http().patch(`/api/equipment/requests/${equipmentRequestId}/reserve`).set('Cookie', support.cookie).expect(200);
    expect((await pool.query('SELECT status, quantity FROM equipment_reservations WHERE event_id = $1', [id])).rows)
      .toEqual([{ status: 'Reserved', quantity: 2 }]);
    const ok = await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(200);

    // Assert: pending again, and the old items are cleared
    expect(ok.body.status).toBe('pending');
    const left = await pool.query('SELECT count(*)::int AS n FROM safety_check_feedback_items WHERE event_id = $1', [id]);
    expect(left.rows[0].n).toBe(0);
    const readiness = await http().get(`/api/events/${id}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(readiness.body.ready).toBe(false);
    expect(readiness.body.outstanding).toEqual([
      { type: 'safety', label: 'Safety Officer approval', detail: 'Awaiting check', state: 'Awaiting Check' },
    ]);
    const queue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(queue.body.map((event: { id: string }) => event.id)).toContain(id);
  });

  /** SAFETY-OUTCOME-06: a legacy migration upgrades only selected arrangements; authenticated planning and staff flows preserve row identity, checkbox gating, and approvals across replay. */
  it('SAFETY-OUTCOME-06 re-approves selected arrangements through staff workflows before re-request', async () => {
    const { id, venueId, bookingId, equipmentRequestId, itemId, reservationId, equipmentName } = await seedApprovedEvent();
    const officer = await createSession('SAFETY_OFFICER', 'Safety Officer Migration Fixture');
    const venueStaff = await createSession('VENUE_STAFF', 'Venue Staff Reapprover');
    const support = await createSession('TECH_SUPPORT', 'Technical Support Reapprover');
    const unselectedVenueId = (await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, 'Unselected Hall', $2, 200, 'Open weekdays', 0, 0) RETURNING id`,
      [coordinator.uid, `Level 10 ${id}`],
    )).rows[0].id;
    createdVenueIds.push(unselectedVenueId);
    const unselectedBookingId = (await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1, $2, $3, $4, 'approved') RETURNING id`,
      [id, unselectedVenueId, SLOT_START, SLOT_END],
    )).rows[0].id;
    const unselectedEquipmentName = `${equipmentName} - Unselected`;
    const unselectedEquipmentId = unselectedVenueId;
    await pool.query(
      `INSERT INTO equipment (id, equipment_name, equipment_type, quantity, maintenance_status, active_quantity,
         under_maintenance_quantity, retired_quantity, location)
       VALUES ($1, $2, 'Audio', 5, 'Active', 5, 0, 0, 'E2E Store')`,
      [unselectedEquipmentId, unselectedEquipmentName],
    );
    createdEquipmentIds.push(unselectedEquipmentId);
    const unselectedItemId = (await pool.query<{ id: string }>(
      `INSERT INTO equipment_request_items (request_id, equipment_name, equipment_type, quantity, item_order)
       VALUES ($1, $2, 'Audio', 1, 1) RETURNING id`,
      [equipmentRequestId, unselectedEquipmentName],
    )).rows[0].id;
    const unselectedReservationId = (await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status, equipment_request_item_id)
       VALUES ($1, $2, 1, 'Reserved', $3) RETURNING id`,
      [id, unselectedEquipmentName, unselectedItemId],
    )).rows[0].id;

    // Fixture arrangement writes can invalidate the original safety row; now persist a legacy AC6 decision
    // after all arrangements exist, as it would have been recorded before migration 031.
    const itemIds = [randomUUID(), randomUUID()];
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, feedback, decided_at)
       VALUES ($1, 'changes_needed', now(), $2, 'Safety Officer 1', 'Update the venue and equipment.', now())
       ON CONFLICT (event_id) DO UPDATE SET status = EXCLUDED.status, requested_at = EXCLUDED.requested_at,
         requested_by = EXCLUDED.requested_by, approver_name = EXCLUDED.approver_name,
         feedback = EXCLUDED.feedback, decided_at = EXCLUDED.decided_at`,
      [id, coordinator.uid],
    );
    await pool.query(
      `INSERT INTO safety_check_feedback_items (id, event_id, feedback_text, requested_at)
       VALUES ($1, $3, 'Update the venue.', now()), ($2, $3, 'Update the equipment.', now())`,
      [itemIds[0], itemIds[1], id],
    );
    await pool.query(
      `UPDATE safety_check_feedback_items
          SET review_arrangements = CASE id
                WHEN $1 THEN jsonb_build_object('venueIds', jsonb_build_array($3::text), 'equipmentIds', '[]'::jsonb)
                ELSE jsonb_build_object('venueIds', '[]'::jsonb, 'equipmentIds', jsonb_build_array($4::text))
              END
        WHERE event_id = $2`,
      [itemIds[0], id, bookingId, reservationId],
    );
    const migration031 = await readFile(new URL('../migrations/031_spm131_resource_reapproval.sql', import.meta.url), 'utf8');
    const migration033 = await readFile(new URL('../migrations/033_fix_venue_trigger_bypass.sql', import.meta.url), 'utf8');

    // Apply the migration upgrade to legacy rows: only the selected IDs return to staff review.
    await pool.query(migration031);
    // Restore the fixed trigger so later suites (safety-officer) are not affected.
    await pool.query(migration033);
    const migratedChecklist = await http().get(`/api/events/${id}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(migratedChecklist.body.checklist.venue.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: bookingId, safetyReviewStatus: 'Pending review' }),
    ]));
    expect(migratedChecklist.body.checklist.venue.items.find((item: { id: string }) => item.id === unselectedBookingId))
      .not.toHaveProperty('safetyReviewStatus');
    expect(migratedChecklist.body.checklist.equipment.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: reservationId, safetyReviewStatus: 'Pending review' }),
    ]));
    expect(migratedChecklist.body.checklist.equipment.items.find((item: { id: string }) => item.id === unselectedReservationId))
      .not.toHaveProperty('safetyReviewStatus');
    expect((await pool.query('SELECT id, status FROM venue_bookings WHERE event_id = $1 ORDER BY id', [id])).rows)
      .toEqual([{ id: bookingId, status: 'pending' }, { id: unselectedBookingId, status: 'approved' }].sort((a, b) => a.id.localeCompare(b.id)));
    expect((await pool.query('SELECT id, status FROM equipment_reservations WHERE event_id = $1 ORDER BY id', [id])).rows)
      .toEqual([
        { id: reservationId, status: 'Requested' },
        { id: unselectedReservationId, status: 'Reserved' },
      ].sort((a, b) => a.id.localeCompare(b.id)));
    const upgradedFeedback = await pool.query<{ id: string; review_arrangements: { venueIds: string[]; equipmentIds: string[] }; reapproval_started_at: Date | null; reapproval_backfilled_at: Date | null }>(
      'SELECT id, review_arrangements, reapproval_started_at, reapproval_backfilled_at FROM safety_check_feedback_items WHERE event_id = $1 ORDER BY id', [id],
    );
    expect(upgradedFeedback.rows).toEqual([
      { id: itemIds[0], review_arrangements: { venueIds: [bookingId], equipmentIds: [] }, reapproval_started_at: expect.any(Date), reapproval_backfilled_at: expect.any(Date) },
      { id: itemIds[1], review_arrangements: { venueIds: [], equipmentIds: [reservationId] }, reapproval_started_at: expect.any(Date), reapproval_backfilled_at: expect.any(Date) },
    ].sort((a, b) => a.id.localeCompare(b.id)));

    // Coordinator revises the selected request through the authenticated HTTP contract and keeps the other item intact.
    const update = await http().put(`/api/equipment/requests/${equipmentRequestId}`).set('Cookie', coordinator.cookie)
      .send({ eventId: id, items: [
        { id: itemId, equipmentName, equipmentType: 'Visual', quantity: 2 },
        { id: unselectedItemId, equipmentName: unselectedEquipmentName, equipmentType: 'Audio', quantity: 1 },
      ] }).expect(200);
    expect(update.body.id).toBe(equipmentRequestId);
    expect((await pool.query(
      `SELECT item.id AS item_id, reservation.id AS reservation_id, item.equipment_name, item.quantity, reservation.status
         FROM equipment_request_items item JOIN equipment_reservations reservation ON reservation.equipment_request_item_id = item.id
        WHERE item.request_id = $1 ORDER BY item.id`, [equipmentRequestId],
    )).rows).toEqual([
      { item_id: itemId, reservation_id: reservationId, equipment_name: equipmentName, quantity: 2, status: 'Requested' },
      { item_id: unselectedItemId, reservation_id: unselectedReservationId, equipment_name: unselectedEquipmentName, quantity: 1, status: 'Reserved' },
    ].sort((a, b) => a.item_id.localeCompare(b.item_id)));
    expect((await pool.query('SELECT count(*)::int AS count FROM safety_check_feedback_items WHERE event_id = $1', [id])).rows[0].count).toBe(2);

    // Coordinator checkboxes cannot satisfy the still-pending resource approvals.
    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[0]}/resolve`).set('Cookie', coordinator.cookie).expect(200);
    const readinessBlocked = await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(422);
    expect(readinessBlocked.body.code).toBe('SAFETY_PREREQUISITES_NOT_MET');
    // Actual Venue Staff and Technical Support sessions re-approve the preserved arrangement rows.
    await pool.query('UPDATE venues SET owner_user_id = $2 WHERE id = $1', [venueId, venueStaff.uid]);
    await http().post(`/api/venues/bookings/${bookingId}/approve`).set('Cookie', venueStaff.cookie).expect(201);
    await http().patch(`/api/equipment/requests/${equipmentRequestId}/reserve`).set('Cookie', support.cookie).expect(200);
    const afterStaffReview = await pool.query(
      'SELECT id, status FROM venue_bookings WHERE event_id = $1 ORDER BY id', [id],
    );
    expect(afterStaffReview.rows).toEqual([
      { id: bookingId, status: 'approved' },
      { id: unselectedBookingId, status: 'approved' },
    ].sort((a, b) => a.id.localeCompare(b.id)));
    expect((await pool.query(
      `SELECT item.id AS item_id, reservation.id AS reservation_id, item.quantity, reservation.status
         FROM equipment_request_items item JOIN equipment_reservations reservation ON reservation.equipment_request_item_id = item.id
        WHERE item.request_id = $1 ORDER BY item.id`, [equipmentRequestId],
    )).rows).toEqual([
      { item_id: itemId, reservation_id: reservationId, quantity: 2, status: 'Reserved' },
      { item_id: unselectedItemId, reservation_id: unselectedReservationId, quantity: 1, status: 'Reserved' },
    ].sort((a, b) => a.item_id.localeCompare(b.item_id)));

    // Replaying migration 031 after approval must not demote approved arrangements or clear the feedback checks.
    const markersBeforeReplay = (await pool.query(
      'SELECT id, reapproval_backfilled_at FROM safety_check_feedback_items WHERE event_id = $1 ORDER BY id', [id],
    )).rows;
    await pool.query(migration031);
    // Restore the fixed trigger so later suites (safety-officer) are not affected.
    await pool.query(migration033);
    expect((await pool.query('SELECT id, status FROM venue_bookings WHERE event_id = $1 ORDER BY id', [id])).rows)
      .toEqual(afterStaffReview.rows);
    expect((await pool.query(
      'SELECT id, reapproval_backfilled_at FROM safety_check_feedback_items WHERE event_id = $1 ORDER BY id', [id],
    )).rows).toEqual(markersBeforeReplay);
    expect((await pool.query('SELECT id, status FROM equipment_reservations WHERE event_id = $1 ORDER BY id', [id])).rows)
      .toEqual([
        { id: reservationId, status: 'Reserved' },
        { id: unselectedReservationId, status: 'Reserved' },
      ].sort((a, b) => a.id.localeCompare(b.id)));
    const checkboxBlocked = await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(422);
    expect(checkboxBlocked.body.code).toBe('SAFETY_FEEDBACK_UNRESOLVED');

    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[1]}/resolve`).set('Cookie', coordinator.cookie).expect(200);
    const accepted = await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(200);
    expect(accepted.body.status).toBe('pending');
    expect((await pool.query('SELECT count(*)::int AS count FROM safety_check_feedback_items WHERE event_id = $1', [id])).rows[0].count).toBe(0);
    expect((await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200)).body.map((event: { id: string }) => event.id)).toContain(id);
  });

  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: rejected feedback remains durable and blocks re-request until coordinator resolution. */
  it('SPM129-SUP-REJECT-RESOLUTION preserves a rejected reason until it is resolved', async () => {
    const { id } = await seedApprovedEvent();
    const feedbackId = randomUUID();
    await pool.query("UPDATE event_safety_checks SET status = 'rejected', feedback = 'Add a fire exit plan.' WHERE event_id = $1", [id]);
    await pool.query(
      `INSERT INTO safety_check_feedback_items (id, event_id, feedback_text, requested_at)
       VALUES ($1, $2, 'Add a fire exit plan.', now())`,
      [feedbackId, id],
    );

    const refused = await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(422);
    expect(refused.body.code).toBe('SAFETY_FEEDBACK_UNRESOLVED');
    expect(await pool.query('SELECT status, feedback FROM event_safety_checks WHERE event_id = $1', [id]).then((result) => result.rows[0]))
      .toEqual({ status: 'rejected', feedback: 'Add a fire exit plan.' });
    expect(await pool.query('SELECT resolved_by_coordinator_at FROM safety_check_feedback_items WHERE id = $1', [feedbackId]).then((result) => result.rows[0].resolved_by_coordinator_at))
      .toBeNull();

    await http().post(`/api/events/${id}/safety-check/feedback/${feedbackId}/resolve`).set('Cookie', coordinator.cookie).expect(200);
    const accepted = await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(200);
    expect(accepted.body.status).toBe('pending');
    expect(await pool.query('SELECT status, feedback FROM event_safety_checks WHERE event_id = $1', [id]).then((result) => result.rows[0]))
      .toMatchObject({ status: 'pending', feedback: null });
    expect(await pool.query('SELECT count(*)::int AS count FROM safety_check_feedback_items WHERE event_id = $1', [id]).then((result) => result.rows[0].count))
      .toBe(0);
  });

  /** An unknown feedback item is reported as not found, and resolving while the check is not in changes-needed is refused. */
  it('SAFETY-FEEDBACK-03: an unknown item is not found, and resolving outside changes-needed is refused', async () => {
    // Arrange
    const { id, itemIds } = await seedChangesNeededEvent();

    // Act + Assert: an item id that is not on this event
    await http().post(`/api/events/${id}/safety-check/feedback/00000000-0000-4000-8000-000000000999/resolve`).set('Cookie', coordinator.cookie).expect(404);

    // Arrange: the check is approved, not changes-needed
    await pool.query("UPDATE event_safety_checks SET status = 'approved' WHERE event_id = $1", [id]);

    // Act + Assert
    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[0]}/resolve`).set('Cookie', coordinator.cookie).expect(409);
  });
});
