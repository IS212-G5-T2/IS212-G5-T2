/*
 * SPM-63 AC4: the CSV and PDF download. downloadReportExport turns each server answer into either a file or a
 * user-facing message. The network is stubbed at fetch; the messages are literals from the code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/utils/api";
import { downloadReportExport } from "@/features/registrations/lib/registrationReport";

const EVENT_ID = "EVT-101";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const fetchMock = () => vi.mocked(fetch);

describe("SPM-63 AC4: downloadReportExport", () => {
  // Kills: the request for the wrong format, or the session cookie not sent.
  it("requests the export for the chosen format with the session cookie", async () => {
    fetchMock().mockResolvedValue(new Response("a,b\n", { status: 200 }));
    await downloadReportExport(EVENT_ID, "pdf");
    const [url, init] = fetchMock().mock.calls[0];
    expect(String(url)).toContain(`/api/events/${EVENT_ID}/registrations/report/export?format=pdf`);
    expect(init).toMatchObject({ credentials: "include" });
  });

  // Kills: the header filename ignored when present.
  it("uses the filename from the Content-Disposition header", async () => {
    fetchMock().mockResolvedValue(
      new Response("a,b\n", {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="cloud_101_registrations.csv"' },
      }),
    );
    const { filename } = await downloadReportExport(EVENT_ID, "csv");
    expect(filename).toBe("cloud_101_registrations.csv");
  });

  // Kills: no fallback when the header is hidden, or the fallback uses the event name instead of the id.
  it("falls back to <event id>_registrations.<format> when the header is absent", async () => {
    fetchMock().mockResolvedValue(new Response("a,b\n", { status: 200 }));
    const { filename, blob } = await downloadReportExport(EVENT_ID, "csv");
    expect(filename).toBe("EVT-101_registrations.csv");
    expect(blob.size).toBeGreaterThan(0);
  });

  // Kills: a network failure leaking the raw error, or a different message.
  it("reports a network failure as a connection message", async () => {
    fetchMock().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(downloadReportExport(EVENT_ID, "csv")).rejects.toMatchObject({
      message: "Unable to reach the server. Check your connection and try again.",
    });
  });

  // Kills: a 5xx answer shown as the server's text, or the status dropped from the error.
  it("answers a 5xx with the service-unavailable message and keeps the status", async () => {
    fetchMock().mockResolvedValue(new Response(JSON.stringify({ message: "db down" }), { status: 503 }));
    const error = await downloadReportExport(EVENT_ID, "pdf").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: "The service is temporarily unavailable. Please try again.",
      status: 503,
    });
  });

  // Kills: the server's message ignored for a 4xx.
  it("shows the server's message for a 4xx answer with a JSON body", async () => {
    fetchMock().mockResolvedValue(
      new Response(JSON.stringify({ message: "You do not have access to this event's registrations." }), { status: 403 }),
    );
    await expect(downloadReportExport(EVENT_ID, "csv")).rejects.toMatchObject({
      message: "You do not have access to this event's registrations.",
      status: 403,
    });
  });

  // Kills: a non-JSON error body crashing the handler, or the generic text missing.
  it("falls back to 'Request failed.' for a 4xx answer whose body is not JSON", async () => {
    fetchMock().mockResolvedValue(new Response("<html>nope</html>", { status: 400 }));
    await expect(downloadReportExport(EVENT_ID, "csv")).rejects.toMatchObject({
      message: "Request failed.",
      status: 400,
    });
  });
});
