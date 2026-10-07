import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RejectionNotifications } from "@/components/domain/RejectionNotifications";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
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
      screen.getByRole("link", { name: /View request/i }).getAttribute("href"),
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
    fireEvent.click(screen.getByRole("button", { name: /Mark as read/i }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/notifications/notif-1/read",
        expect.objectContaining({ method: "POST" }),
      ),
    );
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
    expect(screen.getByRole("link", { name: /View request/i }).getAttribute("href")).toBe(
      "/events/event-1",
    );
  });
});
