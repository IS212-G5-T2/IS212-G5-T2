import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { shouldTransitionToPlanning } from '../../events/types/event-status.js';
import { CLOCK, systemClock, type Clock } from '../../common/clock.js';
import { Inject, Optional } from '@nestjs/common';
import type { EquipmentRequestInput } from './dto/equipment-request-input.js';
import { notifyEquipmentDecision, type EquipmentDecisionContext } from './equipment-decision-notice.js';

interface EventRow {
  id: string; event_name: string; start_date_time: Date; end_date_time: Date;
  expected_attendance: number; status: string;
}
interface RequestRow {
  id: string; event_id: string; event_name: string; start_date_time: Date;
  end_date_time: Date; expected_attendance: number; event_status: string; status: string;
  requested_by: string; coordinator_name: string | null; created_at: Date;
  decision_reason: string | null;
  item_id: string; equipment_name: string; equipment_type: string; quantity: number;
  reservation_id: string | null; reservation_status: string | null;
  safety_review_selected: boolean;
  available_quantity: number;
}
interface ReservationRow {
  id: string; event_id: string; event_name: string; start_date_time: Date;
  end_date_time: Date; equipment_name: string; equipment_type: string | null;
  quantity: number; status: string; coordinator_email: string | null;
}

@Injectable()
/** Owns transactional equipment request submission and request-list reads. */
export class EquipmentRequestsRepository {
  constructor(private readonly database: DatabaseService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock) {}

  async submit(coordinatorId: string, input: EquipmentRequestInput) {
    return this.database.transaction(async (client) => {
      const event = await client.query<EventRow>(
        `SELECT id, event_name, start_date_time, end_date_time, expected_attendance, status
           FROM events WHERE id = $1::uuid AND coordinator_id = $2::text FOR UPDATE`,
        [input.eventId, coordinatorId],
      );
      const row = event.rows[0];
      if (!row) return { kind: 'event-not-assigned' as const };
      if (!['Approved', 'Planning'].includes(row.status))
        return { kind: 'event-not-open' as const, status: row.status };

      // The event row lock serializes submissions for this event. Check for an
      // existing request while holding it so retries/concurrent submits cannot
      // create a second request; all later changes must use update().
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM equipment_requests WHERE event_id = $1::uuid LIMIT 1',
        [input.eventId],
      );
      if (existing.rows[0]) return { kind: 'already-submitted' as const };

      const request = await client.query<{ id: string }>(
        `INSERT INTO equipment_requests (event_id, requested_by)
         VALUES ($1::uuid, $2::uuid) RETURNING id`,
        [input.eventId, coordinatorId],
      );
      const requestId = request.rows[0].id;
      for (const [itemOrder, item] of input.items.entries()) {
        const savedItem = await client.query<{ id: string }>(
          `INSERT INTO equipment_request_items (request_id, equipment_name, equipment_type, quantity, item_order)
           VALUES ($1::uuid, $2, $3, $4, $5) RETURNING id`,
          [requestId, item.equipmentName, item.equipmentType, item.quantity, itemOrder],
        );
        await client.query(
          `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status, equipment_request_item_id)
           VALUES ($1::uuid, $2, $3, 'Requested', $4::uuid)`,
          [input.eventId, item.equipmentName, item.quantity, savedItem.rows[0].id],
        );
      }
      let statusChanged = false;
      if (shouldTransitionToPlanning(row.status)) {
        const now = this.clock.now();
        const moved = await client.query(
          `UPDATE events SET status = 'Planning', updated_at = $2::timestamptz
            WHERE id = $1::uuid AND status = 'Approved'`,
          [input.eventId, now],
        );
        statusChanged = moved.rowCount === 1;
        if (!statusChanged) throw new Error('Could not transition the approved event to Planning.');
        await client.query(
          `INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at)
           VALUES ($1::uuid, $2::uuid, 'Approved', 'Planning', $3::text, $4::timestamptz)`,
          [randomUUID(), input.eventId, coordinatorId, now],
        );
      }
      return {
        kind: 'created' as const,
        id: requestId,
        event: {
          id: row.id, name: row.event_name, status: (statusChanged ? 'Planning' : row.status).toLowerCase(),
          startDateTime: row.start_date_time.toISOString(), endDateTime: row.end_date_time.toISOString(),
          expectedAttendance: row.expected_attendance,
        },
      };
    });
  }

  async update(coordinatorId: string, requestId: string, input: EquipmentRequestInput) {
    return this.database.transaction(async (client) => {
      const existing = await client.query<{ id: string; event_id: string; event_status: string; request_status: string }>(
        `SELECT r.id, r.event_id, r.status AS request_status, e.status AS event_status
           FROM equipment_requests r JOIN events e ON e.id = r.event_id
          WHERE r.id = $1::uuid AND e.coordinator_id = $2::text
          FOR UPDATE OF r, e`,
        [requestId, coordinatorId],
      );
      const row = existing.rows[0];
      if (!row) return { kind: 'request-not-found' as const };
      if (row.event_id !== input.eventId) return { kind: 'event-not-open' as const };
      // SPM-153 BR9: a Completed event's equipment requests cannot be changed.
      if (row.event_status === 'Completed') return { kind: 'event-completed' as const };
      if (row.event_status === 'Confirmed') return { kind: 'event-confirmed' as const };
      if (!['Approved', 'Planning'].includes(row.event_status)) return { kind: 'event-not-open' as const };

      const safetySelected = await client.query<{
        item_id: string; reservation_id: string; equipment_name: string; equipment_type: string; quantity: number; status: string;
      }>(
        `SELECT DISTINCT item.id AS item_id, reservation.id AS reservation_id,
                item.equipment_name, item.equipment_type, item.quantity, reservation.status
           FROM equipment_request_items item
           JOIN equipment_reservations reservation ON reservation.equipment_request_item_id = item.id
           JOIN safety_check_feedback_items feedback ON feedback.event_id = reservation.event_id
           JOIN event_safety_checks safety ON safety.event_id = feedback.event_id
          WHERE item.request_id = $1::uuid
            AND safety.status IN ('changes_needed', 'rejected')
            AND COALESCE(feedback.review_arrangements->'equipmentIds', '[]'::jsonb) ? reservation.id::text`,
        [requestId],
      );
      if (safetySelected.rows.length) {
        const currentItems = await client.query<{
          item_id: string; reservation_id: string | null; equipment_name: string; equipment_type: string; quantity: number; status: string | null;
        }>(
          `SELECT item.id AS item_id, reservation.id AS reservation_id,
                  item.equipment_name, item.equipment_type, item.quantity, reservation.status
             FROM equipment_request_items item
             LEFT JOIN equipment_reservations reservation ON reservation.equipment_request_item_id = item.id
            WHERE item.request_id = $1::uuid ORDER BY item.item_order, item.id FOR UPDATE OF item`,
          [requestId],
        );
        const submittedById = new Map(input.items.filter((item) => item.id).map((item) => [item.id!, item]));
        const existingIds = new Set(currentItems.rows.map((item) => item.item_id));
        if (submittedById.size !== input.items.length || submittedById.size !== currentItems.rows.length ||
            [...submittedById.keys()].some((id) => !existingIds.has(id)))
          return { kind: 'invalid-safety-review-update' as const };
        const selectedItems = new Set(safetySelected.rows.map((item) => item.item_id));
        for (const existingItem of currentItems.rows) {
          const submitted = submittedById.get(existingItem.item_id)!;
          if (!selectedItems.has(existingItem.item_id) &&
              (submitted.equipmentName !== existingItem.equipment_name ||
               submitted.equipmentType !== existingItem.equipment_type ||
               submitted.quantity !== existingItem.quantity))
            return { kind: 'invalid-safety-review-update' as const };
        }
        for (const selected of safetySelected.rows) {
          const submitted = submittedById.get(selected.item_id)!;
          await client.query(
            `UPDATE equipment_request_items
                SET equipment_name = $2, equipment_type = $3, quantity = $4
              WHERE id = $1::uuid`,
            [selected.item_id, submitted.equipmentName, submitted.equipmentType, submitted.quantity],
          );
          await client.query(
            `UPDATE equipment_reservations
                SET equipment_name = $2, quantity = $3, status = 'Requested', updated_at = $4::timestamptz
              WHERE id = $1::uuid AND equipment_request_item_id = $5::uuid`,
            [selected.reservation_id, submitted.equipmentName, submitted.quantity, this.clock.now(), selected.item_id],
          );
        }
        await client.query(
          `UPDATE equipment_requests SET status = 'Pending Review', decision_reason = NULL, updated_at = $2::timestamptz
            WHERE id = $1::uuid`,
          [requestId, this.clock.now()],
        );
        return { kind: 'updated' as const, id: row.id };
      }

      await client.query('DELETE FROM equipment_request_items WHERE request_id = $1::uuid', [requestId]);
      for (const [itemOrder, item] of input.items.entries()) {
        const savedItem = await client.query<{ id: string }>(
          `INSERT INTO equipment_request_items (request_id, equipment_name, equipment_type, quantity, item_order)
           VALUES ($1::uuid, $2, $3, $4, $5) RETURNING id`,
          [requestId, item.equipmentName, item.equipmentType, item.quantity, itemOrder],
        );
        await client.query(
          `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status, equipment_request_item_id)
           VALUES ($1::uuid, $2, $3, 'Requested', $4::uuid)`,
          [row.event_id, item.equipmentName, item.quantity, savedItem.rows[0].id],
        );
      }
      // SPM-58: a changed request must be re-checked, so it returns to the Technical
      // Support review queue (any prior Reserved/Cannot Provide decision no longer applies).
      await client.query("UPDATE equipment_requests SET status = 'Pending Review', decision_reason = NULL, updated_at = $2::timestamptz WHERE id = $1::uuid", [requestId, this.clock.now()]);
      return { kind: 'updated' as const, id: row.id };
    });
  }

  /**
   * The equipment-request picker deliberately reads the event table directly.
   * A venue booking is not an event label: the UI must always display
   * events.event_name, even when the event has an approved venue booking.
   */
  async listEligibleEvents(coordinatorId: string) {
    const result = await this.database.query<EventRow>(
      `SELECT id, event_name, start_date_time, end_date_time, expected_attendance, status
         FROM events
        WHERE coordinator_id = $1::text
          AND status IN ('Approved', 'Planning')
          AND NOT EXISTS (SELECT 1 FROM equipment_requests r WHERE r.event_id = events.id)
        ORDER BY start_date_time ASC, event_name ASC`,
      [coordinatorId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.event_name,
      status: row.status.toLowerCase(),
      startDateTime: row.start_date_time.toISOString(),
      endDateTime: row.end_date_time.toISOString(),
      expectedAttendance: row.expected_attendance,
    }));
  }

  async listMine(coordinatorId: string) {
    // Assignment is current ownership for coordinator-facing request access;
    // requested_by remains the historical submitter and must not grant access
    // after the event has been reassigned.
    return this.readRequests("WHERE e.coordinator_id = $1::text AND e.status NOT IN ('Cancelled', 'Rejected')", [coordinatorId]);
  }

  async listQueue() {
    return this.readRequests(`WHERE r.status = 'Pending Review' AND e.status NOT IN ('Cancelled', 'Rejected')
      AND (NOT EXISTS (SELECT 1 FROM equipment_reservations requested
                        JOIN equipment_request_items requested_item ON requested_item.id = requested.equipment_request_item_id
                       WHERE requested_item.request_id = r.id AND requested.status = 'Requested')
        OR reservation.status = 'Requested')`, []);
  }

  /** SPM-58 AC7: Technical Support can see the event that owns each reservation,
   *  including the email of the coordinator the event is assigned to. */
  async listReservations() {
    const result = await this.database.query<ReservationRow>(
      `SELECT r.id, r.event_id, e.event_name, e.start_date_time, e.end_date_time,
              r.equipment_name, i.equipment_type, r.quantity, r.status, u.email AS coordinator_email
         FROM equipment_reservations r
         JOIN events e ON e.id = r.event_id
         LEFT JOIN equipment_request_items i ON i.id = r.equipment_request_item_id
         LEFT JOIN users u ON u.id::text = e.coordinator_id
        WHERE r.status = 'Reserved'
        ORDER BY e.start_date_time ASC, e.event_name ASC, r.equipment_name ASC, r.id ASC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      eventName: row.event_name,
      eventStart: row.start_date_time.toISOString(),
      eventEnd: row.end_date_time.toISOString(),
      equipmentName: row.equipment_name,
      equipmentType: row.equipment_type ?? '—',
      quantity: row.quantity,
      status: row.status,
      coordinatorEmail: row.coordinator_email ?? '—',
    }));
  }

  /** Atomically makes the request and every linked placeholder reservation live. */
  async reserve(requestId: string) {
    return this.database.transaction(async (client) => {
      const found = await client.query<{ id: string; status: string; event_id: string; event_status: string; start_date_time: Date; end_date_time: Date; event_name: string; coordinator_id: string | null }>(
        `SELECT r.id, r.status, r.event_id, e.status AS event_status, e.start_date_time, e.end_date_time, e.event_name, e.coordinator_id
           FROM equipment_requests r JOIN events e ON e.id = r.event_id
          WHERE r.id = $1::uuid FOR UPDATE OF r, e`,
        [requestId],
      );
      const request = found.rows[0];
      if (!request) return { kind: 'request-not-found' as const };
      // SPM-153 BR9: a Completed event's equipment reservations cannot be reserved, changed or released.
      if (request.event_status === 'Completed') return { kind: 'event-completed' as const };
      if (request.event_status === 'Confirmed') return { kind: 'event-confirmed' as const };
      if (request.status !== 'Pending Review') return { kind: 'not-pending' as const };

      // Lock the matching inventory rows before checking demand.  This means
      // two approvals for the same named equipment cannot both see the same
      // Active units and over-reserve them.
      const requested = await client.query<{ equipment_name: string; requested_quantity: number }>(
        `SELECT item.equipment_name, SUM(item.quantity)::integer AS requested_quantity
           FROM equipment_request_items item
           LEFT JOIN equipment_reservations reservation ON reservation.equipment_request_item_id = item.id
          WHERE item.request_id = $1::uuid
            AND (NOT EXISTS (SELECT 1 FROM equipment_reservations pending
                              JOIN equipment_request_items pending_item ON pending_item.id = pending.equipment_request_item_id
                             WHERE pending_item.request_id = $1::uuid AND pending.status = 'Requested')
              OR reservation.status = 'Requested')
          GROUP BY item.equipment_name`,
        [requestId],
      );
      const names = requested.rows.map((item) => item.equipment_name);
      const inventory = await client.query<{ equipment_name: string; active_quantity: number; is_available: boolean }>(
        `SELECT equipment_name, active_quantity, is_available
           FROM equipment
          WHERE equipment_name = ANY($1::text[])
          FOR UPDATE`,
        [names],
      );
      const reserved = await client.query<{ equipment_name: string; reserved_quantity: number }>(
        `SELECT r.equipment_name, SUM(r.quantity)::integer AS reserved_quantity
           FROM equipment_reservations r JOIN events e ON e.id = r.event_id
          WHERE r.status = 'Reserved'
            AND (r.event_id <> $1::uuid OR EXISTS (
              SELECT 1 FROM equipment_reservations selected
              JOIN equipment_request_items selected_item ON selected_item.id = selected.equipment_request_item_id
              WHERE selected_item.request_id = $5::uuid AND selected.status = 'Requested'
            ))
            AND e.start_date_time < $3::timestamptz
            AND e.end_date_time > $2::timestamptz
            AND r.equipment_name = ANY($4::text[])
          GROUP BY r.equipment_name`,
        [request.event_id, request.start_date_time, request.end_date_time, names, requestId],
      );
      const inventoryByName = new Map(inventory.rows.map((item) => [item.equipment_name, item]));
      const reservedByName = new Map(reserved.rows.map((item) => [item.equipment_name, item.reserved_quantity]));
      const unavailable = requested.rows.find((item) => {
        const record = inventoryByName.get(item.equipment_name);
        const remaining = record && record.is_available
          ? record.active_quantity - (reservedByName.get(item.equipment_name) ?? 0)
          : 0;
        return remaining < item.requested_quantity;
      });
      if (unavailable) return { kind: 'insufficient-active-stock' as const, equipmentName: unavailable.equipment_name };

      const now = this.clock.now();
      // Requests created before placeholder creation (including imported/seeded
      // requests) still get one reservation per item. The linked-item guard makes
      // retries and pre-existing placeholders idempotent.
      await client.query(
        `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status, equipment_request_item_id)
         SELECT $2::uuid, item.equipment_name, item.quantity, 'Reserved', item.id
           FROM equipment_request_items item
          WHERE item.request_id = $1::uuid
            AND NOT EXISTS (SELECT 1 FROM equipment_reservations pending
                             JOIN equipment_request_items pending_item ON pending_item.id = pending.equipment_request_item_id
                            WHERE pending_item.request_id = $1::uuid AND pending.status = 'Requested')
            AND NOT EXISTS (SELECT 1 FROM equipment_reservations linked WHERE linked.equipment_request_item_id = item.id)`,
        [requestId, request.event_id],
      );
      // Refresh existing and newly inserted rows from the request item as the authoritative source.
      await client.query(
        `UPDATE equipment_reservations reservation
            SET event_id = $2::uuid, equipment_name = item.equipment_name, quantity = item.quantity,
                status = 'Reserved', updated_at = $3::timestamptz
           FROM equipment_request_items item
          WHERE item.request_id = $1::uuid AND reservation.equipment_request_item_id = item.id
            AND (NOT EXISTS (SELECT 1 FROM equipment_reservations pending
                              JOIN equipment_request_items pending_item ON pending_item.id = pending.equipment_request_item_id
                             WHERE pending_item.request_id = $1::uuid AND pending.status = 'Requested')
              OR reservation.status = 'Requested')`,
        [requestId, request.event_id, now],
      );
      await client.query(
        "UPDATE equipment_requests SET status = 'Reserved', decision_reason = NULL, updated_at = $2::timestamptz WHERE id = $1::uuid",
        [requestId, now],
      );
      // SPM-172: tell the event's Coordinator (the one on the locked event row), in this same transaction.
      await notifyEquipmentDecision(client, this.decisionContext(request, 'reserved', now));
      return { kind: 'reserved' as const, id: request.id };
    });
  }

  /** SPM-58 AC8/AC9: records why a Pending Review request cannot be fulfilled and
   *  retires its linked reservations. The reason is shown to the coordinator.
   *  A Pending Review request can carry either a placeholder ('Requested')
   *  reservation from a fresh submission, or an already-held ('Reserved')
   *  reservation when it reached Pending Review via an in-window reschedule
   *  that deliberately kept the hold (see EventPlanningRepository.rescheduleEquipment).
   *  Both must be released here so Cannot Provide fully frees the equipment. */
  async markCannotProvide(requestId: string, reason: string) {
    return this.database.transaction(async (client) => {
      const found = await client.query<{ id: string; status: string; event_id: string; event_status: string; event_name: string; coordinator_id: string | null }>(
        `SELECT r.id, r.status, r.event_id, e.status AS event_status, e.event_name, e.coordinator_id
           FROM equipment_requests r JOIN events e ON e.id = r.event_id
          WHERE r.id = $1::uuid FOR UPDATE OF r, e`,
        [requestId],
      );
      const request = found.rows[0];
      if (!request) return { kind: 'request-not-found' as const };
      // SPM-153 BR9: a Completed event's equipment reservations cannot be reserved, changed or released.
      if (request.event_status === 'Completed') return { kind: 'event-completed' as const };
      if (request.event_status === 'Confirmed') return { kind: 'event-confirmed' as const };
      if (request.status !== 'Pending Review') return { kind: 'not-pending' as const };

      const now = this.clock.now();
      await client.query(
        `UPDATE equipment_requests
            SET status = 'Cannot Provide', decision_reason = $2, updated_at = $3::timestamptz
          WHERE id = $1::uuid`,
        [requestId, reason, now],
      );
      // The request will not be fulfilled, so its linked reservations are retired:
      // both placeholder (Requested) and already-held (Reserved) reservations.
      await client.query(
        `UPDATE equipment_reservations reservation
            SET status = 'Unavailable', updated_at = $2::timestamptz
           FROM equipment_request_items item
          WHERE item.request_id = $1::uuid
            AND reservation.equipment_request_item_id = item.id
            AND (reservation.status = 'Requested' OR (
              NOT EXISTS (SELECT 1 FROM equipment_reservations pending
                           JOIN equipment_request_items pending_item ON pending_item.id = pending.equipment_request_item_id
                          WHERE pending_item.request_id = $1::uuid AND pending.status = 'Requested')
              AND reservation.status = 'Reserved'))`,
        [requestId, now],
      );
      await notifyEquipmentDecision(client, this.decisionContext(request, 'cannot-provide', now));
      return { kind: 'cannot-provided' as const, id: request.id };
    });
  }

  /** SPM-172: what the decision notice needs from the locked request and event row. */
  private decisionContext(
    request: { id: string; event_id: string; event_name: string; coordinator_id: string | null },
    decision: EquipmentDecisionContext['decision'],
    decidedAt: Date,
  ): EquipmentDecisionContext {
    return {
      requestId: request.id,
      eventId: request.event_id,
      eventName: request.event_name,
      coordinatorId: request.coordinator_id,
      decision,
      decidedAt,
    };
  }

  private async readRequests(where: string, params: unknown[]) {
    const result = await this.database.query<RequestRow>(
      `SELECT r.id, r.event_id, e.event_name, e.start_date_time, e.end_date_time,
              e.expected_attendance, e.status AS event_status, r.status, r.requested_by, e.coordinator_name,
              r.created_at, r.decision_reason, i.id AS item_id, i.equipment_type, i.quantity,
              i.equipment_name, reservation.id AS reservation_id, reservation.status AS reservation_status,
              (reservation.id IS NOT NULL AND EXISTS (
                SELECT 1 FROM safety_check_feedback_items feedback
                JOIN event_safety_checks safety ON safety.event_id = feedback.event_id
                WHERE feedback.event_id = e.id AND safety.status IN ('changes_needed', 'rejected')
                  AND COALESCE(feedback.review_arrangements->'equipmentIds', '[]'::jsonb) ? reservation.id::text
              )) AS safety_review_selected,
              GREATEST(COALESCE((SELECT CASE WHEN eq.is_available THEN eq.active_quantity ELSE 0 END
                  FROM equipment eq WHERE eq.equipment_name = i.equipment_name LIMIT 1), 0)
                - COALESCE((SELECT SUM(res.quantity) FROM equipment_reservations res
                  JOIN events other_event ON other_event.id = res.event_id
                 WHERE res.equipment_name = i.equipment_name AND res.status = 'Reserved'
                   AND (res.event_id IS DISTINCT FROM e.id OR EXISTS (
                     SELECT 1 FROM equipment_reservations selected
                     JOIN equipment_request_items selected_item ON selected_item.id = selected.equipment_request_item_id
                     WHERE selected_item.request_id = r.id AND selected.status = 'Requested'
                   ))
                   AND other_event.start_date_time < e.end_date_time
                   AND other_event.end_date_time > e.start_date_time), 0), 0)::integer AS available_quantity
         FROM equipment_requests r JOIN events e ON e.id = r.event_id
         JOIN equipment_request_items i ON i.request_id = r.id
         LEFT JOIN equipment_reservations reservation ON reservation.equipment_request_item_id = i.id
         ${where} ORDER BY r.created_at DESC, r.id, i.item_order, i.created_at, i.id`, params,
    );
    const records = new Map<string, {
      id: string; reference: string; eventId: string; eventName: string;
      eventStart: string; eventEnd: string; expectedAttendance: number;
      status: string; eventStatus: RequestRow['event_status']; requestedBy: string; coordinatorName: string | null;
      createdAt: string; decisionReason: string | null;
      items: { id: string; equipmentName: string; equipmentType: string; quantity: number; availableQuantity: number; sufficient: boolean; reservationId?: string; reservationStatus?: string; safetyReviewSelected: boolean }[];
    }>();
    for (const row of result.rows) {
      let record = records.get(row.id);
      if (!record) {
        record = {
          id: row.id, reference: `ER-${row.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
          eventId: row.event_id, eventName: row.event_name,
          eventStart: row.start_date_time.toISOString(), eventEnd: row.end_date_time.toISOString(),
          expectedAttendance: row.expected_attendance, eventStatus: row.event_status,
          status: row.status,
          requestedBy: row.requested_by, coordinatorName: row.coordinator_name,
          createdAt: row.created_at.toISOString(), decisionReason: row.decision_reason, items: [],
        };
        records.set(row.id, record);
      }
      record.items.push({ id: row.item_id, equipmentName: row.equipment_name, equipmentType: row.equipment_type, quantity: row.quantity,
        availableQuantity: row.available_quantity, sufficient: row.available_quantity >= row.quantity,
        ...(row.reservation_id ? { reservationId: row.reservation_id } : {}),
        ...(row.reservation_status ? { reservationStatus: row.reservation_status } : {}),
        safetyReviewSelected: row.safety_review_selected, });
    }
    return [...records.values()];
  }
}
