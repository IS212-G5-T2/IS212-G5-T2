import { describe, expect, it } from "vitest";
import {
  checkVenueAvailability,
  formatVenueInstant,
  formatVenueRange,
  getFreeVenueIntervals,
  parseRequestTime,
} from "./availability";
import type { VenueRecord } from "./venue-records";

const venue: VenueRecord = {
  id: "venue-1",
  name: "Orchid Hall",
  location: "North Wing",
  capacity: 80,
  facilities: [],
  accessibility: [],
  layouts: [],
  operatingInformation: "",
  operatingDays: ["Monday"],
  operatingStartTime: "08:00",
  operatingEndTime: "22:00",
  setupTimeMinutes: 15,
  turnaroundTimeMinutes: 20,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [],
};

describe("checkVenueAvailability (SPM-51)", () => {
  /** VEN-AVL-05-A/B: nested and overlapping occupied intervals preserve the outer range and leave no false gap. */
  it("keeps the enclosing occupancy end when later intervals are nested and overlapping", () => {
    const result = getFreeVenueIntervals(
      {
        ...venue,
        unavailablePeriods: [
          {
            id: "outer",
            start: "2030-01-12T02:00:00Z",
            end: "2030-01-12T08:00:00Z",
            reason: "Venue closure",
          },
          {
            id: "nested",
            start: "2030-01-12T04:00:00Z",
            end: "2030-01-12T05:00:00Z",
            reason: "Nested maintenance",
          },
          {
            id: "overlapping",
            start: "2030-01-12T06:00:00Z",
            end: "2030-01-12T07:00:00Z",
            reason: "Overlapping maintenance",
          },
        ],
      },
      "2030-01-12T00:00:00Z",
      "2030-01-12T10:00:00Z",
    );

    expect(result).toEqual([
      {
        start: "2030-01-12T00:00:00.000Z",
        end: "2030-01-12T02:00:00.000Z",
      },
      {
        start: "2030-01-12T08:00:00.000Z",
        end: "2030-01-12T10:00:00.000Z",
      },
    ]);
  });

  /** VEN-AVL-02-A: free-gap calculation rejects malformed and reversed ranges. */
  it.each([
    ["not-a-date", "2030-01-12T13:00"],
    ["2030-01-12T12:00", "not-a-date"],
    ["2030-01-12T13:00", "2030-01-12T12:00"],
  ])("returns no gaps for an invalid view range (%s to %s)", (start, end) => {
    expect(getFreeVenueIntervals(venue, start, end)).toEqual([]);
  });

  /** VEN-AVL-01-A: datetime-local inputs are interpreted in the specified Singapore timezone. */
  it("parses event form values as Singapore time independent of host timezone", () => {
    expect(new Date(parseRequestTime("2030-01-12T12:00")).toISOString()).toBe(
      "2030-01-12T04:00:00.000Z",
    );
  });

  /** VEN-AVL-01-B: displayed schedule and hold expiry instants use Singapore time. */
  it("formats availability schedule values in SGT", () => {
    expect(
      formatVenueRange("2030-01-12T04:00:00.000Z", "2030-01-12T05:00:00.000Z"),
    ).toBe("12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 (SGT)");
    expect(formatVenueInstant("2030-01-12T04:30:00.000Z")).toBe(
      "12 Jan 2030, 12:30 SGT",
    );
  });

  /** VEN-AVL-08-B: a candidate after an existing booking conflicts inside the turnaround/setup buffers. */
  it("blocks a candidate after an existing booking when their buffers overlap", () => {
    const result = checkVenueAvailability(
      {
        ...venue,
        reservations: [
          {
            id: "b1",
            eventName: "Existing",
            start: "2030-01-12T04:00:00Z",
            end: "2030-01-12T05:00:00Z",
            status: "booked",
            affectedByUnavailablePeriod: false,
          },
        ],
      },
      "2030-01-12T05:10:00Z",
      "2030-01-12T06:00:00Z",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      label: "Confirmed booking",
      reason: "Existing",
    });
  });

  /** VEN-AVL-07-A: a server-returned active tentative hold blocks and includes its expiry. */
  it("reports an active API hold and its expiry time", () => {
    const result = checkVenueAvailability(
      {
        ...venue,
        reservations: [
          {
            id: "h1",
            eventName: "Workshop",
            start: "2030-01-12T04:00:00Z",
            end: "2030-01-12T05:00:00Z",
            status: "tentative",
            holdExpiresAt: "2030-01-11T23:30:00Z",
            affectedByUnavailablePeriod: false,
          },
        ],
      },
      "2030-01-12T04:30:00Z",
      "2030-01-12T05:30:00Z",
    );

    expect(result[0]).toMatchObject({
      label: "Tentative hold",
      holdExpiresAt: "2030-01-11T23:30:00Z",
    });
  });

  /** VEN-AVL-08-B: a candidate before an existing booking conflicts inside the turnaround/setup buffers. */
  it("blocks a candidate before an existing booking when their buffers overlap", () => {
    const result = checkVenueAvailability(
      {
        ...venue,
        reservations: [
          {
            id: "b1",
            eventName: "Later",
            start: "2030-01-12T05:10:00Z",
            end: "2030-01-12T06:00:00Z",
            status: "booked",
            affectedByUnavailablePeriod: false,
          },
        ],
      },
      "2030-01-12T04:00:00Z",
      "2030-01-12T05:00:00Z",
    );

    expect(result).toMatchObject([
      { label: "Confirmed booking", reason: "Later" },
    ]);
  });

  /** VEN-AVL-08-B/BND-1: with zero buffers, an exact half-open end/start touch is available. */
  it("accepts exact touching ranges when both venue buffers are zero", () => {
    const result = checkVenueAvailability(
      {
        ...venue,
        setupTimeMinutes: 0,
        turnaroundTimeMinutes: 0,
        reservations: [
          {
            id: "b1",
            eventName: "Earlier",
            start: "2030-01-12T01:00:00Z",
            end: "2030-01-12T02:00:00Z",
            status: "booked",
            affectedByUnavailablePeriod: false,
          },
        ],
      },
      "2030-01-12T02:00:00Z",
      "2030-01-12T03:00:00Z",
    );

    expect(result).toEqual([]);
  });

  /** VEN-AVL-08-VAR-1: venues with different configured buffers produce different availability results. */
  it("uses the selected venue's configured setup and turnaround values", () => {
    const scheduled = {
      ...venue,
      reservations: [
        {
          id: "b1",
          eventName: "Earlier",
          start: "2030-01-12T04:00:00Z",
          end: "2030-01-12T05:00:00Z",
          status: "booked" as const,
          affectedByUnavailablePeriod: false,
        },
      ],
    };
    const setupOnly = checkVenueAvailability(
      { ...scheduled, setupTimeMinutes: 30, turnaroundTimeMinutes: 0 },
      "2030-01-12T05:10:00Z",
      "2030-01-12T06:00:00Z",
    );
    const shortTurnaround = checkVenueAvailability(
      { ...scheduled, setupTimeMinutes: 0, turnaroundTimeMinutes: 5 },
      "2030-01-12T05:10:00Z",
      "2030-01-12T06:00:00Z",
    );

    expect(setupOnly).toHaveLength(1);
    expect(shortTurnaround).toEqual([]);
  });

  /** VEN-AVL-08-A/BND-1: a blockout intersecting setup makes the requested time unavailable. */
  it("blocks a candidate whose setup buffer intersects an unavailable period", () => {
    const result = checkVenueAvailability(
      {
        ...venue,
        unavailablePeriods: [
          {
            id: "p1",
            start: "2030-01-12T03:50:00Z",
            end: "2030-01-12T03:55:00Z",
            reason: "Cleaning",
          },
        ],
      },
      "2030-01-12T04:00:00Z",
      "2030-01-12T05:00:00Z",
    );

    expect(result).toMatchObject([
      { label: "Unavailable period", reason: "Cleaning" },
    ]);
  });

  /** VEN-AVL-07-B: a requested range overlapping a blockout shows its reason. */
  it("reports an unavailable period reason", () => {
    const result = checkVenueAvailability(
      {
        ...venue,
        unavailablePeriods: [
          {
            id: "p1",
            start: "2030-01-12T04:00:00Z",
            end: "2030-01-12T05:00:00Z",
            reason: "Maintenance",
          },
        ],
      },
      "2030-01-12T04:15:00Z",
      "2030-01-12T04:45:00Z",
    );

    expect(result).toMatchObject([
      { label: "Unavailable period", reason: "Maintenance" },
    ]);
  });
});
