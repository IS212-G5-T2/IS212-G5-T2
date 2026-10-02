import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AssignmentNotifications } from "@/components/domain/AssignmentNotifications";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { Notification, UserRole } from "@/types";

/**
 * SPM-123 AC2: an assigned coordinator is told a new event request is awaiting
 * their review. Test IDs follow EVE-ASN-02-*.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function assignment(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    audienceRole: "coordinator",
    audienceUserId: "coord-1",
    type: "coordinator_assignment",
    message: 'New event request "Welcome Evening" is awaiting your review.',
    relatedEventId: "event-1",
    read: false,
    createdAt: "2026-09-22T00:00:00.000Z",
    ...overrides,
  };
}

function signInAs(role: UserRole, roles?: UserRole[]) {
  useAppStore.setState({
    currentUser: { id: "coord-1", name: "Coordinator One", email: "c@example.test", role, roles },
  });
}

function renderBanner() {
  return render(
    <MemoryRouter>
      <AssignmentNotifications />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AssignmentNotifications (SPM-123 AC2)", () => {
  it("EVE-ASN-02-H tells the coordinator a new request is awaiting review, with a link to it", async () => {
    signInAs("coordinator");
    apiMock.mockResolvedValue([assignment()]);

    renderBanner();

    expect(
      await screen.findByText('New event request "Welcome Evening" is awaiting your review.'),
    ).toBeTruthy();
    expect(screen.getByText("1 awaiting your review")).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith("/notifications");
    expect(screen.getByRole("link", { name: /View request/i }).getAttribute("href")).toBe(
      "/events/event-1",
    );
  });

  it("EVE-ASN-02-I marks a notification as read and removes it from the banner", async () => {
    signInAs("coordinator");
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path === "/notifications" ? [assignment()] : {}),
    );

    renderBanner();
    fireEvent.click(await screen.findByRole("button", { name: /Mark as read/i }));

    await waitFor(() => expect(screen.queryByText(/awaiting your review\./)).toBeNull());
    expect(apiMock).toHaveBeenCalledWith("/notifications/notif-1/read", { method: "POST" });
  });

  it("EVE-ASN-02-J shows nothing when every notification has already been read", async () => {
    signInAs("coordinator");
    apiMock.mockResolvedValue([assignment({ read: true })]);

    const { container } = renderBanner();

    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("EVE-ASN-02-K never asks an organiser-only account for coordinator notifications", async () => {
    signInAs("organiser");

    const { container } = renderBanner();

    expect(apiMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });

  // A Coordinator + Venue Staff account (e.g. the seeded Coor_Venue) still gets the banner.
  it("EVE-ASN-02-L notifies a Coordinator + Venue Staff account", async () => {
    // Arrange: signed in with both roles; one unread assignment.
    signInAs("coordinator", ["coordinator", "venue_staff"]);
    apiMock.mockResolvedValue([assignment()]);

    // Act: render the banner.
    renderBanner();

    // Assert: the assignment is shown.
    expect(
      await screen.findByText('New event request "Welcome Evening" is awaiting your review.'),
    ).toBeTruthy();
  });

  it("EVE-ASN-02-M shows an error with a retry when notifications cannot be loaded", async () => {
    signInAs("coordinator");
    apiMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([assignment()]);

    renderBanner();

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Could not load assignment notifications."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/awaiting your review\./)).toBeTruthy();
  });

  it("EVE-ASN-02-N keeps the notification and shows an error when marking it read fails", async () => {
    signInAs("coordinator");
    apiMock.mockImplementation((path: string) =>
      path === "/notifications" ? Promise.resolve([assignment()]) : Promise.reject(new Error("nope")),
    );

    renderBanner();
    fireEvent.click(await screen.findByRole("button", { name: /Mark as read/i }));

    expect(await screen.findByText("Could not mark the notification as read. Please try again.")).toBeTruthy();
    expect(screen.getByText(/awaiting your review\./)).toBeTruthy();
  });

  // Trying again after a failed "Mark as read" clears the error once it works.
  it("EVE-ASN-02-U clears the error when a retried mark-as-read succeeds", async () => {
    // Arrange: the first mark-as-read fails, the second succeeds.
    signInAs("coordinator");
    let attempts = 0;
    apiMock.mockImplementation((path: string) => {
      if (path === "/notifications") return Promise.resolve([assignment()]);
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("nope")) : Promise.resolve({});
    });
    renderBanner();
    fireEvent.click(await screen.findByRole("button", { name: /Mark as read/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    // Act: try again.
    fireEvent.click(screen.getByRole("button", { name: /Mark as read/i }));

    // Assert: the notification and the error are both gone.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByText(/awaiting your review\./)).toBeNull();
  });

  // Retry keeps working however many times the load fails.
  it("EVE-ASN-02-V retries the load every time Retry is clicked", async () => {
    // Arrange: two failed loads, then a successful one.
    signInAs("coordinator");
    apiMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([assignment()]);
    renderBanner();

    // Act: Retry after the first failure, then again after the second.
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    // Assert: the third load ran and its assignment is shown.
    expect(await screen.findByText(/awaiting your review\./)).toBeTruthy();
    expect(apiMock).toHaveBeenCalledTimes(3);
  });

  // Switching accounts mid-load must never show the previous account's work.
  it("EVE-ASN-02-W ignores a slow load from the previous account after switching accounts", async () => {
    // Arrange: coord-1's load hangs; coord-2's load returns their own assignment.
    signInAs("coordinator");
    let finishOldLoad: (value: Notification[]) => void = () => {};
    apiMock
      .mockReturnValueOnce(new Promise((resolve) => { finishOldLoad = resolve; }))
      .mockResolvedValueOnce([
        assignment({ id: "n-2", audienceUserId: "coord-2", message: 'New event request "Gala" is awaiting your review.' }),
      ]);
    renderBanner();

    // Act: switch to coord-2, then let coord-1's old load finish late.
    act(() => {
      useAppStore.setState({
        currentUser: { id: "coord-2", name: "Coordinator Two", email: "c2@example.test", role: "coordinator" },
      });
    });
    expect(await screen.findByText(/"Gala"/)).toBeTruthy();
    await act(async () => {
      finishOldLoad([assignment()]);
    });

    // Assert: only coord-2's assignment is shown.
    expect(screen.getByText(/"Gala"/)).toBeTruthy();
    expect(screen.queryByText(/"Welcome Evening"/)).toBeNull();
  });

  // A late failure from the previous account must not show an error to the new one.
  it("EVE-ASN-02-X ignores a slow failed load from the previous account after switching accounts", async () => {
    // Arrange: coord-1's load will fail late; coord-2's load succeeds.
    signInAs("coordinator");
    let failOldLoad: (reason: Error) => void = () => {};
    apiMock
      .mockReturnValueOnce(new Promise((_, reject) => { failOldLoad = reject; }))
      .mockResolvedValueOnce([
        assignment({ id: "n-2", audienceUserId: "coord-2", message: 'New event request "Gala" is awaiting your review.' }),
      ]);
    renderBanner();

    // Act: switch to coord-2, then let coord-1's old load fail.
    act(() => {
      useAppStore.setState({
        currentUser: { id: "coord-2", name: "Coordinator Two", email: "c2@example.test", role: "coordinator" },
      });
    });
    expect(await screen.findByText(/"Gala"/)).toBeTruthy();
    await act(async () => {
      failOldLoad(new Error("offline"));
    });

    // Assert: no error is shown to coord-2.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AssignmentNotifications refresh (SPM-123 AC2)", () => {
  // Lets pending api() promises settle and React re-render under fake timers.
  const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // A coordinator who is already online sees a new assignment without reloading.
  it("EVE-ASN-02-O picks up a new assignment on the 30-second refresh", async () => {
    // Arrange: nothing assigned at first, then a new assignment arrives.
    signInAs("coordinator");
    apiMock.mockResolvedValueOnce([]).mockResolvedValue([assignment()]);
    renderBanner();
    await flush();
    expect(screen.queryByText(/awaiting your review\./)).toBeNull();

    // Act: let the polling interval fire.
    await act(() => vi.advanceTimersByTimeAsync(30000));

    // Assert: the banner now shows the new assignment.
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/awaiting your review\./)).toBeTruthy();
  });

  // Returning to the tab refreshes straight away rather than waiting for the timer.
  it("EVE-ASN-02-P refreshes when the window regains focus", async () => {
    // Arrange: the first load finds nothing.
    signInAs("coordinator");
    apiMock.mockResolvedValueOnce([]).mockResolvedValue([assignment()]);
    renderBanner();
    await flush();

    // Act: the coordinator switches back to the tab.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });

    // Assert: a second fetch ran and its result is shown.
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/awaiting your review\./)).toBeTruthy();
  });

  // A focus event during a slow fetch must not start a second, overlapping one.
  it("EVE-ASN-02-Q does not start another fetch while one is still in flight", async () => {
    // Arrange: the first fetch hangs until we resolve it.
    signInAs("coordinator");
    let resolveFirst: (value: Notification[]) => void = () => {};
    apiMock.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    const { container } = renderBanner();
    // Nothing (not even an error) is shown before the first load finishes.
    expect(container.textContent).toBe("");

    // Act: focus fires while the first fetch is still pending.
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    // Assert: still only one request; finishing it renders normally.
    expect(apiMock).toHaveBeenCalledTimes(1);
    resolveFirst([assignment()]);
    await flush();
    expect(screen.getByText(/awaiting your review\./)).toBeTruthy();
  });

  // Signing out or leaving the page stops all background refreshing.
  it("EVE-ASN-02-R stops polling and listening for focus once unmounted", async () => {
    // Arrange: render and let the first load finish.
    signInAs("coordinator");
    apiMock.mockResolvedValue([]);
    const { unmount } = renderBanner();
    await flush();
    expect(apiMock).toHaveBeenCalledTimes(1);

    // Act: unmount, then fire both refresh triggers.
    unmount();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(60000);

    // Assert: no further requests were made.
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  // A fetch that finishes (or fails) after the banner is gone is safely ignored.
  it("EVE-ASN-02-S ignores a load that settles after the banner has unmounted", async () => {
    // Arrange: two fetches that hang until we settle them.
    signInAs("coordinator");
    let resolveLoad: (value: Notification[]) => void = () => {};
    let rejectLoad: (reason: Error) => void = () => {};
    apiMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveLoad = resolve; }))
      .mockReturnValueOnce(new Promise((_, reject) => { rejectLoad = reject; }));
    const first = renderBanner();
    first.unmount();
    const second = renderBanner();
    second.unmount();

    // Act: both settle after unmount.
    resolveLoad([assignment()]);
    rejectLoad(new Error("offline"));
    await flush();

    // Assert: nothing was rendered and no error surfaced.
    expect(document.body.textContent).toBe("");
  });
});

describe("AssignmentNotifications with several assignments (SPM-123 AC2)", () => {
  // Marking one request read leaves the coordinator's other pending requests in place.
  it("EVE-ASN-02-T marks only the chosen notification read and keeps the rest", async () => {
    // Arrange: two unread assignments.
    signInAs("coordinator");
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/notifications"
          ? [
              assignment(),
              assignment({ id: "notif-2", message: 'New event request "Gala" is awaiting your review.' }),
            ]
          : {},
      ),
    );
    renderBanner();
    expect(await screen.findByText("2 awaiting your review")).toBeTruthy();

    // Act: mark the first one read.
    fireEvent.click(screen.getAllByRole("button", { name: /Mark as read/i })[0]);

    // Assert: only the second assignment is left.
    expect(await screen.findByText("1 awaiting your review")).toBeTruthy();
    expect(screen.queryByText(/"Welcome Evening"/)).toBeNull();
    expect(screen.getByText(/"Gala"/)).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith("/notifications/notif-1/read", { method: "POST" });
  });
});
