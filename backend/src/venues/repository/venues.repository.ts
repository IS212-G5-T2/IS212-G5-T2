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
import type { TentativeHoldRequestInput } from '../availability/dto/tentative-hold-request.js';

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
  | (VenueReservationBase & { status: 'tentative'; holdExpiresAt?: string });

export type AffectedVenueReservation = VenueReservation & { eventId: string };

/** A pending venue request shown to the venue's Venue Staff for review (SPM-55). */
export interface PendingVenueBooking {
  id: string;
  eventId: string;
  eventName: string;
  eventStart: string;
  eventEnd: string;
  coordinatorName: string;
  venueName: string;
  bookingReference: string;
  specialRequest?: string;
  start: string;
  end: string;
  status: 'pending' | 'approved' | 'rejected';
  requestKind: 'booking' | 'tentative_hold';
  holdExpiresAt?: string;
  holdExpired: boolean;
  rejectionReason?: string;
  reassessmentRequired?: boolean;
}

/** The booking state after an approve or reject decision (SPM-55). */
export interface VenueBookingDecision {
  id: string;
  eventId: string;
  venueId: string;
  status: 'approved' | 'rejected';
  start: string;
  end: string;
  rejectionReason?: string;
  bookingReference: string;
  requestKind?: 'booking' | 'tentative_hold';
  holdExpiresAt?: string;
}

export type VenueBookingDecisionResult =
  | { kind: 'not-found' }
  | { kind: 'already-decided'; status: string }
  | { kind: 'conflict'; reason: string; conflicts: VenueBookingConflict[] }
  | { kind: 'decided'; booking: VenueBookingDecision };

/** An occupied venue interval that prevents a pending booking from being approved. */
export interface VenueBookingConflict {
  id: string;
  reason: string;
  kind: 'booking' | 'unavailable';
  start: string;
  end: string;
  occupiedStart: string;
  occupiedEnd: string;
  status?: 'approved' | 'pending';
  holdExpiresAt?: string;
}

interface BookingLockRow {
  id: string;
  event_id: string;
  venue_id: string;
  status: string;
  start_at: Date;
  end_at: Date;
  rejection_reason: string | null;
  request_kind?: 'booking' | 'tentative_hold';
  hold_expires_at?: Date | null;
  reassessment_required?: boolean;
  event_start?: Date | null;
}

type BookingDecisionRow = BookingLockRow;

/** Maps a decided booking row to the API shape, deriving the reference the same way the coordinator list does. */
function toDecisionRecord(row: BookingDecisionRow): VenueBookingDecision {
  return {
    id: row.id,
    eventId: row.event_id,
    venueId: row.venue_id,
    status: row.status as 'approved' | 'rejected',
    start: row.start_at.toISOString(),
    end: row.end_at.toISOString(),
    rejectionReason: row.rejection_reason ?? undefined,
    bookingReference: `VB-${row.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    requestKind: row.request_kind,
    holdExpiresAt: row.hold_expires_at?.toISOString(),
  };
}

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
  request_kind?: 'booking' | 'tentative_hold';
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
      venue_staff_name: string;
      start_at: Date;
      end_at: Date;
      status: string;
      request_kind: 'booking' | 'tentative_hold';
      hold_expires_at: Date | null;
      special_request: string | null;
      created_at: Date;
      affected: boolean;
      booking_reference: string;
      rejection_reason: string | null;
    }>(
      `SELECT b.id, b.event_id, e.event_name, b.venue_id, v.name AS venue_name,
              u.display_name AS venue_staff_name,
              b.start_at, b.end_at, b.status, b.request_kind, b.hold_expires_at,
              b.special_request, b.created_at,
              b.rejection_reason,
              'VB-' || upper(substr(replace(b.id::text, '-', ''), 1, 8)) AS booking_reference,
              EXISTS (SELECT 1 FROM venue_bookings blockout
                WHERE blockout.venue_id = b.venue_id AND blockout.status = 'blocked'
                  AND blockout.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)
                  AND blockout.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)) AS affected
         FROM venue_bookings b
         JOIN events e ON e.id = b.event_id
         JOIN venues v ON v.id = b.venue_id
         JOIN users u ON u.id = v.owner_user_id
        WHERE e.coordinator_id = $1::text AND b.status <> 'blocked'
        ORDER BY b.created_at DESC, b.id`,
      [coordinatorId],
    );
    const now = this.clock.now();
    return result.rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      eventName: row.event_name,
      venueId: row.venue_id,
      venueName: row.venue_name,
      venueStaffName: row.venue_staff_name,
      start: row.start_at.toISOString(),
      end: row.end_at.toISOString(),
      status: row.status,
      requestKind: row.request_kind,
      holdExpiresAt: row.hold_expires_at?.toISOString(),
      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,
      bookingReference: row.booking_reference,
      specialRequest: row.special_request ?? undefined,
      affected: row.affected,
      rejectionReason: row.rejection_reason ?? undefined,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /** SPM-55 AC1: lists pending requests for venues the Venue Staff member owns, soonest event first. */
  async listPendingVenueBookings(
    staffId: string,
  ): Promise<PendingVenueBooking[]> {
    const result = await this.database.query<{
      id: string;
      event_id: string;
      event_name: string;
      event_start: Date;
      event_end: Date;
      coordinator_name: string;
      venue_name: string;
      booking_reference: string;
      special_request: string | null;
      start_at: Date;
      end_at: Date;
      status: 'pending' | 'approved' | 'rejected';
      request_kind: 'booking' | 'tentative_hold';
      hold_expires_at: Date | null;
      rejection_reason: string | null;
      reassessment_required: boolean;
    }>(
      `SELECT b.id, b.event_id, e.event_name, e.start_date_time AS event_start,
              e.end_date_time AS event_end, coordinator_user.display_name AS coordinator_name,
              v.name AS venue_name,
              'VB-' || upper(substr(replace(b.id::text, '-', ''), 1, 8)) AS booking_reference,
              b.special_request, b.start_at, b.end_at, b.status, b.rejection_reason,
              b.request_kind, b.hold_expires_at,
              b.reassessment_required
         FROM venue_bookings b
         JOIN venues v ON v.id = b.venue_id
         JOIN events e ON e.id = b.event_id
         JOIN users coordinator_user ON coordinator_user.id::text = e.coordinator_id
        WHERE v.owner_user_id::text = $1::text AND b.status IN ('pending', 'approved', 'rejected')
        ORDER BY b.start_at ASC, b.id`,
      [staffId],
    );
    const now = this.clock.now();
    return result.rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      eventName: row.event_name,
      eventStart: row.event_start.toISOString(),
      eventEnd: row.event_end.toISOString(),
      coordinatorName: row.coordinator_name,
      venueName: row.venue_name,
      bookingReference: row.booking_reference,
      specialRequest: row.special_request ?? undefined,
      start: row.start_at.toISOString(),
      end: row.end_at.toISOString(),
      status: row.status,
      requestKind: row.request_kind,
      holdExpiresAt: row.hold_expires_at?.toISOString(),
      holdExpired: row.request_kind === 'tentative_hold' && row.hold_expires_at != null && row.hold_expires_at <= now,
      rejectionReason: row.rejection_reason ?? undefined,
      reassessmentRequired: row.reassessment_required,
    }));
  }

  /**
   * SPM-55 AC2 / SPM-56: approves a pending request for an owned venue. The venue row lock
   * serialises decisions; the approval re-check returns every conflict with its occupied window.
   */
  async approveVenueBooking(
    staffId: string,
    bookingId: string,
  ): Promise<VenueBookingDecisionResult> {
    return this.database.transaction(async (client) => {
      const locked = await this.lockOwnedBooking(client, staffId, bookingId);
      if (!locked) return { kind: 'not-found' as const };
      const { booking, setupMinutes, turnaroundMinutes } = locked;
      if (booking.status !== 'pending')
        return { kind: 'already-decided' as const, status: booking.status };
      // SPM-159: Venue Staff recheck eligibility and conflicts on every hold approval, so the
      // 336-hour lead time is evaluated at the approval instant, not only after a setup change.
      if (booking.request_kind === 'tentative_hold') {
        const leadHours = booking.event_start
          ? (booking.event_start.getTime() - setupMinutes * 60_000 - this.clock.now().getTime()) / 3_600_000
          : Number.NEGATIVE_INFINITY;
        if (leadHours < 336)
          return {
            kind: 'conflict' as const,
            reason: booking.reassessment_required
              ? 'The venue setup change makes this request fail the 336-hour lead-time rule.'
              : 'The event is now inside the 336-hour lead-time minimum for a tentative hold.',
          };
      }

      const conflict = await client.query<{
        id: string;
        reason: string;
        kind: 'booking' | 'unavailable';
        start_at: Date;
        end_at: Date;
        occupied_start: Date;
        occupied_end: Date;
        status: 'approved' | 'pending' | null;
        hold_expires_at: Date | null;
      }>(
        `SELECT id, reason, kind, start_at, end_at, occupied_start, occupied_end,
                status, hold_expires_at
           FROM (
           SELECT id, COALESCE(reason, 'Venue unavailable') AS reason,
                  'unavailable'::text AS kind, start_at, end_at,
                  start_at AS occupied_start, end_at AS occupied_end,
                  NULL::text AS status, NULL::timestamptz AS hold_expires_at
             FROM venue_bookings
            WHERE venue_id = $1::uuid AND status = 'blocked'
              AND start_at < $3::timestamptz + make_interval(mins => $5::int)
              AND end_at > $2::timestamptz - make_interval(mins => $4::int)
           UNION ALL
           SELECT b.id, COALESCE(e.event_name, 'Existing venue booking') AS reason,
                  'booking'::text AS kind, b.start_at, b.end_at,
                  b.start_at - make_interval(mins => $4::int) AS occupied_start,
                  b.end_at + make_interval(mins => $5::int) AS occupied_end,
                  b.status, b.hold_expires_at
             FROM venue_bookings b
             LEFT JOIN events e ON e.id = b.event_id
            WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid
              AND ((b.status = 'approved' AND
                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL
                  OR b.hold_expires_at > $7::timestamptz)) OR
                (b.status = 'pending' AND
                  (b.hold_expires_at > $7::timestamptz OR
                   (b.request_kind <> 'tentative_hold' AND EXISTS (
                    SELECT 1 FROM venue_booking_requests r
                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id
                   )))))
              AND b.start_at - make_interval(mins => $4::int)
                    < $3::timestamptz + make_interval(mins => $5::int)
              AND b.end_at + make_interval(mins => $5::int)
                    > $2::timestamptz - make_interval(mins => $4::int)
         ) conflicts
          ORDER BY occupied_start, occupied_end, id`,
        [
          booking.venue_id,
          booking.start_at,
          booking.end_at,
          setupMinutes,
          turnaroundMinutes,
          bookingId,
          this.clock.now(),
        ],
      );
      if (conflict.rows.length)
        return {
          kind: 'conflict' as const,
          reason: conflict.rows[0].reason,
          conflicts: conflict.rows.map((row) => ({
            id: row.id,
            reason: row.reason,
            kind: row.kind,
            start: row.start_at.toISOString(),
            end: row.end_at.toISOString(),
            occupiedStart: row.occupied_start.toISOString(),
            occupiedEnd: row.occupied_end.toISOString(),
            ...(row.status ? { status: row.status } : {}),
            ...(row.hold_expires_at
              ? { holdExpiresAt: row.hold_expires_at.toISOString() }
              : {}),
          })),
        };

      const updated = await client.query<BookingDecisionRow>(
        `UPDATE venue_bookings
            SET status = 'approved',
                reassessment_required = false,
                hold_expires_at = CASE
                  WHEN request_kind = 'tentative_hold' THEN $2::timestamptz
                  ELSE hold_expires_at
                END
          WHERE id = $1::uuid
          RETURNING id, event_id, venue_id, status, start_at, end_at, rejection_reason,
                    request_kind, hold_expires_at`,
        [
          bookingId,
          new Date(this.clock.now().getTime() + 14 * 24 * 60 * 60 * 1000),
        ],
      );
      await client.query(
        `INSERT INTO booking_review_log (booking_id, actor_user_id, action)
         VALUES ($1::uuid, $2::uuid, 'approved')`,
        [bookingId, staffId],
      );
      return {
        kind: 'decided' as const,
        booking: toDecisionRecord(updated.rows[0]),
      };
    });
  }

  /** SPM-55 AC3, AC5: rejects a pending request for an owned venue and stores the required reason. */
  async rejectVenueBooking(
    staffId: string,
    bookingId: string,
    reason: string,
  ): Promise<VenueBookingDecisionResult> {
    return this.database.transaction(async (client) => {
      const locked = await this.lockOwnedBooking(client, staffId, bookingId);
      if (!locked) return { kind: 'not-found' as const };
      if (locked.booking.status !== 'pending')
        return {
          kind: 'already-decided' as const,
          status: locked.booking.status,
        };

      const updated = await client.query<BookingDecisionRow>(
        `UPDATE venue_bookings SET status = 'rejected', rejection_reason = $2
          WHERE id = $1::uuid
          RETURNING id, event_id, venue_id, status, start_at, end_at, rejection_reason,
                    request_kind, hold_expires_at`,
        [bookingId, reason],
      );
      await client.query(
        `INSERT INTO booking_review_log (booking_id, actor_user_id, action, reason)
         VALUES ($1::uuid, $2::uuid, 'rejected', $3)`,
        [bookingId, staffId, reason],
      );
      return {
        kind: 'decided' as const,
        booking: toDecisionRecord(updated.rows[0]),
      };
    });
  }

  /**
   * Locks the venue, then the booking, and returns them only when the booking's venue belongs to the staff member.
   * Locking the venue first matches submission, so approvals for one venue run one at a time.
   */
  private async lockOwnedBooking(
    client: Queryable,
    staffId: string,
    bookingId: string,
  ) {
    const owned = await client.query<{ venue_id: string }>(
      `SELECT b.venue_id FROM venue_bookings b
         JOIN venues v ON v.id = b.venue_id
        WHERE b.id = $1::uuid AND v.owner_user_id::text = $2::text`,
      [bookingId, staffId],
    );
    const venueId = owned.rows[0]?.venue_id;
    if (!venueId) return undefined;
    const venue = await client.query<{
      setup_time_minutes: number;
      turnaround_time_minutes: number;
    }>(
      `SELECT setup_time_minutes, turnaround_time_minutes FROM venues
        WHERE id = $1::uuid FOR UPDATE`,
      [venueId],
    );
    const booking = await client.query<BookingLockRow>(
      `SELECT b.id, b.event_id, b.venue_id, b.status, b.start_at, b.end_at,
              b.rejection_reason, b.request_kind, b.reassessment_required,
              e.start_date_time AS event_start
         FROM venue_bookings b LEFT JOIN events e ON e.id = b.event_id
        WHERE b.id = $1::uuid FOR UPDATE OF b`,
      [bookingId],
    );
    const row = booking.rows[0];
    const venueRow = venue.rows[0];
    if (!row || !venueRow) return undefined;
    return {
      booking: row,
      setupMinutes: venueRow.setup_time_minutes,
      turnaroundMinutes: venueRow.turnaround_time_minutes,
    };
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
            AND (status = 'pending' OR (status = 'approved' AND
              (request_kind <> 'tentative_hold' OR hold_expires_at IS NULL OR hold_expires_at > $3::timestamptz)))
          ORDER BY created_at DESC, id LIMIT 1`,
        [input.eventId, venueId, this.clock.now()],
      );
      if (activeRequest.rows[0])
        return {
          kind: 'already-requested',
          id: activeRequest.rows[0].id,
          status: activeRequest.rows[0].status,
        };

      // SPM-54 AC2: booking requests remain blockers without hold expiry; standalone Venue Staff holds block only until expiry. SPM-148 PLAN-STATUS-01-C, 01-BND: conflicts are checked before any write; an adjacent booking (end == start) does not conflict.
      // Only standalone pending holds need an expiry here; event-linked pending booking requests also block below.
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
              AND ((b.status = 'approved' AND
                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL
                  OR b.hold_expires_at > $6::timestamptz)) OR
                (b.status = 'pending' AND
                  (b.hold_expires_at > $6::timestamptz OR
                   (b.request_kind <> 'tentative_hold' AND EXISTS (
                    SELECT 1 FROM venue_booking_requests r
                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id
                   )))))
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
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, special_request)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, 'pending', $5)
         RETURNING id, start_at, end_at`,
        [
          venueId,
          input.eventId,
          eventRow.start_date_time,
          eventRow.end_date_time,
          input.specialRequest ?? null,
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

  /** Records an assigned Coordinator's tentative hold request from persisted event times. */
  async submitTentativeHoldRequest(
    venueId: string,
    coordinatorId: string,
    input: TentativeHoldRequestInput,
  ): Promise<
    | { kind: 'venue-not-found' }
    | { kind: 'event-not-assigned' }
    | { kind: 'event-not-open'; status: string }
    | { kind: 'already-requested'; status: string }
    | { kind: 'lead-time' }
    | { kind: 'configuration-unavailable' }
    | { kind: 'conflict'; reason: string }
    | { kind: 'created'; id: string; start: string; end: string; specialRequest?: string }
  > {
    return this.database.transaction(async (client) => {
      const venue = await client.query<{
        id: string;
        setup_time_minutes: number | null;
        turnaround_time_minutes: number | null;
      }>(
        `SELECT id, setup_time_minutes, turnaround_time_minutes
           FROM venues WHERE id = $1::uuid FOR UPDATE`,
        [venueId],
      );
      const venueRow = venue.rows[0];
      if (!venueRow) return { kind: 'venue-not-found' as const };
      if (
        venueRow.setup_time_minutes === null ||
        venueRow.turnaround_time_minutes === null
      )
        return { kind: 'configuration-unavailable' as const };

      const event = await client.query<{
        id: string;
        status: string;
        start_date_time: Date;
        end_date_time: Date;
      }>(
        `SELECT id, status, start_date_time, end_date_time
           FROM events WHERE id = $1::uuid AND coordinator_id = $2::text FOR UPDATE`,
        [input.eventId, coordinatorId],
      );
      const eventRow = event.rows[0];
      if (!eventRow) return { kind: 'event-not-assigned' as const };
      if (!(BOOKING_OPEN_STATUSES as readonly string[]).includes(eventRow.status))
        return { kind: 'event-not-open' as const, status: eventRow.status };

      const occupiedStart =
        eventRow.start_date_time.getTime() -
        venueRow.setup_time_minutes * 60_000;
      if (occupiedStart - this.clock.now().getTime() < 336 * 60 * 60_000)
        return { kind: 'lead-time' as const };

      const activeRequest = await client.query<{ status: string }>(
        `SELECT status FROM venue_bookings
          WHERE event_id = $1::uuid AND venue_id = $2::uuid
            AND (status = 'pending' OR
              (status = 'approved' AND
                (request_kind <> 'tentative_hold' OR hold_expires_at IS NULL
                  OR hold_expires_at > $3::timestamptz)))
          ORDER BY created_at DESC, id LIMIT 1`,
        [input.eventId, venueId, this.clock.now()],
      );
      if (activeRequest.rows[0])
        return {
          kind: 'already-requested' as const,
          status: activeRequest.rows[0].status,
        };

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
              AND ((b.status = 'approved' AND
                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL
                  OR b.hold_expires_at > $6::timestamptz)) OR
                (b.status = 'pending' AND b.hold_expires_at > $6::timestamptz))
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
        return { kind: 'conflict' as const, reason: conflict.rows[0].reason };

      const saved = await client.query<{
        id: string;
        start_at: Date;
        end_at: Date;
      }>(
        `INSERT INTO venue_bookings
           (venue_id, event_id, start_at, end_at, status, request_kind, special_request)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz,
                 'pending', 'tentative_hold', $5)
         RETURNING id, start_at, end_at`,
        [venueId, input.eventId, eventRow.start_date_time, eventRow.end_date_time, input.specialRequest ?? null],
      );
      await client.query(
        `INSERT INTO venue_booking_requests (event_id, venue_id)
         VALUES ($1::uuid, $2::uuid)
         ON CONFLICT (event_id, venue_id) DO NOTHING`,
        [input.eventId, venueId],
      );
      await this.moveToPlanning(client, input.eventId, coordinatorId, eventRow.status);
      const row = saved.rows[0];
      return {
        kind: 'created' as const,
        id: row.id,
        start: row.start_at.toISOString(),
        end: row.end_at.toISOString(),
        specialRequest: input.specialRequest,
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
           b.request_kind, b.hold_expires_at
         FROM venue_bookings b JOIN events e ON e.id = b.event_id
         JOIN venues v ON v.id = b.venue_id
         WHERE b.venue_id = $1::uuid
           AND b.end_at + make_interval(mins => v.turnaround_time_minutes) > $3::timestamptz
           AND ((b.status = 'approved' AND b.request_kind <> 'tentative_hold') OR
             (b.status = 'approved' AND b.request_kind = 'tentative_hold' AND
               (b.hold_expires_at IS NULL OR b.hold_expires_at > $3::timestamptz)) OR
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
              (booking.status === 'approved' &&
                booking.request_kind !== 'tentative_hold') ||
              (booking.status === 'approved' &&
                booking.request_kind === 'tentative_hold' &&
                (booking.hold_expires_at == null ||
                  booking.hold_expires_at.getTime() > now.getTime())) ||
              (booking.status === 'pending' &&
                booking.hold_expires_at != null &&
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
            // SPM-159: an active approved tentative hold is tentative; only a confirmed booking is booked.
            return booking.status === 'approved' &&
              booking.request_kind !== 'tentative_hold'
              ? { ...affectedBooking, status: 'booked' }
              : {
                  ...affectedBooking,
                  status: 'tentative',
                  ...(booking.hold_expires_at
                    ? { holdExpiresAt: booking.hold_expires_at.toISOString() }
                    : {}),
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
        `SELECT b.id, b.venue_id, e.event_name, b.start_at, b.end_at, b.status,
         b.request_kind, b.hold_expires_at,
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
         AND ((b.status = 'approved' AND
              (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL
                OR b.hold_expires_at > $2::timestamptz)) OR
           -- Schedule lists include only pending rows with future expiries; booking-conflict queries retain linked pending bookings.
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
      const activeTentativeHold =
        row.request_kind === 'tentative_hold' &&
        (row.hold_expires_at == null ||
          row.hold_expires_at.getTime() > now.getTime());
      if (row.status === 'approved' && !activeTentativeHold) {
        venue.reservations.push({ ...reservation, status: 'booked' });
      } else {
        venue.reservations.push({
          ...reservation,
          status: 'tentative',
          ...(row.hold_expires_at
            ? { holdExpiresAt: row.hold_expires_at.toISOString() }
            : {}),
        });
      }
      if (row.current && (row.status === 'approved' || activeTentativeHold))
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
