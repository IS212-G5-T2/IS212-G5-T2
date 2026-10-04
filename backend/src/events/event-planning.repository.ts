/*
 * Raw SQL for SPM-97 / SPM-49 / SPM-85 planning data: the event row, its venue
 * bookings (with other events' bookings at the same venue), equipment
 * arrangements and flagged changes. Business rules live in
 * EventPlanningService; this class only reads and writes rows.
 *
 * Tables come from database/postgresql/init/007_spm49_spm85_spm97_event_planning.sql.
 * `venue_bookings` and `equipment_reservations` are minimal placeholders until
 * the venue-booking and equipment-reservation stories own them; if those
 * stories change the shape, only the SQL in this file needs to follow.
 *
 * runInTransaction() opens one transaction and every repository call made
 * inside it (in the same async context) uses that connection, so the service
 * can make "apply + flag" and "confirm + record" atomic. findEvent() locks the
 * event row (FOR UPDATE) when called inside a transaction, which serialises
 * concurrent updates/resolutions of the same event.
 */
import { ConflictException, Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { DatabaseService } from '../database/database.service.js';
import {
  TURNAROUND_MINUTES,
  type BookingImpact,
  type NeighbourBooking,
} from './event-impact.js';
import type { EventFieldKey, EventUpdatePatch } from './event-update-input.js';

/** Flat, camel-cased event row used by the planning service. */
export interface PlanningEventRow {
  id: string;
  organiserId: string;
  organiserName?: string;
  coordinatorId: string | null;
  coordinatorName?: string | null;
  status: string;
  name: string;
  purpose: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  expectedAttendance: number;
  layout: string;
  facilities: string[];
  accessibility: string[];
  equipmentNeeds: string;
  registrationEnabled?: boolean;
  createdAt?: string;
  updatedAt: string;
}

export type VenueBookingStatus = 'Booked' | 'Unavailable' | 'Cancelled';

export interface VenueBookingRow {
  id: string;
  venueId: string;
  venueName: string;
  capacity: number;
  start: string;
  end: string;
  status: VenueBookingStatus | string;
  neighbours: NeighbourBooking[];
}

export interface EquipmentArrangementRow {
  id: string;
  name: string;
  quantity: number;
  status: string;
}

export interface EquipmentImpact {
  arrangementId: string;
  name: string;
  quantity: number;
  detail: string;
}

/** A booking impact plus the coordinator's per-booking decision (SPM-85 AC7). */
export interface StoredBookingImpact extends BookingImpact {
  decision?: 'Applied' | 'Rejected';
  decidedBy?: string;
  decidedAt?: string;
}

export type FlaggedChangeStatus = 'Needs Review' | 'Applied' | 'Rejected';

export interface FlaggedChangeRow {
  id: string;
  eventId: string;
  kind: 'booking_conflict';
  field: EventFieldKey;
  originalValue: unknown;
  proposedValue: unknown;
  status: FlaggedChangeStatus;
  impacts: StoredBookingImpact[];
  equipmentImpacts?: EquipmentImpact[];
  proposedBy: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface NewFlaggedChange {
  kind: 'booking_conflict';
  field: EventFieldKey;
  originalValue: unknown;
  proposedValue: unknown;
  impacts: BookingImpact[];
  equipmentImpacts: EquipmentImpact[];
  proposedBy: string;
  proposedById: string;
}

export interface ChangeResolution {
  status: 'Applied' | 'Rejected';
  resolvedBy: string;
  resolvedById?: string;
  resolvedAt: Date;
  /** Reject only: clear the stored impact assessment (SPM-85 AC3). */
  clearImpacts?: boolean;
  /** Record the decision for this one venue booking only (SPM-85 AC7). */
  bookingId?: string;
}

/** A time window used to widen the neighbour search to a proposed date. */
export interface BookingWindow {
  start?: string;
  end?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whitelisted API field → events column mapping. Only these columns can ever
// be written by applyFields, whatever the caller passes.
const COLUMNS: Record<EventFieldKey, string> = {
  name: 'event_name',
  purpose: 'purpose',
  description: 'description',
  startDateTime: 'start_date_time',
  endDateTime: 'end_date_time',
  expectedAttendance: 'expected_attendance',
  layout: 'preferred_room_layout',
  facilities: 'required_facilities',
  accessibility: 'accessibility_needs',
  equipmentNeeds: 'equipment_needs',
};

/** Either the pool-backed DatabaseService or a transaction's client. */
type Queryable = {
  query(text: string, params?: unknown[]): Promise<pg.QueryResult>;
};

function iso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}

function optionalIso(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : iso(value);
}

@Injectable()
export class EventPlanningRepository {
  private readonly context = new AsyncLocalStorage<pg.PoolClient>();

  constructor(private readonly database: DatabaseService) {}

  /** Runs `work` in one transaction; nested calls reuse the outer one. */
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    return this.database.transaction((client) =>
      this.context.run(client, work),
    );
  }

  private db(): Queryable {
    return this.context.getStore() ?? this.database;
  }

  async findEvent(eventId: string): Promise<PlanningEventRow | undefined> {
    const lock = this.context.getStore() ? ' FOR UPDATE' : '';
    const result = await this.db().query(
      `SELECT * FROM events WHERE id = $1${lock}`,
      [eventId],
    );
    return result.rows[0] ? this.eventRow(result.rows[0]) : undefined;
  }

  /**
   * The event's venue bookings, each with other events' active bookings at the
   * same venue that are close enough to clash with either the booking's
   * current window or the optional proposed window.
   */
  async listVenueBookings(
    eventId: string,
    window: BookingWindow = {},
  ): Promise<VenueBookingRow[]> {
    const result = await this.db().query(
      `SELECT b.*,
              COALESCE(
                json_agg(
                  json_build_object('id', n.id, 'eventName', e.event_name,
                                    'start', n.start_date_time, 'end', n.end_date_time)
                  ORDER BY n.start_date_time
                ) FILTER (WHERE n.id IS NOT NULL),
                '[]'::json
              ) AS neighbours
         FROM venue_bookings b
         LEFT JOIN venue_bookings n
           ON n.venue_id = b.venue_id
          AND n.event_id <> b.event_id
          AND n.status = 'Booked'
          AND n.start_date_time < GREATEST(b.end_date_time, $3::timestamptz) + make_interval(mins => $4)
          AND n.end_date_time > LEAST(b.start_date_time, $2::timestamptz) - make_interval(mins => $4)
         LEFT JOIN events e ON e.id = n.event_id
        WHERE b.event_id = $1
        GROUP BY b.id
        ORDER BY b.start_date_time, b.created_at`,
      [eventId, window.start ?? null, window.end ?? null, TURNAROUND_MINUTES],
    );
    return result.rows.map((row) => ({
      id: row.id,
      venueId: row.venue_id,
      venueName: row.venue_name,
      capacity: row.venue_capacity,
      start: iso(row.start_date_time),
      end: iso(row.end_date_time),
      status: row.status,
      neighbours: (row.neighbours as NeighbourBooking[]).map((n) => ({
        ...n,
        start: iso(n.start),
        end: iso(n.end),
      })),
    }));
  }

  async listEquipmentArrangements(
    eventId: string,
  ): Promise<EquipmentArrangementRow[]> {
    const result = await this.db().query(
      `SELECT id, equipment_name, quantity, status FROM equipment_reservations
        WHERE event_id = $1 ORDER BY created_at`,
      [eventId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.equipment_name,
      quantity: row.quantity,
      status: row.status,
    }));
  }

  async listPendingChanges(eventId: string): Promise<FlaggedChangeRow[]> {
    const result = await this.db().query(
      `SELECT * FROM event_flagged_changes
        WHERE event_id = $1 AND status = 'Needs Review' ORDER BY created_at`,
      [eventId],
    );
    return result.rows.map((row) => this.changeRow(row));
  }

  /** Every flagged change of the event; the service filters and orders. */
  async listHistory(eventId: string): Promise<FlaggedChangeRow[]> {
    const result = await this.db().query(
      'SELECT * FROM event_flagged_changes WHERE event_id = $1 ORDER BY created_at DESC',
      [eventId],
    );
    return result.rows.map((row) => this.changeRow(row));
  }

  async findChange(
    eventId: string,
    changeId: string,
  ): Promise<FlaggedChangeRow | undefined> {
    // A malformed id can never match a uuid column; avoid a database cast error.
    if (!UUID.test(changeId)) return undefined;
    const lock = this.context.getStore() ? ' FOR UPDATE' : '';
    const result = await this.db().query(
      `SELECT * FROM event_flagged_changes WHERE id = $1 AND event_id = $2${lock}`,
      [changeId, eventId],
    );
    return result.rows[0] ? this.changeRow(result.rows[0]) : undefined;
  }

  /** Writes the given fields and stamps updated_at; returns the new row. */
  async applyFields(
    eventId: string,
    patch: EventUpdatePatch,
    now: Date,
  ): Promise<PlanningEventRow> {
    const assignments: string[] = [];
    const values: unknown[] = [eventId];
    for (const [field, value] of Object.entries(patch)) {
      const column = COLUMNS[field as EventFieldKey];
      if (!column) continue;
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    }
    values.push(now);
    assignments.push(`updated_at = $${values.length}`);
    const result = await this.db().query(
      `UPDATE events SET ${assignments.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return this.eventRow(result.rows[0]);
  }

  async createFlaggedChange(
    eventId: string,
    change: NewFlaggedChange,
  ): Promise<FlaggedChangeRow> {
    try {
      const result = await this.db().query(
        `INSERT INTO event_flagged_changes
           (id, event_id, kind, field, original_value, proposed_value, impacts,
            equipment_impacts, proposed_by, proposed_by_id)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)
         RETURNING *`,
        [
          randomUUID(),
          eventId,
          change.kind,
          change.field,
          JSON.stringify(change.originalValue),
          JSON.stringify(change.proposedValue),
          JSON.stringify(change.impacts),
          JSON.stringify(change.equipmentImpacts),
          change.proposedBy,
          change.proposedById,
        ],
      );
      return this.changeRow(result.rows[0]);
    } catch (error) {
      // event_flagged_changes_one_pending_per_field: a concurrent request won.
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          `A change to ${change.field} is already awaiting review.`,
        );
      throw error;
    }
  }

  /**
   * With `bookingId`: records the decision on that booking's impact entry only
   * (and clears that entry's conflicts on reject); the change stays pending.
   * Without: closes the whole change as Applied/Rejected.
   */
  async resolveChange(
    eventId: string,
    changeId: string,
    resolution: ChangeResolution,
  ): Promise<FlaggedChangeRow> {
    const result = resolution.bookingId
      ? await this.db().query(
          `UPDATE event_flagged_changes
              SET impacts = (
                SELECT COALESCE(jsonb_agg(
                         CASE WHEN item->>'bookingId' = $3
                              THEN item
                                   || jsonb_build_object('decision', $4::text,
                                                         'decidedBy', $5::text,
                                                         'decidedAt', $6::timestamptz)
                                   || CASE WHEN $7 THEN '{"conflicts": []}'::jsonb ELSE '{}'::jsonb END
                              ELSE item END
                         ORDER BY ordinal), '[]'::jsonb)
                  FROM jsonb_array_elements(impacts) WITH ORDINALITY AS t(item, ordinal)
              )
            WHERE id = $1 AND event_id = $2 AND status = 'Needs Review'
            RETURNING *`,
          [
            changeId,
            eventId,
            resolution.bookingId,
            resolution.status,
            resolution.resolvedBy,
            resolution.resolvedAt,
            resolution.clearImpacts === true,
          ],
        )
      : await this.db().query(
          `UPDATE event_flagged_changes
              SET status = $3,
                  resolved_by = $4,
                  resolved_by_id = $5,
                  resolved_at = $6,
                  impacts = CASE WHEN $7 THEN '[]'::jsonb ELSE impacts END,
                  equipment_impacts = CASE WHEN $7 THEN '[]'::jsonb ELSE equipment_impacts END
            WHERE id = $1 AND event_id = $2 AND status = 'Needs Review'
            RETURNING *`,
          [
            changeId,
            eventId,
            resolution.status,
            resolution.resolvedBy,
            resolution.resolvedById ?? null,
            resolution.resolvedAt,
            resolution.clearImpacts === true,
          ],
        );
    if (!result.rows[0])
      throw new ConflictException('This change has already been resolved.');
    return this.changeRow(result.rows[0]);
  }

  private eventRow(row: pg.QueryResultRow): PlanningEventRow {
    return {
      id: row.id,
      organiserId: row.organiser_id,
      organiserName: row.organiser_name,
      coordinatorId: row.coordinator_id ?? null,
      coordinatorName: row.coordinator_name ?? null,
      status: row.status,
      name: row.event_name,
      purpose: row.purpose,
      description: row.description,
      startDateTime: iso(row.start_date_time),
      endDateTime: iso(row.end_date_time),
      expectedAttendance: row.expected_attendance,
      layout: row.preferred_room_layout,
      facilities: row.required_facilities,
      accessibility: row.accessibility_needs,
      equipmentNeeds: row.equipment_needs,
      registrationEnabled: row.registration_enabled ?? false,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }

  private changeRow(row: pg.QueryResultRow): FlaggedChangeRow {
    return {
      id: row.id,
      eventId: row.event_id,
      kind: row.kind,
      field: row.field,
      originalValue: row.original_value,
      proposedValue: row.proposed_value,
      status: row.status,
      impacts: row.impacts ?? [],
      equipmentImpacts: row.equipment_impacts ?? [],
      proposedBy: row.proposed_by,
      createdAt: iso(row.created_at),
      resolvedBy: row.resolved_by ?? undefined,
      resolvedAt: optionalIso(row.resolved_at),
    };
  }
}
