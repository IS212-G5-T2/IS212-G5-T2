import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Outlet, Route, Routes, useParams } from "react-router-dom";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import { deferred } from "@/test/deferred";
import type { Notification } from "@/types";

/**
 * SPM-83 — AC6: the Organiser is notified of the rejection (the reason is on the event page since the SPM-88 AC3 amendment).
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
    message: 'Your event request "Welcome Evening" was rejected',
    relatedEventId: "event-1",
    read: false,
    createdAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

function approvalNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-approval-1",
    audienceRole: "organiser",
    audienceUserId: "organiser-9",
    type: "approval",
    message: 'Your event request "Welcome Evening" was approved and can proceed.',
    relatedEventId: "event-1",
    read: false,
    createdAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

function setUserRole(role: "organiser" | "coordinator") {
  useAppStore.setState({
    currentUser: { id: "organiser-9", name: "Org", email: "o@example.test", role },
  });
}

afterEach(cleanup);

// The bell button in the top bar; its name is "Notifications" or "Notifications, N unread".
const bellButton = () => screen.getByRole("button", { name: /^Notifications/ });

// Renders the bell and opens its dropdown (the rows live inside it).
function renderBell() {
  const view = render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
  fireEvent.click(bellButton());
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationBell (SPM-83 AC6)", () => {
  // Kills: the rejection headline dropped, a reason shown in the bell, or the 'View Request' link pointing anywhere other than /events/event-1.
  it("EVENT-REJECT-SUP-01 shows the organiser the rejection without a reason and a link to the request", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([rejectionNotification()]);

    renderBell();

    expect(
      await screen.findByText('Your event request "Welcome Evening" was rejected'),
    ).toBeTruthy();
    expect(screen.queryByText(/Reason/)).toBeNull();
    expect(apiMock).toHaveBeenCalledWith("/notifications");
    expect(
      screen.getByRole("link", { name: /View Request/i }).getAttribute("href"),
    ).toBe("/events/event-1");
  });

  // Kills: 'Mark As Read' not posting to the notification's read route with method POST.
  it("EVENT-REJECT-SUP-02 lets the organiser mark a rejection notification as read", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([rejectionNotification()]);

    renderBell();

    await screen.findByText(/Welcome Evening/);
    fireEvent.click(screen.getByRole("button", { name: /Mark As Read/i }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/notifications/notif-1/read",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  // Kills: a read decision listed in the bell, or a Show all / Show unread toggle appearing (the dev-side toggle was retired by SPM-88).
  /**
   * EVENT-REJECT-02-D (changed by the 29 Oct 2026 bell decision): only unread rejection decisions are listed; there
   * is no Show all / Show unread toggle, and a read decision is not shown.
   */
  it("SPM-83 lists only unread rejection decisions and offers no Show all toggle", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([
      rejectionNotification(),
      rejectionNotification({
        id: "notif-read",
        message: 'Your event request "Past Event" was rejected',
        read: true,
      }),
    ]);
    renderBell();
    expect(await screen.findByText(/Welcome Evening/)).toBeInTheDocument();
    expect(screen.queryByText(/Past Event/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show all|show unread/i })).not.toBeInTheDocument();
  });

  // Kills: a failed load not showing the 'Could not load request decisions.' alert, or Retry not re-fetching the feed.
  /**
   * EVENT-REJECT-02-E: organisers can retry after rejection-notification loading fails.
   */
  it("SPM-83 displays a rejection-notification load error and retries", async () => {
    setUserRole("organiser");
    apiMock
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce([rejectionNotification()]);
    renderBell();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load request decisions.",
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText(/Welcome Evening/)).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  // Kills: an empty successful feed showing a badge, or the dropdown lacking the "You're all caught up" message.
  /**
   * EVENT-REJECT-02-F (through the bell, 29 Oct 2026 decision): an empty successful feed shows no badge and
   * "You're all caught up" in the dropdown.
   */
  it("shows no badge and the caught-up message when the successful feed is empty", async () => {
    setUserRole("organiser");
    // Hold the feed request open so the assertion cannot pass on the pre-load state.
    const pending = deferred<Notification[]>();
    apiMock.mockReturnValue(pending.promise);
    renderBell();
    expect(apiMock).toHaveBeenCalled();

    await act(async () => {
      pending.resolve([]);
      await pending.promise;
    });

    expect(bellButton().getAttribute("aria-label")).toBe("Notifications");
    expect(screen.getByText("You're all caught up")).toBeTruthy();
  });

  // Kills: an all-read feed showing a badge or the 'All caught up' state missing, or a read decision still listed or reviewable.
  /**
   * EVENT-REJECT-02-G (through the bell, 29 Oct 2026 decision): an all-read feed shows no badge, lists no
   * decision and offers no way to review read ones.
   */
  it("shows no badge and lists nothing when every decision is read", async () => {
    setUserRole("organiser");
    const pending = deferred<Notification[]>();
    apiMock.mockReturnValue(pending.promise);
    renderBell();
    await act(async () => {
      pending.resolve([rejectionNotification({ id: "notif-read", read: true })]);
      await pending.promise;
    });

    expect(bellButton().getAttribute("aria-label")).toBe("Notifications");
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.queryByText(/Welcome Evening/)).toBeNull();
    expect(screen.queryByRole("button", { name: /mark as read|show all/i })).toBeNull();
  });

  // Kills: the bell rendering for a coordinator, or calling the notifications API for a non-organiser.
  it("EVENT-REJECT-SUP-03 renders no bell for a non-organiser", () => {
    setUserRole("coordinator");

    const { container } = render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe("NotificationBell (SPM-40 AC4)", () => {
  // Kills: an approval notification shown with altered text, or its link pointing away from /events/event-1.
  it("EVENT-APPROVE-SUP-02 shows the organiser that the approved event can proceed", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([approvalNotification()]);

    renderBell();

    expect(
      await screen.findByText(
        'Your event request "Welcome Evening" was approved and can proceed.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /View Request/i }).getAttribute("href")).toBe(
      "/events/event-1",
    );
  });

  // Parent AC (SUPPORTING): SPM-65 AC not in pasted list (to confirm) (story reassigned on 23 Oct 2026)
  // Kills: a denial shown with its reason, or the change-request link going to the event page instead of /change-requests.
  /** SPM-65: change request decisions show without the reason (AC3 amendment) and open the Change Requests page. */
  it("REVIEW-CHANGE-05-D shows a change request denial without its reason and an approval as a confirmation", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([
      rejectionNotification({
        id: "cr-denied",
        type: "change_request_denied",
        message: 'Your change request for "Welcome Evening" was denied: The hall is too small.',
      }),
      rejectionNotification({
        id: "cr-approved",
        type: "change_request_approved",
        message: 'Your change request for "Welcome Evening" was approved.',
      }),
    ]);
    renderBell();
    expect(await screen.findByText(/Your change request for "Welcome Evening" was denied$/)).toBeTruthy();
    expect(screen.queryByText(/hall is too small/)).toBeNull();
    expect(screen.getByText('Your change request for "Welcome Evening" was approved.')).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "View Change Request" });
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("/events/event-1/change-requests");

    // Following a change request link does not mark it read (the Change Requests page does that).
    fireEvent.click(links[0]);
    expect(apiMock.mock.calls.filter(([path]) => String(path).endsWith("/read"))).toHaveLength(0);
    // It also closes the dropdown.
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
  });

  // Kills: a window focus refresh starting a second load while one is in flight (apiMock called twice).
  /**
   * A window focus refresh that arrives while a notification load is still in flight does not start a second load;
   * the held load then fills the list when it resolves.
   */
  it("EVENT-APPROVE-SUP-03 does not start a second notification load while one is still in flight", async () => {
    setUserRole("organiser");
    const load = deferred<Notification[]>();
    apiMock.mockReturnValueOnce(load.promise);
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );

    fireEvent(window, new Event("focus"));

    expect(apiMock).toHaveBeenCalledTimes(1);
    load.resolve([rejectionNotification()]);
    // The bell badge appears once the held load fills the list; opening it shows the decision.
    await waitFor(() => expect(bellButton().getAttribute("aria-label")).toBe("Notifications, 1 unread"));
    fireEvent.click(bellButton());
    expect(await screen.findByText(/Welcome Evening/)).toBeTruthy();
  });
});

/**
 * SPM-88 request decision notifications. Dates are rendered against a fixed clock
 * (Date only is faked; timers stay real so waitFor works). createdAt is
 * 2026-10-28T12:00:00Z, which is 28 Oct in UTC, Asia/Singapore and America/Los_Angeles.
 */
const DECISION_CREATED_AT = "2026-10-28T12:00:00.000Z";

function decisionClock() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z"));
}

function postReadCalls(notificationId: string) {
  return apiMock.mock.calls.filter(([path]) => path === `/notifications/${notificationId}/read`);
}

function EventMarker() {
  const { id } = useParams();
  return <p>Event detail page for {id}</p>;
}

// Keeps the bell mounted while the child route changes, so read state can be asserted after navigation.
// The dropdown is opened first, as a user would.
function renderBellWithEventRoute() {
  const view = render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <NotificationBell />
              <Outlet />
            </>
          }
        >
          <Route path="events/:id" element={<EventMarker />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(bellButton());
  return view;
}

describe("NotificationBell (SPM-88 AC2: approval content)", () => {
  beforeEach(decisionClock);
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * DECISION-NOTIFY-02-A: an approval shows the event name, the word approved and the
   * decision date as visible text (not only in a title attribute).
   * Kills: decision date left out of the row; date only exposed through title;
   * approval wording dropped.
   */
  it("DECISION-NOTIFY-02-A: approval shows the event name, 'approved' and the visible date 28 Oct 2026", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([approvalNotification({ createdAt: DECISION_CREATED_AT })]);

    renderBell();

    expect(await screen.findByText(/Welcome Evening/)).toBeTruthy();
    expect(screen.getByText(/approved/)).toBeTruthy();
    expect(screen.getByText("28 Oct 2026")).toBeVisible();
  });

  /**
   * DECISION-NOTIFY-02-C: an approval has no reason block.
   * Kills: a Reason block rendered for an approval.
   */
  it("DECISION-NOTIFY-02-C: approval renders no Reason block", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([approvalNotification({ createdAt: DECISION_CREATED_AT })]);

    renderBell();

    expect(await screen.findByText(/Welcome Evening/)).toBeTruthy();
    expect(screen.queryByText(/Reason:/)).toBeNull();
  });
});

describe("NotificationBell (SPM-88 AC2: decision date boundaries)", () => {
  beforeEach(decisionClock);
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * DECISION-NOTIFY-02-BND-1: the visible date is the viewer's local calendar day, written
   * without a leading zero, inside a <time> element. The two timestamps are 00:30 and 23:30
   * local time on 5 Oct 2026, so in a timezone ahead of UTC (Asia/Singapore) the first one is
   * 4 Oct in UTC, and in one behind UTC (America/Los_Angeles) the second one is 6 Oct in UTC.
   * Kills: date read with UTC getters; day zero-padded ("05 Oct"); date not in a <time> element.
   */
  it("DECISION-NOTIFY-02-BND-1: decisions at 00:30 and 23:30 local on 5 Oct both show '5 Oct 2026' in a <time>", async () => {
    setUserRole("organiser");
    const earlyLocal = new Date(2026, 9, 5, 0, 30).toISOString();
    const lateLocal = new Date(2026, 9, 5, 23, 30).toISOString();
    apiMock.mockResolvedValue([
      approvalNotification({ id: "n-early", createdAt: earlyLocal }),
      approvalNotification({ id: "n-late", createdAt: lateLocal }),
    ]);

    renderBell();

    const dates = await screen.findAllByText("5 Oct 2026");
    expect(dates).toHaveLength(2);
    expect(dates.map((el) => el.tagName)).toEqual(["TIME", "TIME"]);
    expect(dates.map((el) => el.getAttribute("datetime")).sort()).toEqual([earlyLocal, lateLocal].sort());
  });

  /**
   * DECISION-NOTIFY-02-BND-2: an unparseable createdAt still shows the decision, with no
   * "NaN" or "undefined" date or relative time text.
   * Kills: invalid timestamp rendered as "NaN undefined NaN" or "NaNd ago".
   */
  it("DECISION-NOTIFY-02-BND-2: an invalid createdAt shows the decision without any NaN date text", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([approvalNotification({ createdAt: "not-a-date" })]);

    renderBell();

    const section = await screen.findByRole("dialog", { name: "Notifications" });
    expect(screen.getByText(/Welcome Evening/)).toBeTruthy();
    expect(section.textContent).not.toMatch(/NaN|undefined/);
    expect(section.querySelector("time")).toBeNull();
  });
});

describe("NotificationBell (SPM-88 AC3: rejection content)", () => {
  beforeEach(decisionClock);
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * DECISION-NOTIFY-03-A: a rejection shows the event name, the word rejected and the visible decision
   * date, and no reason (AC3 amended 30 Oct 2026; the reason is on the event page, AC4).
   * Kills: date missing from the visible text; headline without the name; a Reason block in the bell.
   */
  it("DECISION-NOTIFY-03-A: rejection shows name, 'rejected' and visible 28 Oct 2026, with no reason", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([rejectionNotification({ createdAt: DECISION_CREATED_AT })]);

    const { container } = renderBell();

    expect(await screen.findByText('Your event request "Welcome Evening" was rejected')).toBeTruthy();
    expect(screen.getByText("28 Oct 2026")).toBeTruthy();
    expect(screen.queryByText(/Reason/)).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.getByRole("link", { name: "View Request" })).toHaveAttribute("href", "/events/event-1");
  });

  /**
   * DECISION-NOTIFY-03-INT-2: an event name containing quoted decision phrases keeps its full name in the
   * headline, and no reason appears, for a rejection and for an SPM-65 change request denial (whose backend
   * message still carries the reason after the last '" was denied: ').
   * Kills: a split at the first quote-anchored match (name cut at its own '" was denied: ' and part of the
   * name hidden); a denial reason left in the headline.
   */
  it.each([
    {
      label: "rejection (name holds the rejected phrase)",
      type: "rejection" as const,
      message: 'Your event request "Why it was rejected: a retro" was rejected',
    },
    {
      label: "rejection (name holds both quoted phrases)",
      type: "rejection" as const,
      message: 'Your event request "Why" was denied: and" was rejected: a retro" was rejected',
    },
    {
      label: "change request denial (name holds the rejected phrase)",
      type: "change_request_denied" as const,
      message: 'Your change request for "Why" was rejected: a retro" was denied: Dates overlap an existing booking',
      headline: 'Your change request for "Why" was rejected: a retro" was denied',
    },
    {
      label: "change request denial (name holds the denied phrase)",
      type: "change_request_denied" as const,
      message: 'Your change request for "Why" was denied: a retro" was denied: Dates overlap an existing booking',
      headline: 'Your change request for "Why" was denied: a retro" was denied',
    },
    {
      label: "change request denial (message has no separator)",
      type: "change_request_denied" as const,
      message: 'Your change request for "Spring Fair" was denied',
    },
  ])(
    "DECISION-NOTIFY-03-INT-2: $label shows the full name and no reason",
    async ({ type, message, headline }) => {
      setUserRole("organiser");
      apiMock.mockResolvedValue([rejectionNotification({ type, message })]);

      renderBell();

      expect(await screen.findByText(headline ?? message)).toBeVisible();
      expect(screen.queryByText(/Dates overlap|Reason/)).toBeNull();
    },
  );
});

describe("NotificationBell (SPM-88 AC4: link to the event)", () => {
  beforeEach(decisionClock);
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * DECISION-NOTIFY-04-A: the approval link opens the event detail page.
   * Kills: approval link pointing at the change-requests page or at a list.
   */
  it("DECISION-NOTIFY-04-A: the approval link points to /events/event-1", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([approvalNotification({ createdAt: DECISION_CREATED_AT })]);

    renderBell();

    expect(await screen.findByRole("link", { name: "View Request" })).toHaveAttribute(
      "href",
      "/events/event-1",
    );
  });

  /**
   * DECISION-NOTIFY-04-B: the rejection link opens the event detail page, not the change requests page.
   * Kills: rejection routed to /change-requests (the SPM-64/65 change-request route).
   */
  it("DECISION-NOTIFY-04-B: the rejection link points to /events/event-1, not /change-requests", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([rejectionNotification({ createdAt: DECISION_CREATED_AT })]);

    renderBell();

    expect(await screen.findByRole("link", { name: "View Request" })).toHaveAttribute(
      "href",
      "/events/event-1",
    );
  });
});

describe("NotificationBell (SPM-88 AC5: unread state and mark as read)", () => {
  beforeEach(decisionClock);
  afterEach(() => {
    vi.useRealTimers();
  });

  const unreadDecisions = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      rejectionNotification({
        id: `notif-${i + 1}`,
        message: `Your event request "Event ${i + 1}" was rejected`,
        createdAt: DECISION_CREATED_AT,
      }),
    );

  // Serves two unread decisions and acknowledges mark-read calls.
  const twoUnread = [
    rejectionNotification({ id: "notif-1", createdAt: DECISION_CREATED_AT }),
    rejectionNotification({
      id: "notif-2",
      message: 'Your event request "Spring Gala" was rejected',
      createdAt: DECISION_CREATED_AT,
    }),
  ];

  /**
   * DECISION-NOTIFY-05-A: two unread and one read notification show the badge "2" (bell name
   * "Notifications, 2 unread"), list the two unread newest first, and do not list the read one
   * (29 Oct 2026 decision).
   * Kills: badge taken from the total; read decisions still listed; list not sorted newest first.
   */
  it("DECISION-NOTIFY-05-A: two unread and one read notification show badge 2 and list only the two unread, newest first", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue([
      rejectionNotification({ id: "notif-1", createdAt: "2026-10-27T12:00:00.000Z" }),
      rejectionNotification({
        id: "notif-2",
        message: 'Your event request "Spring Gala" was rejected',
        createdAt: DECISION_CREATED_AT,
      }),
      rejectionNotification({
        id: "notif-3",
        message: 'Your event request "Past Event" was rejected',
        read: true,
        createdAt: DECISION_CREATED_AT,
      }),
    ]);

    renderBell();

    await waitFor(() => expect(bellButton().getAttribute("aria-label")).toBe("Notifications, 2 unread"));
    expect(bellButton().textContent).toBe("2");
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Spring Gala");
    expect(rows[1]).toHaveTextContent("Welcome Evening");
    expect(screen.queryByText(/Past Event/)).toBeNull();
    expect(screen.getAllByLabelText("Unread")).toHaveLength(2);
  });

  /**
   * DECISION-NOTIFY-05-B: View Request on an unread decision marks it read once, opens the event
   * and closes the dropdown. Second scenario: when the mark-read call fails, the page still opens
   * the event and the decision stays unread (SPM-88 A3).
   * Kills: link without the mark-read call; dropdown left open after View Request.
   */
  it("DECISION-NOTIFY-05-B: View Request marks the decision read once, opens /events/event-1 and closes the dropdown", async () => {
    setUserRole("organiser");
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith("/read") ? undefined : [rejectionNotification({ createdAt: DECISION_CREATED_AT })]),
    );

    renderBellWithEventRoute();
    fireEvent.click(await screen.findByRole("link", { name: "View Request" }));

    expect(await screen.findByText("Event detail page for event-1")).toBeTruthy();
    expect(postReadCalls("notif-1")).toHaveLength(1);
    expect(postReadCalls("notif-1")[0][1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
    expect(bellButton().getAttribute("aria-expanded")).toBe("false");
  });

  /**
   * DECISION-NOTIFY-05-B (second scenario, SPM-88 A3): when the mark-read call fails, View Request
   * still opens the event, the mark-read is attempted once, and the decision stays unread (badge 1,
   * and still listed when the dropdown is opened again).
   * Kills: navigation blocked by a failed mark-read; the mark-read never attempted; the decision
   * dropped after a failed call.
   */
  it("DECISION-NOTIFY-05-B: when mark-read fails, View Request still opens the event and the decision stays unread", async () => {
    setUserRole("organiser");
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/read")
        ? Promise.reject(new Error("network down"))
        : Promise.resolve([rejectionNotification({ createdAt: DECISION_CREATED_AT })]),
    );

    renderBellWithEventRoute();
    fireEvent.click(await screen.findByRole("link", { name: "View Request" }));

    expect(await screen.findByText("Event detail page for event-1")).toBeTruthy();
    expect(postReadCalls("notif-1")).toHaveLength(1);
    await waitFor(() => expect(bellButton().getAttribute("aria-label")).toBe("Notifications, 1 unread"));
    fireEvent.click(bellButton());
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not mark the notification as read. Please try again.",
    );
  });

  /**
   * DECISION-NOTIFY-05-B (approval, SPM-88 A3): View Request on an unread approval marks it read
   * once and opens the event. Rejections are covered above; this closes the approval path.
   * Kills: mark-read on View Request limited to rejections (approvals excluded from the click mark-read).
   */
  it("DECISION-NOTIFY-05-B: View Request on an unread approval marks it read and opens the event", async () => {
    setUserRole("organiser");
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith("/read") ? undefined : [approvalNotification({ createdAt: DECISION_CREATED_AT })]),
    );

    renderBellWithEventRoute();
    fireEvent.click(await screen.findByRole("link", { name: "View Request" }));

    expect(await screen.findByText("Event detail page for event-1")).toBeTruthy();
    expect(postReadCalls("notif-approval-1")).toHaveLength(1);
  });

  /**
   * DECISION-NOTIFY-05-C: Mark As Read on one of two unread decisions removes that row, the badge
   * becomes 1, the dropdown stays open and nothing navigates.
   * Kills: the read decision left in the list; badge not updated; mark-read also navigating to the event;
   * dropdown closed by Mark As Read.
   */
  it("DECISION-NOTIFY-05-C: Mark As Read removes that row, drops the badge to 1 and does not navigate", async () => {
    setUserRole("organiser");
    apiMock.mockImplementation((path: string) => Promise.resolve(path.endsWith("/read") ? undefined : twoUnread));

    renderBellWithEventRoute();
    const welcomeItem = (await screen.findByText(/Welcome Evening/)).closest("li")!;
    fireEvent.click(within(welcomeItem).getByRole("button", { name: "Mark As Read" }));

    await waitFor(() => expect(bellButton().getAttribute("aria-label")).toBe("Notifications, 1 unread"));
    expect(bellButton().textContent).toBe("1");
    expect(screen.queryByText(/Welcome Evening/)).toBeNull();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Spring Gala");
    expect(postReadCalls("notif-1")).toHaveLength(1);
    expect(screen.queryByText("Event detail page for event-1")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeTruthy();
  });

  /**
   * DECISION-NOTIFY-05-E: a failed Mark As Read shows the exact error and leaves the badge and the
   * rows unchanged.
   * Kills: failure silently ignored; badge decremented or row removed before the server confirms.
   */
  it("DECISION-NOTIFY-05-E: a failed Mark As Read shows the error and leaves the badge and rows unchanged", async () => {
    setUserRole("organiser");
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/read") ? Promise.reject(new Error("server error")) : Promise.resolve(twoUnread),
    );

    renderBellWithEventRoute();
    const welcomeItem = (await screen.findByText(/Welcome Evening/)).closest("li")!;
    fireEvent.click(within(welcomeItem).getByRole("button", { name: "Mark As Read" }));

    expect(
      await screen.findByText("Could not mark the notification as read. Please try again."),
    ).toBeTruthy();
    expect(bellButton().getAttribute("aria-label")).toBe("Notifications, 2 unread");
    expect(bellButton().textContent).toBe("2");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  /**
   * DECISION-NOTIFY-05-F: dismissal. Esc closes the dropdown and returns focus to the bell; a click
   * on a focusable element outside closes it and focus stays on that element; clicking the bell
   * while open closes it; a click inside keeps it open; while closed, Esc and document clicks do
   * nothing (focus does not move), including after an earlier close (listeners removed).
   * Kills: Esc or outside click not closing; focus not returned on Esc; focus stolen on outside click;
   * bell click only opening; a click inside closing it; closed-state listeners moving focus; listener
   * cleanup removed.
   */
  it("DECISION-NOTIFY-05-F: Esc returns focus to the bell, an outside click closes without moving focus, the bell toggles", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue(twoUnread);
    const user = userEvent.setup({ delay: null });
    render(
      <MemoryRouter>
        <input aria-label="Outside field" />
        <NotificationBell />
      </MemoryRouter>,
    );
    await waitFor(() => expect(bellButton().getAttribute("aria-label")).toBe("Notifications, 2 unread"));
    const outside = screen.getByLabelText("Outside field");
    const dialog = () => screen.queryByRole("dialog", { name: "Notifications" });

    // Closed: Esc and a click elsewhere have no effect and focus does not move to the bell.
    await user.click(outside);
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(outside);
    expect(dialog()).toBeNull();

    // Opening: aria-expanded flips and the dropdown shows.
    expect(bellButton().getAttribute("aria-expanded")).toBe("false");
    expect(bellButton().getAttribute("aria-haspopup")).toBe("dialog");
    await user.click(bellButton());
    expect(bellButton().getAttribute("aria-expanded")).toBe("true");
    expect(dialog()).toBeTruthy();

    // A click inside the dropdown keeps it open.
    await user.click(screen.getByRole("heading", { name: "Notifications" }));
    expect(dialog()).toBeTruthy();

    // Clicking the bell while open closes it.
    await user.click(bellButton());
    expect(dialog()).toBeNull();
    expect(bellButton().getAttribute("aria-expanded")).toBe("false");

    // Esc closes it with focus back on the bell.
    await user.click(bellButton());
    screen.getAllByRole("button", { name: "Mark As Read" })[0].focus();
    await user.keyboard("{Escape}");
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(bellButton());

    // A click on a focusable element outside closes it and focus stays on that element.
    await user.click(bellButton());
    expect(dialog()).toBeTruthy();
    await user.click(outside);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(outside);

    // After closing, Esc no longer touches focus (the document listeners were removed).
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(outside);

    // A key other than Esc leaves an open dropdown open.
    await user.click(bellButton());
    await user.keyboard("a");
    expect(dialog()).toBeTruthy();
  });

  /**
   * DECISION-NOTIFY-05-G: a decision made while the organiser is online appears without reloading the
   * page: the feed reloads every 30 s, and also when the window regains focus. Only Date and the
   * interval timers are faked in this test.
   * Kills: refresh interval removed or changed; window focus refresh removed.
   */
  it("DECISION-NOTIFY-05-G: a decision made while online appears after 30 s or on window focus", async () => {
    setUserRole("organiser");
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z"));
    let served: Notification[] = [];
    apiMock.mockImplementation(() => Promise.resolve(served));

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    // First load: nothing unread.
    await act(async () => {});
    expect(bellButton().getAttribute("aria-label")).toBe("Notifications");
    expect(apiMock).toHaveBeenCalledTimes(1);

    // A decision is made; the next 30 s refresh shows it.
    served = unreadDecisions(1);
    await act(async () => {
      vi.advanceTimersByTime(29_000);
    });
    expect(apiMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(bellButton().getAttribute("aria-label")).toBe("Notifications, 1 unread");
    expect(bellButton().textContent).toBe("1");

    // Another decision arrives; regaining window focus reloads at once.
    served = unreadDecisions(2);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(apiMock).toHaveBeenCalledTimes(3);
    expect(bellButton().textContent).toBe("2");
  });

  /**
   * DECISION-NOTIFY-05-BND-1: with no unread decisions there is no badge (the bell is just
   * "Notifications") and the dropdown says "You're all caught up" with no rows, badges or
   * Mark As Read controls (29 Oct 2026 decision).
   * Kills: a "0" badge; read decisions listed; missing empty state; "total" wording.
   */
  it("DECISION-NOTIFY-05-BND-1: zero unread shows no badge and \"You're all caught up\"", async () => {
    setUserRole("organiser");
    const pending = deferred<Notification[]>();
    apiMock.mockReturnValue(pending.promise);

    renderBell();
    await act(async () => {
      pending.resolve([
        rejectionNotification({ id: "notif-1", read: true, createdAt: DECISION_CREATED_AT }),
        rejectionNotification({ id: "notif-2", read: true, createdAt: DECISION_CREATED_AT }),
        rejectionNotification({ id: "notif-3", read: true, createdAt: DECISION_CREATED_AT }),
      ]);
      await pending.promise;
    });

    expect(bellButton().getAttribute("aria-label")).toBe("Notifications");
    expect(bellButton().textContent).toBe("");
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Mark As Read" })).toBeNull();
  });

  /**
   * DECISION-NOTIFY-05-BND-2: with 6 unread decisions all 6 rows are rendered inside one labelled,
   * keyboard-focusable, height-capped scroll region and the badge shows "6"; there is no Show all
   * control and no "total" or "more unread" text (29 Oct 2026 decision).
   * Kills: rows capped or sliced; scroll region without a height cap, tabIndex or accessible name;
   * "total" or "more unread" text; Show all control present.
   */
  it("DECISION-NOTIFY-05-BND-2: 6 unread show all 6 rows in a labelled focusable scroll region and badge 6", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue(unreadDecisions(6));

    renderBell();

    await waitFor(() => expect(bellButton().textContent).toBe("6"));
    const region = screen.getByRole("list", { name: "Unread notifications" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("max-h-96");
    // The dialog itself is a viewport-bounded flex column, so the list scrolls instead of the actions
    // falling off a short screen (the browser check is DECISION-NOTIFY-05-VIEWPORT-1).
    expect(region.className).toContain("min-h-0");
    expect(region.className).toContain("flex-1");
    expect(region.closest('[role="dialog"]')?.classList.contains("max-h-[calc(100dvh-5rem)]")).toBe(true);
    expect(region.closest('[role="dialog"]')?.classList.contains("sm:max-h-[calc(100dvh-6rem)]")).toBe(true);
    expect(region.className).toContain("overflow-y-auto");
    expect(within(region).getAllByRole("listitem")).toHaveLength(6);
    expect(within(region).getByText(/Event 6"/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /show all|show unread/i })).toBeNull();
    expect(screen.queryByText(/total|more unread|All caught up/)).toBeNull();
  });

  /**
   * DECISION-NOTIFY-05-BND-3 (repurposed from the removed panel's last-unread case, 29 Oct 2026 decision):
   * the badge is capped at "9+". Exactly 9 unread show "9", 10 unread show "9+" (the bell name
   * still carries the true count), and all 10 rows are listed.
   * Kills: badge showing the raw count above 9; cap off by one (9 shown as "9+" or 10 as "10").
   */
  it("DECISION-NOTIFY-05-BND-3: the badge shows 9 for nine unread and 9+ for ten unread", async () => {
    setUserRole("organiser");
    apiMock.mockResolvedValue(unreadDecisions(9));
    const nine = renderBell();
    await waitFor(() => expect(bellButton().textContent).toBe("9"));
    nine.unmount();

    apiMock.mockResolvedValue(unreadDecisions(10));
    renderBell();
    await waitFor(() => expect(bellButton().textContent).toBe("9+"));
    expect(bellButton().getAttribute("aria-label")).toBe("Notifications, 10 unread");
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });
});
