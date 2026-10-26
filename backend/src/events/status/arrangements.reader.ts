/*
 * SPM-135 arrangements read model. Reads venue bookings and equipment
 * reservations for one event, and asks the safety-outcome port for the SPM-126
 * outcome. The source tables belong to other stories; the reader only reads them.
 *
 * Fail closed: the safety port answers "no record" until SPM-129 to 131 build a
 * safety source, and "no record" is outstanding (readiness.ts). Tests replace
 * only the port, never the readiness rule.
 */
import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { VENUE_UNAVAILABLE_SQL } from '../venue-unavailable.js';
import type {
  EquipmentFact,
  SafetyFact,
  VenueBookingFact,
} from './readiness.js';

export interface Queryable {
  query<T extends pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>>;
}

export interface ArrangementsSnapshot {
  venueBookings: VenueBookingFact[];
  equipment: EquipmentFact[];
  /** The coordinator confirmed "no equipment needed" (events.equipment_confirmed_at). */
  equipmentNoneConfirmed: boolean;
}

/** SPM-126 safety outcome source (a boundary: the story that owns it is not built). */
export interface SafetyOutcomeSource {
  read(eventId: string): Promise<SafetyFact | undefined>;
}

export const SAFETY_OUTCOME_SOURCE = Symbol('SAFETY_OUTCOME_SOURCE');

/** Production default: no safety record exists yet, so the outcome is outstanding. */
@Injectable()
export class NoSafetyRecordSource implements SafetyOutcomeSource {
  async read(): Promise<SafetyFact | undefined> {
    return undefined;
  }
}

@Injectable()
export class ArrangementsReader {
  constructor(
    @Inject(SAFETY_OUTCOME_SOURCE) private readonly safety: SafetyOutcomeSource,
  ) {}

  /**
   * Reads the arrangements inside the caller's connection. `forUpdate` takes
   * shared row locks so an approval cannot be revoked between the readiness
   * check and the status change (Design: "Read the arrangements inside the same
   * transaction with shared locks").
   */
  async read(
    db: Queryable,
    eventId: string,
    options: { lock: boolean },
  ): Promise<ArrangementsSnapshot> {
    const lock = options.lock ? ' FOR SHARE OF b' : '';
    const bookings = await db.query<{
      id: string;
      venue_name: string;
      status: 'pending' | 'approved' | 'rejected' | 'released' | 'cancelled';
      hold_expires_at: Date | null;
      start_at: Date;
      end_at: Date;
      created_at: Date;
      venue_unavailable: boolean;
    }>(
      `SELECT b.id, v.name AS venue_name, b.status, b.hold_expires_at, b.start_at, b.end_at, b.created_at,
              ${VENUE_UNAVAILABLE_SQL} AS venue_unavailable
         FROM venue_bookings b
         JOIN venues v ON v.id = b.venue_id
        WHERE b.event_id = $1
        ORDER BY b.start_at, b.id${lock}`,
      [eventId],
    );

    const equipment = await db.query<{
      id: string;
      equipment_name: string;
      quantity: number;
      status: string;
      created_at: Date;
    }>(
      `SELECT id, equipment_name, quantity, status, created_at
         FROM equipment_reservations
        WHERE event_id = $1
        ORDER BY id${options.lock ? ' FOR SHARE' : ''}`,
      [eventId],
    );

    const confirmation = await db.query<{
      equipment_confirmed_at: Date | null;
    }>('SELECT equipment_confirmed_at FROM events WHERE id = $1', [eventId]);

    return {
      equipmentNoneConfirmed:
        confirmation.rows[0]?.equipment_confirmed_at != null,
      venueBookings: bookings.rows.map((row) => ({
        id: row.id,
        venueName: row.venue_name,
        status: row.status,
        holdExpiresAt: row.hold_expires_at,
        venueUnavailable: row.venue_unavailable,
        start: row.start_at.toISOString(),
        end: row.end_at.toISOString(),
        requestedAt: row.created_at.toISOString(),
      })),
      equipment: equipment.rows.map((row) => ({
        id: row.id,
        name: row.equipment_name,
        quantity: row.quantity,
        status: row.status,
        requestedAt: row.created_at.toISOString(),
      })),
    };
  }
}
