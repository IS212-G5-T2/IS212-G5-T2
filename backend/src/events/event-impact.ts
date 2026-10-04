/*
 * SPM-85 AC2, AC6, AC7: assesses a proposed event change against each of the
 * event's venue bookings, independently. Pure functions only; see
 * event-impact.spec.ts.
 *
 * Assumptions (also recorded in backend/HANDOVER.md):
 * - A venue booking's required window follows the event's date/time. If the
 *   proposal moves only the start (or only the end), the other edge keeps the
 *   booking's current value.
 * - Setup/turnaround: the venue needs TURNAROUND_MINUTES free between this
 *   booking and any other event's booking at the same venue. A gap of exactly
 *   TURNAROUND_MINUTES is fine; anything shorter (including touching bookings)
 *   is a 'turnaround' conflict; any overlap is an 'overlap' conflict.
 * - Overlap and turnaround are only assessed when the proposal moves the start
 *   or the end; other changes are not blamed for a gap that already existed.
 * - Attendance above the booked venue's capacity is a 'capacity' conflict;
 *   attendance equal to capacity is fine.
 * - Layout and facility changes cannot be verified automatically because venue
 *   layout/facility data is not stored yet, so each venue booking gets a
 *   'requirements' entry telling the coordinator to re-check suitability.
 */

/** Minimum free time a venue needs between two different events' bookings. */
export const TURNAROUND_MINUTES = 30;

const MINUTE = 60_000;

/** Another event's booking at the same venue. */
export interface NeighbourBooking {
  id: string;
  eventName: string;
  start: string;
  end: string;
}

export interface VenueBookingInput {
  id: string;
  venueId: string;
  venueName: string;
  capacity: number;
  start: string;
  end: string;
  neighbours: NeighbourBooking[];
}

/** The subset of a proposed change that can affect a venue booking. */
export interface ProposedChange {
  startDateTime?: string;
  endDateTime?: string;
  expectedAttendance?: number;
  layout?: string;
  facilities?: string[];
}

export type ImpactConflictKind =
  'overlap' | 'turnaround' | 'capacity' | 'requirements';

export interface ImpactConflict {
  kind: ImpactConflictKind;
  withBookingId?: string;
  detail: string;
}

export interface BookingImpact {
  bookingId: string;
  venueId: string;
  venueName: string;
  impacted: boolean;
  conflicts: ImpactConflict[];
}

function clock(value: number): string {
  return new Date(value).toISOString().slice(11, 16);
}

function timeConflicts(
  start: number,
  end: number,
  neighbours: NeighbourBooking[],
): ImpactConflict[] {
  const conflicts: ImpactConflict[] = [];
  for (const other of neighbours) {
    const otherStart = Date.parse(other.start);
    const otherEnd = Date.parse(other.end);
    if (otherStart < end && otherEnd > start) {
      conflicts.push({
        kind: 'overlap',
        withBookingId: other.id,
        detail: `Overlaps ${other.eventName} (${clock(otherStart)}–${clock(otherEnd)} UTC)`,
      });
      continue;
    }
    // No overlap, so the neighbour is entirely before or entirely after.
    const before = otherEnd <= start;
    const gapMinutes = Math.round(
      (before ? start - otherEnd : otherStart - end) / MINUTE,
    );
    if (gapMinutes < TURNAROUND_MINUTES) {
      conflicts.push({
        kind: 'turnaround',
        withBookingId: other.id,
        detail: `Only ${gapMinutes} min turnaround ${before ? 'after' : 'before'} ${other.eventName}; ${TURNAROUND_MINUTES} min needed for setup`,
      });
    }
  }
  return conflicts;
}

/**
 * Returns one entry per venue booking, in input order. Each booking is
 * assessed on its own so a clash at one venue never marks another as impacted.
 */
export function assessVenueBookings(
  proposed: ProposedChange,
  bookings: VenueBookingInput[],
): BookingImpact[] {
  return bookings.map((booking) => {
    const start = Date.parse(proposed.startDateTime ?? booking.start);
    const end = Date.parse(proposed.endDateTime ?? booking.end);
    // Overlap/turnaround can only be caused by moving the booking in time. A
    // gap that was already tight is not the fault of an attendance, layout or
    // facilities change, so it is not reported for those.
    const moves =
      proposed.startDateTime !== undefined ||
      proposed.endDateTime !== undefined;
    const conflicts = moves
      ? timeConflicts(start, end, booking.neighbours)
      : [];

    if (
      proposed.expectedAttendance !== undefined &&
      proposed.expectedAttendance > booking.capacity
    )
      conflicts.push({
        kind: 'capacity',
        detail: `Attendance ${proposed.expectedAttendance} exceeds capacity ${booking.capacity}`,
      });
    if (proposed.layout !== undefined)
      conflicts.push({
        kind: 'requirements',
        detail: `Check that ${booking.venueName} supports the ${proposed.layout} layout`,
      });
    if (proposed.facilities !== undefined)
      conflicts.push({
        kind: 'requirements',
        detail: `Check that ${booking.venueName} provides: ${proposed.facilities.join(', ') || 'no specific facilities'}`,
      });

    return {
      bookingId: booking.id,
      venueId: booking.venueId,
      venueName: booking.venueName,
      impacted: conflicts.length > 0,
      conflicts,
    };
  });
}
