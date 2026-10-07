import { Inject, Injectable, Optional } from '@nestjs/common';
import type pg from 'pg';
import { DatabaseService } from '../database/database.service.js';
import { CLOCK, systemClock, type Clock } from '../registrations/clock.js';
import { accessibilityOptions } from './accessibility-options.js';
import type { VenueImageInput, VenueInput } from './venue-input.js';

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
  operatingDays: string[];
  operatingStartTime: string;
  operatingEndTime: string;
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
}

export interface VenueReservation {
  id: string;
  eventName: string;
  start: string;
  end: string;
  status: 'booked' | 'tentative';
  affectedByUnavailablePeriod: boolean;
}

type Queryable = Pick<pg.PoolClient, 'query'>;
type VenueRow = Omit<
  VenueRecord,
  | 'operatingInformation'
  | 'operatingDays'
  | 'operatingStartTime'
  | 'operatingEndTime'
  | 'setupTimeMinutes'
  | 'turnaroundTimeMinutes'
> & {
  operating_information: string;
  operating_days: string[];
  operating_start_time: string;
  operating_end_time: string;
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
  current: boolean;
  affected: boolean;
}

/** PostgreSQL serializes `time` columns with seconds; the venue API uses HH:MM. */
function toMinuteTime(value: string): string {
  return value.slice(0, 5);
}

const venueSelect = `
  SELECT v.id, v.name, v.location, v.capacity, v.operating_information,
    v.operating_days, v.operating_start_time, v.operating_end_time,
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
      operatingDays: row.operating_days,
      operatingStartTime: toMinuteTime(row.operating_start_time),
      operatingEndTime: toMinuteTime(row.operating_end_time),
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
           (b.status = 'pending' AND (b.hold_expires_at IS NULL OR b.hold_expires_at > $2::timestamptz)))
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
      });
      if (row.current) venue.availabilityStatus = 'unavailable';
    }
    for (const row of bookings.rows) {
      const venue = byId.get(row.venue_id);
      if (!venue) continue;
      venue.reservations.push({
        id: row.id,
        eventName: row.event_name,
        start: row.start_at.toISOString(),
        end: row.end_at.toISOString(),
        status: row.status === 'approved' ? 'booked' : 'tentative',
        affectedByUnavailablePeriod: row.affected,
      });
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
      'INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, operating_days, operating_start_time, operating_end_time, setup_time_minutes, turnaround_time_minutes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [
        ownerUserId,
        venue.name,
        venue.location,
        venue.capacity,
        venue.operatingInformation,
        venue.operatingDays,
        venue.operatingStartTime,
        venue.operatingEndTime,
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
