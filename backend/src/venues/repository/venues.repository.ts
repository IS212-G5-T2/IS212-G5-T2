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
import { notifyBookingDecision } from '../review/booking-decision-notice.js';
import { markHoldRemindersRead, notifyHoldLifecycle } from '../review/hold-lifecycle-notice.js';
import type {
  VenueImageInput,
  VenueInput,
} from '../creation/dto/venue-input.js';
import type { UnavailabilityInput } from '../availability/dto/venue-unavailability.js';
import type { BookingRequestInput } from '../availability/dto/booking-request.js';
import type { TentativeHoldRequestInput } from '../availability/dto/tentative-hold-request.js';
import {
  notifyVenueImpact,
  type ImpactedBooking,
} from '../notifications/venue-impact-notifications.js';

/** A persisted, catalogue-ready venue record. */
export interface VenueRecord {
  id: string;
  ownerId: string;
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

/** One booking that now conflicts after a venue timing change (SPM-121 AC8). */
export interface AffectedBooking {
  bookingId: string;
  eventName: string;
  start: string;
  end: string;
  status: 'pending' | 'approved';
  /** SPM-125 AC8/AC9: present (true) when the booking's Event Coordinator was notified of the change. */
  coordinatorNotified?: true;
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

export type AffectedVenueReservation = VenueReservation & {
  eventId: string;
  /** SPM-125 AC6: present (true) when the booking's Event Coordinator was notified of the unavailable period. */
  coordinatorNotified?: true;
  /**
   * SPM-122 AC7 / SPM-125 AC7: the occupied window, the event start minus the venue's setup time through the event end
   * plus its turnaround time (ISO instants). Equal to start and end when the venue has neither.
   */
  occupiedStart: string;
  occupiedEnd: string;
};

/** SPM-125 AC1: one entry of a venue's unavailability history. */
export interface VenueUnavailabilityHistoryEntry {
  id: string;
  periodId: string;
  action: 'created' | 'ended_early';
  start: string;
  end: string;
  /** Only for an early end: the end the period had before. */
  previousEnd?: string;
  reason: string;
  /** The Venue Staff member's display name; null for periods saved before SPM-125 recorded it. */
  changedBy: string | null;
  changedAt: string;
}

/** SPM-125 AC5: one booking or tentative hold in a venue's booking history, whatever its status. */
export interface VenueBookingHistoryEntry {
  id: string;
  bookingReference: string;
  eventId: string;
  eventName: string;
  coordinatorName: string | null;
  start: string;
  end: string;
  status: 'pending' | 'approved' | 'rejected' | 'released' | 'cancelled' | 'expired';
  requestKind: 'booking' | 'tentative_hold';
  holdExpiresAt?: string;
  /** Its occupied period (setup to turnaround) overlaps an unavailable period, current, ended or scheduled. */
  affectedByUnavailablePeriod: boolean;
  requestedAt: string;
}

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
  status: 'pending' | 'approved' | 'rejected' | 'expired';
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
  | { kind: 'event-completed' }
  | { kind: 'decided'; booking: VenueBookingDecision };

/** The result of a Venue Staff conversion or release of one tentative hold (SPM-132). */
export type TentativeHoldActionResult =
  | { kind: 'not-found' }
  | { kind: 'not-active' }
  | { kind: 'expired' }
  | { kind: 'event-completed' }
  | { kind: 'updated'; id: string; status: 'approved' | 'released'; requestKind: 'booking' | 'tentative_hold'; holdExpiresAt?: string };

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
  requestKind?: 'booking' | 'tentative_hold';
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
  event_status?: string | null;
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
  'ownerId' | 'operatingInformation' | 'setupTimeMinutes' | 'turnaroundTimeMinutes'
> & {
  owner_user_id: string;
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

/** A booking listed by SPM-121 AC8 or AC9, with what SPM-125 needs to notify its event's Coordinator. */
interface ListedBookingRow {
  id: string;
  event_name: string;
  start_at: Date;
  end_at: Date;
  status: 'pending' | 'approved';
  event_id: string;
  coordinator_id: string | null;
  /**
   * SPM-125 AC9: false when the listed row no longer holds the venue (an expired tentative hold, or a pending row
   * that is neither an active hold nor a booking request). The AC8 query lists only rows that do, so it omits this.
   */
  holds_venue?: boolean;
}

/**
 * SPM-125 AC8/AC9: only bookings that have not ended can still be rearranged, and only rows that still hold the
 * venue are bookings to rearrange, so only they are notified.
 */
function upcomingImpacted(rows: ListedBookingRow[], now: Date): ImpactedBooking[] {
  return rows
    .filter((row) => row.end_at.getTime() > now.getTime() && row.holds_venue !== false)
    .map((row) => ({
      bookingId: row.id,
      eventId: row.event_id,
      eventName: row.event_name,
      coordinatorId: row.coordinator_id,
      start: row.start_at,
      end: row.end_at,
    }));
}

/** The SPM-121 listing shape, marked when SPM-125 notified the booking's Coordinator. */
function toAffectedBooking(row: ListedBookingRow, notified: Set<string>): AffectedBooking {
  return {
    bookingId: row.id,
    eventName: row.event_name,
    start: row.start_at.toISOString(),
    end: row.end_at.toISOString(),
    status: row.status,
    ...(notified.has(row.id) ? { coordinatorNotified: true as const } : {}),
  };
}

const venueSelect = `
  SELECT v.id, v.owner_user_id, v.name, v.location, v.capacity, v.operating_information,
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
      owner_user_id: ownerUserId,
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

  /** SPM-121: updates an owned venue record and returns the new state plus any newly conflicting bookings. */
  async update(
    ownerUserId: string,
    venueId: string,
    input: VenueInput,
  ): Promise<
    | { kind: 'not-found' }
    | { kind: 'forbidden' }
    | { kind: 'updated'; venue: VenueReadRecord; affectedBookings: AffectedBooking[]; capacityBookings: AffectedBooking[] }
  > {
    return this.database.transaction(async (client) => {
      const lock = await client.query<{
        id: string; owner_user_id: string; capacity: number;
        setup_time_minutes: number; turnaround_time_minutes: number;
      }>(
        `SELECT id, owner_user_id, capacity, setup_time_minutes, turnaround_time_minutes
         FROM venues WHERE id = $1::uuid FOR UPDATE`,
        [venueId],
      );
      if (!lock.rows[0]) return { kind: 'not-found' as const };
      if (lock.rows[0].owner_user_id !== ownerUserId)
        return { kind: 'forbidden' as const };
      const capacityChanged = lock.rows[0].capacity !== input.capacity;
      const oldSetup = lock.rows[0].setup_time_minutes;
      const oldTurnaround = lock.rows[0].turnaround_time_minutes;
      const timingChanged = oldSetup !== input.setupTimeMinutes || oldTurnaround !== input.turnaroundTimeMinutes;

      await client.query(
        `UPDATE venues SET name=$2, location=$3, capacity=$4, operating_information=$5,
           setup_time_minutes=$6, turnaround_time_minutes=$7
         WHERE id=$1::uuid`,
        [
          venueId,
          input.name,
          input.location,
          input.capacity,
          input.operatingInformation,
          input.setupTimeMinutes,
          input.turnaroundTimeMinutes,
        ],
      );

      await client.query('DELETE FROM venue_facilities WHERE venue_id=$1::uuid', [venueId]);
      if (input.facilities.length)
        await client.query(
          'INSERT INTO venue_facilities (venue_id, facility_id) SELECT $1, id FROM facilities WHERE name = ANY($2::text[])',
          [venueId, input.facilities],
        );

      await client.query('DELETE FROM venue_layouts WHERE venue_id=$1::uuid', [venueId]);
      if (input.layouts.length)
        await client.query(
          'INSERT INTO venue_layouts (venue_id, layout_id) SELECT $1, id FROM room_layouts WHERE name = ANY($2::text[])',
          [venueId, input.layouts],
        );

      await client.query('DELETE FROM venue_accessibility WHERE venue_id=$1::uuid', [venueId]);
      if (input.accessibility.length)
        await this.insertAccessibility(client, venueId, input.accessibility);

      // Always clear the existing image so removal (no input.image) is persisted.
      await client.query('DELETE FROM venue_images WHERE venue_id=$1::uuid', [venueId]);
      if (input.image) await this.insertImage(client, venueId, input.image);

      // AC8: find eligible bookings that overlap an eligible counterpart under
      // the new timing but did not overlap that same counterpart under the old
      // timing. Eligibility mirrors the SPM-56 approval conflict check: approved
      // bookings with non-expired holds, pending bookings with a future hold or
      // a matching booking request, and unavailability periods (status=blocked).
      const now = this.clock.now();
      const eligibleBooking = `(
        (b.status = 'approved' AND (b.request_kind <> 'tentative_hold'
          OR b.hold_expires_at IS NULL OR b.hold_expires_at > $6::timestamptz))
        OR (b.status = 'pending' AND (b.hold_expires_at > $6::timestamptz
          OR (b.request_kind <> 'tentative_hold' AND EXISTS (
            SELECT 1 FROM venue_booking_requests r
            WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id))))
      )`;
      const eligibleOther = `(
        o.status = 'blocked'
        OR (o.status = 'approved' AND (o.request_kind <> 'tentative_hold'
          OR o.hold_expires_at IS NULL OR o.hold_expires_at > $6::timestamptz))
        OR (o.status = 'pending' AND (o.hold_expires_at > $6::timestamptz
          OR (o.request_kind <> 'tentative_hold' AND EXISTS (
            SELECT 1 FROM venue_booking_requests r
            WHERE r.event_id = o.event_id AND r.venue_id = o.venue_id))))
      )`;
      const setupExpr = (p: string, col: string) =>
        `CASE WHEN ${col}.status = 'blocked' THEN interval '0' ELSE make_interval(mins => ${p}::int) END`;
      const affected = timingChanged
        ? await client.query<ListedBookingRow>(
            `SELECT DISTINCT b.id, e.event_name, b.start_at, b.end_at, b.status,
                    b.event_id, e.coordinator_id
               FROM venue_bookings b
               JOIN events e ON e.id = b.event_id
               JOIN venue_bookings o ON o.venue_id = b.venue_id AND o.id <> b.id
              WHERE b.venue_id = $1::uuid
                AND ${eligibleBooking}
                AND ${eligibleOther}
                -- overlaps under new timing
                AND o.start_at - ${setupExpr('$2', 'o')} < b.end_at + make_interval(mins => $3::int)
                AND o.end_at + CASE WHEN o.status = 'blocked' THEN interval '0' ELSE make_interval(mins => $3::int) END
                      > b.start_at - make_interval(mins => $2::int)
                -- did not overlap under old timing
                AND NOT (
                  o.start_at - ${setupExpr('$4', 'o')} < b.end_at + make_interval(mins => $5::int)
                  AND o.end_at + CASE WHEN o.status = 'blocked' THEN interval '0' ELSE make_interval(mins => $5::int) END
                        > b.start_at - make_interval(mins => $4::int)
                )
              ORDER BY b.start_at, b.id`,
            [venueId, input.setupTimeMinutes, input.turnaroundTimeMinutes,
             oldSetup, oldTurnaround, now],
          )
        : { rows: [] as ListedBookingRow[] };

      // AC9: when capacity changed, list all pending/approved bookings at this venue.
      const capacityRows = capacityChanged
        ? await client.query<ListedBookingRow>(
            `SELECT b.id, e.event_name, b.start_at, b.end_at, b.status,
                    b.event_id, e.coordinator_id,
                    -- SPM-125 AC9: whether the row still holds the venue (the AC8 eligibility rule), for notifying.
                    ${eligibleBooking.replaceAll('$6', '$2')} AS holds_venue
               FROM venue_bookings b
               JOIN events e ON e.id = b.event_id
              WHERE b.venue_id = $1::uuid
                AND b.status IN ('pending', 'approved')
              ORDER BY b.start_at, b.id`,
            [venueId, now],
          )
        : { rows: [] as ListedBookingRow[] };

      const updated = await client.query<VenueRow>(
        `${venueSelect} WHERE v.id = $1::uuid`,
        [venueId],
      );
      if (!updated.rows[0]) return { kind: 'not-found' as const };

      // SPM-125 AC8/AC9: notify the Coordinators of the listed bookings that have not ended yet, in this
      // transaction, so a failed update never sends a notice. The venue is named as it is after the update.
      const timingNotified = await notifyVenueImpact(client, {
        venueName: input.name,
        change: { kind: 'timing' },
        bookings: upcomingImpacted(affected.rows, now),
      });
      const capacityNotified = await notifyVenueImpact(client, {
        venueName: input.name,
        change: { kind: 'capacity', previousCapacity: lock.rows[0].capacity, capacity: input.capacity },
        bookings: upcomingImpacted(capacityRows.rows, now),
      });

      const venue = (await this.withSchedules([this.toReadRecord(updated.rows[0])]))[0];
      const affectedBookings: AffectedBooking[] = affected.rows.map((r) =>
        toAffectedBooking(r, timingNotified),
      );
      const capacityBookings: AffectedBooking[] = capacityRows.rows.map((r) =>
        toAffectedBooking(r, capacityNotified),
      );
      return { kind: 'updated' as const, venue, affectedBookings, capacityBookings };
    });
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
      holdExpired: row.request_kind === 'tentative_hold' && (row.status === 'expired' || (row.hold_expires_at != null && row.hold_expires_at <= now)),
      bookingReference: row.booking_reference,
      specialRequest: row.special_request ?? undefined,
      affected: row.affected,
      rejectionReason: row.rejection_reason ?? undefined,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /** SPM-55 AC1: lists the requests for venues the Venue Staff member owns, by their stored booking slot, soonest first. */
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
      status: 'pending' | 'approved' | 'rejected' | 'expired';
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
        WHERE v.owner_user_id::text = $1::text AND b.status IN ('pending', 'approved', 'rejected', 'expired')
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
      holdExpired: row.request_kind === 'tentative_hold' && (row.status === 'expired' || (row.hold_expires_at != null && row.hold_expires_at <= now)),
      rejectionReason: row.rejection_reason ?? undefined,
      reassessmentRequired: row.reassessment_required,
    }));
  }

  /**
   * SPM-55 AC2 / SPM-56: approves a pending request for an owned venue. The venue row lock
   * serialises decisions; the approval re-check returns every conflict with its occupied window.
   * E2E-09 [S2]: pending ordinary requests may coexist, so only approved bookings, active holds and
   * unavailable periods block here; the first approval wins and any overlapping pending request is
   * refused (409) when its own approval is attempted.
   */
  async approveVenueBooking(
    staffId: string,
    bookingId: string,
  ): Promise<VenueBookingDecisionResult> {
    return this.database.transaction(async (client) => {
      const locked = await this.lockOwnedBooking(client, staffId, bookingId);
      if (!locked) return { kind: 'not-found' as const };
      const { booking, setupMinutes, turnaroundMinutes } = locked;
      // SPM-153 BR9: a Completed event's venue bookings cannot be approved.
      if (booking.event_status === 'Completed') return { kind: 'event-completed' as const };
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
            conflicts: [],
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
        request_kind: 'booking' | 'tentative_hold' | null;
        hold_expires_at: Date | null;
      }>(
        `SELECT id, reason, kind, start_at, end_at, occupied_start, occupied_end,
                status, request_kind, hold_expires_at
           FROM (
           SELECT id, COALESCE(reason, 'Venue unavailable') AS reason,
                  'unavailable'::text AS kind, start_at, end_at,
                  start_at AS occupied_start, end_at AS occupied_end,
                  NULL::text AS status, NULL::text AS request_kind,
                  NULL::timestamptz AS hold_expires_at
             FROM venue_bookings
            WHERE venue_id = $1::uuid AND status = 'blocked'
              AND start_at < $3::timestamptz + make_interval(mins => $5::int)
              AND end_at > $2::timestamptz - make_interval(mins => $4::int)
           UNION ALL
           SELECT b.id, COALESCE(e.event_name, 'Existing venue booking') AS reason,
                  'booking'::text AS kind, b.start_at, b.end_at,
                  b.start_at - make_interval(mins => $4::int) AS occupied_start,
                  b.end_at + make_interval(mins => $5::int) AS occupied_end,
                  b.status, b.request_kind, b.hold_expires_at
             FROM venue_bookings b
             LEFT JOIN events e ON e.id = b.event_id
            WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid
              AND ((b.status = 'approved' AND
                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL
                  OR b.hold_expires_at > $7::timestamptz)) OR
                (b.status = 'pending' AND b.hold_expires_at > $7::timestamptz))
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
            ...(row.request_kind ? { requestKind: row.request_kind } : {}),
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
      // SPM-137 / SPM-165: the decision tells the event's Coordinator (a booking or a tentative hold notice by request
      // kind), in this transaction.
      await notifyBookingDecision(client, bookingId, 'approved', this.clock.now(), booking.request_kind ?? 'booking');
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
      // SPM-153 BR9: a Completed event's venue bookings cannot be rejected.
      if (locked.booking.event_status === 'Completed') return { kind: 'event-completed' as const };
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
      // SPM-137 / SPM-165: as for an approval, a rejection tells the Coordinator.
      await notifyBookingDecision(client, bookingId, 'rejected', this.clock.now(), locked.booking.request_kind ?? 'booking');
      return {
        kind: 'decided' as const,
        booking: toDecisionRecord(updated.rows[0]),
      };
    });
  }

  /** Converts an active hold to a confirmed booking after checking its authoritative expiry. */
  async convertTentativeHold(staffId: string, bookingId: string): Promise<TentativeHoldActionResult> {
    return this.updateTentativeHold(staffId, bookingId, 'convert');
  }

  /** Releases an active hold immediately and retains its booking history row. */
  async releaseTentativeHold(staffId: string, bookingId: string): Promise<TentativeHoldActionResult> {
    return this.updateTentativeHold(staffId, bookingId, 'release');
  }

  /**
   * Persists elapsed approved holds as expired once; logical expiry remains based on hold_expires_at. SPM-134 AC2: each
   * hold's expired notice is written in the same transaction as its status change, so a hold is never expired without
   * its notice, and the guarded UPDATE gives overlapping runs exactly one winner per hold.
   *
   * The whole batch is one transaction on purpose: one UPDATE claims every elapsed hold and each claimed hold's notice is
   * written before COMMIT, so no hold is ever expired without its notice. The trade-off (accepted, Q-04): if one notice
   * fails, the whole batch rolls back, no hold in it is marked expired, and the scheduler retries the batch on its next
   * tick (the next minute by default).
   */
  async processExpiredTentativeHolds(now: Date = this.clock.now()): Promise<string[]> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ id: string; hold_expires_at: Date }>(
        `UPDATE venue_bookings
            SET status = 'expired', hold_expiry_processed_at = $1::timestamptz
          WHERE request_kind = 'tentative_hold' AND status = 'approved'
            AND hold_expires_at <= $1::timestamptz AND hold_expiry_processed_at IS NULL
          RETURNING id, hold_expires_at`,
        [now],
      );
      // AC4: an expired hold's notice is stamped with the hold's own expiry time, not the processing time.
      for (const row of result.rows) await notifyHoldLifecycle(client, row.id, { event: 'expired', expiresAt: row.hold_expires_at }, row.hold_expires_at);
      return result.rows.map((row) => row.id);
    });
  }

  /**
   * SPM-134 AC1, AC5: sends the 48-hour expiry reminder once per active tentative hold. The conditional UPDATE sets
   * hold_reminder_sent_at only for an approved, unprocessed, not yet reminded hold that has not expired and expires
   * within 48 hours, on an event that is not cancelled, so a released, converted or already expired hold is never
   * reminded and overlapping runs mark each hold once. The reminder is written in the same transaction as the marker.
   */
  async processTentativeHoldReminders(now: Date = this.clock.now()): Promise<string[]> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ id: string; hold_expires_at: Date }>(
        `UPDATE venue_bookings b
            SET hold_reminder_sent_at = $1::timestamptz
           FROM events e
          WHERE e.id = b.event_id AND e.status <> 'Cancelled'
            AND b.request_kind = 'tentative_hold' AND b.status = 'approved'
            AND b.hold_expiry_processed_at IS NULL AND b.hold_reminder_sent_at IS NULL
            AND b.hold_expires_at > $1::timestamptz
            AND b.hold_expires_at <= $1::timestamptz + interval '48 hours'
          RETURNING b.id, b.hold_expires_at`,
        [now],
      );
      for (const row of result.rows) await notifyHoldLifecycle(client, row.id, { event: 'reminder', expiresAt: row.hold_expires_at }, now);
      return result.rows.map((row) => row.id);
    });
  }

  private async updateTentativeHold(
    staffId: string,
    bookingId: string,
    action: 'convert' | 'release',
  ): Promise<TentativeHoldActionResult> {
    return this.database.transaction(async (client) => {
      const locked = await this.lockOwnedBooking(client, staffId, bookingId);
      if (!locked) return { kind: 'not-found' as const };
      const { booking } = locked;
      if (booking.event_status === 'Completed') return { kind: 'event-completed' as const };
      if (booking.status === 'expired' && booking.request_kind === 'tentative_hold')
        return { kind: 'expired' as const };
      if (booking.status !== 'approved' || booking.request_kind !== 'tentative_hold')
        return { kind: 'not-active' as const };

      const now = this.clock.now();
      const expiry = booking.hold_expires_at;
      if (!expiry || expiry.getTime() <= now.getTime())
        return { kind: 'expired' as const };

      if (action === 'convert') {
        const result = await client.query<{ id: string; status: 'approved'; request_kind: 'booking'; hold_expires_at: null }>(
          `UPDATE venue_bookings
              SET request_kind = 'booking', hold_expires_at = NULL
            WHERE id = $1::uuid AND status = 'approved' AND request_kind = 'tentative_hold'
            RETURNING id, status, request_kind, hold_expires_at`,
          [bookingId],
        );
        // SPM-134 AC11 and AC3: the reminders for this hold are read, then the change tells the Coordinator, in this transaction.
        await markHoldRemindersRead(client, bookingId);
        await notifyHoldLifecycle(client, bookingId, { event: 'converted' }, now);
        return { kind: 'updated' as const, id: result.rows[0].id, status: 'approved' as const, requestKind: 'booking' as const };
      }

      const result = await client.query<{ id: string }>(
        `UPDATE venue_bookings SET status = 'released', released_at = $2::timestamptz
          WHERE id = $1::uuid AND status = 'approved' AND request_kind = 'tentative_hold'
          RETURNING id`,
        [bookingId, now],
      );
      await markHoldRemindersRead(client, bookingId);
      await notifyHoldLifecycle(client, bookingId, { event: 'released' }, now);
      return { kind: 'updated' as const, id: result.rows[0].id, status: 'released' as const, requestKind: 'tentative_hold' as const };
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
              b.rejection_reason, b.request_kind, b.hold_expires_at, b.reassessment_required,
              e.start_date_time AS event_start, e.status AS event_status
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
        event_status: string;
      }>(
        `SELECT b.id, b.event_id, b.status, e.status AS event_status FROM venue_bookings b
          JOIN events e ON e.id = b.event_id
         WHERE b.id = $1::uuid AND e.coordinator_id = $2::text
         FOR UPDATE OF b, e`,
        [bookingId, coordinatorId],
      );
      const row = booking.rows[0];
      if (!row) return { kind: 'not-found' as const };
      // SPM-153 BR9: a Completed event's venue bookings cannot be cancelled.
      if (row.event_status === 'Completed') return { kind: 'event-completed' as const };
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

      // SPM-54 AC2: approved bookings, active holds and unavailable periods are the blockers. SPM-148 PLAN-STATUS-01-C, 01-BND: conflicts are checked before any write; an adjacent booking (end == start) does not conflict.
      // E2E-09 [S2]: pending ordinary booking requests do NOT block a new request, so two Coordinators may both
      // request the same window. The race is settled at approval, where approveVenueBooking re-checks against the
      // booking that was approved first and refuses the other with 409 BOOKING_SLOT_CONFLICT.
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

  /**
   * Block a venue without altering existing event bookings or holds.
   * SPM-125 AC1: the saved period and its 'created' history entry (naming the Venue Staff member) are one statement.
   * SPM-125 AC6: the affected bookings' Coordinators are notified in the same transaction.
   */
  async markUnavailable(
    venueId: string,
    input: UnavailabilityInput,
    actorId: string,
  ): Promise<
    | {
        period: VenueUnavailablePeriod;
        affectedBookings: AffectedVenueReservation[];
      }
    | undefined
  > {
    return this.database.transaction(async (client) => {
      const now = this.clock.now();
      const venue = await client.query<{ id: string; name: string }>(
        'SELECT id, name FROM venues WHERE id = $1::uuid FOR UPDATE',
        [venueId],
      );
      if (!venue.rows[0]) return undefined;
      const saved = await client.query<{
        id: string;
        start_at: Date;
        end_at: Date;
        reason: string;
      }>(
        `WITH saved AS (
           INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason)
           VALUES ($1, $2, $3, 'blocked', $4) RETURNING id, venue_id, start_at, end_at, reason
         ), logged AS (
           INSERT INTO venue_unavailability_history
             (venue_id, period_id, action, start_at, end_at, reason, actor_user_id)
           SELECT venue_id, id, 'created', start_at, end_at, reason, $5::uuid FROM saved
         )
         SELECT id, start_at, end_at, reason FROM saved`,
        [venueId, input.start, input.end, input.reason, actorId],
      );
      const affected = await client.query<
        BookingRow & {
          event_id: string;
          coordinator_id: string | null;
          setup_time_minutes: number;
          turnaround_time_minutes: number;
        }
      >(
        `SELECT b.id, b.event_id, b.venue_id, e.event_name, b.start_at, b.end_at, b.status,
           b.request_kind, b.hold_expires_at, e.coordinator_id,
           v.setup_time_minutes, v.turnaround_time_minutes
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
      const affectedRows = affected.rows.filter(
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
          );
      // SPM-125 AC6/AC7: the Coordinators of exactly the bookings SPM-122 AC7 lists are notified.
      const notified = await notifyVenueImpact(client, {
        venueName: venue.rows[0].name,
        change: {
          kind: 'unavailable',
          start: row.start_at,
          end: row.end_at,
          reason: row.reason,
        },
        bookings: affectedRows.map((booking) => ({
          bookingId: booking.id,
          eventId: booking.event_id,
          eventName: booking.event_name,
          coordinatorId: booking.coordinator_id,
          start: booking.start_at,
          end: booking.end_at,
        })),
      });
      return {
        period: {
          id: row.id,
          start: row.start_at.toISOString(),
          end: row.end_at.toISOString(),
          reason: row.reason,
        },
        affectedBookings: affectedRows.map((booking): AffectedVenueReservation => {
            const affectedBooking = {
              id: booking.id,
              eventId: booking.event_id,
              eventName: booking.event_name,
              start: booking.start_at.toISOString(),
              end: booking.end_at.toISOString(),
              // SPM-122 AC7 / SPM-125 AC7: the same buffered window the overlap test above uses.
              occupiedStart: new Date(
                booking.start_at.getTime() - booking.setup_time_minutes * 60_000,
              ).toISOString(),
              occupiedEnd: new Date(
                booking.end_at.getTime() + booking.turnaround_time_minutes * 60_000,
              ).toISOString(),
              affectedByUnavailablePeriod: true as const,
              ...(notified.has(booking.id) ? { coordinatorNotified: true as const } : {}),
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

  /**
   * Shorten only the selected active blockout; retain every other period.
   * SPM-125 AC1: the update and its 'ended_early' history entry (the new end, the end it replaced and the Venue
   * Staff member) are one statement, so neither can exist without the other.
   */
  async endUnavailable(
    venueId: string,
    periodId: string,
    actorId: string,
  ): Promise<VenueUnavailablePeriod | undefined> {
    const now = this.clock.now();
    const result = await this.database.query<{
      id: string;
      start_at: Date;
      end_at: Date;
      reason: string;
    }>(
      `WITH target AS (
         SELECT id, end_at AS previous_end_at FROM venue_bookings
          WHERE id = $2::uuid AND venue_id = $1::uuid AND status = 'blocked'
            AND start_at < $3::timestamptz AND end_at > $3::timestamptz
          FOR UPDATE
       ), ended AS (
         UPDATE venue_bookings b SET end_at = $3::timestamptz
           FROM target WHERE b.id = target.id
         RETURNING b.id, b.venue_id, b.start_at, b.end_at, b.reason, target.previous_end_at
       ), logged AS (
         INSERT INTO venue_unavailability_history
           (venue_id, period_id, action, start_at, end_at, previous_end_at, reason, actor_user_id, created_at)
         SELECT venue_id, id, 'ended_early', start_at, end_at, previous_end_at, reason, $4::uuid, $3::timestamptz
           FROM ended
       )
       SELECT id, start_at, end_at, reason FROM ended`,
      [venueId, periodId, now, actorId],
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
   * SPM-125 AC1: the venue's unavailability history, newest change first, or undefined when the venue does not
   * exist. Read only; nothing in the application updates or deletes history rows.
   */
  async listUnavailabilityHistory(
    venueId: string,
  ): Promise<VenueUnavailabilityHistoryEntry[] | undefined> {
    const venue = await this.database.query('SELECT id FROM venues WHERE id = $1::uuid', [venueId]);
    if (!venue.rows[0]) return undefined;
    const result = await this.database.query<{
      id: string;
      period_id: string;
      action: 'created' | 'ended_early';
      start_at: Date;
      end_at: Date;
      previous_end_at: Date | null;
      reason: string;
      changed_by: string | null;
      created_at: Date;
    }>(
      `SELECT h.id, h.period_id, h.action, h.start_at, h.end_at, h.previous_end_at, h.reason,
              u.display_name AS changed_by, h.created_at
         FROM venue_unavailability_history h
         LEFT JOIN users u ON u.id = h.actor_user_id
        WHERE h.venue_id = $1::uuid
        ORDER BY h.created_at DESC, h.id`,
      [venueId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      periodId: row.period_id,
      action: row.action,
      start: row.start_at.toISOString(),
      end: row.end_at.toISOString(),
      ...(row.previous_end_at ? { previousEnd: row.previous_end_at.toISOString() } : {}),
      reason: row.reason,
      changedBy: row.changed_by,
      changedAt: row.created_at.toISOString(),
    }));
  }

  /**
   * SPM-125 AC5: every booking and tentative hold ever made at the venue (past and future, every status), latest
   * slot first, or undefined when the venue does not exist. Marking the venue unavailable or ending a period early
   * changes none of these rows.
   */
  async listBookingHistory(
    venueId: string,
  ): Promise<VenueBookingHistoryEntry[] | undefined> {
    const venue = await this.database.query('SELECT id FROM venues WHERE id = $1::uuid', [venueId]);
    if (!venue.rows[0]) return undefined;
    const result = await this.database.query<{
      id: string;
      booking_reference: string;
      event_id: string;
      event_name: string;
      coordinator_name: string | null;
      start_at: Date;
      end_at: Date;
      status: VenueBookingHistoryEntry['status'];
      request_kind: 'booking' | 'tentative_hold';
      hold_expires_at: Date | null;
      affected: boolean;
      created_at: Date;
    }>(
      `SELECT b.id, 'VB-' || upper(substr(replace(b.id::text, '-', ''), 1, 8)) AS booking_reference,
              b.event_id, e.event_name, coordinator_user.display_name AS coordinator_name,
              b.start_at, b.end_at, b.status, b.request_kind, b.hold_expires_at, b.created_at,
              EXISTS (SELECT 1 FROM venue_bookings blockout
                WHERE blockout.venue_id = b.venue_id AND blockout.status = 'blocked'
                  AND blockout.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)
                  AND blockout.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)) AS affected
         FROM venue_bookings b
         JOIN events e ON e.id = b.event_id
         JOIN venues v ON v.id = b.venue_id
         LEFT JOIN users coordinator_user ON coordinator_user.id::text = e.coordinator_id
        WHERE b.venue_id = $1::uuid AND b.status <> 'blocked'
        ORDER BY b.start_at DESC, b.id`,
      [venueId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      bookingReference: row.booking_reference,
      eventId: row.event_id,
      eventName: row.event_name,
      coordinatorName: row.coordinator_name,
      start: row.start_at.toISOString(),
      end: row.end_at.toISOString(),
      status: row.status,
      requestKind: row.request_kind,
      ...(row.hold_expires_at ? { holdExpiresAt: row.hold_expires_at.toISOString() } : {}),
      affectedByUnavailablePeriod: row.affected,
      requestedAt: row.created_at.toISOString(),
    }));
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
      ownerId: row.owner_user_id,
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
