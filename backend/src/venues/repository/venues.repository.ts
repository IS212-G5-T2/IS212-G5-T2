import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BOOKING_OPEN_STATUSES, shouldTransitionToPlanning } from '../../events/types/event-status.js';
import type pg from 'pg';
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
  | 'operatingInformation'
  | 'setupTimeMinutes'
  | 'turnaroundTimeMinutes'
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

  /** Atomically rechecks a venue schedule and records an assigned coordinator's request. */
  async submitBookingRequest(
    venueId: string,
    coordinatorId: string,
    input: BookingRequestInput,
  ): Promise<
    | { kind: 'venue-not-found' }
    | { kind: 'event-not-assigned' }
    | { kind: 'event-not-open'; status: string }
    | { kind: 'event-not-eligible' }
    | { kind: 'duplicate-request'; id: string }
    | { kind: 'conflict'; reason: string }
    | { kind: 'unsuitable'; reasons: string[] }
    | { kind: 'created'; id: string; start: string; end: string; eventStatus: string; statusChanged: boolean }
  > {
    return this.database.transaction(async (client) => {
      const venue = await client.query<{
        id: string;
        capacity: number;
        setup_time_minutes: number;
        turnaround_time_minutes: number;
        facilities: string[];
        accessibility: string[];
        layouts: string[];
      }>(
        `SELECT v.id, v.capacity, v.setup_time_minutes, v.turnaround_time_minutes,
          COALESCE((SELECT array_agg(f.name) FROM venue_facilities vf JOIN facilities f ON f.id = vf.facility_id WHERE vf.venue_id = v.id), ARRAY[]::varchar[]) AS facilities,
          COALESCE((SELECT array_agg(a.label) FROM venue_accessibility va JOIN accessibility_features a ON a.id = va.accessibility_id WHERE va.venue_id = v.id), ARRAY[]::varchar[]) AS accessibility,
          COALESCE((SELECT array_agg(l.name) FROM venue_layouts vl JOIN room_layouts l ON l.id = vl.layout_id WHERE vl.venue_id = v.id), ARRAY[]::varchar[]) AS layouts
         FROM venues v WHERE v.id = $1::uuid FOR UPDATE OF v`,
        [venueId],
      );
      const venueRow = venue.rows[0];
      if (!venueRow) return { kind: 'venue-not-found' };

      const event = await client.query<{
        id: string; status: string; expected_attendance: number; preferred_room_layout: string;
        required_facilities: string[]; accessibility_needs: string[];
        start_date_time: Date; end_date_time: Date;
      }>(
        `SELECT id, status, expected_attendance, preferred_room_layout, required_facilities, accessibility_needs,
                start_date_time, end_date_time
         FROM events WHERE id = $1::uuid AND coordinator_id = $2::text FOR UPDATE`,
        [input.eventId, coordinatorId],
      );
      if (!event.rows[0]) return { kind: 'event-not-assigned' };
      const eventRow = event.rows[0];
      if (!(BOOKING_OPEN_STATUSES as readonly string[]).includes(eventRow.status))
        return { kind: 'event-not-open', status: eventRow.status };

      // The pair-keyed request is permanent: terminal booking history still
      // prevents another request for this event and venue, regardless of dates.
      const duplicate = await client.query<{ id: string }>(
        `SELECT b.id
           FROM venue_booking_requests r
           JOIN venue_bookings b ON b.event_id = r.event_id AND b.venue_id = r.venue_id
          WHERE r.event_id = $1::uuid AND r.venue_id = $2::uuid
          ORDER BY b.created_at DESC, b.id DESC
          LIMIT 1`,
        [input.eventId, venueId],
      );
      if (duplicate.rows[0]) return { kind: 'duplicate-request', id: duplicate.rows[0].id };

      const normalize = (items: string[]) => new Set(items.map((item) => item.trim().toLocaleLowerCase()));
      const availableFacilities = normalize(venueRow.facilities);
      const availableAccessibility = normalize(venueRow.accessibility);
      const availableLayouts = normalize(venueRow.layouts);
      const reasons = [
        ...(venueRow.capacity < eventRow.expected_attendance ? [`Capacity ${venueRow.capacity} is below required attendance ${eventRow.expected_attendance}.`] : []),
        ...eventRow.required_facilities.filter((item) => !availableFacilities.has(item.trim().toLocaleLowerCase())).map((item) => `Missing facility: ${item}.`),
        ...eventRow.accessibility_needs.filter((item) => !availableAccessibility.has(item.trim().toLocaleLowerCase())).map((item) => `Missing accessibility feature: ${item}.`),
        ...(eventRow.preferred_room_layout && !availableLayouts.has(eventRow.preferred_room_layout.trim().toLocaleLowerCase()) ? [`Required layout unavailable: ${eventRow.preferred_room_layout}.`] : []),
      ];
      if (reasons.length) return { kind: 'unsuitable', reasons };

      const start = eventRow.start_date_time;
      const end = eventRow.end_date_time;

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
                (b.status = 'pending' AND b.hold_expires_at > $6::timestamptz))
              AND b.start_at - make_interval(mins => $4::int)
                    < $3::timestamptz + make_interval(mins => $5::int)
              AND b.end_at + make_interval(mins => $5::int)
                    > $2::timestamptz - make_interval(mins => $4::int)
         ) conflicts LIMIT 1`,
        [
          venueId,
          start,
          end,
          venueRow.setup_time_minutes,
          venueRow.turnaround_time_minutes,
          this.clock.now(),
        ],
      );
      if (conflict.rows[0])
        return { kind: 'conflict', reason: conflict.rows[0].reason };

      await client.query(
        `INSERT INTO venue_booking_requests (event_id, venue_id, special_request)
         VALUES ($1::uuid, $2::uuid, $3)`,
        [input.eventId, venueId, input.specialRequests ?? null],
      );

      const saved = await client.query<{
        id: string;
        start_at: Date;
        end_at: Date;
      }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, 'pending')
         RETURNING id, start_at, end_at`,
        [venueId, input.eventId, start, end],
      );
      const row = saved.rows[0];
      const statusChanged = await this.moveToPlanning(client, input.eventId, coordinatorId, eventRow.status);
      return { kind: 'created', id: row.id, start: row.start_at.toISOString(), end: row.end_at.toISOString(), eventStatus: statusChanged ? 'Planning' : eventRow.status, statusChanged };
    });
  }

  private async moveToPlanning(client: pg.PoolClient, eventId: string, actorId: string, status: string): Promise<boolean> {
    if (!shouldTransitionToPlanning(status)) return false;
    const now = this.clock.now();
    const moved = await client.query(`UPDATE events SET status = 'Planning', updated_at = $2::timestamptz WHERE id = $1::uuid AND status = 'Approved'`, [eventId, now]);
    if (moved?.rowCount !== 1) return false;
    await client.query(`INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at) VALUES ($1::uuid, $2::uuid, 'Approved', 'Planning', $3::text, $4::timestamptz)`, [randomUUID(), eventId, actorId, now]);
    return true;
  }

  async listCoordinatorBookings(coordinatorId: string) {
    const result = await this.database.query<{
      id: string; event_id: string; event_name: string; venue_id: string; venue_name: string;
      start_at: Date; end_at: Date; status: string; special_request: string | null; created_at: Date;
      affected: boolean;
    }>(`SELECT b.id, b.event_id, e.event_name, b.venue_id, v.name AS venue_name,
          b.start_at, b.end_at, b.status, r.special_request, b.created_at,
          EXISTS (SELECT 1 FROM venue_bookings x WHERE x.venue_id = b.venue_id AND x.status = 'blocked'
            AND x.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)
            AND x.end_at > b.start_at - make_interval(mins => v.setup_time_minutes)) AS affected
        FROM venue_bookings b JOIN events e ON e.id = b.event_id JOIN venues v ON v.id = b.venue_id
        LEFT JOIN venue_booking_requests r ON r.event_id = b.event_id AND r.venue_id = b.venue_id
        WHERE e.coordinator_id = $1::text AND b.status <> 'blocked'
        ORDER BY b.created_at DESC, b.id`, [coordinatorId]);
    return result.rows.map((row) => ({
      id: row.id, eventId: row.event_id, eventName: row.event_name, venueId: row.venue_id,
      venueName: row.venue_name, start: row.start_at.toISOString(), end: row.end_at.toISOString(),
      status: row.status, specialRequests: row.special_request ?? '',
      createdAt: row.created_at.toISOString(), affectedByUnavailablePeriod: row.affected,
      bookingReference: `VB-${row.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    }));
  }

  async cancelCoordinatorBooking(coordinatorId: string, bookingId: string, confirmLastActive = false) {
    return this.database.transaction(async (client) => {
      const current = await client.query<{ event_id: string }>(
        `SELECT b.event_id FROM venue_bookings b JOIN events e ON e.id = b.event_id
          WHERE b.id = $1::uuid AND e.coordinator_id = $2::text AND b.status IN ('pending','approved') FOR UPDATE OF e, b`, [bookingId, coordinatorId]);
      if (!current.rows[0]) return undefined;
      const active = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM venue_bookings WHERE event_id = $1::uuid AND status IN ('pending','approved')`, [current.rows[0].event_id]);
      if (Number(active.rows[0]?.count) === 1 && !confirmLastActive) return { kind: 'confirmation-required' as const };
      const row = await client.query<{ id: string; event_id: string }>(
        `UPDATE venue_bookings b SET status = 'cancelled'
          FROM events e WHERE b.id = $1::uuid AND b.event_id = e.id
            AND e.coordinator_id = $2::text AND b.status IN ('pending','approved')
          RETURNING b.id, b.event_id`, [bookingId, coordinatorId]);
      if (!row.rows[0]) return undefined;
      return { id: row.rows[0].id, eventId: row.rows[0].event_id, hasOtherActiveBookings: Number(active.rows[0]?.count) > 1 };
    });
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
        (!row.hold_expires_at ||
          row.hold_expires_at.getTime() <= now.getTime())
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
