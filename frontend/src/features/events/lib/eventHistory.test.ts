/* SPM-157 AC5: how changed values are shown (AUDIT-HISTORY-05-E). */
import { describe, expect, it } from "vitest";
import { changeLines, formatHistoryValue, groupByDay, visibleSections } from "@/features/events/lib/eventHistory";
import type { EventHistory } from "@/features/events/types/eventHistory";

describe("SPM-157 event history display rules", () => {
  /** AUDIT-HISTORY-05-E: instants in Singapore time, lists joined, nothing as "None". */
  it("AUDIT-HISTORY-05-E formats each kind of value", () => {
    expect(formatHistoryValue("2027-02-05T10:30:00.000Z")).toBe("5 Feb 2027, 6:30 pm SGT");
    expect(formatHistoryValue(null)).toBe("None");
    expect(formatHistoryValue(undefined)).toBe("None");
    expect(formatHistoryValue("")).toBe("None");
    expect(formatHistoryValue([])).toBe("None");
    expect(formatHistoryValue(["Projector", "Microphone"])).toBe("Projector, Microphone");
    expect(formatHistoryValue(150)).toBe("150");
    expect(formatHistoryValue(true)).toBe("Yes");
    expect(formatHistoryValue(false)).toBe("No");
    expect(formatHistoryValue("Planning")).toBe("Planning");
    expect(formatHistoryValue("2027-99-99T99:99 not a date")).toBe("2027-99-99T99:99 not a date");
    expect(formatHistoryValue({ a: 1 })).toBe('{"a":1}');
  });

  /** AUDIT-HISTORY-08-B: only the sections the server returned, in the AC1 to AC4 order. */
  it("AUDIT-HISTORY-08-B lists only the returned sections in order", () => {
    const history = (sections: EventHistory["sections"]): EventHistory =>
      ({ eventId: "e", eventName: "E", eventStatus: "Planning", viewer: "coordinator", sections });
    expect(visibleSections(history({ registrations: [], event: [], equipment: [], venueBookings: [] })))
      .toEqual(["event", "venueBookings", "equipment", "registrations"]);
    expect(visibleSections(history({ registrations: [], event: [] }))).toEqual(["event", "registrations"]);
  });

  /** AUDIT-HISTORY-05-E: each change becomes one readable line. */
  it("AUDIT-HISTORY-05-E turns changes into readable lines", () => {
    expect(changeLines([
      { field: "status", label: "Status", from: "Submitted", to: "Approved" },
      { field: "coordinator", label: "Coordinator", from: null, to: "Marcus Lee" },
      { field: "status", label: "Status", from: "Approved", to: null },
      { field: "message", label: "Message", from: null, to: "About five." },
      { field: "operationalNotes", label: "Operational notes", from: "Old", to: "New" },
      { field: "issues", label: "Issues", from: [], to: [] },
      { field: "holdExpiresAt", label: "Hold expires", from: null, to: "2027-02-05T10:30:00.000Z" },
    ])).toEqual([
      { kind: "change", label: "Status", from: "Submitted", to: "Approved" },
      { kind: "set", label: "Coordinator", value: "Marcus Lee" },
      { kind: "cleared", label: "Status", from: "Approved" },
      { kind: "quote", label: "Message", value: "About five." },
      { kind: "change", label: "Operational notes", from: "Old", to: "New" },
      { kind: "set", label: "Hold expires", value: "5 Feb 2027, 6:30 pm SGT" },
    ]);
  });

  /** AUDIT-HISTORY-05-E: a new start and end become one time range; a changed one stays two lines. */
  it("AUDIT-HISTORY-05-E merges a new slot into one time range only when both ends are new", () => {
    const start = { field: "start", label: "Start", from: null, to: "2026-11-05T23:01:00.000Z" };
    const end = { field: "end", label: "End", from: null, to: "2026-11-06T01:01:00.000Z" };
    expect(changeLines([start, end])).toEqual([{ kind: "period", label: "Time", value: "6 Nov 2026, 7:01 am – 9:01 am SGT" }]);
    expect(changeLines([{ ...start, from: "2026-11-04T23:01:00.000Z" }, end]).map((line) => line.kind)).toEqual(["change", "set"]);
    expect(changeLines([start]).map((line) => line.kind)).toEqual(["set"]);
  });

  /** AUDIT-HISTORY-06-C: entries grouped by Singapore day, order kept. */
  it("AUDIT-HISTORY-06-C groups entries by Singapore day in order", () => {
    const at = (occurredAt: string, id: string) => ({ id, occurredAt });
    // 15:59 UTC is 11:59 pm SGT on the 14th; 16:00 UTC is midnight SGT on the 15th.
    expect(groupByDay([at("2026-10-14T15:59:00.000Z", "a"), at("2026-10-14T16:00:00.000Z", "b"), at("2026-10-15T01:00:00.000Z", "c")]))
      .toEqual([
        { day: "14 Oct 2026", entries: [{ id: "a", occurredAt: "2026-10-14T15:59:00.000Z" }] },
        { day: "15 Oct 2026", entries: [
          { id: "b", occurredAt: "2026-10-14T16:00:00.000Z" },
          { id: "c", occurredAt: "2026-10-15T01:00:00.000Z" },
        ] },
      ]);
    expect(groupByDay([])).toEqual([]);
  });
});
