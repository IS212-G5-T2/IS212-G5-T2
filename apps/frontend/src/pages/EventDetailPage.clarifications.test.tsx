import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
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
    changeRequests: [],
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
  it("REQ-CLAR-01-A: Event Coordinator can submit a clarification request and status changes to Under Review", async () => {
    const user = userEvent.setup();
    const event = baseEvent();
    const updatedEvent = baseEvent({ status: "under_review" });

    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/events/event-1/comments") return Promise.resolve([]);
      if (path === "/events/event-1/clarifications" && init?.method === "POST") {
        return Promise.resolve(comment());
      }
      if (path === "/events/event-1") return Promise.resolve(updatedEvent);
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
      expect(useAppStore.getState().events.find((e) => e.id === "event-1")?.status).toBe("under_review");
    });
  });

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

    expect(await screen.findByText("Clarification message cannot be blank.")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      "/events/event-1/clarifications",
      expect.anything(),
    );
  });

  // REQ-CLAR-01-C
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

    expect(await screen.findByText("Clarification message cannot be blank.")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      "/events/event-1/clarifications",
      expect.anything(),
    );
  });

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

  it("REQ-CLAR-02-B: Event Coordinator can see a clear indicator when a clarification request is awaiting Organiser's reply", async () => {
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

  it("both organiser and coordinator can resolve a clarification, which hides the reply button and marks it Answered", async () => {
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

  // REQ-CLAR-02-A
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
  });
});
