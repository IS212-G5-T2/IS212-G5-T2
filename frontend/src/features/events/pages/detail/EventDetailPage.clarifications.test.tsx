/*
 * SPM-39 test case map (source: "SPM-39 Test Cases" document, REQ-CLAR-*):
 *   REQ-CLAR-01-A  AC1          submit a clarification, status unchanged    -> it("REQ-CLAR-01-A: ...")
 *   REQ-CLAR-01-B  AC2          blank message shows an error                -> it("REQ-CLAR-01-B: ...")
 *   REQ-CLAR-01-C  AC2          whitespace-only message shows an error      -> it("REQ-CLAR-01-C: ...")
 *   REQ-CLAR-02-A  AC3, AC4     full chronological thread                   -> it("REQ-CLAR-02-A: ...")
 *   REQ-CLAR-02-B  AC5          pending-reply indicator, Organiser and Coordinator views
 *                              -> it("REQ-CLAR-02-B (Organiser view): ...") and it("REQ-CLAR-02-B (Coordinator view): ...")
 *
 * Design (confirmed): the indicator is "Pending" until a clarification is resolved. A reply does not clear it.
 * There is no real-time update; the page shows the state it loads.
 * REQ-CLAR-03 is not in the SPM-39 document. It is kept as an extra case.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventComment, EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function baseEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "event-1",
    name: "Community Welcome Evening",
    purpose: "Community building",
    description: "An evening of introductions.",
    organiserId: "organiser-1",
    organiserName: "Priya Nair",
    coordinatorId: "coordinator-1",
    coordinatorName: "Marcus Lee",
    status: "submitted",
    startDateTime: "2026-12-12T18:00:00.000Z",
    endDateTime: "2026-12-12T21:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

function comment(overrides: Partial<EventComment> = {}): EventComment {
  return {
    id: "comment-1",
    eventId: "event-1",
    parentId: null,
    type: "clarification",
    authorId: "coordinator-1",
    authorName: "Marcus Lee",
    authorRole: "coordinator",
    message: "Please confirm whether livestream needs a second camera angle.",
    awaitingReply: true,
    resolved: false,
    createdAt: "2026-09-18T13:05:00.000Z",
    ...overrides,
  };
}

function renderPage(eventId = "event-1") {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe("EventDetailPage clarification thread", () => {
  // "Under Review" was retired as a distinct status (SPM-38 follow-up): a
  // clarification request no longer changes the event's status.
  // SPM-39 REQ-CLAR-01-A (AC1)
  it("REQ-CLAR-01-A: Event Coordinator can submit a clarification request without changing the event's status", async () => {
    const user = userEvent.setup();
    const event = baseEvent();

    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/events/event-1/comments") return Promise.resolve([]);
      if (path === "/events/event-1/clarifications" && init?.method === "POST") {
        return Promise.resolve(comment());
      }
      return Promise.resolve(event);
    });

    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    const textarea = await screen.findByPlaceholderText("Type a question or clarification…");
    await user.type(textarea, "Please confirm whether livestream needs a second camera angle.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/events/event-1/clarifications",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "Please confirm whether livestream needs a second camera angle." }),
        }),
      );
    });

    await waitFor(() => {
      expect(useAppStore.getState().events.find((e) => e.id === "event-1")?.status).toBe("submitted");
    });
  });

  // SPM-39 REQ-CLAR-01-B (AC2)
  it("REQ-CLAR-01-B: Event Coordinator will see an error message if they try to submit a blank clarification message", async () => {
    const user = userEvent.setup();
    const event = baseEvent();
    apiMock.mockImplementation((path: string) =>
      path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
    );

    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    await screen.findByPlaceholderText("Type a question or clarification…");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Clarification message is required")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      "/events/event-1/clarifications",
      expect.anything(),
    );
  });

  // SPM-39 REQ-CLAR-01-C (AC2)
  it("REQ-CLAR-01-C: Event Coordinator will see an error message if they try to submit a whitespace-only clarification message", async () => {
    const user = userEvent.setup();
    const event = baseEvent();
    apiMock.mockImplementation((path: string) =>
      path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
    );

    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    const input = await screen.findByPlaceholderText("Type a question or clarification…");
    await user.type(input, "   \n\t  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Clarification message is required")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      "/events/event-1/clarifications",
      expect.anything(),
    );
  });

  // Not in the SPM-39 document. Extra case: cross-coordinator refusal.
  it("REQ-CLAR-03: Event Coordinator cannot request clarification on an event assigned to another Coordinator", async () => {
    const event = baseEvent();
    apiMock.mockImplementation((path: string) =>
      path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
    );

    useAppStore.setState({
      currentUser: { id: "someone-else", name: "Other Coordinator", email: "other@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    await screen.findByRole("heading", { name: event.name });
    expect(screen.queryByPlaceholderText("Type a question or clarification…")).not.toBeInTheDocument();
    // Not the assigned coordinator and not the organiser: no comment thread access at all.
    expect(apiMock).not.toHaveBeenCalledWith("/events/event-1/comments");
  });

  // SPM-39 REQ-CLAR-02-B (AC5), Organiser view: the Organiser sees the open clarification as Pending, and it
  // stays Pending after their reply because only a resolve clears it.
  it("REQ-CLAR-02-B (Organiser view): the pending indicator shows on an open clarification and stays after a reply", async () => {
    const user = userEvent.setup();
    const event = baseEvent();
    const openClarification = comment();
    const reply = comment({
      id: "comment-2",
      parentId: "comment-1",
      type: "reply",
      authorId: "organiser-1",
      authorName: "Priya Nair",
      authorRole: "organiser",
      message: "Yes, please add a second angle on the main stage.",
      awaitingReply: false,
    });

    let repliedYet = false;
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/events/event-1/comments") {
        return Promise.resolve(repliedYet ? [openClarification, reply] : [openClarification]);
      }
      if (path === "/events/event-1/clarifications/comment-1/reply" && init?.method === "POST") {
        repliedYet = true;
        return Promise.resolve(reply);
      }
      return Promise.resolve(event);
    });

    useAppStore.setState({
      currentUser: { id: "organiser-1", name: "Priya Nair", email: "priya@example.test", role: "organiser" },
      events: [],
    });

    renderPage();

    // Check for "Pending" status badge which indicates awaiting reply
    expect(await screen.findByText("Pending")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reply" }));
    const replyTextarea = await screen.findByLabelText("Reply");
    await user.type(replyTextarea, "Yes, please add a second angle on the main stage.");
    await user.click(screen.getByRole("button", { name: "Send Reply" }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/events/event-1/clarifications/comment-1/reply",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // A reply alone doesn't close the thread — it's still pending until
    // someone explicitly resolves it, so the organiser and coordinator can
    // keep exchanging messages.
    await waitFor(() => {
      expect(screen.getByText("Yes, please add a second angle on the main stage.")).toBeInTheDocument();
    });
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
  });

  // SPM-39 REQ-CLAR-02-B (AC5), Coordinator view: the Coordinator who raised an open clarification sees the indicator.
  it("REQ-CLAR-02-B (Coordinator view): the Coordinator sees the Pending indicator on an open clarification they raised", async () => {
    const event = baseEvent();
    const openClarification = comment();
    apiMock.mockImplementation((path: string) => {
      if (path === "/events/event-1/comments") return Promise.resolve([openClarification]);
      return Promise.resolve(event);
    });

    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Pending (1)")).toBeInTheDocument();
    expect(screen.queryByText("Answered")).not.toBeInTheDocument();
  });

  it("REQ-CLAR-SUP-54 both organiser and coordinator can resolve a clarification, which hides the reply button and marks it Answered", async () => {
    const user = userEvent.setup();
    const event = baseEvent();
    const openClarification = comment();
    const resolvedClarification = comment({ resolved: true, awaitingReply: false });

    let resolvedYet = false;
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/events/event-1/comments") {
        return Promise.resolve([resolvedYet ? resolvedClarification : openClarification]);
      }
      if (path === "/events/event-1/clarifications/comment-1/resolve" && init?.method === "POST") {
        resolvedYet = true;
        return Promise.resolve(resolvedClarification);
      }
      return Promise.resolve(event);
    });

    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/events/event-1/clarifications/comment-1/resolve",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Answered")).toBeInTheDocument();
    });
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
  });

  // SPM-39 REQ-CLAR-02-A (AC3, AC4)
  it("REQ-CLAR-02-A: Event Coordinator can see the full chronological history of comments and clarifications", async () => {
    const event = baseEvent();
    const answeredClarification = comment({
      id: "comment-1",
      message: "What is the expected room layout?",
      createdAt: "2026-09-18T09:15:00.000Z",
      awaitingReply: false,
      resolved: true,
    });
    const organiserReply = comment({
      id: "comment-2",
      parentId: "comment-1",
      type: "reply",
      authorId: "organiser-1",
      authorName: "Priya Nair",
      authorRole: "organiser",
      message: "Room layout will be Banquet.",
      awaitingReply: false,
      createdAt: "2026-09-18T10:30:00.000Z",
    });
    const openClarification = comment({
      id: "comment-3",
      message: "Please confirm expected attendance.",
      createdAt: "2026-09-18T11:00:00.000Z",
      awaitingReply: true,
      resolved: false,
    });

    apiMock.mockImplementation((path: string) =>
      path.includes("/comments")
        ? Promise.resolve([answeredClarification, organiserReply, openClarification])
        : Promise.resolve(event),
    );

    useAppStore.setState({
      currentUser: { id: "organiser-1", name: "Priya Nair", email: "priya@example.test", role: "organiser" },
      events: [],
    });

    renderPage();

    // Wait for thread to render and check for status badges
    expect(await screen.findByText("Pending")).toBeInTheDocument();

    // Check that role badges are shown (Coordinator and Organiser)
    const coordinatorBadges = screen.getAllByText("Coordinator");
    const organiserBadges = screen.getAllByText("Organiser");
    expect(coordinatorBadges.length).toBeGreaterThan(0);
    expect(organiserBadges.length).toBeGreaterThan(0);

    // Only the still-open clarification should have "Pending" status
    const pendingBadges = screen.getAllByText("Pending");
    expect(pendingBadges.length).toBe(1);

    // The answered clarification should have "Answered" status
    expect(screen.getByText("Answered")).toBeInTheDocument();

    // Chronological order: the first entry (18 Sep 09:15 UTC), its reply (10:30) and the open one (11:00) appear in that order.
    const first = screen.getByText("What is the expected room layout?", { selector: "p.mt-1" });
    const reply = screen.getByText("Room layout will be Banquet.", { selector: "p.mt-1" });
    const open = screen.getByText("Please confirm expected attendance.", { selector: "p.mt-1" });
    expect(first.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(reply.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Each entry shows its timestamp. 09:15, 10:30 and 11:00 UTC are on 18 Sep in Singapore, UTC and Los Angeles time.
    for (const text of ["What is the expected room layout?", "Please confirm expected attendance."]) {
      const entry = screen.getByText(text, { selector: "p.mt-1" }).closest(".border") as HTMLElement;
      // The first timestamp in the entry is its own header; a reply inside the entry has its own timestamp after it.
      expect(within(entry).getAllByText(/Sep 18/)[0]).toBeTruthy();
    }
  });
});

// SPM-148 AC7 (PLAN-STATUS-07-A, 07-D on the frontend). Clarifications stay open in Planning
// and close at Confirmed; the thread stays readable. Mirrors the backend status lists.
describe("SPM-148 AC7: clarifications in Planning and Confirmed", () => {
  // Parent AC (SUPPORTING): SPM-39 AC1 (cross-story: test cites SPM-148 AC7)
  it("PLAN-STATUS-07-A: the assigned Coordinator can post a clarification while the event is in Planning", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/events/event-1/comments") return Promise.resolve([]);
      if (path === "/events/event-1/clarifications" && init?.method === "POST") {
        return Promise.resolve(comment({ message: "Is a stage required?" }));
      }
      return Promise.resolve(baseEvent({ status: "planning" }));
    });
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    const textarea = await screen.findByPlaceholderText("Type a question or clarification…");
    await user.type(textarea, "Is a stage required?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/events/event-1/clarifications",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ message: "Is a stage required?" }) }),
      );
    });
  });

  // Parent AC (SUPPORTING): SPM-39 AC4 (cross-story: test cites SPM-148 AC7)
  it("PLAN-STATUS-07-D: once Confirmed there is no composer and no reply button, and the thread is still shown", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/events/event-1/comments") return Promise.resolve([comment()]);
      return Promise.resolve(baseEvent({ status: "confirmed" }));
    });
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    // The message can appear in more than one place in the thread; readable is what matters.
    expect(
      (await screen.findAllByText("Please confirm whether livestream needs a second camera angle.")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByPlaceholderText("Type a question or clarification…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
  });
});

// A failed comments load is reported in the page alert, so an organiser or coordinator can see why
// the thread is missing rather than seeing an empty thread.
describe("EventDetailPage comments load failure (SPM-39)", () => {
  /** When loading comments fails, the failure message is shown in an alert. */
  it("REQ-CLAR-SUP-55 shows the comments load failure message in an alert", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/events/event-1/comments") return Promise.reject(new Error("Comments are unavailable."));
      return Promise.resolve(baseEvent());
    });
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    expect(await screen.findByText("Comments are unavailable.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Comments are unavailable.");
  });

  /** A comments failure that is not an Error object falls back to the generic message. */
  it("REQ-CLAR-SUP-56 shows the generic comments message when the failure is not an Error", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/events/event-1/comments") return Promise.reject("offline");
      return Promise.resolve(baseEvent());
    });
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
      events: [],
    });

    renderPage();

    expect(await screen.findByText("Could not load comments.")).toBeTruthy();
  });
});
