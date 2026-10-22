import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  BOOKING_OPEN_STATUSES,
  shouldTransitionToPlanning,
} from '../../events/types/event-status.js';
import { DatabaseService } from '../../database/database.service.js';
import { CLOCK, systemClock, type Clock } from '../../common/clock.js';
import { accessibilityOptions } from '../helpers/accessibility-options.js';
import type {
  VenueImageInput,
  VenueInput,
} from '../creation/dto/venue-input.js';
import type { UnavailabilityInput } from '../availability/dto/venue-unavailability.js';
import type { BookingRequestInput } from '../availability/dto/booking-request.js';

/** A persisted, catalogue-ready venue record. */
export interface VenueRecord {
  id: string;
  name: string;
  location: string;
  capacity: number;
  facilities: string[];
  accessibility: string[];
  layouts: string[];
  operatingInformation: string;
  setupTimeMinutes: number;
  turnaroundTimeMinutes: number;
  image?: VenueImageInput;
}

export interface VenueReadRecord extends VenueRecord {
  availabilityStatus: 'available' | 'unavailable';
  unavailablePeriods: VenueUnavailablePeriod[];
  reservations: VenueReservation[];
}

export interface VenueUnavailablePeriod {
  id: string;
  start: string;
  end: string;
  reason: string;
  current?: boolean;
}

interface VenueReservationBase {
  id: string;
  eventName: string;
  start: string;
  end: string;
  affectedByUnavailablePeriod: boolean;
}

export type VenueReservation =
  | (VenueReservationBase & { status: 'booked'; holdExpiresAt?: never })
  | (VenueReservationBase & { status: 'tentative'; holdExpiresAt: string });

export type AffectedVenueReservation = VenueReservation & { eventId: string };

type Queryable = Pick<pg.PoolClient, 'query'>;
type VenueRow = Omit<
  VenueRecord,
  'operatingInformation' | 'setupTimeMinutes' | 'turnaroundTimeMinutes'
> & {
  operating_information: string;
  setup_time_minutes: number;
  turnaround_time_minutes: number;
  image_name?: string | null;
  image_type?: string | null;
  image_size?: number | null;
  image_data_url?: string | null;
};

interface UnavailableRow {
  id: string;
  venue_id: string;
  start_at: Date;
  end_at: Date;
  reason: string;
  current: boolean;
}

interface BookingRow {
  id: string;
  venue_id: string;
  event_name: string;
  start_at: Date;
  end_at: Date;
  status: 'pending' | 'approved';
  hold_expires_at?: Date | null;
  current: boolean;
  affected: boolean;
}

const venueSelect = `
  SELECT v.id, v.name, v.location, v.capacity, v.operating_information,
    v.setup_time_minutes, v.turnaround_time_minutes,
    COALESCE((SELECT array_agg(f.name ORDER BY f.name)
      FROM venue_facilities vf JOIN facilities f ON f.id = vf.facility_id
      WHERE vf.venue_id = v.id), ARRAY[]::varchar[]) AS facilities,
    COALESCE((SELECT array_agg(l.name ORDER BY l.name)
      FROM venue_layouts vl JOIN room_layouts l ON l.id = vl.layout_id
      WHERE vl.venue_id = v.id), ARRAY[]::varchar[]) AS layouts,
    COALESCE((SELECT array_agg(a.label ORDER BY a.label)
      FROM venue_accessibility va JOIN accessibility_features a ON a.id = va.accessibility_id
      WHERE va.venue_id = v.id), ARRAY[]::varchar[]) AS accessibility,
    i.file_name AS image_name, i.mime_type AS image_type,
    i.byte_size AS image_size, i.data_url AS image_data_url
  FROM venues v LEFT JOIN venue_images i ON i.venue_id = v.id`;

/* v8 ignore start -- TypeScript decorator metadata emits an unreachable fallback branch. */
@Injectable()
/** Persists a venue and its accessibility selections atomically. */
export class VenuesRepository {
  /* v8 ignore stop */
  constructor(
    private readonly database: DatabaseService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Inserts one venue and its accessibility selections in one transaction.
   *
   * @param ownerUserId - Verified local account ID from the authenticated session.
   * @param venue - Validated venue details ready for persistence.
   * @returns The saved venue record.
   */
  async create(ownerUserId: string, venue: VenueInput): Promise<VenueRecord> {
    const created = await this.database.transaction(async (client) => {
      const result = await this.insertVenue(client, ownerUserId, venue);
      await this.insertAccessibility(client, result.id, venue.accessibility);
      await this.insertFacilities(client, result.id, venue.facilities);
      await this.insertLayouts(client, result.id, venue.layouts);
      if (venue.image) await this.insertImage(client, result.id, venue.image);
      return result;
    });

    return this.toRecord({
      ...created,
      accessibility: venue.accessibility,
      facilities: venue.facilities,
      layouts: venue.layouts,
      image_name: venue.image?.name,
      image_type: venue.image?.type,
      image_size: venue.image?.size,
      image_data_url: venue.image?.dataUrl,
    });
  }

  async list(ownerUserId?: string): Promise<VenueReadRecord[]> {
    const result = await this.database.query<VenueRow>(
      `${venueSelect}${ownerUserId ? ' WHERE v.owner_user_id = $1::uuid' : ''} ORDER BY v.name, v.id`,
      ownerUserId ? [ownerUserId] : [],
    );
    return this.withSchedules(result.rows.map((row) => this.toReadRecord(row)));
  }

  async get(id: string): Promise<VenueReadRecord | undefined> {
    const result = await this.database.query<VenueRow>(
      `${venueSelect} WHERE v.id = $1::uuid`,
      [id],
    );
    if (!result.rows[0]) return undefined;
    return (await this.withSchedules([this.toReadRecord(result.rows[0])]))[0];
  }

  /** Lists the caller's event venue requests, retaining their current lifecycle status. */
  async listCoordinatorBookings(coordinatorId: string) {
    const result = await this.database.query<{
      id: string;
      event_id: string;
      event_name: string;
      venue_id: string;
      venue_name: string;
      start_at: Date;
      end_at: Date;
      status: string;
      special_request: string | null;
      created_at: Date;
      affected: boolean;
      booking_reference: string;
    }>(
      `SELECT b.id, b.event_id, e.event_name, b.venue_id, v.name AS venue_name,
              b.start_at, b.end_at, b.status, r.special_request, b.created_at,
              'VB-' || upper(substr(replace(b.id::text, '-', ''), 1, 8)) AS booking_reference,
              EXISTS (SELECT 1 FROM venue_bookings blockout
                WHERE blockout.venue_id = b.venue_id AND blockout.status = 'blocked'
                  AND blockout.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)
                  AND blockout.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)) AS affected
         FROM venue_bookings b
         JOIN events e ON e.id = b.event_id
         JOIN venues v ON v.id = b.venue_id
         LEFT JOIN venue_booking_requests r ON r.event_id = b.event_id AND r.venue_id = b.venue_id
        WHERE e.coordinator_id = $1::text AND b.status <> 'blocked'
        ORDER BY b.created_at DESC, b.id`,
      [coordinatorId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      eventName: row.event_name,
      venueId: row.venue_id,
      venueName: row.venue_name,
      start: row.start_at.toISOString(),
      end: row.end_at.toISOString(),
      status: row.status,
      bookingReference: row.booking_reference,
      specialRequest: row.special_request ?? undefined,
      affected: row.affected,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /** Cancels one owned request and refuses to remove the event's last active venue booking without explicit confirmation. */
  async cancelCoordinatorBooking(
    coordinatorId: string,
    bookingId: string,
    confirmed: boolean,
  ) {
    return this.database.transaction(async (client) => {
      const booking = await client.query<{
        id: string;
        event_id: string;
        status: string;
      }>(
        `SELECT b.id, b.event_id, b.status FROM venue_bookings b
          JOIN events e ON e.id = b.event_id
         WHERE b.id = $1::uuid AND e.coordinator_id = $2::text
         FOR UPDATE OF b, e`,
        [bookingId, coordinatorId],
      );
      const row = booking.rows[0];
      if (!row) return { kind: 'not-found' as const };
      if (row.status !== 'pending' && row.status !== 'approved')
        return { kind: 'not-active' as const };
      const remaining = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM venue_bookings
          WHERE event_id = $1::uuid AND id <> $2::uuid AND status IN ('pending', 'approved')`,
        [row.event_id, bookingId],
      );
      if (remaining.rows[0].count === 0 && !confirmed)
        return { kind: 'last-active' as const };
      await client.query(
        "UPDATE venue_bookings SET status = 'cancelled' WHERE id = $1::uuid",
        [bookingId],
      );
      return { kind: 'cancelled' as const };
    });
  }

  /** Atomically rechecks a venue schedule and records an assigned coordinator's request. */
  async submitBookingRequest(
    venueId: string,
    coordinatorId: string,
    input: BookingRequestInput,
  ): Promise<
    | { kind: 'venue-not-found' }
    | { kind: 'event-not-assigned' }
    | { kind: 'event-not-open'; status: string }
    | { kind: 'already-requested'; id: string; status: string }
    | { kind: 'conflict'; reason: string }
    | {
        kind: 'created';
        id: string;
        start: string;
        end: string;
        eventStatus: string;
        statusChanged: boolean;
      }
  > {
    return this.database.transaction(async (client) => {
      const venue = await client.query<{
        id: string;
        capacity: number;
        facilities: string[];
        accessibility: string[];
        layouts: string[];
        setup_time_minutes: number;
        turnaround_time_minutes: number;
      }>(
        `SELECT v.id, v.capacity, v.setup_time_minutes, v.turnaround_time_minutes,
           COALESCE((SELECT array_agg(f.name ORDER BY f.name) FROM venue_facilities vf JOIN facilities f ON f.id = vf.facility_id WHERE vf.venue_id = v.id), '{}') AS facilities,
           COALESCE((SELECT array_agg(a.label ORDER BY a.label) FROM venue_accessibility va JOIN accessibility_features a ON a.id = va.accessibility_id WHERE va.venue_id = v.id), '{}') AS accessibility,
           COALESCE((SELECT array_agg(l.name ORDER BY l.name) FROM venue_layouts vl JOIN room_layouts l ON l.id = vl.layout_id WHERE vl.venue_id = v.id), '{}') AS layouts
         FROM venues v WHERE v.id = $1::uuid FOR UPDATE`,
        [venueId],
      );
      const venueRow = venue.rows[0];
      if (!venueRow) return { kind: 'venue-not-found' };

      // SPM-148 PLAN-STATUS-02-E, 03-D: the event row lock (FOR UPDATE) serialises parallel first requests.
      // The event row lock serialises first requests: the status check, the
      // booking, the compare-and-set and the history row commit as one unit.
      const event = await client.query<{
        id: string;
        status: string;
        expected_attendance: number;
        required_facilities: string[];
        accessibility_needs: string[];
        preferred_room_layout: string;
        start_date_time: Date;
        end_date_time: Date;
      }>(
        `SELECT id, status, expected_attendance, required_facilities, accessibility_needs, preferred_room_layout, start_date_time, end_date_time
           FROM events WHERE id = $1::uuid AND coordinator_id = $2::text FOR UPDATE`,
        [input.eventId, coordinatorId],
      );
      const eventRow = event.rows[0];
      if (!eventRow) return { kind: 'event-not-assigned' };
      // SPM-148 PLAN-STATUS-01-B: Submitted, Rejected, Completed and Cancelled answer 409 (event-not-open).
      if (
        !(BOOKING_OPEN_STATUSES as readonly string[]).includes(eventRow.status)
      )
        return { kind: 'event-not-open', status: eventRow.status };

      // SPM-54 AC1/AC2: suitability and capacity are advisory. Availability,
      // active requests and event state below remain authoritative blockers.

      // SPM-54 AC7: the event row lock serializes retries. Only pending/approved
      // requests block; cancelled/rejected history remains available for retry.
      const activeRequest = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM venue_bookings
          WHERE event_id = $1::uuid AND venue_id = $2::uuid
            AND status IN ('pending', 'approved')
          ORDER BY created_at DESC, id LIMIT 1`,
        [input.eventId, venueId],
      );
      if (activeRequest.rows[0])
        return {
          kind: 'already-requested',
          id: activeRequest.rows[0].id,
          status: activeRequest.rows[0].status,
        };

      // SPM-54 AC2: booking requests remain blockers without hold expiry; standalone Venue Staff holds block only until expiry. SPM-148 PLAN-STATUS-01-C, 01-BND: conflicts are checked before any write; an adjacent booking (end == start) does not conflict.
      const conflict = await client.query<{ reason: string }>(
        `SELECT reason FROM (
           SELECT COALESCE(reason, 'Venue unavailable') AS reason
             FROM venue_bookings
            WHERE venue_id = $1::uuid AND status = 'blocked'
              AND start_at < $3::timestamptz + make_interval(mins => $5::int)
              AND end_at > $2::timestamptz - make_interval(mins => $4::int)
           UNION ALL
           SELECT COALESCE(e.event_name, 'Existing venue booking') AS reason
             FROM venue_bookings b
             LEFT JOIN events e ON e.id = b.event_id
            WHERE b.venue_id = $1::uuid
              AND (b.status = 'approved' OR
                (b.status = 'pending' AND
                  (b.hold_expires_at > $6::timestamptz OR EXISTS (
                    SELECT 1 FROM venue_booking_requests r
                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id
                  ))))
              AND b.start_at - make_interval(mins => $4::int)
                    < $3::timestamptz + make_interval(mins => $5::int)
              AND b.end_at + make_interval(mins => $5::int)
                    > $2::timestamptz - make_interval(mins => $4::int)
         ) conflicts LIMIT 1`,
        [
          venueId,
          eventRow.start_date_time,
          eventRow.end_date_time,
          venueRow.setup_time_minutes,
          venueRow.turnaround_time_minutes,
          this.clock.now(),
        ],
      );
      if (conflict.rows[0])
        return { kind: 'conflict', reason: conflict.rows[0].reason };

      // SPM-148 PLAN-STATUS-02-A, 02-C: the booking row, written in the same transaction as the status change and history row.
      const saved = await client.query<{
        id: string;
        start_at: Date;
        end_at: Date;
      }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, 'pending')
         RETURNING id, start_at, end_at`,
        [
          venueId,
          input.eventId,
          eventRow.start_date_time,
          eventRow.end_date_time,
        ],
      );
      const row = saved.rows[0];
      await client.query(
        `INSERT INTO venue_booking_requests (event_id, venue_id, special_request)
         VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT (event_id, venue_id) DO UPDATE SET special_request = EXCLUDED.special_request`,
        [input.eventId, venueId, input.specialRequest ?? null],
      );
      // SPM-148 PLAN-STATUS-01-A, 01-B, 03-A, 03-B: transition in the same transaction as the booking; only a request for an Approved event moves it.
      const statusChanged = await this.moveToPlanning(
        client,
        input.eventId,
        coordinatorId,
        eventRow.status,
      );
      return {
        kind: 'created',
        id: row.id,
        start: row.start_at.toISOString(),
        end: row.end_at.toISOString(),
        eventStatus: statusChanged ? 'Planning' : eventRow.status,
        statusChanged,
      };
    });
  }

  /**
   * SPM-148 R1/R4: compare-and-set Approved -> Planning inside the booking
   * transaction. Only the request whose UPDATE touches a row writes history.
   */
  private async moveToPlanning(
    client: pg.PoolClient,
    eventId: string,
    actorId: string,
    status: string,
  ): Promise<boolean> {
    // SPM-148 PLAN-STATUS-01-B, 03-A: only Approved moves to Planning; later requests leave the status alone.
    if (!shouldTransitionToPlanning(status)) return false;
    const now = this.clock.now();
    const moved = await client.query(
      `UPDATE events SET status = 'Planning', updated_at = $2::timestamptz
        WHERE id = $1::uuid AND status = 'Approved'`,
      [eventId, now],
    );
    // SPM-148 PLAN-STATUS-02-E, 03-D: a lost compare-and-set writes no history row.
    if (moved.rowCount !== 1) return false;
    // SPM-148 PLAN-STATUS-02-D, 04-A, 04-C, 04-D: history row; actor is the session user and the time the injected clock (not SQL now()); append-only.
    await client.query(
      `INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at)
       VALUES ($1::uuid, $2::uuid, 'Approved', 'Planning', $3::text, $4::timestamptz)`,
      [randomUUID(), eventId, actorId, now],
    );
    return true;
  }

  /** Block a venue without altering existing event bookings or holds. */
  async markUnavailable(
    venueId: string,
    input: UnavailabilityInput,
  ): Promise<
    | {
        period: VenueUnavailablePeriod;
        affectedBookings: AffectedVenueReservation[];
      }
    | undefined
  > {
    return this.database.transaction(async (client) => {
      const now = this.clock.now();
      const venue = await client.query(
        'SELECT id FROM venues WHERE id = $1::uuid FOR UPDATE',
        [venueId],
      );
      if (!venue.rows[0]) return undefined;
      const saved = await client.query<{
        id: string;
        start_at: Date;
        end_at: Date;
        reason: string;
      }>(
        `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason)
         VALUES ($1, $2, $3, 'blocked', $4) RETURNING id, start_at, end_at, reason`,
        [venueId, input.start, input.end, input.reason],
      );
      const affected = await client.query<BookingRow & { event_id: string }>(
        `SELECT b.id, b.event_id, b.venue_id, e.event_name, b.start_at, b.end_at, b.status,
           b.hold_expires_at
         FROM venue_bookings b JOIN events e ON e.id = b.event_id
         JOIN venues v ON v.id = b.venue_id
         WHERE b.venue_id = $1::uuid
           AND b.end_at + make_interval(mins => v.turnaround_time_minutes) > $3::timestamptz
           AND (b.status = 'approved' OR
             (b.status = 'pending' AND b.hold_expires_at > $3::timestamptz))
           AND b.start_at - make_interval(mins => v.setup_time_minutes) < $2::timestamptz
           AND b.end_at + make_interval(mins => v.turnaround_time_minutes) > $4::timestamptz
         ORDER BY b.start_at, b.id`,
        [venueId, input.end, now, input.start],
      );
      const row = saved.rows[0];
      return {
        period: {
          id: row.id,
          start: row.start_at.toISOString(),
          end: row.end_at.toISOString(),
          reason: row.reason,
        },
        affectedBookings: affected.rows
          .filter(
            (booking) =>
              booking.status === 'approved' ||
              (booking.hold_expires_at !== null &&
                booking.hold_expires_at !== undefined &&
                booking.hold_expires_at.getTime() > now.getTime()),
          )
          .map((booking): AffectedVenueReservation => {
            const affectedBooking = {
              id: booking.id,
              eventId: booking.event_id,
              eventName: booking.event_name,
              start: booking.start_at.toISOString(),
              end: booking.end_at.toISOString(),
              affectedByUnavailablePeriod: true as const,
            };
            return booking.status === 'approved'
              ? { ...affectedBooking, status: 'booked' }
              : {
                  ...affectedBooking,
                  status: 'tentative',
                  holdExpiresAt: booking.hold_expires_at!.toISOString(),
                };
          }),
      };
    });
  }

  /** Shorten only the selected active blockout; retain every other period. */
  async endUnavailable(
    venueId: string,
    periodId: string,
  ): Promise<VenueUnavailablePeriod | undefined> {
    const now = this.clock.now();
    const result = await this.database.query<{
      id: string;
      start_at: Date;
      end_at: Date;
      reason: string;
    }>(
      `UPDATE venue_bookings SET end_at = $3::timestamptz
       WHERE id = $2::uuid AND venue_id = $1::uuid AND status = 'blocked'
         AND start_at < $3::timestamptz AND end_at > $3::timestamptz
       RETURNING id, start_at, end_at, reason`,
      [venueId, periodId, now],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          start: row.start_at.toISOString(),
          end: row.end_at.toISOString(),
          reason: row.reason,
        }
      : undefined;
  }

  /**
   * Translates database field names to the venue API contract.
   *
   * @param row - Persisted venue row and resolved accessibility labels.
   * @returns A catalogue-ready venue record.
   */
  private toRecord(row: VenueRow): VenueRecord {
    return {
      id: row.id,
      name: row.name,
      location: row.location,
      capacity: row.capacity,
      facilities: row.facilities,
      accessibility: row.accessibility,
      layouts: row.layouts,
      operatingInformation: row.operating_information,
      setupTimeMinutes: row.setup_time_minutes,
      turnaroundTimeMinutes: row.turnaround_time_minutes,
      ...(row.image_name &&
      row.image_type &&
      row.image_size &&
      row.image_data_url
        ? {
            image: {
              name: row.image_name,
              type: row.image_type,
              size: row.image_size,
              dataUrl: row.image_data_url,
            },
          }
        : {}),
    };
  }

  private toReadRecord(row: VenueRow): VenueReadRecord {
    return {
      ...this.toRecord(row),
      availabilityStatus: 'available',
      unavailablePeriods: [],
      reservations: [],
    };
  }

  private async withSchedules(
    venues: VenueReadRecord[],
  ): Promise<VenueReadRecord[]> {
    if (!venues.length) return venues;
    const ids = venues.map((venue) => venue.id);
    const now = this.clock.now();
    const [periods, bookings] = await Promise.all([
      this.database.query<UnavailableRow>(
        `SELECT id, venue_id, start_at, end_at, reason,
           start_at <= $2::timestamptz AND end_at > $2::timestamptz AS current
         FROM venue_bookings
         WHERE venue_id = ANY($1::uuid[]) AND status = 'blocked' AND end_at > $2::timestamptz
         ORDER BY start_at, id`,
        [ids, now],
      ),
      this.database.query<BookingRow>(
        `SELECT b.id, b.venue_id, e.event_name, b.start_at, b.end_at, b.status, b.hold_expires_at,
         b.start_at - make_interval(mins => v.setup_time_minutes) <= $2::timestamptz
           AND b.end_at + make_interval(mins => v.turnaround_time_minutes) > $2::timestamptz AS current,
         EXISTS (
           SELECT 1 FROM venue_bookings blockout
           WHERE blockout.venue_id = b.venue_id
             AND blockout.status = 'blocked'
             AND blockout.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)
             AND blockout.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)
         ) AS affected
       FROM venue_bookings b
       JOIN events e ON e.id = b.event_id
       JOIN venues v ON v.id = b.venue_id
       WHERE b.venue_id = ANY($1::uuid[])
         AND b.end_at + make_interval(mins => v.turnaround_time_minutes) > $2::timestamptz
         AND (b.status = 'approved' OR
           (b.status = 'pending' AND b.hold_expires_at > $2::timestamptz))
         ORDER BY b.start_at, b.id`,
        [ids, now],
      ),
    ]);
    const byId = new Map(venues.map((venue) => [venue.id, venue]));
    for (const row of periods.rows) {
      const venue = byId.get(row.venue_id);
      if (!venue) continue;
      venue.unavailablePeriods.push({
        id: row.id,
        start: row.start_at.toISOString(),
        end: row.end_at.toISOString(),
        reason: row.reason,
        current: row.current,
      });
      if (row.current) venue.availabilityStatus = 'unavailable';
    }
    for (const row of bookings.rows) {
      const venue = byId.get(row.venue_id);
      if (!venue) continue;
      if (
        row.status === 'pending' &&
        (!row.hold_expires_at || row.hold_expires_at.getTime() <= now.getTime())
      )
        continue;
      const reservation = {
        id: row.id,
        eventName: row.event_name,
        start: row.start_at.toISOString(),
        end: row.end_at.toISOString(),
        affectedByUnavailablePeriod: row.affected,
      };
      if (row.status === 'approved') {
        venue.reservations.push({ ...reservation, status: 'booked' });
      } else {
        venue.reservations.push({
          ...reservation,
          status: 'tentative',
          holdExpiresAt: row.hold_expires_at!.toISOString(),
        });
      }
      if (row.current && row.status === 'approved')
        venue.availabilityStatus = 'unavailable';
    }
    return venues;
  }

  private async insertVenue(
    client: Queryable,
    ownerUserId: string,
    venue: VenueInput,
  ) {
    const result = await client.query(
      'INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [
        ownerUserId,
        venue.name,
        venue.location,
        venue.capacity,
        venue.operatingInformation,
        venue.setupTimeMinutes,
        venue.turnaroundTimeMinutes,
      ],
    );
    return result.rows[0];
  }

  private async insertAccessibility(
    client: Queryable,
    venueId: string,
    accessibility: string[],
  ) {
    await client.query(
      'INSERT INTO venue_accessibility (venue_id, accessibility_id) SELECT $1, unnest($2::varchar[])',
      [
        venueId,
        accessibility.map(
          (label) =>
            accessibilityOptions.find((option) => option.label === label)!.id,
        ),
      ],
    );
  }

  private async insertFacilities(
    client: Queryable,
    venueId: string,
    facilities: string[],
  ) {
    await client.query(
      'INSERT INTO venue_facilities (venue_id, facility_id) SELECT $1, id FROM facilities WHERE name = ANY($2::text[])',
      [venueId, facilities],
    );
  }

  private async insertLayouts(
    client: Queryable,
    venueId: string,
    layouts: string[],
  ) {
    await client.query(
      'INSERT INTO venue_layouts (venue_id, layout_id) SELECT $1, id FROM room_layouts WHERE name = ANY($2::text[])',
      [venueId, layouts],
    );
  }

  private async insertImage(
    client: Queryable,
    venueId: string,
    image: VenueImageInput,
  ) {
    await client.query(
      'INSERT INTO venue_images (venue_id, file_name, mime_type, byte_size, data_url) VALUES ($1,$2,$3,$4,$5)',
      [venueId, image.name, image.type, image.size, image.dataUrl],
    );
  }
}
