/*
 * Story: SPM-63 View Registration Information (Organiser and Coordinator), frontend helpers.
 * ACs: AC2 (count wording), AC3 (dates in SGT), AC1/AC5 (who gets a link), AC4 (download filename).
 * Test cases: VIEW-REG-INFO-02-A (count lines), 03-A (SGT cells), 04-A (filename), 01-A / 01-C / 05-A / 05-B (links).
 *
 * Pure functions. Oracles are literals from the Confluence cases and the prompt's resolved specs; the date tests are
 * also run under TZ=UTC, Asia/Singapore and America/Los_Angeles in Phase 4.
 */
import { describe, expect, it } from "vitest";
import {
  attendeeCountLine,
  canViewRegistrationReport,
  filenameFromDisposition,
  formatReportDateTimeSgt,
  spotsLine,
} from "./registrationReport";

describe("SPM-63 AC3: dates are shown in Singapore time", () => {
  // Oracle (SPEC 03-A): the three seeded instants read 15:00, 10:30 and 09:00 SGT, never the UTC hour.
  // Kills: UTC hour (07:00) or process-TZ formatting; the SGT suffix missing.
  it.each([
    ["2026-09-27T07:00:00.000Z", "27 Sep 2026 15:00 SGT"],
    ["2026-09-28T02:30:00.000Z", "28 Sep 2026 10:30 SGT"],
    ["2026-09-29T01:00:00.000Z", "29 Sep 2026 09:00 SGT"],
  ])("VIEW-REG-INFO-03-A: %s is shown as %s", (iso, expected) => {
    // Arrange / Act
    const shown = formatReportDateTimeSgt(iso);

    // Assert
    expect(shown).toBe(expected);
  });

  // Oracle (ASSUMED A1): September is "Sep"; and 31 Dec 16:30Z is 1 Jan 00:30 SGT of the next year.
  // Kills: relying on Intl's "Sept"; the UTC date used.
  it("VIEW-REG-INFO-03-A-BND: a fixed month table and the SGT calendar date are used", () => {
    // Arrange / Act
    const september = formatReportDateTimeSgt("2026-09-01T04:00:00.000Z");
    const newYear = formatReportDateTimeSgt("2026-12-31T16:30:00.000Z");

    // Assert
    expect(september).toBe("1 Sep 2026 12:00 SGT");
    expect(newYear).toBe("1 Jan 2027 00:30 SGT");
  });
});

describe("SPM-63 AC2: count and availability wording mirrors the server", () => {
  // Oracle (SPEC 04-B / F3 and ASSUMED A4): plural, singular and zero.
  // Kills: M20 plural always "Attendees"; singular for zero.
  it.each([
    [3, 50, "3 Attendees Registered (3 / 50)"],
    [1, 50, "1 Attendee Registered (1 / 50)"],
    [0, 50, "0 Attendees Registered (0 / 50)"],
  ])("VIEW-REG-INFO-02-A: %i of %i reads %s", (count, capacity, expected) => {
    // Arrange / Act
    const line = attendeeCountLine(count, capacity);

    // Assert
    expect(line).toBe(expected);
  });

  // Oracle (SPEC 02-A: 50 - 3 = 47; ASSUMED A5 wording and singular).
  // Kills: count and spots swapped; no singular.
  it.each([
    [47, "47 spots available"],
    [1, "1 spot available"],
    [0, "0 spots available"],
  ])("VIEW-REG-INFO-02-A: %i spots reads %s", (spots, expected) => {
    // Arrange / Act
    const line = spotsLine(spots);

    // Assert
    expect(line).toBe(expected);
  });
});

describe("SPM-63 AC4: the download is saved under the server's filename", () => {
  // Oracle (SPEC 04-A, D15): the name is read from Content-Disposition.
  // Kills: a client-invented filename.
  it("VIEW-REG-INFO-04-A: a quoted filename is extracted", () => {
    // Arrange / Act
    const name = filenameFromDisposition('attachment; filename="EVT-101_registrations_2026-09-29.csv"');

    // Assert
    expect(name).toBe("EVT-101_registrations_2026-09-29.csv");
  });

  // Oracle (derived): a missing or unparsable header gives undefined so the caller can fall back.
  // Kills: a thrown error or a garbage name when the header is hidden by CORS.
  it.each([null, "", "attachment"])("VIEW-REG-INFO-04-A-BND: %s gives no filename", (header) => {
    // Arrange / Act
    const name = filenameFromDisposition(header);

    // Assert
    expect(name).toBeUndefined();
  });
});

describe("SPM-63 AC1 / AC5: the entry-point link is only for events the user manages", () => {
  const event = { coordinatorId: "COO-01", organiserId: "ORG-01" };
  const user = (id: string, role: "coordinator" | "organiser" | "attendee") => ({ id, role });

  // Oracle (SPEC 01-A / 01-C): the assigned coordinator and the owning organiser see "View Registrations".
  // Kills: link missing for a manager; wrong column compared.
  it.each([
    ["the assigned coordinator", user("COO-01", "coordinator")],
    ["the owning organiser", user("ORG-01", "organiser")],
  ])("VIEW-REG-INFO-01-A: %s gets the link", (_who, who) => {
    // Arrange / Act
    const allowed = canViewRegistrationReport(who, event);

    // Assert
    expect(allowed).toBe(true);
  });

  // Oracle (SPEC 05-A / 05-B / 05-D): an unassigned coordinator, a non-owning organiser and an attendee do not.
  // Kills: any coordinator or any organiser getting the link; an attendee with a matching id.
  it.each([
    ["an unassigned coordinator", user("COO-02", "coordinator")],
    ["a non-owning organiser", user("ORG-02", "organiser")],
    ["an attendee", user("ATT-01", "attendee")],
    ["a coordinator whose id equals the organiser column", user("ORG-01", "coordinator")],
    ["an organiser whose id equals the coordinator column", user("COO-01", "organiser")],
  ])("VIEW-REG-INFO-05-A: %s gets no link", (_who, who) => {
    // Arrange / Act
    const allowed = canViewRegistrationReport(who, event);

    // Assert
    expect(allowed).toBe(false);
  });

  // Oracle (derived): an event with no coordinator yet matches nobody.
  // Kills: undefined === undefined style matches.
  it("VIEW-REG-INFO-05-A-NULL: an unassigned event gives a coordinator no link", () => {
    // Arrange / Act
    const allowed = canViewRegistrationReport(user("COO-01", "coordinator"), { organiserId: "ORG-01" });

    // Assert
    expect(allowed).toBe(false);
  });
});

// ASSUMPTION index
// A1: "Sep" (not "Sept") and the SGT calendar date                       -> 03-A-BND
// A4: singular "1 Attendee Registered (1 / N)"                           -> 02-A
// A5: "{k} spots available", singular "1 spot available"                 -> 02-A
