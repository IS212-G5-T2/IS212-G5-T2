/*
 * Story: SPM-138 owner decision (the report lists every status). The library's status parameter on the report request and on
 * the export URL. Test case: REP-FE-03-C (the export URL carries the chosen status; "all" adds no parameter).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadReportExport, reportStatusQuery } from "./registrationReport";

afterEach(() => vi.unstubAllGlobals());

describe("REP-FE-03-C: the export URL carries the chosen status", () => {
  // Kills: F-REP-EXPORT-IGNORES-FILTER (the export URL drops the chosen status)
  it("REP-FE-03-C: the CSV request names the chosen status, and 'all' adds no parameter", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response("x", { status: 200, headers: { "Content-Disposition": 'attachment; filename="a.csv"' } }));
    vi.stubGlobal("fetch", fetchMock);

    await downloadReportExport("EVT-101", "csv", "waitlisted");
    await downloadReportExport("EVT-101", "csv", "all");

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toMatch(/\/registrations\/report\/export\?format=csv&status=waitlisted$/);
    expect(urls[1]).toMatch(/\/registrations\/report\/export\?format=csv$/);
  });

  // Kills: F-REP-QUERY-ALL (the query helper names a status for the all filter)
  it("REP-FE-03-D: the report query is empty for every status and names one status otherwise", () => {
    expect(reportStatusQuery("all")).toBe("");
    expect(reportStatusQuery("registered")).toBe("status=registered");
  });
});
