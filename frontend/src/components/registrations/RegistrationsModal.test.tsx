/*
 * SPM-63 registrations modal (opened from the People card on the event detail page): summary, search and filter,
 * expandable cards, empty states, exports and closing. The API and the download helpers are mocked at the boundary;
 * only Date is faked (the suite clock T0 from report.fixtures) so "Registered today" never depends on the wall clock.
 * Not covered by the backend report contract: special requirements and a waitlist, so the modal does not show them.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationsModal } from "./RegistrationsModal";
import { ALICE_TAN, CHLOE_NG, DEV_PATEL, T0, buildReport } from "./report.fixtures";
import { ApiError, api } from "@/utils/api";
import { downloadReportExport, filterRegistrations, saveDownloadedFile } from "@/utils/registrationReport";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
vi.mock("@/utils/registrationReport", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadReportExport: vi.fn(),
  saveDownloadedFile: vi.fn(),
}));
const apiMock = vi.mocked(api);
const downloadMock = vi.mocked(downloadReportExport);
const saveMock = vi.mocked(saveDownloadedFile);

const OPENS = "2026-09-20T00:00:00.000Z";
const CLOSES = "2026-10-08T15:59:00.000Z";

function renderModal(onClose = vi.fn()) {
  render(<RegistrationsModal eventId="EVT-101" registrationOpensAt={OPENS} registrationClosesAt={CLOSES} onClose={onClose} />);
  return onClose;
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue(buildReport());
  downloadMock.mockReset();
  saveMock.mockReset();
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
});
afterEach(() => vi.useRealTimers());

describe("SPM-63 registrations modal: summary", () => {
  // The title carries the count and the summary shows capacity, the registration period and the no-waitlist note.
  it("shows the count in the title and the capacity, period and waitlist summary", async () => {
    renderModal();

    expect(await screen.findByRole("heading", { name: "Registrations (3)" })).toBeInTheDocument();
    expect(screen.getByText("3 of 50 spots registered · 47 available")).toBeInTheDocument();
    expect(screen.getByText(/Opens: 20 Sep 2026 08:00 SGT · Closes: 8 Oct 2026 23:59 SGT/)).toBeInTheDocument();
    expect(screen.getByText("No waitlist")).toBeInTheDocument();
    expect(screen.getByText(/Event: 9 Oct 2026 18:00 SGT – 9 Oct 2026 21:00 SGT/)).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/events/EVT-101/registrations/report");
  });

  // A refusal from the server shows MSG-08 and no attendee data.
  it("shows the access-refused message and no registrations on a 403", async () => {
    apiMock.mockRejectedValue(new ApiError("nope", undefined, undefined, 403));
    renderModal();

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access to this event's registrations.");
    expect(screen.queryByText(ALICE_TAN.fullName)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export as CSV" })).not.toBeInTheDocument();
  });
});

describe("SPM-63 registrations modal: expandable cards", () => {
  // Collapsed cards show name, email and date; clicking one reveals every detail and clicking again hides them.
  it("expands a card to show details and collapses it again", async () => {
    const user = userEvent.setup();
    renderModal();

    const card = await screen.findByRole("button", { name: /Alice Tan \(alice\.tan@example\.com\)/ });
    expect(card).toHaveTextContent("28 Sep 2026");
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Contact number")).not.toBeInTheDocument();

    await user.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
    const details = within(screen.getByText("Contact number").closest("dl") as HTMLElement);
    expect(details.getByText("98765432")).toBeInTheDocument();
    expect(details.getByText("Vegetarian menu")).toBeInTheDocument();
    expect(details.getByText("28 Sep 2026 10:30 SGT")).toBeInTheDocument();
    expect(details.getByText("Confirmed")).toBeInTheDocument();

    await user.click(card);
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Contact number")).not.toBeInTheDocument();
  });

  // Only one card is open at a time, so opening a second collapses the first.
  it("keeps a single card expanded at a time", async () => {
    const user = userEvent.setup();
    renderModal();

    const first = await screen.findByRole("button", { name: /Dev Patel/ });
    const second = screen.getByRole("button", { name: /Alice Tan/ });
    await user.click(first);
    await user.click(second);

    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
  });
});

describe("SPM-63 registrations modal: search and filter", () => {
  // VIEW-REG-INFO-03-SEARCH
  // Oracle (SPEC: name, email, phone with case-insensitivity; 150 ms debounce)
  // Kills: search ignores phone; debounce removed or wrong interval
  it("VIEW-REG-INFO-03-SEARCH: filters by name, email and phone, with 150ms debounce", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(buildReport({ registrations: [DEV_PATEL, { ...ALICE_TAN, contactNumber: "+65 91234567" }, CHLOE_NG] }));
    renderModal();
    const search = await screen.findByRole("searchbox", { name: "Search registrations" });

    // Type and wait for debounce
    await user.type(search, "ALICE");
    expect(screen.getByText(/Dev Patel/)).toBeInTheDocument(); // not yet filtered
    await vi.advanceTimersByTimeAsync(150);
    await waitFor(() => expect(screen.queryByText(/Dev Patel/)).not.toBeInTheDocument());
    expect(screen.getByText(/Alice Tan/)).toBeInTheDocument();

    // Phone search works
    await user.clear(search);
    await user.type(search, "+65 9123");
    await vi.advanceTimersByTimeAsync(150);
    await waitFor(() => expect(screen.queryByText(/Chloe Ng/)).not.toBeInTheDocument());
    expect(screen.getByText(/Alice Tan/)).toBeInTheDocument();
  });

  // VIEW-REG-INFO-03-TODAY
  // Oracle (SPEC: Singapore calendar day, 150ms debounce)
  // Kills: UTC day used; debounce ignored on filter change
  it("VIEW-REG-INFO-03-TODAY: filters to attendees registered today and combines with search", async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText(/Dev Patel/);

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter:" }), "today");
    expect(screen.getByText(/Chloe Ng/)).toBeInTheDocument();
    expect(screen.queryByText(/Dev Patel/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Alice Tan/)).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "dev");
    expect(await screen.findByText("No registrations match your criteria")).toBeInTheDocument();
  });

  // VIEW-REG-INFO-03-SPECIAL
  // Oracle (SPEC: non-empty specialRequirements field only)
  // Kills: filter matches everyone; empty string treated as present
  it("VIEW-REG-INFO-03-SPECIAL: filters to attendees with indicated special requirements", async () => {
    const user = userEvent.setup();
    const withRequirements = { ...ALICE_TAN, specialRequirements: "Vegetarian menu" };
    apiMock.mockResolvedValue(buildReport({ registrations: [DEV_PATEL, withRequirements, CHLOE_NG] }));
    renderModal();
    await screen.findByText(/Dev Patel/);

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter:" }), "special-requirements");
    expect(screen.getByText(/Alice Tan/)).toBeInTheDocument();
    expect(screen.queryByText(/Dev Patel/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chloe Ng/)).not.toBeInTheDocument();
  });

  // VIEW-REG-INFO-03-TODAY-BND
  // Oracle (SPEC 2.5): Singapore calendar day boundary at UTC+8, not UTC
  // Kills: UTC day used; off-by-one at midnight
  it("VIEW-REG-INFO-03-TODAY-BND: treats the day boundary as Singapore time", () => {
    const lateYesterday = { ...ALICE_TAN, registeredAt: "2026-09-28T15:30:00.000Z" };
    const justToday = { ...ALICE_TAN, registeredAt: "2026-09-28T16:10:00.000Z" };
    const now = new Date("2026-09-28T16:20:00.000Z");

    expect(filterRegistrations([lateYesterday], "", "today", now)).toEqual([]);
    expect(filterRegistrations([justToday], "", "today", now)).toEqual([justToday]);
  });
});

describe("SPM-63 registrations modal: empty states", () => {
  // With no registrations at all the modal says so, instead of showing an empty list.
  it("shows 'No registrations yet' when there are none", async () => {
    apiMock.mockResolvedValue(buildReport({ registrations: [] }));
    renderModal();

    expect(await screen.findByText("No registrations yet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registrations (0)" })).toBeInTheDocument();
  });
});

describe("SPM-63 registrations modal: export and close", () => {
  // Each export button asks the server for that format and saves the file under the server's filename.
  it("downloads the CSV and the PDF through the server export", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["x"]);
    downloadMock.mockResolvedValue({ blob, filename: "EVT-101_registrations.csv" });
    renderModal();

    await user.click(await screen.findByRole("button", { name: "Export as CSV" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith(blob, "EVT-101_registrations.csv"));
    expect(downloadMock).toHaveBeenLastCalledWith("EVT-101", "csv");

    await user.click(screen.getByRole("button", { name: "Export as PDF" }));
    await waitFor(() => expect(downloadMock).toHaveBeenLastCalledWith("EVT-101", "pdf"));
  });

  // A failed export is announced inside the modal and the list stays visible.
  it("shows an export failure without closing the modal", async () => {
    const user = userEvent.setup();
    downloadMock.mockRejectedValue(new ApiError("The service is temporarily unavailable. Please try again."));
    renderModal();

    await user.click(await screen.findByRole("button", { name: "Export as PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.getByText(/Alice Tan/)).toBeInTheDocument();
  });

  // VIEW-REG-INFO-CLOSE-1
  // Oracle (SPEC: click inside does not close)
  // Kills: any click closes; backdrop click not checked
  it("VIEW-REG-INFO-CLOSE-1: a click inside the modal does not close it", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    await screen.findByText(/Alice Tan/);

    await user.click(screen.getByText("No waitlist"));
    expect(onClose).not.toHaveBeenCalled();
  });

  // VIEW-REG-INFO-CLOSE-2
  // Oracle (SPEC: close button closes)
  // Kills: close button does nothing
  it("VIEW-REG-INFO-CLOSE-2: the close button closes the modal", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    await screen.findByText(/Alice Tan/);

    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // VIEW-REG-INFO-CLOSE-3
  // Oracle (SPEC: Escape closes)
  // Kills: Escape ignored
  it("VIEW-REG-INFO-CLOSE-3: Escape closes the modal", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    await screen.findByText(/Alice Tan/);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // VIEW-REG-INFO-CLOSE-4
  // Oracle (SPEC: backdrop click closes)
  // Kills: backdrop click not wired
  it("VIEW-REG-INFO-CLOSE-4: a click on the backdrop closes the modal", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    await screen.findByText(/Alice Tan/);

    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
