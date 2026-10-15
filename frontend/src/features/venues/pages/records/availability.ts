import type { VenueRecord, VenueReservation } from "./venue-records";
import { sgtLocalDateTimeToDate } from "@/utils/sgtDate";
import { sgtDateTimeParts } from "@/utils/sgtDate";

export interface AvailabilityConflict {
  label: string;
  start: string;
  end: string;
  reason: string;
  holdExpiresAt?: string;
}

export interface AvailableInterval {
  start: string;
  end: string;
}

/** Free half-open intervals inside a requested view, excluding setup and turnaround occupancy. */
export function getFreeVenueIntervals(
  venue: VenueRecord,
  start: string,
  end: string,
): AvailableInterval[] {
  const rangeStart = parseRequestTime(start);
  const rangeEnd = parseRequestTime(end);
  if (
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    rangeStart >= rangeEnd
  )
    return [];

  const occupied = [
    ...venue.unavailablePeriods.map((period) => ({
      start: Date.parse(period.start),
      end: Date.parse(period.end),
    })),
    ...venue.reservations.map((reservation) => ({
      start: Date.parse(reservation.start) - venue.setupTimeMinutes * 60_000,
      end: Date.parse(reservation.end) + venue.turnaroundTimeMinutes * 60_000,
    })),
  ]
    .map((interval) => ({
      start: Math.max(interval.start, rangeStart),
      end: Math.min(interval.end, rangeEnd),
    }))
    .filter((interval) => interval.start < interval.end)
    .sort((left, right) => left.start - right.start);

  const merged: { start: number; end: number }[] = [];
  for (const interval of occupied) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }

  const free: AvailableInterval[] = [];
  let cursor = rangeStart;
  for (const interval of merged) {
    if (cursor < interval.start)
      free.push({
        start: new Date(cursor).toISOString(),
        end: new Date(interval.start).toISOString(),
      });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < rangeEnd)
    free.push({
      start: new Date(cursor).toISOString(),
      end: new Date(rangeEnd).toISOString(),
    });
  return free;
}

/** SPM-51 / VEN-AVL-08-A: compare half-open intervals including venue setup and turnaround. */
export function checkVenueAvailability(
  venue: VenueRecord,
  start: string,
  end: string,
): AvailabilityConflict[] {
  const requestedStart = parseRequestTime(start);
  const requestedEnd = parseRequestTime(end);
  if (
    !Number.isFinite(requestedStart) ||
    !Number.isFinite(requestedEnd) ||
    requestedStart >= requestedEnd
  )
    return [];
  const paddedStart = requestedStart - venue.setupTimeMinutes * 60_000;
  const paddedEnd = requestedEnd + venue.turnaroundTimeMinutes * 60_000;
  const conflicts: AvailabilityConflict[] = [];
  for (const period of venue.unavailablePeriods) {
    if (
      paddedStart < Date.parse(period.end) &&
      paddedEnd > Date.parse(period.start)
    ) {
      conflicts.push({
        label: "Unavailable period",
        start: period.start,
        end: period.end,
        reason: period.reason,
      });
    }
  }
  for (const reservation of venue.reservations) {
    if (
      paddedStart <
        Date.parse(reservation.end) + venue.turnaroundTimeMinutes * 60_000 &&
      paddedEnd >
        Date.parse(reservation.start) - venue.setupTimeMinutes * 60_000
    ) {
      conflicts.push(reservationConflict(reservation));
    }
  }
  return conflicts;
}

/** Input controls use SGT wall time; ISO values remain absolute instants. */
export function parseRequestTime(value: string): number {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? Date.parse(value)
    : sgtLocalDateTimeToDate(value).getTime();
}

/** Render schedule instants in the business timezone used by venue operations. */
export function formatVenueRange(start: string, end: string): string {
  // Form controls provide SGT wall times without an offset; venue records and
  // reservations provide ISO instants. Normalize both through the same parser
  // so rendering does not depend on the host machine's timezone.
  const startParts = sgtDateTimeParts(new Date(parseRequestTime(start)));
  const endParts = sgtDateTimeParts(new Date(parseRequestTime(end)));
  return `${startParts.date}, ${startParts.time} – ${endParts.date}, ${endParts.time} (SGT)`;
}

export function formatVenueInstant(value: string): string {
  const parts = sgtDateTimeParts(value);
  return `${parts.date}, ${parts.time} SGT`;
}

function reservationConflict(
  reservation: VenueReservation,
): AvailabilityConflict {
  return {
    label:
      reservation.status === "booked" ? "Confirmed booking" : "Tentative hold",
    start: reservation.start,
    end: reservation.end,
    reason: reservation.eventName,
    ...(reservation.holdExpiresAt
      ? { holdExpiresAt: reservation.holdExpiresAt }
      : {}),
  };
}
