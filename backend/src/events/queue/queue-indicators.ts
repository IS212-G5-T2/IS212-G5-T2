/*
 * SPM-48 Monitor Workspace Queue & Status. Pure rules for what the coordinator's queue shows on each
 * event. They take the stored facts and the current time as inputs and never read the clock or the
 * database themselves, so every rule can be checked with fixed values.
 */
import { deriveSafetyIndicator } from '../status/event-indicators.js';

/** Statuses an event can have once it is in a coordinator's queue (AC2; drafts never reach it, AC3). */
export const QUEUE_STATUSES = [
  'Submitted',
  'Approved',
  'Planning',
  'Confirmed',
  'Completed',
  'Cancelled',
  'Rejected',
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/** The queue status for a stored or API status value, matched case-insensitively ('planning' gives 'Planning'). */
export function queueStatusOf(value: string): string {
  return QUEUE_STATUSES.find((status) => status.toLowerCase() === value.toLowerCase()) ?? value;
}

/** Nothing can be done on these events, so the queue flags no venue or safety follow-up on them. */
const TERMINAL_STATUSES: readonly string[] = ['Completed', 'Cancelled', 'Rejected'];

/**
 * The safety state on a queue card.
 * - AWAITING_CHECK, CHANGES_REQUESTED, CLEARED: the SPM-94 states, with the same rules (AC6, AC7).
 * - REJECTED: the Safety Officer rejected the arrangement (AC7, SPM-130 AC2).
 * - RESET: the check was reset (for example after an approved change, SPM-65 AC8) and the
 *   coordinator must request it again (AC6).
 */
export type QueueSafety = 'AWAITING_CHECK' | 'CHANGES_REQUESTED' | 'REJECTED' | 'RESET' | 'CLEARED';

/** Why an event needs the coordinator's action (AC5). The set was confirmed by the PO (MONITOR-QUEUE-05-B). */
export type QueueAction =
  | 'AWAITING_REVIEW'
  | 'SAFETY_CHANGES_REQUESTED'
  | 'SAFETY_REJECTED'
  | 'SAFETY_RESET'
  | 'VENUE_UNAVAILABLE'
  | 'HOLD_EXPIRED';

/** One of the event's pending or approved venue bookings, as the queue reads it. */
export interface QueueBookingFact {
  /** The venue's id: venues are told apart by id, never by name (two venues can share a name). */
  venueId: string;
  venueName: string;
  venueLocation: string;
  status: 'pending' | 'approved';
  holdExpiresAt: Date | null;
  /** A Venue Staff unavailable period overlaps the booking's window (SPM-122). */
  venueUnavailable: boolean;
}

export interface QueueHold {
  venueName: string;
  expiresAt: string;
  state: 'ACTIVE' | 'EXPIRED';
}

export interface QueueIndicators {
  safety: QueueSafety | null;
  holds: QueueHold[];
  unavailableVenues: string[];
  actions: QueueAction[];
  needsAction: boolean;
}

export interface QueueEventFacts {
  /** The stored event status, for example 'Planning'. */
  status: string;
  /** event_safety_checks.status, or null when there is no record. */
  safetyState: string | null;
  /** An event_safety_resets row exists: the last check was reset and not requested again. */
  safetyReset: boolean;
  bookings: QueueBookingFact[];
}

/** AC6, AC7: at most one safety state per event. */
export function deriveQueueSafety(
  status: string,
  safetyState: string | null,
  safetyReset: boolean,
): QueueSafety | null {
  if (TERMINAL_STATUSES.includes(status)) return null;
  if (!safetyState) return safetyReset ? 'RESET' : null;
  if (safetyState === 'rejected') return 'REJECTED';
  return deriveSafetyIndicator(safetyState, status);
}

/** A hold is active until its expiry instant and expired from that instant on (AC8, MONITOR-QUEUE-08-B). */
export function holdIsActive(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() > now.getTime();
}

/** AC8: each tentative hold (a pending booking with an expiry) with its state and expiry. */
/**
 * How a venue is named on the card: its name, plus its location when another of the event's venues has the same
 * name, so venues that share a name stay distinguishable (PR #80 review).
 */
export function venueLabel(booking: QueueBookingFact, bookings: QueueBookingFact[]): string {
  const clash = bookings.some((other) => other.venueId !== booking.venueId && other.venueName === booking.venueName);
  return clash ? `${booking.venueName} (${booking.venueLocation})` : booking.venueName;
}

export function deriveHolds(bookings: QueueBookingFact[], now: Date): QueueHold[] {
  return bookings
    .filter((booking) => booking.status === 'pending' && booking.holdExpiresAt !== null)
    .map((booking) => ({
      venueName: venueLabel(booking, bookings),
      expiresAt: booking.holdExpiresAt!.toISOString(),
      state: holdIsActive(booking.holdExpiresAt!, now) ? 'ACTIVE' : 'EXPIRED',
    }));
}

/**
 * AC9: venues of the event's active bookings that an unavailable period now overlaps. A booking is
 * active while it is approved, or pending with no hold or a hold that has not expired (CONTEXT.md:
 * active venue request). The flag clears once the affected booking is no longer active (cancelled by
 * the coordinator) or the unavailable period no longer overlaps it (ended early); booking a
 * replacement alone does not clear it (decided 23 Oct 2026, SPM-54 AC6 keeps the affected booking).
 */
export function deriveUnavailableVenues(bookings: QueueBookingFact[], now: Date): string[] {
  const affected = bookings
    .filter(
      (booking) =>
        booking.venueUnavailable &&
        (booking.status === 'approved' ||
          booking.holdExpiresAt === null ||
          holdIsActive(booking.holdExpiresAt, now)),
    );
  // One entry per venue, by id: two bookings of the same venue are listed once, two venues with one name twice.
  const byVenue = new Map(affected.map((booking) => [booking.venueId, booking]));
  return [...byVenue.values()].map((booking) => venueLabel(booking, bookings));
}

/** AC5: the reasons an event needs the coordinator's action, in a fixed order. */
export function deriveActions(
  status: string,
  safety: QueueSafety | null,
  holds: QueueHold[],
  unavailableVenues: string[],
): QueueAction[] {
  const actions: QueueAction[] = [];
  if (status === 'Submitted') actions.push('AWAITING_REVIEW');
  if (safety === 'CHANGES_REQUESTED') actions.push('SAFETY_CHANGES_REQUESTED');
  if (safety === 'REJECTED') actions.push('SAFETY_REJECTED');
  if (safety === 'RESET') actions.push('SAFETY_RESET');
  if (unavailableVenues.length > 0) actions.push('VENUE_UNAVAILABLE');
  if (holds.some((hold) => hold.state === 'EXPIRED')) actions.push('HOLD_EXPIRED');
  return actions;
}

/** Everything the queue shows for one event. Terminal events show their status only. */
export function buildQueueIndicators(facts: QueueEventFacts, now: Date): QueueIndicators {
  const terminal = TERMINAL_STATUSES.includes(facts.status);
  const safety = deriveQueueSafety(facts.status, facts.safetyState, facts.safetyReset);
  const holds = terminal ? [] : deriveHolds(facts.bookings, now);
  const unavailableVenues = terminal ? [] : deriveUnavailableVenues(facts.bookings, now);
  const actions = deriveActions(facts.status, safety, holds, unavailableVenues);
  return { safety, holds, unavailableVenues, actions, needsAction: actions.length > 0 };
}

/** The parsed `status` filter: the statuses asked for (null for no filter), or the first unknown value. */
export type StatusFilter = { ok: true; statuses: QueueStatus[] | null } | { ok: false; unknown: string };

/**
 * The optional `status` filter (SPM-148 handoff): one status or a comma-separated list, matched
 * without regard to case. Blank means no filter.
 */
export function parseStatusFilter(raw: unknown): StatusFilter {
  if (raw === undefined) return { ok: true, statuses: null };
  const values = (Array.isArray(raw) ? raw : [raw]).flatMap((value) =>
    typeof value === 'string' ? value.split(',').map((part) => part.trim()) : [String(value)],
  );
  const wanted = values.filter((value) => value !== '');
  if (wanted.length === 0) return { ok: true, statuses: null };
  const statuses: QueueStatus[] = [];
  for (const value of wanted) {
    const match = QUEUE_STATUSES.find((status) => status.toLowerCase() === value.toLowerCase());
    if (!match) return { ok: false, unknown: value };
    if (!statuses.includes(match)) statuses.push(match);
  }
  return { ok: true, statuses };
}
