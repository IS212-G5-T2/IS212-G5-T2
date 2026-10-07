// SPM-123 AC9: the assigned coordinator is told a new request awaits their review.
// Test cases: LEAD-ASN-09-D, 09-F, 09-G, 09-H, 09-I.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(screen.queryByRole("region", { name: "New assigned requests" })).not.toBeInTheDocument();

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
});
