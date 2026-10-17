// Story: SPM-64 Request a Change to a Submitted Event — AC3
// Test case: REQ-CHANGE-03-A (a change request notice opens the proposed changes)
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import type { Notification } from "@/types";

function notice(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n-1",
    type: "coordinator_change_request",
    message: 'Organiser 1 requested a change to "Alumni Night": expected attendance.',
    read: false,
    createdAt: "2026-10-17T02:00:00.000Z",
    relatedEventId: "event-1",
    ...overrides,
  } as Notification;
}

function renderItem(notification: Notification, onRead = vi.fn()) {
  render(
    <MemoryRouter>
      <NotificationItem notification={notification} onRead={onRead} />
    </MemoryRouter>,
  );
  return onRead;
}

afterEach(cleanup);

describe("NotificationItem", () => {
  /** REQ-CHANGE-03-A: a change request notice links to the event's Change Requests page and marks itself read. */
  it("REQ-CHANGE-03-A links a change request notice to the Change Requests page", async () => {
    const onRead = renderItem(notice());
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/events/event-1/change-requests");
    expect(screen.getByLabelText("Unread")).toBeInTheDocument();
    await userEvent.setup().click(link);
    expect(onRead).toHaveBeenCalledWith("n-1");
  });

  /** Other notices about an event still open the event page. */
  it("links other event notices to the event page", () => {
    renderItem(notice({ type: "coordinator_assignment", read: true }));
    expect(screen.getByRole("link")).toHaveAttribute("href", "/events/event-1");
    expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument();
  });

  /** A notice without an event is a button that marks it read. */
  it("renders a notice without an event as a button", async () => {
    const onRead = renderItem(notice({ type: "submission", relatedEventId: undefined }));
    await userEvent.setup().click(screen.getByRole("button"));
    expect(onRead).toHaveBeenCalledWith("n-1");
  });

  /** SPM-65: the organiser's decision notices open the Change Requests page. */
  it.each(["change_request_approved", "change_request_denied"] as const)("opens the Change Requests page for %s", (type) => {
    renderItem(notice({ type, message: "Your change request was decided." }));
    expect(screen.getByRole("link")).toHaveAttribute("href", "/events/event-1/change-requests");
  });
});
