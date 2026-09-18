import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/pages/EventDetailPage";
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
  it("lets the assigned coordinator submit a clarification and reflects the resulting Under Review status", async () => {
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

    const input = await screen.findByLabelText("Request clarification or amendment");
    await user.type(input, "Please confirm whether livestream needs a second camera angle.");
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

  it("shows a client-side error and does not call the API for a blank clarification", async () => {
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

    await screen.findByLabelText("Request clarification or amendment");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Clarification message cannot be blank.")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      "/events/event-1/clarifications",
      expect.anything(),
    );
  });

  it("does not show the clarification control to a coordinator not assigned to the event", async () => {
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
    expect(screen.queryByLabelText("Request clarification or amendment")).not.toBeInTheDocument();
    // Not the assigned coordinator and not the organiser: no comment thread access at all.
    expect(apiMock).not.toHaveBeenCalledWith("/events/event-1/comments");
  });

  it("lets the organiser reply and clears the awaiting-reply indicator", async () => {
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
        return Promise.resolve(repliedYet ? [{ ...openClarification, awaitingReply: false }, reply] : [openClarification]);
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

    expect(await screen.findByText("⏳ Awaiting Organiser’s reply")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reply" }));
    await user.type(screen.getByLabelText("Reply"), "Yes, please add a second angle on the main stage.");
    await user.click(screen.getByRole("button", { name: "Send Reply" }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/events/event-1/clarifications/comment-1/reply",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(screen.queryByText("⏳ Awaiting Organiser’s reply")).not.toBeInTheDocument();
  });
});
