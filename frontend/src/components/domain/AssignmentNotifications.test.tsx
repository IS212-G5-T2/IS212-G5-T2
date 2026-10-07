// SPM-123 AC9: the assigned coordinator is told a new request awaits their review.
// Test cases: LEAD-ASN-09-D, 09-F, 09-G, 09-H, 09-I, 09-J, 09-K, 09-L; SPM-47 LEAD-REASN-08-E;
// SPM-46 REASN-VIEW-01-B.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { AssignmentNotifications } from "./AssignmentNotifications";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/utils/api", () => ({ api }));

const assignment = {
  id: "notif-1",
  audienceRole: "coordinator",
  audienceUserId: "coord-1",
  type: "coordinator_assignment",
  message: 'New event request "Welcome Evening" is awaiting your review.',
  relatedEventId: "event-1",
  read: false,
  createdAt: "2026-10-06T09:00:00.000Z",
};

beforeEach(() => {
  // A signed-in coordinator with one unread assignment notification.
  api.mockReset();
  useAppStore.setState({
    currentUser: { id: "coord-1", name: "Coordinator 1", email: "c1@example.test", role: "coordinator", roles: ["coordinator"] },
  });
});

describe("SPM-123 AC9: coordinator assignment notifications", () => {
  // The coordinator sees the new request with a link to it and can mark it read.
  it("LEAD-ASN-09-D shows the coordinator the new assignment with a link and Mark as read", async () => {
    // Arrange: the feed returns one unread assignment; marking read succeeds.
    const user = userEvent.setup();
    api.mockImplementation((path: string) =>
      Promise.resolve(path === "/notifications" ? [assignment] : { success: true }),
    );

    // Act: render the panel.
    render(
      <MemoryRouter>
        <AssignmentNotifications />
      </MemoryRouter>,
    );

    // Assert: the message and a link to the request are shown.
    expect(await screen.findByText('New event request "Welcome Evening" is awaiting your review.')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View request" })).toHaveAttribute("href", "/events/event-1");

    // Act: mark it read.
    await user.click(screen.getByRole("button", { name: "Mark as read" }));

    // Assert: the read call is sent and the notification leaves the panel.
    expect(api).toHaveBeenCalledWith("/notifications/notif-1/read", { method: "POST" });
    await waitFor(() =>
      expect(screen.queryByText('New event request "Welcome Evening" is awaiting your review.')).not.toBeInTheDocument(),
    );
  });

  // If the feed can't be loaded, the coordinator is told.
  it("LEAD-ASN-09-F shows an error when the coordinator's notifications cannot be loaded", async () => {
    // Arrange: loading fails.
    api.mockRejectedValue(new Error("offline"));

    // Act: render the panel.
    render(
      <MemoryRouter>
        <AssignmentNotifications />
      </MemoryRouter>,
    );

    // Assert: the error is shown.
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your new assignments.");
  });

  // A failed "Mark as read" keeps the notification and says so.
  it("LEAD-ASN-09-G keeps the notification and shows an error when marking it read fails", async () => {
    // Arrange: the feed loads, but marking read fails.
    const user = userEvent.setup();
    api.mockImplementation((path: string) =>
      path === "/notifications" ? Promise.resolve([assignment]) : Promise.reject(new Error("offline")),
    );
    render(
      <MemoryRouter>
        <AssignmentNotifications />
      </MemoryRouter>,
    );

    // Act: try to mark it read.
    await user.click(await screen.findByRole("button", { name: "Mark as read" }));

    // Assert: the error is shown and the notification is still listed.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not mark the notification as read. Please try again.",
    );
    expect(screen.getByText('New event request "Welcome Evening" is awaiting your review.')).toBeInTheDocument();
  });

  // An assignment made while the coordinator is already on the page appears when they come back to the window.
  it("LEAD-ASN-09-H shows an assignment made after the page loaded when the window regains focus", async () => {
    // Arrange: the first load has nothing; the Lead then assigns a request.
    api.mockResolvedValueOnce([]).mockResolvedValue([assignment]);
    render(
      <MemoryRouter>
        <AssignmentNotifications />
      </MemoryRouter>,
    );
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region", { name: "Assignment updates" })).not.toBeInTheDocument();

    // Act: the coordinator returns to the window.
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    // Assert: the feed is fetched again and the new assignment is shown.
    expect(await screen.findByText('New event request "Welcome Evening" is awaiting your review.')).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });

  // A successful retry of "Mark as read" clears the earlier error.
  it("LEAD-ASN-09-I clears the error when a later Mark as read succeeds", async () => {
    // Arrange: two unread assignments, so the panel stays visible after one is read;
    // the first mark-read fails and the retry succeeds.
    const user = userEvent.setup();
    const second = { ...assignment, id: "notif-2", relatedEventId: "event-2", message: 'New event request "Spring Gala" is awaiting your review.' };
    let markAttempts = 0;
    api.mockImplementation((path: string) => {
      if (path === "/notifications") return Promise.resolve([assignment, second]);
      markAttempts += 1;
      return markAttempts === 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ success: true });
    });
    render(
      <MemoryRouter>
        <AssignmentNotifications />
      </MemoryRouter>,
    );

    // Act: the first attempt on "Welcome Evening" fails.
    const [firstButton] = await screen.findAllByRole("button", { name: "Mark as read" });
    await user.click(firstButton);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not mark the notification as read. Please try again.",
    );

    // Act: the retry succeeds.
    await user.click(screen.getAllByRole("button", { name: "Mark as read" })[0]);

    // Assert: the error is gone, the read one has left and the other is still shown.
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.queryByText('New event request "Welcome Evening" is awaiting your review.')).not.toBeInTheDocument();
    expect(screen.getByText('New event request "Spring Gala" is awaiting your review.')).toBeInTheDocument();
  });

  // Anyone who isn't a coordinator (here the Lead) gets no panel and no request for notifications.
  it("LEAD-ASN-09-J shows nothing and loads nothing for a user who is not a coordinator", () => {
    // Arrange: the signed-in user is the Event Coordinator Lead; the feed would return an assignment.
    useAppStore.setState({
      currentUser: { id: "lead-1", name: "Coordinator Lead", email: "lead@example.test", role: "coordinator_lead", roles: ["coordinator_lead"] },
    });
    api.mockResolvedValue([assignment]);

    // Act: render the panel.
    render(
      <MemoryRouter>
        <AssignmentNotifications />
      </MemoryRouter>,
    );

    // Assert: no notifications request is made and no panel is shown.
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Assignment updates" })).not.toBeInTheDocument();
  });

  // A notification the coordinator already read stays hidden; only unread ones are listed.
  it("LEAD-ASN-09-K lists only unread assignments and keeps already-read ones hidden", async () => {
    // Arrange: the feed returns one read and one unread assignment.
    const alreadyRead = { ...assignment, id: "notif-0", relatedEventId: "event-0", message: 'New event request "Old Picnic" is awaiting your review.', read: true };
    api.mockResolvedValue([alreadyRead, assignment]);

    // Act: render the panel.
    render(
      <MemoryRouter>
        <AssignmentNotifications />
      </MemoryRouter>,
    );

    // Assert: the unread one is shown with its single Mark as read; the read one is not.
    expect(await screen.findByText('New event request "Welcome Evening" is awaiting your review.')).toBeInTheDocument();
    expect(screen.queryByText('New event request "Old Picnic" is awaiting your review.')).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(1);
  });
});

describe("SPM-47 AC8: reassignment notifications", () => {
  // A coordinator sees events reassigned to them (with a link) and away from them (without one).
  it("LEAD-REASN-08-E shows reassignment to and away from the coordinator, linking only to events they now have", async () => {
    // Arrange: one event reassigned to this coordinator and one reassigned away.
    api.mockResolvedValue([
      { ...assignment, id: "notif-r", type: "coordinator_reassignment", relatedEventId: "event-2", message: 'Event "Spring Gala" has been reassigned to you.' },
      { ...assignment, id: "notif-u", type: "coordinator_unassignment", relatedEventId: "event-3", message: 'Event "Old Picnic" has been reassigned to Coordinator 2.' },
    ]);

    // Act: render the panel.
    render(
      <MemoryRouter>
        <AssignmentNotifications />
      </MemoryRouter>,
    );

    // Assert: both messages are shown; only the event they now have is linked.
    expect(await screen.findByText('Event "Spring Gala" has been reassigned to you.')).toBeInTheDocument();
    expect(screen.getByText('Event "Old Picnic" has been reassigned to Coordinator 2.')).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "View request" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/events/event-2");
  });
});

describe("SPM-46 AC1: the reassignment notice opens the event", () => {
  // Clicking the notice's link takes the coordinator to that event's page.
  it("REASN-VIEW-01-B opens the reassigned event's page from the notice", async () => {
    // Arrange: one unread "reassigned to you" notice for event-2, inside a router with the event route.
    const user = userEvent.setup();
    api.mockResolvedValue([
      { ...assignment, id: "notif-r", type: "coordinator_reassignment", relatedEventId: "event-2", message: 'Event "Spring Gala" has been reassigned to you.' },
    ]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<AssignmentNotifications />} />
          <Route path="/events/:id" element={<p>Event page for event-2</p>} />
        </Routes>
      </MemoryRouter>,
    );

    // Act: follow the notice's link.
    await user.click(await screen.findByRole("link", { name: "View request" }));

    // Assert: the event's page is open.
    expect(screen.getByText("Event page for event-2")).toBeInTheDocument();
  });
});

describe("SPM-123 AC9: periodic refresh while the page stays open", () => {
  afterEach(() => {
    // Restore real timers so other tests are unaffected.
    vi.useRealTimers();
  });

  // Flush the pending fetch promise and the state update it triggers.
  async function flush() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  // A coordinator who leaves the tab open sees a new assignment after 30 seconds, without focus or reload.
  it("LEAD-ASN-09-L fetches again every 30 seconds and shows an assignment that arrived meanwhile", async () => {
    // Arrange: fake timers; the first load has nothing, later loads return one unread assignment.
    vi.useFakeTimers();
    api.mockResolvedValueOnce([]).mockResolvedValue([assignment]);
    render(
      <MemoryRouter>
        <AssignmentNotifications />
      </MemoryRouter>,
    );
    await flush();
    expect(api).toHaveBeenCalledTimes(1);

    // Act: just under 30 seconds pass.
    act(() => {
      vi.advanceTimersByTime(29_999);
    });

    // Assert: no second fetch yet.
    expect(api).toHaveBeenCalledTimes(1);

    // Act: the 30-second mark is reached.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    await flush();

    // Assert: the feed was fetched again and the new assignment is shown.
    expect(api).toHaveBeenCalledTimes(2);
    expect(screen.getByText('New event request "Welcome Evening" is awaiting your review.')).toBeInTheDocument();
  });
});
