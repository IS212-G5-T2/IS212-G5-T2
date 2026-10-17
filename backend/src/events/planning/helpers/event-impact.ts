/*
 * SPM-85 AC2, AC6, AC7: assesses a proposed event change against each of the
 * event's venue bookings, independently. Pure functions only; see
 * event-impact.spec.ts.
 *
 * The result decides whether a change is applied immediately or flagged
 * (SPM-49 AC3/AC5, SPM-85 AC1): a change that leaves every booking compatible
 * applies at once; only the bookings it is incompatible with are marked
 * `impacted`.
 *
 * Assumptions (also recorded in backend/HANDOVER.md):
 * - A venue booking's required window follows the event's date/time. If the
 *   proposal moves only the start (or only the end), the other edge keeps the
 *   booking's current value.
 * - A new time that stays inside the window the booking already holds is
 *   compatible: the booking still covers the event and nothing else moves.
 *   A new time outside it is a 'window' conflict (the booking must change),
 *   and is then also checked for overlap/turnaround at the new time.
 * - Setup/turnaround: the venue needs TURNAROUND_MINUTES free between this
 *   booking and any other event's booking at the same venue. A gap of exactly
 *   TURNAROUND_MINUTES is fine; anything shorter (including touching bookings)
 *   is a 'turnaround' conflict; any overlap is an 'overlap' conflict.
 * - Overlap and turnaround are only assessed when the proposal moves the start
 *   or the end outside the held window; other changes are not blamed for a
 *   gap that already existed.
 * - Attendance above the booked venue's capacity is a 'capacity' conflict;
 *   attendance equal to or below capacity is compatible.
 * - Layout and added facilities cannot be verified automatically because
 *   venue layout/facility data is not stored yet, so each venue booking gets a
 *   'requirements' entry telling the coordinator to re-check suitability.
 *   Removing facilities only (no additions) can never make a venue unsuitable,
 *   so it is compatible when `currentFacilities` is supplied.
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
  /**
   * The facilities the event already requires. When supplied, only facilities
   * being added need a venue check; removals are always compatible.
   */
  currentFacilities?: string[];
}

export type ImpactConflictKind =
  'window' | 'overlap' | 'turnaround' | 'capacity' | 'requirements';

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

function stamp(value: number): string {
  const iso = new Date(value).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** True when [start, end] lies inside the window [heldStart, heldEnd]. */
export function withinWindow(
  start: number,
  end: number,
  heldStart: number,
  heldEnd: number,
): boolean {
  return start < end && start >= heldStart && end <= heldEnd;
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
    const heldStart = Date.parse(booking.start);
    const heldEnd = Date.parse(booking.end);
    const start = Date.parse(proposed.startDateTime ?? booking.start);
    const end = Date.parse(proposed.endDateTime ?? booking.end);
    const moves =
      proposed.startDateTime !== undefined ||
      proposed.endDateTime !== undefined;
    const conflicts: ImpactConflict[] = [];

    // A move that stays inside the window the booking already holds leaves the
    // booking untouched, so it is compatible. Only a move outside it forces
    // the booking to change, and only then can it create overlap/turnaround
    // clashes. Other fields are never blamed for a gap that already existed.
    if (moves && !withinWindow(start, end, heldStart, heldEnd)) {
      conflicts.push({
        kind: 'window',
        detail: `Booking holds ${booking.venueName} ${stamp(heldStart)}–${clock(heldEnd)} UTC; the event would run ${stamp(start)}–${clock(end)} UTC, so the booking must change`,
      });
      conflicts.push(...timeConflicts(start, end, booking.neighbours));
    }

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
    if (proposed.facilities !== undefined) {
      const needed = proposed.currentFacilities
        ? proposed.facilities.filter(
            (facility) => !proposed.currentFacilities!.includes(facility),
          )
        : proposed.facilities;
      // With the current list known, dropping facilities is always compatible.
      if (!proposed.currentFacilities || needed.length)
        conflicts.push({
          kind: 'requirements',
          detail: `Check that ${booking.venueName} provides: ${needed.join(', ') || 'no specific facilities'}`,
        });
    }

    return {
      bookingId: booking.id,
      venueId: booking.venueId,
      venueName: booking.venueName,
      impacted: conflicts.length > 0,
      conflicts,
    };
  });
}
