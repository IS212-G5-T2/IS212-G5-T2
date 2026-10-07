import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { formatDateTime, formatDateTimeRange } from "@/utils/format";
import {
  PLANNING_REFRESH_MS,
  PLANNING_STATUSES,
  describeCondition,
  fetchChangeHistory,
  fetchPlanningView,
  fieldLabel,
  formatFieldValue,
  isPlanningView,
  resolvePlanningChange,
  satisfiesCondition,
  updatePlanning,
} from "@/utils/planning";

/**
 * SPM-97 / SPM-49 / SPM-85 — shared helpers: API calls (paths, methods, bodies),
 * the response guard, labels and value formatting.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const validView = {
  event: { id: "e1" },
  venueBookings: [],
  equipmentArrangements: [],
  pendingChanges: [],
  editableFields: [],
  readOnly: true,
  lastUpdatedAt: "2026-10-04T09:00:00.000Z",
};

beforeEach(() => vi.clearAllMocks());

describe("planning constants", () => {
  // EVENT-VIEW-05-A: AC5 — the view refreshes every 15 seconds.
  it("EVENT-VIEW-05-A refreshes every 15 seconds", () => {
    expect(PLANNING_REFRESH_MS).toBe(15_000);
  });

  // EVENT-VIEW-01-A / 01-C: the statuses that get planning information match the backend.
  it("EVENT-VIEW-01-A loads planning information for approved, planning and confirmed events only", () => {
    expect([...PLANNING_STATUSES].sort()).toEqual(["approved", "confirmed", "planning"]);
  });
});

describe("planning API helpers", () => {
  // EVENT-VIEW-02-A: the organiser/coordinator view is read from /planning.
  it("EVENT-VIEW-02-A reads the planning view from the planning endpoint", async () => {
    apiMock.mockResolvedValue(validView);
    await expect(fetchPlanningView("e1")).resolves.toEqual(validView);
    expect(apiMock).toHaveBeenCalledWith("/events/e1/planning");
  });

  // EVENT-VIEW-02-A: anything that is not planning data is an error rather than data.
  it.each([null, undefined, "text", {}, { ...validView, event: undefined }, { ...validView, venueBookings: "x" }, { ...validView, pendingChanges: null }])(
    "EVENT-VIEW-02-A rejects a malformed response %j",
    async (response) => {
      apiMock.mockResolvedValue(response);
      await expect(fetchPlanningView("e1")).rejects.toThrow("Planning information could not be read.");
    },
  );

  it("EVENT-VIEW-02-A accepts a well-formed response in the guard", () => {
    expect(isPlanningView(validView)).toBe(true);
    expect(isPlanningView({ ...validView, equipmentArrangements: undefined })).toBe(false);
  });

  // EVENT-UPDATE-03-A: updates are PATCH requests carrying only the changed fields.
  it("EVENT-UPDATE-03-A sends an update as a PATCH with the changed fields", async () => {
    apiMock.mockResolvedValue({ applied: [], flagged: [] });
    await updatePlanning("e1", { expectedAttendance: 120 });
    expect(apiMock).toHaveBeenCalledWith("/events/e1/planning", {
      method: "PATCH",
      body: JSON.stringify({ expectedAttendance: 120 }),
    });
  });

  // EVENT-FLAG-04-A / 07-A: a decision names the change and, for one booking, that booking.
  it.each([
    [{ changeId: "chg-1", decision: "confirm" as const }, { decision: "confirm" }],
    [{ changeId: "chg-1", decision: "reject" as const }, { decision: "reject" }],
    [{ changeId: "chg-1", decision: "confirm" as const, bookingId: "bk-1" }, { decision: "confirm", bookingId: "bk-1" }],
  ])("EVENT-FLAG-04-A posts a decision %j", async (request, body) => {
    apiMock.mockResolvedValue({});
    await resolvePlanningChange("e1", request);
    expect(apiMock).toHaveBeenCalledWith("/events/e1/planning/changes/chg-1/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });

  // EVENT-FLAG-05-A: the history is read from /planning/history, and a bad response means no history rather than a crash.
  it("EVENT-FLAG-05-A reads the history and treats a malformed response as empty", async () => {
    const entries = [{ id: "h1" }];
    apiMock.mockResolvedValueOnce(entries);
    await expect(fetchChangeHistory("e1")).resolves.toEqual(entries);
    expect(apiMock).toHaveBeenCalledWith("/events/e1/planning/history");
    apiMock.mockResolvedValueOnce({ not: "a list" });
    await expect(fetchChangeHistory("e1")).resolves.toEqual([]);
  });
});

describe("planning labels and values", () => {
  // EVENT-UPDATE-02-A: fields have the same names everywhere they appear.
  it("EVENT-UPDATE-02-A names each field and falls back to the raw key", () => {
    expect(fieldLabel("expectedAttendance")).toBe("Expected attendance");
    expect(fieldLabel("startDateTime")).toBe("Start date & time");
    expect(fieldLabel("venue")).toBe("Venue");
    expect(fieldLabel("somethingNew")).toBe("somethingNew");
  });

  // EVENT-FLAG-02-A / 05-A: values read as people write them.
  it.each([
    ["name", null, "None"],
    ["name", undefined, "None"],
    ["name", "", "None"],
    ["name", "   ", "None"],
    ["name", "Orientation", "Orientation"],
    ["expectedAttendance", 80, "80"],
    ["expectedAttendance", 0, "0"],
    ["facilities", [], "None"],
    ["facilities", ["Catering", "Stage"], "Catering, Stage"],
  ])("EVENT-FLAG-02-A formats %s = %j as %j", (field, value, expected) => {
    expect(formatFieldValue(field, value)).toBe(expected);
  });

  it("EVENT-FLAG-02-A formats start and end values as date-times but leaves other strings alone", () => {
    const iso = "2026-11-10T10:00:00.000Z";
    expect(formatFieldValue("startDateTime", iso)).toBe(formatDateTime(iso));
    expect(formatFieldValue("endDateTime", iso)).toBe(formatDateTime(iso));
    expect(formatFieldValue("description", iso)).toBe(iso);
  });
});

describe("describeCondition (SPM-49 AC2)", () => {
  // EVENT-UPDATE-02-B: each conditional rule reads as a plain sentence.
  it("EVENT-UPDATE-02-B describes each kind of condition", () => {
    const start = "2026-11-10T10:00:00.000Z";
    const end = "2026-11-10T13:00:00.000Z";
    expect(describeCondition({ kind: "within_window", start, end })).toContain(formatDateTimeRange(start, end));
    expect(describeCondition({ kind: "max_attendance", max: 200 })).toBe(
      "Applies immediately up to 200 attendees; more needs review.",
    );
    expect(describeCondition({ kind: "remove_only" })).toBe(
      "Removing facilities applies immediately; adding any needs review.",
    );
  });
});

describe("satisfiesCondition (mirrors the backend compatibility rules)", () => {
  const window = { kind: "within_window" as const, start: "2026-11-10T10:00:00.000Z", end: "2026-11-10T13:00:00.000Z" };

  // EVENT-UPDATE-05-B: the window allows times inside it, edges included.
  it.each([
    ["the same window", "10:00", "13:00", true],
    ["a shorter event inside it", "10:30", "12:00", true],
    ["an earlier start", "09:59", "13:00", false],
    ["a later end", "10:00", "13:01", false],
    ["an end before the start", "12:00", "11:00", false],
  ])("EVENT-UPDATE-05-B within_window accepts %s: %s–%s → %s", (_label, from, to, expected) => {
    expect(
      satisfiesCondition(window, { startDateTime: `2026-11-10T${from}:00.000Z`, endDateTime: `2026-11-10T${to}:00.000Z` }),
    ).toBe(expected);
  });

  // EVENT-UPDATE-05-B: an unreadable time cannot be confirmed as compatible.
  it("EVENT-UPDATE-05-B treats a missing time as needing review", () => {
    expect(satisfiesCondition(window, { startDateTime: window.start })).toBe(false);
  });

  // EVENT-UPDATE-05-B: attendance up to the capacity applies immediately.
  it.each([
    [70, true],
    [200, true],
    [201, false],
    [undefined, false],
  ])("EVENT-UPDATE-05-B max_attendance 200 with %s → %s", (attendance, expected) => {
    expect(satisfiesCondition({ kind: "max_attendance", max: 200 }, { expectedAttendance: attendance })).toBe(expected);
  });

  // EVENT-UPDATE-05-B: only removals keep every venue suitable.
  it.each([
    [["Catering"], true],
    [[], true],
    [["Catering", "Stage"], false],
  ])("EVENT-UPDATE-05-B remove_only with %j → %s", (facilities, expected) => {
    expect(
      satisfiesCondition({ kind: "remove_only" }, { facilities, currentFacilities: ["Catering", "Projector"] }),
    ).toBe(expected);
  });
});
