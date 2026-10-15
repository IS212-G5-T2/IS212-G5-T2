/*
 * Story: SPM-138 Join Waiting List (attendee notices).
 * ACs: AC9 (the attendee is notified of a promotion, in the app) and AC12 (a cancelled waiting entry is notified).
 * Test cases: JOIN-WAITLIST-09-C-FE (the notice renders with MSG-WL-05, a link to the event, and no other types),
 * JOIN-WAITLIST-09-C-FE-ROLE (no request and no notice for a non-attendee).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WaitlistNotifications } from "@/components/notifications/WaitlistNotifications";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { Notification } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const MSG_WL_05 = "A spot opened up. You are now registered for Gala Waitlist Night.";

const notice = (overrides: Partial<Notification>): Notification => ({
  id: "n-1",
  audienceRole: "attendee",
  audienceUserId: "attendee-1",
  type: "WaitlistPromoted",
  message: MSG_WL_05,
  relatedEventId: "EVT-701",
  read: false,
  createdAt: "2026-10-14T04:00:00.000Z",
  ...overrides,
});

function renderNotices() {
  return render(
    <MemoryRouter>
      <WaitlistNotifications />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  useAppStore.setState({ currentUser: { id: "attendee-1", name: "Alice", email: "alice@example.com", role: "attendee" } });
});
afterEach(() => cleanup());

describe("JOIN-WAITLIST-09-C-FE: the attendee's waiting list notice (AC9, AC12)", () => {
  it("JOIN-WAITLIST-09-C-FE: the promotion text shows with a link to the event, and other types are not shown", async () => {
    apiMock.mockResolvedValue([
      notice({}),
      notice({ id: "n-2", type: "approval", message: "Your request was approved." }),
    ]);

    renderNotices();

    expect(await screen.findByText(MSG_WL_05)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Event" })).toHaveAttribute("href", "/events/EVT-701");
    expect(screen.queryByText("Your request was approved.")).not.toBeInTheDocument();
  });

  it("JOIN-WAITLIST-09-C-FE-CANCEL: a cancelled waiting entry's notice is shown as well", async () => {
    apiMock.mockResolvedValue([
      notice({ id: "n-3", type: "EventCancelled", message: "Gala Waitlist Night has been cancelled. Your waiting list place is cancelled." }),
    ]);

    renderNotices();

    expect(await screen.findByText("Gala Waitlist Night has been cancelled. Your waiting list place is cancelled.")).toBeInTheDocument();
  });

  it("JOIN-WAITLIST-09-C-FE-ROLE: a non-attendee sends no request and sees no notice", async () => {
    useAppStore.setState({ currentUser: { id: "org-1", name: "Org", email: "org@example.com", role: "organiser" } });

    const { container } = renderNotices();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(apiMock).not.toHaveBeenCalled();
  });
});
