import { describe, expect, it } from "vitest";
import type { EventRecord } from "@/types";
import type { VenueRecord } from "@/features/venues/pages/records/venue-records";
import {
  EMPTY_VENUE_SEARCH,
  applyVenueSearch,
  criteriaFromEvent,
  toSgtDateTimeLocal,
  validateVenueSearch,
  type VenueSearchCriteria,
} from "./venueSearch";

// Fixed "now" well before every reservation hold expiry used below, so tests do not depend on the clock.
const NOW = Date.parse("2026-10-15T00:00:00+08:00");

// Setup 30 and turnaround 15 minutes: a booking 11:00-12:00 SGT occupies 10:30-12:15 SGT for this venue.
const orchid: VenueRecord = {
  id: "venue-orchid",
  name: "Orchid Hall",
  location: "North Campus",
  capacity: 120,
  facilities: ["Projector", "Wi-Fi"],
  accessibility: ["Wheelchair access"],
  layouts: ["Classroom"],
  operatingInformation: "Weekdays",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 15,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [],
};

const busy: VenueRecord = {
  ...orchid,
  id: "venue-busy",
  name: "Busy Room",
  location: "South Campus",
  capacity: 50,
  reservations: [
    {
      id: "booking-1",
      eventName: "Existing booking",
      status: "booked",
      start: "2026-10-27T11:00:00+08:00",
      end: "2026-10-27T12:00:00+08:00",
      affectedByUnavailablePeriod: false,
    },
  ],
};

function criteria(overrides: Partial<VenueSearchCriteria> = {}): VenueSearchCriteria {
  return { ...EMPTY_VENUE_SEARCH, ...overrides };
}

const names = (venues: VenueRecord[]) => venues.map((venue) => venue.name);

const event: EventRecord = {
  id: "event-60",
  name: "Small classroom workshop",
  purpose: "Training",
  description: "Workshop",
  organiserId: "org-1",
  organiserName: "Organisation",
  status: "approved",
  startDateTime: "2026-10-27T09:00:00+08:00",
  endDateTime: "2026-10-27T10:30:00+08:00",
  expectedAttendance: 24,
  venueRequirements: {
    minCapacity: 24,
    layout: "Classroom",
    facilities: ["Projector"],
    accessibility: ["Wheelchair access", "Hearing loop"],
  },
  equipmentNeeds: "",
  registrationEnabled: false,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

describe("venue search criteria (SPM-52)", () => {
  /** SPM-52 AC1: the name or location query matches partially and ignores letter case. */
  it("VEN-SRCH-01-A matches a partial name regardless of letter case", () => {
    const venues = [orchid, busy];
    expect(names(applyVenueSearch(venues, criteria({ query: "ORCH" }), NOW))).toEqual(["Orchid Hall"]);
    expect(names(applyVenueSearch(venues, criteria({ query: "room" }), NOW))).toEqual(["Busy Room"]);
  });

  /** SPM-52 AC1: the location query matches partially, ignores case and surrounding spaces. */
  it("VEN-SRCH-01-B matches a partial location ignoring case and surrounding spaces", () => {
    expect(names(applyVenueSearch([orchid, busy], criteria({ query: "  south campus " }), NOW))).toEqual(["Busy Room"]);
    expect(names(applyVenueSearch([orchid, busy], criteria({ query: "CAMP" }), NOW))).toEqual(["Orchid Hall", "Busy Room"]);
  });

  /** SPM-52 AC1 negative: a query that matches neither name nor location hides every venue. */
  it("VEN-SRCH-01-C hides venues when neither the name nor the location contains the query", () => {
    expect(applyVenueSearch([orchid, busy], criteria({ query: "zzz" }), NOW)).toEqual([]);
  });

  /** SPM-52 AC2 boundary: capacity equal to the minimum qualifies, one seat less does not. */
  it("VEN-SRCH-02-A includes a venue whose capacity equals the minimum and excludes smaller venues", () => {
    expect(names(applyVenueSearch([orchid, busy], criteria({ minCapacity: "120" }), NOW))).toEqual(["Orchid Hall"]);
    expect(applyVenueSearch([orchid], criteria({ minCapacity: "121" }), NOW)).toEqual([]);
  });

  /** SPM-52 AC2: the layout filter keeps only venues offering the chosen layout. */
  it("VEN-SRCH-02-B keeps only venues that offer the selected room layout", () => {
    const boardroom = { ...orchid, id: "venue-board", name: "Board Room", layouts: ["Boardroom"] };
    expect(names(applyVenueSearch([orchid, boardroom], criteria({ layout: "Boardroom" }), NOW))).toEqual(["Board Room"]);
  });

  /** SPM-52 AC2: every selected facility must be offered; a venue with only some of them is hidden. */
  it("VEN-SRCH-02-C requires every selected facility", () => {
    const partial = { ...orchid, id: "venue-partial", name: "Partial Room", facilities: ["Projector"] };
    expect(names(applyVenueSearch([orchid, partial], criteria({ facilities: ["Projector", "Wi-Fi"] }), NOW))).toEqual([
      "Orchid Hall",
    ]);
  });

  /** SPM-52 AC2: every selected accessibility feature must be offered; a venue with only some of them is hidden. */
  it("VEN-SRCH-02-D requires every selected accessibility feature", () => {
    const hearing = { ...orchid, id: "venue-hearing", name: "Hearing Hall", accessibility: ["Hearing loop"] };
    expect(
      applyVenueSearch([orchid, hearing], criteria({ accessibility: ["Wheelchair access", "Hearing loop"] }), NOW),
    ).toEqual([]);
    expect(names(applyVenueSearch([orchid, hearing], criteria({ accessibility: ["Hearing loop"] }), NOW))).toEqual([
      "Hearing Hall",
    ]);
  });

  /** SPM-52 AC2: combined criteria show only the venue that matches all of them. */
  it("VEN-SRCH-02-E combines capacity, layout, facilities and accessibility with AND semantics", () => {
    const small = { ...orchid, id: "venue-small", name: "Small Room", capacity: 10 };
    const result = applyVenueSearch(
      [orchid, small, busy],
      criteria({
        minCapacity: "100",
        layout: "Classroom",
        facilities: ["Projector"],
        accessibility: ["Wheelchair access"],
      }),
      NOW,
    );
    expect(names(result)).toEqual(["Orchid Hall"]);
  });

  /** SPM-52 AC3: a venue with no bookings or unavailable periods is free for the whole requested period. */
  it("VEN-SRCH-03-A includes a venue with no bookings or unavailable periods", () => {
    expect(
      names(applyVenueSearch([orchid], criteria({ start: "2026-10-27T08:00", end: "2026-10-27T09:00" }), NOW)),
    ).toEqual(["Orchid Hall"]);
  });

  /** SPM-52 AC3 boundary: the requested period may end exactly where the buffer before a booking starts. */
  it("VEN-SRCH-03-B treats an exact setup or turnaround buffer touch as free", () => {
    // Booking 11:00-12:00 with setup 30 starts occupying at 10:30; a request ending at 10:15 finishes with its turnaround-padded end at 10:30.
    expect(
      names(applyVenueSearch([busy], criteria({ start: "2026-10-27T08:00", end: "2026-10-27T10:15" }), NOW)),
    ).toEqual(["Busy Room"]);
    // Turnaround after the booking ends at 12:15; a request starting at 12:45 has setup padding beginning at 12:15.
    expect(
      names(applyVenueSearch([busy], criteria({ start: "2026-10-27T12:45", end: "2026-10-27T13:30" }), NOW)),
    ).toEqual(["Busy Room"]);
  });

  /** SPM-52 AC3 boundary: a one-minute overlap into the setup or turnaround buffer makes the venue unavailable. */
  it("VEN-SRCH-03-C hides a venue when the requested period overlaps a buffer by one minute", () => {
    expect(
      applyVenueSearch([busy], criteria({ start: "2026-10-27T08:00", end: "2026-10-27T10:16" }), NOW),
    ).toEqual([]);
    expect(
      applyVenueSearch([busy], criteria({ start: "2026-10-27T12:44", end: "2026-10-27T13:30" }), NOW),
    ).toEqual([]);
  });

  /** SPM-52 AC3: a requested period that overlaps an unavailable period hides the venue. */
  it("VEN-SRCH-03-D hides a venue during one of its unavailable periods", () => {
    const maintenance: VenueRecord = {
      ...orchid,
      id: "venue-maintenance",
      name: "Maintenance Hall",
      unavailablePeriods: [
        {
          id: "period-1",
          start: "2026-10-27T13:00:00+08:00",
          end: "2026-10-27T14:00:00+08:00",
          reason: "Maintenance",
        },
      ],
    };
    expect(
      applyVenueSearch([maintenance], criteria({ start: "2026-10-27T13:30", end: "2026-10-27T15:00" }), NOW),
    ).toEqual([]);
  });

  /** SPM-52 AC3: expired tentative holds are ignored, while active holds and confirmed bookings block the period. */
  it("VEN-SRCH-03-E ignores expired tentative holds and respects active holds", () => {
    const expiredHold: VenueRecord = {
      ...orchid,
      id: "venue-expired",
      name: "Expired Hold Hall",
      reservations: [
        {
          id: "hold-expired",
          eventName: "Lapsed hold",
          status: "tentative",
          start: "2026-10-27T09:00:00+08:00",
          end: "2026-10-27T10:30:00+08:00",
          holdExpiresAt: "2026-10-14T00:00:00+08:00",
          affectedByUnavailablePeriod: false,
        },
      ],
    };
    const activeHold: VenueRecord = {
      ...expiredHold,
      id: "venue-active",
      name: "Active Hold Hall",
      reservations: [
        {
          id: "hold-active",
          eventName: "Live hold",
          status: "tentative",
          start: "2026-10-27T09:00:00+08:00",
          end: "2026-10-27T10:30:00+08:00",
          holdExpiresAt: "2026-10-30T00:00:00+08:00",
          affectedByUnavailablePeriod: false,
        },
      ],
    };
    const period = criteria({ start: "2026-10-27T09:00", end: "2026-10-27T10:30" });
    expect(names(applyVenueSearch([expiredHold, activeHold], period, NOW))).toEqual(["Expired Hold Hall"]);
  });

  /** SPM-52 AC4: the event's requirements become the starting criteria, with the event's accessibility needs mapped to venue features. */
  it("VEN-SRCH-04-A maps the event requirements, attendance, times and accessibility labels into search criteria", () => {
    expect(criteriaFromEvent(event)).toEqual({
      query: "",
      minCapacity: "24",
      layout: "Classroom",
      facilities: ["Projector"],
      accessibility: ["Wheelchair access", "Hearing loop"],
      start: "2026-10-27T09:00",
      end: "2026-10-27T10:30",
    });
  });

  /** SPM-52 AC4: an event without a layout does not add a layout requirement. */
  it("VEN-SRCH-04-B applies no layout requirement when the event names none", () => {
    const noLayout = {
      ...event,
      venueRequirements: { ...event.venueRequirements, layout: "", accessibility: [] },
    };
    const boardroom = { ...orchid, id: "venue-board", name: "Board Room", layouts: ["Boardroom"] };
    expect(names(applyVenueSearch([orchid, boardroom], criteriaFromEvent(noLayout), NOW))).toEqual([
      "Orchid Hall",
      "Board Room",
    ]);
  });

  /** SPM-52 AC4: event-derived criteria exclude venues that are busy during the event time, even when they suit the event. */
  it("VEN-SRCH-04-C excludes a suitable venue that is busy during the event", () => {
    const suitableButBusy = {
      ...orchid,
      id: "venue-busy-event",
      accessibility: ["Wheelchair access", "Hearing loop"],
      name: "Busy Event Hall",
      reservations: [
        {
          id: "booking-event",
          eventName: "Clash",
          status: "booked" as const,
          start: "2026-10-27T09:30:00+08:00",
          end: "2026-10-27T10:00:00+08:00",
          affectedByUnavailablePeriod: false,
        },
      ],
    };
    const suitableFree = { ...suitableButBusy, id: "venue-free-event", name: "Free Event Hall", reservations: [] };
    expect(names(applyVenueSearch([suitableFree, suitableButBusy], criteriaFromEvent(event), NOW))).toEqual([
      "Free Event Hall",
    ]);
  });

  /** SPM-52 AC5: minimum capacity must be a positive whole number when it is entered. */
  it("VEN-SRCH-05-A reports a minimum capacity that is not a positive whole number", () => {
    for (const value of ["0", "-3", "2.5", "1e3", "ten"]) {
      expect(validateVenueSearch(criteria({ minCapacity: value })).minCapacity).toBe(
        "Minimum capacity must be a positive whole number.",
      );
    }
    expect(validateVenueSearch(criteria({ minCapacity: "" })).minCapacity).toBeUndefined();
    expect(validateVenueSearch(criteria({ minCapacity: " 1 " })).minCapacity).toBeUndefined();
  });

  /** SPM-52 AC5: an end time equal to or before the start time is reported on the end field. */
  it("VEN-SRCH-05-B reports an end time that is not after the start time", () => {
    const message = "The end time must be after the start time.";
    expect(validateVenueSearch(criteria({ start: "2026-10-27T10:00", end: "2026-10-27T10:00" })).end).toBe(message);
    expect(validateVenueSearch(criteria({ start: "2026-10-27T10:00", end: "2026-10-27T09:00" })).end).toBe(message);
    expect(validateVenueSearch(criteria({ start: "2026-10-27T09:00", end: "2026-10-27T10:00" }))).toEqual({});
  });

  /** SPM-52 AC5: a range with only one bound is reported on the missing field. */
  it("VEN-SRCH-05-C reports the missing bound of a half-entered date range", () => {
    expect(validateVenueSearch(criteria({ start: "2026-10-27T09:00" })).end).toBe(
      "Enter an end date and time to filter by availability.",
    );
    expect(validateVenueSearch(criteria({ end: "2026-10-27T10:00" })).start).toBe(
      "Enter a start date and time to filter by availability.",
    );
  });

  /** SPM-52 AC5 (Sad): a minimum capacity that is not a positive whole number is reported and not applied. "99.5" would drop the 1-seat room if applied, so keeping it proves the criterion is ignored. The date half is not asserted here: a reversed range returns no conflicts from checkVenueAvailability, so dropping it cannot change a result (mutant F10). */
  it("VEN-SRCH-05-D does not apply a non-whole capacity to the results", () => {
    const small = { ...orchid, id: "venue-small", name: "Small Room", capacity: 1 };
    expect(names(applyVenueSearch([orchid, small], criteria({ minCapacity: "99.5" }), NOW))).toEqual([
      "Orchid Hall",
      "Small Room",
    ]);
  });

  /** SPM-52 AC5: a valid set of criteria reports no validation errors. */
  it("VEN-SRCH-05-G reports no errors for valid criteria", () => {
    expect(
      validateVenueSearch(criteria({ minCapacity: "12", start: "2026-10-27T09:00", end: "2026-10-27T10:00" })),
    ).toEqual({});
  });

  /** SPM-52 AC3 boundary: a hold is active only while it expires strictly after the search time; one expiring at that instant no longer blocks. */
  it("VEN-SRCH-03-J treats a hold expiring exactly at the search time as expired, and one a millisecond later as active", () => {
    const holdAt = (expiry: number): VenueRecord => ({
      ...orchid,
      id: `venue-hold-${expiry}`,
      name: `Hold ${expiry - NOW}`,
      reservations: [
        {
          id: `hold-${expiry}`,
          eventName: "Hold",
          status: "tentative",
          start: "2026-10-27T09:00:00+08:00",
          end: "2026-10-27T10:30:00+08:00",
          holdExpiresAt: new Date(expiry).toISOString(),
          affectedByUnavailablePeriod: false,
        },
      ],
    });
    const period = criteria({ start: "2026-10-27T09:00", end: "2026-10-27T10:30" });
    expect(names(applyVenueSearch([holdAt(NOW), holdAt(NOW + 1)], period, NOW))).toEqual(["Hold 0"]);
  });

  /** SPM-52 AC4: the event's expected attendance, not the event venue-requirements minimum, becomes the minimum capacity. */
  it("VEN-SRCH-04-I uses the expected attendance as the minimum capacity", () => {
    const attendance = {
      ...event,
      expectedAttendance: 50,
      venueRequirements: { ...event.venueRequirements, minCapacity: 10 },
    };
    expect(criteriaFromEvent(attendance).minCapacity).toBe("50");
  });

  /** SPM-52 AC5: an invalid minimum capacity is not applied, even when its numeric value would exclude venues. */
  it("VEN-SRCH-05-I does not apply a non-whole capacity entry that would otherwise filter venues", () => {
    for (const entry of ["99.5", "1e3"]) {
      expect(names(applyVenueSearch([orchid, busy], criteria({ minCapacity: entry }), NOW))).toEqual([
        "Orchid Hall",
        "Busy Room",
      ]);
    }
  });

  /** SPM-52 AC4: the event's SGT wall times are formatted as datetime-local values, independent of the host timezone. */
  it("VEN-SRCH-04-G formats instants as SGT datetime-local values", () => {
    expect(toSgtDateTimeLocal("2026-10-27T01:00:00.000Z")).toBe("2026-10-27T09:00");
    expect(toSgtDateTimeLocal("2026-10-27T16:05:00.000Z")).toBe("2026-10-28T00:05");
  });
});
