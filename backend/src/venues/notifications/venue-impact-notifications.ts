/*
 * SPM-125 AC6 to AC9: the one place that writes the notices sent when a venue change affects existing bookings.
 *
 * The Event Coordinator assigned to each affected booking's event gets one notice per booking
 * (`venue_unavailable_impact`, `venue_timing_impact` or `venue_capacity_impact`), linked to the event and the
 * booking. The bell's link opens that booking on the Coordinator's Bookings page (AC7).
 *
 * The Venue Staff member who made the change gets no notice: the save result they are looking at already lists the
 * affected bookings and marks each one whose Coordinator was notified (decision SC-SPM125-01).
 *
 * Callers pass their open transaction client so the notices commit or roll back with the change itself: a change
 * that fails never produces a notice. Which bookings are affected is decided by the caller (SPM-122 AC7 for
 * unavailability, SPM-121 AC8 and AC9 for venue edits); this module only notifies.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { sgtRange } from '../../common/sgt-time.js';

type Queryable = Pick<pg.PoolClient, 'query'>;

/** The Coordinator notification types written here; each one tells the Coordinator what changed. */
export const VENUE_IMPACT_COORDINATOR_TYPES = [
  'venue_unavailable_impact',
  'venue_timing_impact',
  'venue_capacity_impact',
] as const;

/** One existing booking affected by the change, with its event's currently assigned Coordinator. */
export interface ImpactedBooking {
  bookingId: string;
  eventId: string;
  eventName: string;
  /** The event's assigned Coordinator (`events.coordinator_id`); null when the event has none. */
  coordinatorId: string | null;
  start: Date;
  end: Date;
}

/** What changed at the venue, which decides the wording and the notice type. */
export type VenueImpactChange =
  | { kind: 'unavailable'; start: Date; end: Date; reason: string }
  | { kind: 'timing' }
  | { kind: 'capacity'; previousCapacity: number; capacity: number };

export interface VenueImpactInput {
  venueName: string;
  change: VenueImpactChange;
  bookings: ImpactedBooking[];
}

const TYPE_BY_KIND = {
  unavailable: 'venue_unavailable_impact',
  timing: 'venue_timing_impact',
  capacity: 'venue_capacity_impact',
} as const satisfies Record<
  VenueImpactChange['kind'],
  (typeof VENUE_IMPACT_COORDINATOR_TYPES)[number]
>;

/**
 * The Coordinator's message (AC7 for unavailability: the event name, the venue, the unavailable period and its
 * reason). Times are Singapore wall-clock time.
 */
export function coordinatorMessage(
  venueName: string,
  booking: Pick<ImpactedBooking, 'eventName' | 'start' | 'end'>,
  change: VenueImpactChange,
): string {
  const booked = `your booking for "${booking.eventName}" (${sgtRange(booking.start.getTime(), booking.end.getTime())})`;
  if (change.kind === 'unavailable')
    return `${venueName} is unavailable from ${sgtRange(change.start.getTime(), change.end.getTime())} (reason: ${change.reason}). Alternative arrangements are required for ${booked}.`;
  if (change.kind === 'timing')
    return `The setup or turnaround time of ${venueName} changed, so ${booked} now conflicts with another booking or unavailable period. Review the booking and arrange an alternative if needed.`;
  return `The capacity of ${venueName} changed from ${change.previousCapacity} to ${change.capacity}. Check that ${booked} still suits your expected attendance.`;
}

/**
 * Writes one Coordinator notice per affected booking that has an assigned Coordinator (a booking listed twice is
 * notified once). A booking whose event has no Coordinator is skipped.
 *
 * @returns The ids of the bookings whose Coordinator was notified.
 */
export async function notifyVenueImpact(
  client: Queryable,
  input: VenueImpactInput,
): Promise<Set<string>> {
  const notified = new Set<string>();
  for (const booking of input.bookings) {
    if (!booking.coordinatorId || notified.has(booking.bookingId)) continue;
    await client.query(
      `INSERT INTO notifications
         (id, recipient_id, type, message, related_event_id, related_booking_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        booking.coordinatorId,
        TYPE_BY_KIND[input.change.kind],
        coordinatorMessage(input.venueName, booking, input.change),
        booking.eventId,
        booking.bookingId,
      ],
    );
    notified.add(booking.bookingId);
  }
  return notified;
}
