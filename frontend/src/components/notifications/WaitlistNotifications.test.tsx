/*
 * Story: SPM-138 Join Waitlist (attendee notices).
 * ACs: AC9 (the attendee is notified of a promotion, in the app) and AC12 (a cancelled waiting entry is notified).
 * Test cases: JOIN-WAITLIST-09-C-FE (the notice renders with MSG-WL-05, a link to the event, and no other types),
 * JOIN-WAITLIST-09-C-FE-ROLE (no request and no notice for a non-attendee).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("JOIN-WAITLIST-09-C-FE: the attendee's waitlist notice (AC9, AC12)", () => {
  // Kills: F18
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

  // Kills: F18, F37
  it("JOIN-WAITLIST-09-C-FE-CANCEL: a cancelled waiting entry's notice is shown as well", async () => {
    apiMock.mockResolvedValue([
      notice({ id: "n-3", type: "EventCancelled", message: "Gala Waitlist Night has been cancelled. Your waitlist place is cancelled." }),
    ]);

    renderNotices();

    expect(await screen.findByText("Gala Waitlist Night has been cancelled. Your waitlist place is cancelled.")).toBeInTheDocument();
  });

  // Kills: F36
  it("JOIN-WAITLIST-09-C-FE-ERR-ROLE: a non-attendee sends no request and sees no notice", async () => {
    useAppStore.setState({ currentUser: { id: "org-1", name: "Org", email: "org@example.com", role: "organiser" } });

    const { container } = renderNotices();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(apiMock).not.toHaveBeenCalled();
  });
});

/*
 * Story: SPM-181 Event Change Notification (Attendee).
 * AC6 (the notice appears where the attendee's other event notices appear, unread until opened or marked read, and
 * opens the event's page). AC2's timestamp is the notice's own time.
 * Test cases: EVENT-CHANGE-NOTIF-06-E (shown with its time and a link), 06-F (opening it or marking it read clears
 * it), 06-G (an unread-only panel keeps a read notice out).
 */
describe("SPM-181 the attendee's event rescheduled notice (AC2, AC6)", () => {
  const MESSAGE = '"Gala Waitlist Night" has been rescheduled. It now runs 24 Oct 2026, 7:00 pm to 24 Oct 2026, 10:00 pm (SGT).';
  const rescheduled = (overrides: Partial<Notification> = {}) =>
    notice({ id: "n-r", type: "EventRescheduled", message: MESSAGE, createdAt: "2026-10-14T03:00:00.000Z", ...overrides });

  // Kills: the type missing from the panel's filter, a link to another page, the time not shown.
  it("EVENT-CHANGE-NOTIF-06-E shows the notice with the time it was created and a link to the event", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T05:00:00.000Z"));
    apiMock.mockResolvedValue([rescheduled()]);

    renderNotices();

    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("2h ago")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Event" })).toHaveAttribute("href", "/events/EVT-701");
    vi.useRealTimers();
  });

  // Kills: Mark As Read not calling the server, opening the event leaving the notice unread.
  it("EVENT-CHANGE-NOTIF-06-F marking it read, or opening the event, sends the read call for that notice", async () => {
    apiMock.mockImplementation(async (path: string) => (path === "/notifications" ? [rescheduled()] : { success: true }));
    renderNotices();
    await screen.findByText(MESSAGE);

    fireEvent.click(screen.getByRole("link", { name: "View Event" }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/notifications/n-r/read", { method: "POST" }));
    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument());
  });

  /** EVENT-CHANGE-NOTIF-06-F (AC6): Mark As Read sends the read call for the notice and hides it. Kills: no read call, notice left on screen. */
  it("EVENT-CHANGE-NOTIF-06-F Mark As Read hides the notice and sends the read call", async () => {
    apiMock.mockImplementation(async (path: string) => (path === "/notifications" ? [rescheduled()] : { success: true }));
    renderNotices();
    await screen.findByText(MESSAGE);

    fireEvent.click(screen.getByRole("button", { name: "Mark As Read" }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/notifications/n-r/read", { method: "POST" }));
    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument());
  });

  // Kills: showing a notice that is already read.
  it("EVENT-CHANGE-NOTIF-06-G does not show a notice that is already read", async () => {
    apiMock.mockResolvedValue([rescheduled({ read: true })]);

    const { container } = renderNotices();

    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});

/*
 * SPM-181 changed the shared attendee panel for every notice type it lists (the time under the message, and View Event
 * marking the notice read). These cases pin that for the two existing types and for the notice a link belongs to.
 */
describe("SPM-181 the attendee panel for the other notice types (AC6)", () => {
  const WAITLIST_TEXT = "A spot opened up. You are now registered for Gala Waitlist Night.";

  /**
   * EVENT-CHANGE-NOTIF-06-E (AC6): a promotion and a cancellation notice show their time as well.
   * Kills: limiting the time to the rescheduled type.
   */
  it.each([
    ["WaitlistPromoted", WAITLIST_TEXT],
    ["EventCancelled", "Gala Waitlist Night has been cancelled. Your waitlist place is cancelled."],
  ] as const)("EVENT-CHANGE-NOTIF-06-E a %s notice shows the time it was created", async (type, message) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T07:00:00.000Z"));
    apiMock.mockResolvedValue([notice({ type, message, createdAt: "2026-10-14T04:00:00.000Z" })]);

    renderNotices();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("3h ago")).toBeInTheDocument();
    vi.useRealTimers();
  });

  /**
   * EVENT-CHANGE-NOTIF-06-F (AC6): View Event marks a promotion or a cancellation notice read too.
   * Kills: marking only the rescheduled type read.
   */
  it.each([
    ["WaitlistPromoted", WAITLIST_TEXT],
    ["EventCancelled", "Gala Waitlist Night has been cancelled. Your waitlist place is cancelled."],
  ] as const)("EVENT-CHANGE-NOTIF-06-F View Event on a %s notice sends its read call", async (type, message) => {
    apiMock.mockImplementation(async (path: string) => (path === "/notifications" ? [notice({ id: "n-o", type, message })] : { success: true }));
    renderNotices();
    await screen.findByText(message);

    fireEvent.click(screen.getByRole("link", { name: "View Event" }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/notifications/n-o/read", { method: "POST" }));
  });

  /**
   * EVENT-CHANGE-NOTIF-06-F (AC6): with several notices, View Event marks the notice it belongs to, and no other, read.
   * Kills: marking the first (or another) notice read.
   */
  it("EVENT-CHANGE-NOTIF-06-F View Event marks only its own notice read", async () => {
    apiMock.mockImplementation(async (path: string) =>
      path === "/notifications"
        ? [notice({ id: "n-1", message: WAITLIST_TEXT }), notice({ id: "n-2", type: "EventRescheduled", message: "Second notice", relatedEventId: "EVT-702" })]
        : { success: true },
    );
    renderNotices();
    await screen.findByText("Second notice");

    fireEvent.click(screen.getAllByRole("link", { name: "View Event" })[1]);

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/notifications/n-2/read", { method: "POST" }));
    expect(apiMock).not.toHaveBeenCalledWith("/notifications/n-1/read", { method: "POST" });
  });
});
