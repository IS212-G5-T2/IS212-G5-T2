/*
 * Story: SPM-63 View Registration Information (Organiser and Coordinator), the report page.
 * ACs: AC1 (view the report), AC2 (count), AC3 (table), AC4 (export, empty state), AC5 (refused states),
 *      AC6 (updates within 10 seconds without a manual refresh).
 * Test cases: VIEW-REG-INFO-01-A, 01-B (incl. the added stale-response race), 01-C, 02-B (remount), 04-A (download),
 *             04-C (empty state, export errors), 05-A, 05-D (FE), 06-A, 06-B.
 * Matrix deviation (Q11): one page serves both roles at one URL, so the coordinator and organiser page tests live here.
 * 06-A/06-B live on the page, not on ReportTable, because the page owns the polling lifecycle (hook), while
 * ReportTable is presentational.
 *
 * HTTP is mocked at the boundary (api() for JSON, fetch for the download); the store and router are real.
 * Oracles are literals from the Confluence cases and the prompt's resolved specs. Polling tests use fake timers that
 * are advanced explicitly; latency is asserted at the 10 000 ms limit, never with wall-clock time.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { RegistrationReportPage } from "./RegistrationReportPage";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAppStore } from "@/store/useAppStore";
import { ApiError, api } from "@/utils/api";
import type { RegistrationReport } from "@/features/registrations/lib/registrationReport";
import {
  ALICE_TAN, ATT_01, CHLOE_NG, COO_01, COO_02, DEV_PATEL, FARHAN_RAHMAN, ORG_01, T0, buildReport,
} from "@/features/registrations/components/report/report.fixtures";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const MSG_08 = "You do not have access to this event's registrations.";
const URL_101 = "/events/EVT-101/registrations/report";
const URL_105 = "/events/EVT-105/registrations/report";
const forbidden = () => new ApiError(MSG_08, undefined, undefined, 403);

/** EVT-105 "Data Science Meetup": capacity 2, full, Ben Lim and Dev Patel. */
const BEN_LIM = { ...ALICE_TAN, registrationId: "REG-9005", fullName: "Ben Lim", email: "ben.lim@example.com" };
const report105 = () =>
  buildReport({
    event: { id: "EVT-105", name: "Data Science Meetup", startDateTime: "2026-10-20T10:00:00.000Z", endDateTime: "2026-10-20T12:00:00.000Z", capacity: 2 },
    registrations: [DEV_PATEL, BEN_LIM],
    availableSpots: 0,
  });

/** Answers `/events/<id>/registrations/report` from a per-event handler. */
function serve(handlers: Record<string, () => Promise<RegistrationReport>>) {
  apiMock.mockImplementation((path: string) => {
    const match = /^\/events\/([^/]+)\/registrations\/report$/.exec(path);
    const handler = match && handlers[match[1]];
    return handler ? (handler() as never) : (Promise.reject(new Error(`unexpected request ${path}`)) as never);
  });
}
const ok = (report: RegistrationReport) => () => Promise.resolve(report);

function Layout() {
  return (
    <>
      <nav>
        <Link to={URL_101}>go EVT-101</Link>
        <Link to={URL_105}>go EVT-105</Link>
      </nav>
      <Outlet />
    </>
  );
}

function renderPage(path = URL_101) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/events/:id/registrations/report" element={<RequireAuth><RegistrationReportPage /></RequireAuth>} />
          <Route path="/events/:id" element={<p>Attendee event view</p>} />
        </Route>
        <Route path="/login" element={<p>Login screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const rowCount = () => screen.queryAllByRole("row").length - 1; // minus the header row
const names = () => screen.queryAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);

/** Lets pending promises settle and advances fake timers (use only when fake timers are on). */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  apiMock.mockReset();
  useAppStore.setState({ authLoading: false, isAuthenticated: true, currentUser: COO_01, events: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SPM-63 AC1: a manager sees the report for their event", () => {
  // VIEW-REG-INFO-01-A
  // Oracle (SPEC 01-A FE, F1): heading "Tech Talk: Cloud 101 - Registration Report", the table rendered with its three
  // rows, no error state; the request is for this event's report.
  // Kills: link/route built with the wrong event id; an error shown for a valid manager.
  it("VIEW-REG-INFO-01-A: the coordinator's report page shows the heading and the table", async () => {
    // Arrange
    serve({ "EVT-101": ok(buildReport()) });

    // Act
    renderPage();

    // Assert
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Tech Talk: Cloud 101 - Registration Report");
    expect(rowCount()).toBe(3);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/events/EVT-101/registrations/report");
  });

  // VIEW-REG-INFO-01-C
  // Oracle (SPEC 01-C FE): the owning organiser sees the same heading and table.
  // Kills: the page restricted to the coordinator role.
  it("VIEW-REG-INFO-01-C: the organiser's report page shows the same report", async () => {
    // Arrange
    useAppStore.setState({ currentUser: ORG_01 });
    serve({ "EVT-101": ok(buildReport()) });

    // Act
    renderPage();

    // Assert
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Tech Talk: Cloud 101 - Registration Report");
    expect(names()).toEqual(["Dev Patel", "Alice Tan", "Chloe Ng"]);
  });

  // VIEW-REG-INFO-01-B
  // Oracle (SPEC 01-B): EVT-101 shows 3 rows; switching to EVT-105 shows 2 rows (Ben Lim, Dev Patel) under
  // "Data Science Meetup - Registration Report"; back to EVT-101 shows 3 again.
  // Kills: fetch not keyed by event id (the second event shows the first event's rows).
  it("VIEW-REG-INFO-01-B: switching events shows each event's own report", async () => {
    // Arrange
    serve({ "EVT-101": ok(buildReport()), "EVT-105": ok(report105()) });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Tech Talk: Cloud 101 - Registration Report")).toBeInTheDocument();
    expect(rowCount()).toBe(3);

    // Act / Assert: to EVT-105
    await user.click(screen.getByRole("link", { name: "go EVT-105" }));
    expect(await screen.findByText("Data Science Meetup - Registration Report")).toBeInTheDocument();
    expect(names()).toEqual(["Dev Patel", "Ben Lim"]);
    expect(screen.getByText("2 Attendees Registered (2 / 2)")).toBeInTheDocument();

    // Act / Assert: back to EVT-101
    await user.click(screen.getByRole("link", { name: "go EVT-101" }));
    expect(await screen.findByText("Tech Talk: Cloud 101 - Registration Report")).toBeInTheDocument();
    expect(rowCount()).toBe(3);
  });

  // VIEW-REG-INFO-01-B-RACE
  // Oracle (SPEC 2.5 added to 01-B): a slow EVT-101 response that arrives after the user moved to EVT-105 must not
  // overwrite the EVT-105 table.
  // Kills: M17 a late response for the previous event applied.
  it("VIEW-REG-INFO-01-B-RACE: a late response for the previous event is ignored", async () => {
    // Arrange: EVT-101 answers only when we say so.
    let release101: (report: RegistrationReport) => void = () => undefined;
    serve({
      "EVT-101": () => new Promise<RegistrationReport>((resolve) => { release101 = resolve; }),
      "EVT-105": ok(report105()),
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("link", { name: "go EVT-105" }));
    expect(await screen.findByText("Data Science Meetup - Registration Report")).toBeInTheDocument();

    // Act: the slow EVT-101 response now arrives.
    await act(async () => { release101(buildReport()); });

    // Assert: still the EVT-105 report.
    expect(screen.getByText("Data Science Meetup - Registration Report")).toBeInTheDocument();
    expect(screen.queryByText("Tech Talk: Cloud 101 - Registration Report")).not.toBeInTheDocument();
    expect(names()).toEqual(["Dev Patel", "Ben Lim"]);
  });
});

describe("SPM-63 AC2: the count is read fresh on every visit", () => {
  // VIEW-REG-INFO-02-B
  // Oracle (SPEC 02-B FE): a remount after a registration shows "4 Attendees Registered (4 / 50)"; a remount after a
  // withdrawal shows "2 Attendees Registered (2 / 50)".
  // Kills: the report cached on the client between visits.
  it("VIEW-REG-INFO-02-B: each mount refetches and shows the new count", async () => {
    // Arrange: the server answers 4, then 2.
    const four = buildReport({ registrations: [DEV_PATEL, ALICE_TAN, CHLOE_NG, FARHAN_RAHMAN] });
    const two = buildReport({ registrations: [DEV_PATEL, CHLOE_NG] });
    const answers = [four, two];
    serve({ "EVT-101": () => Promise.resolve(answers.shift()!) });

    // Act / Assert: first mount
    const first = renderPage();
    expect(await screen.findByText("4 Attendees Registered (4 / 50)")).toBeInTheDocument();
    first.unmount();

    // Act / Assert: second mount
    renderPage();
    expect(await screen.findByText("2 Attendees Registered (2 / 50)")).toBeInTheDocument();
    expect(screen.queryByText(/4 Attendees/)).not.toBeInTheDocument();
  });
});

describe("SPM-63 AC4: exporting the report", () => {
  /** Stubs fetch, the object-URL API and the anchor click so a download can be observed. */
  function stubDownload(response: () => Promise<Response>) {
    const fetchMock = vi.fn(response);
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn(() => "blob:report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const saved: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ download: this.download, href: this.href });
    });
    return { fetchMock, createObjectURL, revokeObjectURL, saved };
  }
  const csvResponse = () =>
    new Response("﻿Name,Email\r\n", {
      status: 200,
      headers: { "Content-Disposition": 'attachment; filename="EVT-101_registrations_2026-09-29.csv"', "Content-Type": "text/csv; charset=utf-8" },
    });

  // VIEW-REG-INFO-04-A
  // Oracle (SPEC 04-A FE, D15): "Export as CSV" sends exactly one authenticated (credentialed) request for format=csv and
  // saves the file under the server's filename; the object URL is revoked.
  // Kills: a plain link that drops the session; a client-invented filename; a leaked object URL.
  it("VIEW-REG-INFO-04-A: Export as CSV downloads under the server filename", async () => {
    // Arrange
    serve({ "EVT-101": ok(buildReport()) });
    const { fetchMock, revokeObjectURL, saved } = stubDownload(() => Promise.resolve(csvResponse()));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 Attendees Registered (3 / 50)");

    // Act
    await user.click(screen.getByRole("button", { name: "Export as CSV" }));

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/api/events/EVT-101/registrations/report/export?format=csv")).toBe(true);
    expect(init.credentials).toBe("include");
    expect(saved).toEqual([{ download: "EVT-101_registrations_2026-09-29.csv", href: "blob:report" }]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  // VIEW-REG-INFO-04-B
  // Oracle (SPEC 04-B FE): "Export as PDF" requests format=pdf.
  // Kills: both buttons asking for the same format.
  it("VIEW-REG-INFO-04-B: Export as PDF requests the pdf format", async () => {
    // Arrange
    serve({ "EVT-101": ok(buildReport()) });
    const { fetchMock } = stubDownload(() =>
      Promise.resolve(new Response("%PDF-", { status: 200, headers: { "Content-Disposition": 'attachment; filename="EVT-101_registrations_2026-09-29.pdf"' } })),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 Attendees Registered (3 / 50)");

    // Act
    await user.click(screen.getByRole("button", { name: "Export as PDF" }));

    // Assert
    expect((fetchMock.mock.calls[0] as unknown as [string])[0].endsWith("/export?format=pdf")).toBe(true);
  });

  // VIEW-REG-INFO-04-A-BUSY
  // Oracle (D15): the buttons are disabled while a download is in flight, so a double click cannot start two.
  // Kills: two requests for one click-and-click; buttons left enabled.
  it("VIEW-REG-INFO-04-A-BUSY: the export buttons are disabled while downloading", async () => {
    // Arrange: the download resolves only when released.
    serve({ "EVT-101": ok(buildReport()) });
    let release: (r: Response) => void = () => undefined;
    const { fetchMock } = stubDownload(() => new Promise<Response>((resolve) => { release = resolve; }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 Attendees Registered (3 / 50)");

    // Act
    await user.click(screen.getByRole("button", { name: "Export as CSV" }));

    // Assert: busy
    expect(screen.getByRole("button", { name: "Export as CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Export as CSV" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Act / Assert: finished
    await act(async () => { release(csvResponse()); });
    expect(screen.getByRole("button", { name: "Export as CSV" })).toBeEnabled();
  });

  // VIEW-REG-INFO-04-A-ERR
  // Oracle (D15): a 403 or a 500 from the export is shown in the page and nothing is downloaded.
  // Kills: an error swallowed (the user thinks a file was saved); a file saved from an error body.
  it.each([
    [403, JSON.stringify({ message: MSG_08 }), MSG_08],
    [500, JSON.stringify({ message: "boom" }), "The service is temporarily unavailable. Please try again."],
  ])("VIEW-REG-INFO-04-A-ERR: a %i export response is shown as an error", async (status, body, shown) => {
    // Arrange
    serve({ "EVT-101": ok(buildReport()) });
    const { saved } = stubDownload(() => Promise.resolve(new Response(body, { status, headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 Attendees Registered (3 / 50)");

    // Act
    await user.click(screen.getByRole("button", { name: "Export as CSV" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent(shown);
    expect(saved).toEqual([]);
  });

  // VIEW-REG-INFO-04-C
  // Oracle (SPEC 04-C FE): an event with no registrations shows exactly "No registrations yet" and a 0 count.
  // Kills: an error or blank page for an empty report.
  it("VIEW-REG-INFO-04-C: the empty report shows the empty state", async () => {
    // Arrange
    serve({ "EVT-101": ok(buildReport({ registrations: [] })) });

    // Act
    renderPage();

    // Assert
    expect(await screen.findByText("No registrations yet")).toBeInTheDocument();
    expect(screen.getByText("0 Attendees Registered (0 / 50)")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("SPM-63 AC5: people who may not view the report are refused on screen", () => {
  // VIEW-REG-INFO-05-A
  // Oracle (SPEC 05-A FE): COO-02 navigating straight to EVT-101's report sees MSG-08 and no table or attendee data.
  // Kills: the table shown from stale store data; the message dropped.
  it("VIEW-REG-INFO-05-A: an unassigned coordinator sees MSG-08 and no table", async () => {
    // Arrange
    useAppStore.setState({ currentUser: COO_02 });
    serve({ "EVT-101": () => Promise.reject(forbidden()) });

    // Act
    renderPage();

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent(MSG_08);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Dev Patel")).not.toBeInTheDocument();
  });

  // VIEW-REG-INFO-05-D
  // Oracle (SPEC 05-D A FE): a registered attendee gets MSG-08 and is NOT redirected to the attendee event view.
  // Kills: a role guard that bounces the attendee to /events/:id.
  it("VIEW-REG-INFO-05-D: an attendee sees MSG-08 and stays on the report URL", async () => {
    // Arrange
    useAppStore.setState({ currentUser: ATT_01 });
    serve({ "EVT-101": () => Promise.reject(forbidden()) });

    // Act
    renderPage();

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent(MSG_08);
    expect(screen.queryByText("Attendee event view")).not.toBeInTheDocument();
  });

  // VIEW-REG-INFO-05-D
  // Oracle (SPEC 05-D B FE): an expired or missing session (401) sends the user to the login page.
  // Kills: a 401 shown as a generic error; no redirect.
  it("VIEW-REG-INFO-05-D: a 401 redirects to the login page", async () => {
    // Arrange
    serve({ "EVT-101": () => Promise.reject(new ApiError("Missing session", undefined, undefined, 401)) });

    // Act
    renderPage();

    // Assert
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  // VIEW-REG-INFO-01-A-ERR
  // Oracle (derived): a server error on first load is shown with a Retry that fetches again.
  // Kills: an endless spinner; Retry that does nothing.
  it("VIEW-REG-INFO-01-A-ERR: a failed first load offers a retry", async () => {
    // Arrange: first call fails, then succeeds.
    let calls = 0;
    serve({ "EVT-101": () => (++calls === 1 ? Promise.reject(new ApiError("The service is temporarily unavailable. Please try again.", undefined, undefined, 503)) : Promise.resolve(buildReport())) });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("The service is temporarily unavailable. Please try again.");

    // Act
    await user.click(screen.getByRole("button", { name: "Retry" }));

    // Assert
    expect(await screen.findByText("3 Attendees Registered (3 / 50)")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SPM-63 AC6: the report updates by itself within 10 seconds", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });

  /** First call: 3 rows; later calls: the supplied report. */
  function threeThen(next: () => Promise<RegistrationReport>) {
    let calls = 0;
    serve({ "EVT-101": () => (++calls === 1 ? Promise.resolve(buildReport()) : next()) });
  }

  // VIEW-REG-INFO-06-A
  // Oracle (SPEC 06-A): initial "3 Attendees Registered (3 / 50)"; ATT-05 Farhan Rahman registers; after exactly 10 000 ms
  // and no user action the header reads "4 Attendees Registered (4 / 50)", Farhan's row is present with his email, contact
  // number, SGT date and Confirmed, there are exactly 4 rows (no duplicates) and console.error was not called.
  // Kills: M15 polling that appends instead of replaces; a poll interval over 10 s; a header that does not update.
  it("VIEW-REG-INFO-06-A: a new registration appears within 10 seconds, once", async () => {
    // Arrange
    const consoleError = vi.spyOn(console, "error");
    threeThen(ok(buildReport({ registrations: [DEV_PATEL, ALICE_TAN, CHLOE_NG, FARHAN_RAHMAN] })));
    renderPage();
    await advance(0);
    expect(screen.getByText("3 Attendees Registered (3 / 50)")).toBeInTheDocument();

    // Act: no user action, only time.
    await advance(10_000);

    // Assert
    expect(screen.getByText("4 Attendees Registered (4 / 50)")).toBeInTheDocument();
    expect(rowCount()).toBe(4);
    const farhan = screen.getByText("Farhan Rahman").closest("tr")!;
    expect(within(farhan).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Farhan Rahman", "farhan.rahman@example.com", "81234567", "29 Sep 2026 12:00 SGT", "Confirmed",
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  // VIEW-REG-INFO-06-B
  // Oracle (SPEC 06-B): after REG-9001 (Alice Tan) is withdrawn, within 10 000 ms the header reads
  // "2 Attendees Registered (2 / 50)" and Alice's row is gone.
  // Kills: only the count updating while the withdrawn row stays; withdrawn row kept until a manual refresh.
  it("VIEW-REG-INFO-06-B: a withdrawal removes the row within 10 seconds", async () => {
    // Arrange
    threeThen(ok(buildReport({ registrations: [DEV_PATEL, CHLOE_NG] })));
    renderPage();
    await advance(0);
    expect(names()).toEqual(["Dev Patel", "Alice Tan", "Chloe Ng"]);

    // Act
    await advance(10_000);

    // Assert
    expect(screen.getByText("2 Attendees Registered (2 / 50)")).toBeInTheDocument();
    expect(names()).toEqual(["Dev Patel", "Chloe Ng"]);
  });

  // VIEW-REG-INFO-06-A-UNMOUNT
  // Oracle (SPEC 2.5 added to 06-A): once the page is closed no further request is made.
  // Kills: M16 interval not cleared on unmount (a closed page keeps downloading personal data).
  it("VIEW-REG-INFO-06-A-UNMOUNT: no requests after the page is closed", async () => {
    // Arrange
    threeThen(ok(buildReport()));
    const view = renderPage();
    await advance(0);
    view.unmount();
    const callsAtUnmount = apiMock.mock.calls.length;

    // Act
    await advance(60_000);

    // Assert
    expect(apiMock.mock.calls.length).toBe(callsAtUnmount);
  });

  // VIEW-REG-INFO-06-A-REVOKE
  // Oracle (SPEC 2.5 added to 06-A): a 403 during polling (access was revoked) stops polling, clears the rows already
  // shown and shows MSG-08.
  // Kills: stale personal data kept on screen after access is revoked; polling continuing after a refusal.
  it("VIEW-REG-INFO-06-A-REVOKE: a 403 while polling clears the rows and stops polling", async () => {
    // Arrange
    threeThen(() => Promise.reject(forbidden()));
    renderPage();
    await advance(0);
    expect(rowCount()).toBe(3);

    // Act
    await advance(10_000);
    const callsAfterRefusal = apiMock.mock.calls.length;
    await advance(60_000);

    // Assert
    expect(screen.getByRole("alert")).toHaveTextContent(MSG_08);
    expect(screen.queryByText("Dev Patel")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(apiMock.mock.calls.length).toBe(callsAfterRefusal);
  });

  // VIEW-REG-INFO-06-A-SESSION
  // Oracle (derived, R13): a 401 while polling (session ended) stops polling and sends the user to login.
  // Kills: polling on with an expired session.
  it("VIEW-REG-INFO-06-A-SESSION: a 401 while polling redirects to login and stops", async () => {
    // Arrange
    threeThen(() => Promise.reject(new ApiError("Missing session", undefined, undefined, 401)));
    renderPage();
    await advance(0);

    // Act
    await advance(10_000);
    const callsAfter = apiMock.mock.calls.length;
    await advance(60_000);

    // Assert
    expect(screen.getByText("Login screen")).toBeInTheDocument();
    expect(apiMock.mock.calls.length).toBe(callsAfter);
  });

  // VIEW-REG-INFO-06-A-BLIP
  // Oracle (ASSUMED A13): a transient failure during polling keeps the rows on screen and polling carries on, so the next
  // good response is applied.
  // Kills: the table blanked by a network blip; polling stopped for good by one failure.
  it("VIEW-REG-INFO-06-A-BLIP: a transient failure keeps the rows and the next poll recovers", async () => {
    // Arrange: call 1 ok (3 rows), call 2 fails, call 3 returns 4 rows.
    let calls = 0;
    serve({
      "EVT-101": () => {
        calls += 1;
        if (calls === 1) return Promise.resolve(buildReport());
        if (calls === 2) return Promise.reject(new ApiError("Unable to reach the server. Check your connection and try again."));
        return Promise.resolve(buildReport({ registrations: [DEV_PATEL, ALICE_TAN, CHLOE_NG, FARHAN_RAHMAN] }));
      },
    });
    renderPage();
    await advance(0);

    // Act / Assert: after the failed poll the rows remain.
    await advance(5_000);
    expect(rowCount()).toBe(3);

    // Act / Assert: the following poll recovers.
    await advance(5_000);
    expect(rowCount()).toBe(4);
  });

  // VIEW-REG-INFO-06-A-INFLIGHT
  // Oracle (derived): while a request is still outstanding no second one is started, so a slow server is not flooded.
  // Kills: overlapping requests piling up behind a slow response.
  it("VIEW-REG-INFO-06-A-INFLIGHT: no new request while one is still pending", async () => {
    // Arrange: the very first request never answers.
    serve({ "EVT-101": () => new Promise<RegistrationReport>(() => undefined) });
    renderPage();
    await advance(0);

    // Act
    await advance(30_000);

    // Assert
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  // VIEW-REG-INFO-01-B-POLL
  // Oracle (SPEC 2.5 / 3.1): changing event stops polling the old event.
  // Kills: the interval of the previous event surviving a navigation.
  it("VIEW-REG-INFO-01-B-POLL: after switching events only the new event is polled", async () => {
    // Arrange
    serve({ "EVT-101": ok(buildReport()), "EVT-105": ok(report105()) });
    renderPage();
    await advance(0);
    fireEvent.click(screen.getByRole("link", { name: "go EVT-105" }));
    await advance(0);
    apiMock.mockClear();

    // Act
    await advance(10_000);

    // Assert
    const paths = apiMock.mock.calls.map((call) => call[0]);
    expect(paths.length).toBeGreaterThan(0);
    expect(new Set(paths)).toEqual(new Set(["/events/EVT-105/registrations/report"]));
  });
});

// ASSUMPTION index
// A13: a transient poll failure keeps the rows and polling continues                  -> 06-A-BLIP
// A14: the export error text for a 5xx reuses the generic api() wording               -> 04-A-ERR
// Not Automated: real WebSocket/push, the real browser download dialog, visual layout.
