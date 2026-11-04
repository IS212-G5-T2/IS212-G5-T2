// Story: SPM-157 Audit History of Important Actions
// Test cases: AUDIT-HISTORY-01-G, AUDIT-HISTORY-05-E, AUDIT-HISTORY-06-C, AUDIT-HISTORY-08-B, AUDIT-HISTORY-09-C,
// AUDIT-HISTORY-10-C (the history page)
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventHistoryPage } from "@/features/events/pages/history/EventHistoryPage";
import { fetchEventHistory } from "@/features/events/api/event-history-api";
import { ApiError } from "@/utils/api";
import type { EventHistory, HistoryEntry } from "@/features/events/types/eventHistory";

vi.mock("@/features/events/api/event-history-api", () => ({ fetchEventHistory: vi.fn() }));
const fetchMock = vi.mocked(fetchEventHistory);

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: "e1",
    section: "event",
    action: "status_changed",
    summary: "Event request rejected",
    changes: [{ field: "status", label: "Status", from: "Submitted", to: "Rejected" }],
    reason: "The venue cannot host this event size.",
    actor: { kind: "user", name: "Marcus Lee" },
    occurredAt: "2026-10-15T04:00:00.000Z",
    ...overrides,
  };
}

const coordinatorHistory: EventHistory = {
  eventId: "event-1",
  eventName: "Innovation Showcase",
  eventStatus: "Cancelled",
  viewer: "coordinator",
  sections: {
    event: [
      entry({ id: "a", summary: "Event request submitted", changes: [{ field: "status", label: "Status", from: null, to: "Submitted" }], reason: undefined, actor: { kind: "user", name: "Priya Nair" }, occurredAt: "2026-10-14T04:00:00.000Z" }),
      entry({ id: "b" }),
      entry({ id: "c", summary: "Safety check reset", changes: [], reason: "Event details were updated", actor: { kind: "system", name: "System" } }),
    ],
    venueBookings: [
      entry({
        id: "d", section: "venueBookings", summary: "Tentative hold placed", subject: "Seminar Room 2-1", reason: undefined,
        changes: [
          { field: "status", label: "Status", from: "Pending", to: "Approved" },
          { field: "holdExpiresAt", label: "Hold expires", from: null, to: "2027-02-05T10:30:00.000Z" },
        ],
        actor: { kind: "unrecorded", name: "Not recorded" },
      }),
    ],
    equipment: [],
    registrations: [entry({ id: "r", section: "registrations", summary: "Promoted from the waiting list", subject: "Sam Lim", reason: undefined, actor: { kind: "system", name: "System" } })],
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1/history"]}>
      <Routes>
        <Route path="/events/:id/history" element={<EventHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SPM-157 EventHistoryPage", () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(cleanup);

  /** AUDIT-HISTORY-01-G: the coordinator sees all four histories, titled, for the event in the URL. */
  it("AUDIT-HISTORY-01-G shows the four sections of a coordinator's history", async () => {
    fetchMock.mockResolvedValue(coordinatorHistory);
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Loading event history…");
    expect(await screen.findByRole("heading", { name: "History: Innovation Showcase" })).toBeInTheDocument();
    expect(screen.getByText("Current status: Cancelled")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Event Changes", "Venue Bookings", "Equipment Reservations", "Registrations",
    ]);
    expect(screen.getByText("Nothing recorded yet.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("event-1");
    expect(screen.getByRole("link", { name: "Back To Event" })).toHaveAttribute("href", "/events/event-1");
  });

  /**
   * AUDIT-HISTORY-05-E, AUDIT-HISTORY-06-C: each entry has what happened, when (SGT), who, each change as one line
   * and the reason, in order.
   */
  it("AUDIT-HISTORY-05-E / 06-C shows each entry's change, author, time and reason in order", async () => {
    fetchMock.mockResolvedValue(coordinatorHistory);
    renderPage();
    const events = await screen.findByRole("group", { name: "Event Changes" });
    // Grouped by Singapore day, each day headed.
    expect(within(events).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "14 Oct 2026", "15 Oct 2026",
    ]);
    const items = within(events).getAllByRole("listitem").filter((item) => item.parentElement?.tagName === "OL");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Event request submitted", "Event request rejected", "Safety check reset",
    ]);
    expect(items[0]).toHaveTextContent("12:00 pm · by Priya Nair");
    expect(items[0]).toHaveTextContent("Status: Submitted");
    expect(items[1]).toHaveTextContent("12:00 pm · by Marcus Lee");
    expect(items[1]).toHaveTextContent("Status: Submitted → Rejected");
    expect(within(items[1]).getByText("→")).toHaveAttribute("aria-label", "changed to");
    expect(items[1]).toHaveTextContent("Reason: The venue cannot host this event size.");
    expect(items[2]).toHaveTextContent("12:00 pm · System");
    expect(within(items[2]).queryByRole("list")).not.toBeInTheDocument();
    expect(within(items[1]).getByRole("time")).toHaveAttribute("dateTime", "2026-10-15T04:00:00.000Z");

    const venue = within(screen.getByRole("group", { name: "Venue Bookings" })).getAllByRole("listitem")[0];
    expect(venue).toHaveTextContent("Tentative hold placed · Seminar Room 2-1");
    expect(venue).toHaveTextContent("Not recorded");
    expect(venue).toHaveTextContent("Status: Pending → Approved");
    expect(venue).toHaveTextContent("Hold expires: 5 Feb 2027, 6:30 pm SGT");
    expect(venue).not.toHaveTextContent("Reason:");
  });

  /** AUDIT-HISTORY-05-E: a message is quoted and a new booking slot is one time range. */
  it("AUDIT-HISTORY-05-E quotes messages and shows a new slot as one time range", async () => {
    fetchMock.mockResolvedValue({
      ...coordinatorHistory,
      sections: {
        event: [entry({
          id: "q", summary: "Clarification requested", reason: undefined,
          changes: [{ field: "message", label: "Message", from: null, to: "Do you need a stage?" }],
        })],
        venueBookings: [entry({
          id: "v", section: "venueBookings", summary: "Venue booking requested", subject: "Hall A", reason: undefined,
          changes: [
            { field: "status", label: "Status", from: null, to: "Pending" },
            { field: "start", label: "Start", from: null, to: "2026-11-05T23:01:00.000Z" },
            { field: "end", label: "End", from: null, to: "2026-11-06T01:01:00.000Z" },
          ],
        })],
      },
    });
    renderPage();
    const events = await screen.findByRole("group", { name: "Event Changes" });
    expect(within(events).getByRole("blockquote")).toHaveTextContent("“Do you need a stage?”");
    const venue = within(screen.getByRole("group", { name: "Venue Bookings" })).getAllByRole("listitem")[0];
    expect(venue).toHaveTextContent("Time: 6 Nov 2026, 7:01 am – 9:01 am SGT");
    expect(venue).not.toHaveTextContent("Start:");
  });

  /** AUDIT-HISTORY-08-B: the organiser's history has only the sections the server returned. */
  it("AUDIT-HISTORY-08-B shows only the organiser's sections", async () => {
    fetchMock.mockResolvedValue({
      ...coordinatorHistory,
      viewer: "organiser",
      sections: { event: coordinatorHistory.sections.event, registrations: coordinatorHistory.sections.registrations },
    });
    renderPage();
    await screen.findByRole("heading", { name: "History: Innovation Showcase" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Event Changes", "Registrations",
    ]);
  });

  /** AUDIT-HISTORY-09-C: a refusal shows the server's message and a way back. */
  it("AUDIT-HISTORY-09-C shows the server's refusal", async () => {
    fetchMock.mockRejectedValueOnce(new ApiError("You can only view the history of events assigned to you or that you own.", undefined, "FORBIDDEN", 403));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("You can only view the history of events assigned to you or that you own.");
    expect(screen.getByRole("link", { name: "Back To Event" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  /** AUDIT-HISTORY-09-C: a non-Error rejection still shows a message. */
  it("AUDIT-HISTORY-09-C falls back to a generic message", async () => {
    fetchMock.mockRejectedValueOnce("boom");
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the event history.");
  });

  /** AUDIT-HISTORY-10-C: the page offers no way to change an entry. */
  it("AUDIT-HISTORY-10-C has no edit or delete controls", async () => {
    fetchMock.mockResolvedValue(coordinatorHistory);
    renderPage();
    await screen.findByRole("heading", { name: "History: Innovation Showcase" });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  /** A response that arrives after leaving the page is ignored. */
  it("AUDIT-HISTORY-01-G ignores a response that arrives after unmounting", async () => {
    let resolve: (value: EventHistory) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = renderPage();
    view.unmount();
    resolve(coordinatorHistory);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /** A failure that arrives after leaving the page is ignored too. */
  it("AUDIT-HISTORY-09-C ignores a refusal that arrives after unmounting", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error("You cannot view this event's history."));
    const view = renderPage();
    view.unmount();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  /** AUDIT-HISTORY-05-E: a value that was removed reads as the old value struck through and "removed". */
  it("AUDIT-HISTORY-05-E shows a removed value as removed", async () => {
    fetchMock.mockResolvedValue({
      ...coordinatorHistory,
      sections: {
        event: [entry({
          id: "x", summary: "Venue booking removed", reason: undefined,
          changes: [{ field: "status", label: "Status", from: "Pending", to: null }],
        })],
      },
    });
    renderPage();
    const list = await screen.findByRole("group", { name: "Event Changes" });
    const line = within(list).getByText("Pending").closest("li");
    expect(line).toHaveTextContent("Status: Pending removed");
  });
});
