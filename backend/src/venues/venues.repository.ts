import { Injectable } from '@nestjs/common';
import type pg from 'pg';
import { DatabaseService } from '../database/database.service.js';
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

/** PostgreSQL serializes `time` columns with seconds; the venue API uses HH:MM. */
function toMinuteTime(value: string): string {
  return value.slice(0, 5);
}

/* v8 ignore start -- TypeScript decorator metadata emits an unreachable fallback branch. */
@Injectable()
/** Persists a venue and its accessibility selections atomically. */
export class VenuesRepository {
  /* v8 ignore stop */
  constructor(private readonly database: DatabaseService) {}

  /**
   * Inserts one venue and its accessibility selections in one transaction.
   *
   * @param venue - Validated venue details ready for persistence.
   * @returns The saved venue record.
   */
  async create(venue: VenueInput): Promise<VenueRecord> {
    const created = await this.database.transaction(async (client) => {
      const result = await this.insertVenue(client, venue);
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

  private async insertVenue(client: Queryable, venue: VenueInput) {
    const result = await client.query(
      'INSERT INTO venues (name, location, capacity, operating_information, operating_days, operating_start_time, operating_end_time, setup_time_minutes, turnaround_time_minutes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [
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
