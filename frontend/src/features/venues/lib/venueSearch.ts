import type { EventRecord } from "@/types";
import type { VenueRecord } from "@/features/venues/pages/records/venue-records";
import {
  checkVenueAvailability,
  parseRequestTime,
} from "@/features/venues/pages/records/availability";

/** Search and filter criteria as entered on the catalogue form. Empty strings and arrays mean "not set". */
export interface VenueSearchCriteria {
  /** Partial, case-insensitive match against venue name or location (SPM-52 AC1). */
  query: string;
  /** Raw minimum-capacity input; must be a positive whole number when set (AC5). */
  minCapacity: string;
  /** Required room layout; empty means any layout (AC2). */
  layout: string;
  /** Every selected facility must be offered by the venue (AC2). */
  facilities: string[];
  /** Every selected accessibility feature must be offered by the venue (AC2). */
  accessibility: string[];
  /** datetime-local values interpreted as SGT wall time (AC3). */
  start: string;
  end: string;
}

export const EMPTY_VENUE_SEARCH: VenueSearchCriteria = {
  query: "",
  minCapacity: "",
  layout: "",
  facilities: [],
  accessibility: [],
  start: "",
  end: "",
};

export interface VenueSearchErrors {
  minCapacity?: string;
  start?: string;
  end?: string;
}

/** Reports criteria the user must fix before they are applied (SPM-52 AC5). */
export function validateVenueSearch(criteria: VenueSearchCriteria): VenueSearchErrors {
  const errors: VenueSearchErrors = {};
  const capacity = criteria.minCapacity.trim();
  if (capacity !== "" && !(/^\d+$/.test(capacity) && Number(capacity) > 0)) {
    errors.minCapacity = "Minimum capacity must be a positive whole number.";
  }

  const hasStart = criteria.start !== "";
  const hasEnd = criteria.end !== "";
  if (hasStart && !hasEnd) {
    errors.end = "Enter an end date and time to filter by availability.";
  } else if (!hasStart && hasEnd) {
    errors.start = "Enter a start date and time to filter by availability.";
  } else if (hasStart && hasEnd && !(parseRequestTime(criteria.end) > parseRequestTime(criteria.start))) {
    errors.end = "The end time must be after the start time.";
  }
  return errors;
}

/** Drops criteria that failed validation so only valid filters narrow the results. */
function applicableCriteria(criteria: VenueSearchCriteria, errors: VenueSearchErrors): VenueSearchCriteria {
  const dateInvalid = Boolean(errors.start || errors.end);
  return {
    ...criteria,
    minCapacity: errors.minCapacity ? "" : criteria.minCapacity.trim(),
    start: dateInvalid ? "" : criteria.start,
    end: dateInvalid ? "" : criteria.end,
  };
}

/**
 * Returns the venues matching every applicable criterion. Invalid criteria are ignored, so
 * validation errors never narrow the list silently; the page reports them next to the fields.
 * `now` decides whether tentative holds have expired, as in the SPM-51 availability view.
 */
export function applyVenueSearch(
  venues: VenueRecord[],
  criteria: VenueSearchCriteria,
  now: number,
): VenueRecord[] {
  const active = applicableCriteria(criteria, validateVenueSearch(criteria));
  return venues.filter((venue) => matchesVenueSearch(venue, active, now));
}

/** Whether one venue satisfies criteria that have already passed validation. */
export function matchesVenueSearch(
  venue: VenueRecord,
  criteria: VenueSearchCriteria,
  now: number,
): boolean {
  const query = criteria.query.trim().toLocaleLowerCase();
  if (
    query &&
    !venue.name.toLocaleLowerCase().includes(query) &&
    !venue.location.toLocaleLowerCase().includes(query)
  ) {
    return false;
  }
  if (criteria.minCapacity && venue.capacity < Number(criteria.minCapacity)) return false;
  if (criteria.layout && !venue.layouts.includes(criteria.layout)) return false;
  if (!criteria.facilities.every((facility) => venue.facilities.includes(facility))) return false;
  if (!criteria.accessibility.every((feature) => venue.accessibility.includes(feature))) return false;
  if (criteria.start && criteria.end && !isFreeFor(venue, criteria.start, criteria.end, now)) {
    return false;
  }
  return true;
}

/** Event-scoped starting criteria: the event's attendance, layout, facilities, accessibility and time (SPM-52 AC4). */
export function criteriaFromEvent(event: EventRecord): VenueSearchCriteria {
  const requirements = event.venueRequirements;
  return {
    ...EMPTY_VENUE_SEARCH,
    minCapacity: String(event.expectedAttendance),
    layout: requirements.layout,
    facilities: [...requirements.facilities],
    // Event accessibility needs use the venue feature labels (SPM-144; migration 027 renamed the
    // retired "Wheelchair ramps"), so they are searched for as they are.
    accessibility: [...requirements.accessibility],
    start: toSgtDateTimeLocal(event.startDateTime),
    end: toSgtDateTimeLocal(event.endDateTime),
  };
}

/**
 * Uses the SPM-51 availability rule. Expired tentative holds are ignored, then the requested
 * range is compared with setup and turnaround padding (see checkVenueAvailability).
 */
function isFreeFor(venue: VenueRecord, start: string, end: string, now: number): boolean {
  const activeVenue: VenueRecord = {
    ...venue,
    reservations: venue.reservations.filter(
      (reservation) =>
        reservation.status === "booked" || Date.parse(reservation.holdExpiresAt) > now,
    ),
  };
  return checkVenueAvailability(activeVenue, start, end).length === 0;
}

const SGT_DATE_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Singapore",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Formats an instant as a datetime-local value in Singapore time, matching the form controls. */
export function toSgtDateTimeLocal(value: string): string {
  const parts: Record<string, string> = Object.fromEntries(
    SGT_DATE_TIME.formatToParts(new Date(value)).map((item) => [item.type, item.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
