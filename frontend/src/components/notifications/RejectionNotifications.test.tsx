import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RejectionNotifications } from "@/components/notifications/RejectionNotifications";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import { deferred } from "@/test/deferred";
import type { Notification } from "@/types";

/**
 * SPM-83 — AC6: the Organiser is notified of the rejection and can see the reason.
 * Confluence: EVENT-REJECT-02-B (organiser visibility). Covers the rendered
 * organiser view of the persisted rejection notifications.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function rejectionNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    audienceRole: "organiser",
    audienceUserId: "organiser-9",
    type: "rejection",
    message: 'Your event request "Welcome Evening" was rejected: Venue is not available',
    relatedEventId: "event-1",
    read: false,
    createdAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

function approvalNotification(): Notification {
  return {
    id: "notif-approval-1",
    audienceRole: "organiser",
    audienceUserId: "organiser-9",
    type: "approval",
    message: 'Your event request "Welcome Evening" was approved and can proceed.',
    relatedEventId: "event-1",
    read: false,
    createdAt: "2026-09-14T00:00:00.000Z",
  };
}

function setUserRole(role: "organiser" | "coordinator") {
  useAppStore.setState({
    currentUser: { id: "organiser-9", name: "Org", email: "o@example.test", role },
  });
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RejectionNotifications (SPM-83 AC6)", () => {
  it("shows the organiser the rejection with its reason and a link to the request", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([rejectionNotification()]);

    render(
      <MemoryRouter>
        <RejectionNotifications />
      </MemoryRouter>,
    );

    // Headline and the reason are rendered on separate lines.
    expect(
      await screen.findByText(/Your event request "Welcome Evening" was rejected$/),
    ).toBeTruthy();
    expect(screen.getByText(/Reason: Venue is not available/)).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith("/notifications");
    expect(
      screen.getByRole("link", { name: /View Request/i }).getAttribute("href"),
    ).toBe("/events/event-1");
  });

  it("lets the organiser mark a rejection notification as read", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([rejectionNotification()]);

    render(
      <MemoryRouter>
        <RejectionNotifications />
      </MemoryRouter>,
    );

    await screen.findByText(/Reason: Venue is not available/);
    fireEvent.click(screen.getByRole("button", { name: /Mark As Read/i }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/notifications/notif-1/read",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  /**
   * EVENT-REJECT-02-D: organisers can switch between unread-only and all rejection notifications.
   */
  it("SPM-83 toggles between unread and all rejection decisions", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([
      rejectionNotification(),
      rejectionNotification({
        id: "notif-read",
        message: 'Your event request "Past Event" was rejected: Capacity unavailable',
        read: true,
      }),
    ]);
    render(
      <MemoryRouter>
        <RejectionNotifications />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Welcome Evening/)).toBeInTheDocument();
    expect(screen.queryByText(/Past Event/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    expect(screen.getByText(/Past Event/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show unread/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show unread/i }));
    expect(screen.queryByText(/Past Event/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show all/i })).toBeInTheDocument();
  });

  /**
   * EVENT-REJECT-02-E: organisers can retry after rejection-notification loading fails.
   */
  it("SPM-83 displays a rejection-notification load error and retries", async () => {
    setUserRole("organiser");
    apiMock
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce([rejectionNotification()]);
    render(
      <MemoryRouter>
        <RejectionNotifications />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load request decisions.",
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText(/Welcome Evening/)).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /**
   * EVENT-REJECT-02-F: an empty successful rejection-notification feed renders no section.
   */
  it("does not render the decisions section when the successful feed is empty", async () => {
    setUserRole("organiser");
    // Hold the feed request open so the assertion cannot pass on the pre-load
    // state: the panel must be empty specifically AFTER a successful empty load.
    const pending = deferred<Notification[]>();
    apiMock.mockReturnValue(pending.promise);
    const { container } = render(
      <MemoryRouter>
        <RejectionNotifications />
      </MemoryRouter>,
    );

    // The request is still in flight.
    expect(apiMock).toHaveBeenCalled();

    // Complete the request with an empty feed and let the component settle.
    await act(async () => {
      pending.resolve([]);
      await pending.promise;
    });

    // Only now — after the successful empty response has been applied — assert
    // that no decisions section is rendered. A regression that rendered a
    // header/wrapper on load would make this fail.
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * EVENT-REJECT-02-G: an all-read feed shows the caught-up state and remains reviewable.
   */
  it("shows the caught-up state and keeps read decisions available", async () => {
    setUserRole("organiser");
    const user = userEvent.setup();
    apiMock.mockResolvedValue([
      rejectionNotification({ id: "notif-read", read: true }),
    ]);
    render(
      <MemoryRouter>
        <RejectionNotifications />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/No unread decisions/)).toBeInTheDocument();
    expect(screen.getByText(/All caught up/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as read/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show all/i }));

    expect(await screen.findByText(/Welcome Evening/)).toBeInTheDocument();
    expect(screen.getByText(/Reason: Venue is not available/)).toBeInTheDocument();
  });

  it("renders nothing for a non-organiser", () => {
    setUserRole("coordinator");

    const { container } = render(
      <MemoryRouter>
        <RejectionNotifications />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe("RejectionNotifications (SPM-40 AC4)", () => {
  it("shows the organiser that the approved event can proceed", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([approvalNotification()]);

    render(
      <MemoryRouter>
        <RejectionNotifications />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        'Your event request "Welcome Evening" was approved and can proceed.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /View Request/i }).getAttribute("href")).toBe(
      "/events/event-1",
    );
  });
});
