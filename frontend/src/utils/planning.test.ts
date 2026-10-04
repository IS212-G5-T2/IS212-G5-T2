import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
import {
  PLANNING_REFRESH_MS,
  PLANNING_STATUSES,
  fetchChangeHistory,
  fetchPlanningView,
  fieldLabel,
  formatFieldValue,
  isPlanningView,
  resolvePlanningChange,
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
