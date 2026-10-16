/*
 * Story: SPM-138 owner decision (the SPM-63 report lists every status). The report page's status filter, the table's status
 * badges and positions, the header counts, and the exports that carry the current filter.
 * Test cases: REP-FE-01-A (the filter options), REP-FE-01-B (badges, positions and header counts), REP-FE-02-A (the filter
 * drives the request), REP-FE-03-A (exports pass the filter), REP-FE-03-B (an empty status says so).
 *
 * HTTP is mocked at the boundary (api() for the report JSON, the download function for the exports); the store and router
 * are real. Oracles are literals from the owner decision and the status labels.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RegistrationReportPage } from "./RegistrationReportPage";
import { api } from "@/utils/api";
import { downloadReportExport } from "@/features/registrations/lib/registrationReport";
import type { RegistrationReport, ReportRow } from "@/features/registrations/lib/registrationReport";
import { ALICE_TAN, DEV_PATEL, buildReport } from "@/features/registrations/components/report/report.fixtures";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
vi.mock("@/features/registrations/lib/registrationReport", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadReportExport: vi.fn(),
  saveDownloadedFile: vi.fn(),
}));
const apiMock = vi.mocked(api);
const downloadMock = vi.mocked(downloadReportExport);

const WAITLISTED: ReportRow = {
  ...ALICE_TAN,
  registrationId: "REG-W1",
  fullName: "Wei Ling",
  email: "wei.ling@example.com",
  status: "waitlisted",
  waitlistPosition: 1,
  joinedAt: "2026-09-29T02:00:00.000Z",
};
const WITHDRAWN: ReportRow = { ...ALICE_TAN, registrationId: "REG-X1", fullName: "Ben Lim", email: "ben.lim@example.com", status: "withdrawn" };

/** The event with two Confirmed rows, one waitlisted entry and one withdrawn row. The totals are the event's own. */
const fullReport = (): RegistrationReport =>
  buildReport({
    registrations: [DEV_PATEL, ALICE_TAN, WAITLISTED, WITHDRAWN],
    totalConfirmed: 2,
    waitlistCount: 1,
    availableSpots: 48,
  });

/** Answers the report by its status query: every status, or the one chosen. */
function serve(reportFor: (query: string) => RegistrationReport) {
  apiMock.mockImplementation((path: string) => {
    const match = /^\/events\/EVT-101\/registrations\/report(?:\?(.*))?$/.exec(path);
    return match ? (Promise.resolve(reportFor(match[1] ?? "")) as never) : (Promise.reject(new Error(`unexpected ${path}`)) as never);
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/EVT-101/registrations"]}>
      <Routes>
        <Route path="/events/:id/registrations" element={<RegistrationReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  downloadMock.mockReset();
  downloadMock.mockResolvedValue({ blob: new Blob(["x"]), filename: "tech_talk_registrations.csv" });
});
afterEach(() => vi.clearAllMocks());

describe("REP-FE-01-A: the status filter offers every status", () => {
  // Kills: F-REP-FILTER-OPTIONS (the filter lacks a status option)
  it("REP-FE-01-A: the filter lists All and the five statuses under their labels", async () => {
    serve(() => fullReport());

    renderPage();

    const select = await screen.findByRole("combobox", { name: "Status" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All", "Confirmed", "Waitlisted", "Withdrawn", "Removed", "Cancelled",
    ]);
  });
});

describe("REP-FE-01-B: badges, positions and the header counts", () => {
  // Kills: F-REP-BADGE (the table shows the raw status instead of its badge), F-REP-HEADER (the waitlist count is missing)
  it("REP-FE-01-B: each row carries its status badge, a waitlisted row its position, and the header its counts", async () => {
    serve(() => fullReport());

    renderPage();

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[4].textContent)).toEqual([
      "Confirmed", "Confirmed", "WaitlistedPosition 1", "Withdrawn",
    ]);
    expect(screen.getByText("1 on the waitlist")).toBeInTheDocument();
    expect(screen.getByText("48 spots available")).toBeInTheDocument();
  });
});

describe("REP-FE-02-A: the filter drives the request and the table", () => {
  // Kills: F-REP-FILTER-IGNORED (the request ignores the chosen status), PF-HEADER-ROWS (the header counts the filtered rows), PF-SPOTS-ROWS (the spots line is computed from the filtered rows)
  it("REP-FE-02-A: choosing Waitlisted asks for waitlisted rows, shows only them, and keeps the header totals", async () => {
    serve((query) =>
      query === "status=waitlisted"
        ? buildReport({ registrations: [WAITLISTED], totalConfirmed: 2, waitlistCount: 1, availableSpots: 48 })
        : fullReport(),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table");

    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "waitlisted");

    await waitFor(() => expect(apiMock).toHaveBeenLastCalledWith("/events/EVT-101/registrations/report?status=waitlisted"));
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText("Wei Ling")).toBeInTheDocument();
    expect(within(table).queryByText("Dev Patel")).not.toBeInTheDocument();
    expect(screen.getByText("1 on the waitlist")).toBeInTheDocument();
    expect(screen.getByText("2 Attendees Registered (2 / 50)")).toBeInTheDocument();
    expect(screen.getByText("48 spots available")).toBeInTheDocument();
  });
});

describe("REP-FE-03-A: the exports carry the current filter", () => {
  // Kills: F-REP-EXPORT-IGNORES-FILTER (the export is requested without the chosen status)
  it("REP-FE-03-A: CSV and PDF are requested with the status on screen", async () => {
    serve(() => fullReport());
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table");

    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "withdrawn");
    await waitFor(() => expect(apiMock).toHaveBeenLastCalledWith("/events/EVT-101/registrations/report?status=withdrawn"));
    await user.click(await screen.findByRole("button", { name: "Export As CSV" }));
    await waitFor(() => expect(downloadMock).toHaveBeenLastCalledWith("EVT-101", "csv", "withdrawn"));
    await user.click(screen.getByRole("button", { name: "Export As PDF" }));
    await waitFor(() => expect(downloadMock).toHaveBeenLastCalledWith("EVT-101", "pdf", "withdrawn"));
  });
});

describe("REP-FE-03-B: an empty status says so", () => {
  // Kills: F-REP-EMPTY-STATUS (a filtered empty status shows the all-empty text)
  it("REP-FE-03-B: a status with no rows shows that no registrations have it", async () => {
    serve((query) => (query === "status=removed" ? buildReport({ registrations: [], totalConfirmed: 2, waitlistCount: 1, availableSpots: 48 }) : fullReport()));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table");

    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "removed");

    expect(await screen.findByText("No registrations with this status")).toBeInTheDocument();
  });
});
