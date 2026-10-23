import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { shouldTransitionToPlanning } from '../../events/types/event-status.js';
import { CLOCK, systemClock, type Clock } from '../../common/clock.js';
import { Inject, Optional } from '@nestjs/common';
import type { EquipmentRequestInput } from './dto/equipment-request-input.js';

interface EventRow {
  id: string; event_name: string; start_date_time: Date; end_date_time: Date;
  expected_attendance: number; status: string;
}
interface RequestRow {
  id: string; event_id: string; event_name: string; start_date_time: Date;
  end_date_time: Date; expected_attendance: number; event_status: string; status: string;
  requested_by: string; coordinator_name: string | null; created_at: Date;
  item_id: string; equipment_name: string; equipment_type: string; quantity: number;
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
      if (row.request_status !== 'Pending Review') return { kind: 'request-reserved' as const };
      if (row.event_status === 'Confirmed') return { kind: 'event-confirmed' as const };
      if (!['Approved', 'Planning'].includes(row.event_status)) return { kind: 'event-not-open' as const };

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
      await client.query('UPDATE equipment_requests SET updated_at = $2::timestamptz WHERE id = $1::uuid', [requestId, this.clock.now()]);
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
    return this.readRequests("WHERE r.status = 'Pending Review' AND e.status NOT IN ('Cancelled', 'Rejected')", []);
  }

  /** Atomically makes the request and every linked placeholder reservation live. */
  async reserve(requestId: string) {
    return this.database.transaction(async (client) => {
      const found = await client.query<{ id: string; status: string; event_id: string; start_date_time: Date; end_date_time: Date }>(
        `SELECT r.id, r.status, r.event_id, e.start_date_time, e.end_date_time
           FROM equipment_requests r JOIN events e ON e.id = r.event_id
          WHERE r.id = $1::uuid FOR UPDATE OF r, e`,
        [requestId],
      );
      const request = found.rows[0];
      if (!request) return { kind: 'request-not-found' as const };
      if (request.status !== 'Pending Review') return { kind: 'not-pending' as const };

      // Lock the matching inventory rows before checking demand.  This means
      // two approvals for the same named equipment cannot both see the same
      // Active units and over-reserve them.
      const requested = await client.query<{ equipment_name: string; requested_quantity: number }>(
        `SELECT equipment_name, SUM(quantity)::integer AS requested_quantity
           FROM equipment_request_items
          WHERE request_id = $1::uuid
          GROUP BY equipment_name`,
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
            AND r.event_id <> $1::uuid
            AND e.start_date_time < $3::timestamptz
            AND e.end_date_time > $2::timestamptz
            AND r.equipment_name = ANY($4::text[])
          GROUP BY r.equipment_name`,
        [request.event_id, request.start_date_time, request.end_date_time, names],
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

      await client.query(
        "UPDATE equipment_requests SET status = 'Reserved', updated_at = $2::timestamptz WHERE id = $1::uuid",
        [requestId, this.clock.now()],
      );
      await client.query(
        `UPDATE equipment_reservations SET status = 'Reserved', updated_at = $2::timestamptz
          WHERE equipment_request_item_id IN (SELECT id FROM equipment_request_items WHERE request_id = $1::uuid)`,
        [requestId, this.clock.now()],
      );
      return { kind: 'reserved' as const, id: request.id };
    });
  }

  private async readRequests(where: string, params: unknown[]) {
    const result = await this.database.query<RequestRow>(
      `SELECT r.id, r.event_id, e.event_name, e.start_date_time, e.end_date_time,
              e.expected_attendance, e.status AS event_status, r.status, r.requested_by, e.coordinator_name,
              r.created_at, i.id AS item_id, i.equipment_type, i.quantity,
              i.equipment_name
         FROM equipment_requests r JOIN events e ON e.id = r.event_id
         JOIN equipment_request_items i ON i.request_id = r.id
         ${where} ORDER BY r.created_at DESC, r.id, i.item_order, i.created_at, i.id`, params,
    );
    const records = new Map<string, {
      id: string; reference: string; eventId: string; eventName: string;
      eventStart: string; eventEnd: string; expectedAttendance: number;
      status: string; eventStatus: RequestRow['event_status']; requestedBy: string; coordinatorName: string | null;
      createdAt: string; items: { id: string; equipmentName: string; equipmentType: string; quantity: number }[];
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
          createdAt: row.created_at.toISOString(), items: [],
        };
        records.set(row.id, record);
      }
      record.items.push({ id: row.item_id, equipmentName: row.equipment_name, equipmentType: row.equipment_type, quantity: row.quantity });
    }
    return [...records.values()];
  }
}
