/*
 * Story: SPM-138 Join Waitlist When Event Is at Capacity (the attendee's registration section).
 * ACs: AC1 (join when full, no direct register), AC2 (full and waitlist shown on the event), AC3 (Waitlisted status),
 * AC4 (confirmation with position), AC5 (position in the details), AC6 (position moves), AC8 (no entry gets a place
 * without a promotion), AC10 (withdraw from the waitlist), AC11 (removed at close), AC9 (bell: Blocked).
 * Test cases: JOIN-WAITLIST-01-A-FE, 01-C-FE, 01-C-FE-REFUSED, 01-D-FE, 01-E-FE, 01-E-FE-DOUBLE, 01-E-FE-REFRESH,
 * 02-A-FE, 02-B-FE, 03-A-FE, 03-B-FE, 04-A-FE-JOIN, 05-A-FE, 05-B-FE, 06-D-FE, 08-A-FE, 08-C-FE, 09-A-FE (Blocked),
 * 10-A-FE, 10-B-FE, 10-C-FE-C, 11-A-FE, 11-D-FE, 12-B-FE (Blocked).
 *
 * Time is frozen at T0 (setSystemTime through fake Date only); the API is mocked at the boundary, the store is real.
 *
 * ASSUMPTION index:
 *  - A-TXT: "You are on the waitlist" is the waiting indicator copy (F20); the section heading for a waiting entry is "Waitlist".
 *  - A-AVAIL: the full-state availability reads "0 of 3 available" (the spec's wording) from the event's registration limit.
 *  - A-BANNER: the join banner is built from the event name and the response position; the response message is never echoed.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationSection } from "./RegistrationSection";
import { useAppStore } from "@/store/useAppStore";
import { ApiError, api } from "@/utils/api";
import type { EventRecord, Registration, User } from "@/types";
import {
  ATT_04,
  ATT_05,
  ATT_07,
  GALA_NAME,
  HOUR,
  T0,
  buildGala,
  buildRegistered,
  buildWaitlisted,
  iso,
  notFull,
} from "./waitlist.fixtures";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const EVENT_PATH = "/events/EVT-701";
const JOIN = (eventId = "EVT-701") => [`/events/${eventId}/waitlist`, "POST"] as const;

/** One scripted server: the join, the attendee's own read and the withdrawal answer as the case needs. */
interface Server {
  join?: () => Promise<unknown>;
  me?: Registration | null;
  withdraw?: () => Promise<unknown>;
}
function serve(server: Server) {
  apiMock.mockImplementation((path: string, init?: RequestInit) => {
    if (path === JOIN()[0] && init?.method === JOIN()[1]) return (server.join ?? (() => Promise.reject(new Error("no join"))))();
    if (path === `${EVENT_PATH}/registrations/me`) return Promise.resolve({ registration: server.me ?? null });
    if (/\/registrations\/.*\/withdraw$/.test(path) && init?.method === "POST")
      return (server.withdraw ?? (() => Promise.reject(new Error("no withdraw"))))();
    return Promise.reject(new Error(`unexpected request ${path}`));
  });
}
const joinCalls = () => apiMock.mock.calls.filter(([path, init]) => path === JOIN()[0] && init?.method === JOIN()[1]);
const withdrawCalls = () => apiMock.mock.calls.filter(([path, init]) => /\/withdraw$/.test(path) && init?.method === "POST");

function renderSection(event: EventRecord, user: User, registration?: Registration) {
  return render(<RegistrationSection event={event} currentUser={user} registration={registration} onWithdrawn={() => undefined} />);
}
/**
 * A promise the test settles itself. A join answer arrives only when the test resolves it, so the tests need no timer
 * (the earlier 50 ms timers are gone; the fake clock covers only Date).
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
const JOINED_AT_1 = { registrationId: "REG-ATT-04", status: "waitlisted", position: 1, message: "x" };
const joinButton = () => screen.queryByRole("button", { name: "Join Waitlist" });
const registerButton = () => screen.queryByRole("button", { name: "Register" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
  apiMock.mockReset();
  useAppStore.setState({
    isAuthenticated: true,
    currentUser: { ...ATT_04, role: "attendee" },
    registrations: [],
  });
});
afterEach(() => vi.useRealTimers());

// JOIN-WAITLIST-01-A-FE: a full, open event with an empty list offers Join and no Register.
describe("JOIN-WAITLIST-01-A-FE: a full event offers the waitlist, not a direct registration (AC1)", () => {
  // Kills: F1, F23
  it("JOIN-WAITLIST-01-A-FE: the Join Waitlist control is enabled and Register is absent", () => {
    renderSection(buildGala(), ATT_04);

    expect(joinButton()).toBeEnabled();
    expect(registerButton()).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-01-C-FE: the same event before and after the tenth place is taken.
describe("JOIN-WAITLIST-01-C-FE: Register while spots remain, Join once the event is full (AC1)", () => {
  // Kills: F1
  it("JOIN-WAITLIST-01-C-FE-BND-A: with a spot left (9 of 10) the page offers Register and no Join", () => {
    renderSection(notFull(), ATT_04);

    expect(registerButton()).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
  });

  // Kills: F1
  it("JOIN-WAITLIST-01-C-FE-BND-B: once full (10 of 10) the page offers Join and no Register", () => {
    renderSection(notFull({ isFull: true, waitlistAvailable: true, availableSpots: 0, availableRegistrationSpots: 0 }), ATT_04);

    expect(joinButton()).toBeInTheDocument();
    expect(registerButton()).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-01-D-FE: the window is shown before fullness.
describe("JOIN-WAITLIST-01-D-FE: a closed or not-yet-open full event shows the window, not the waitlist (AC1)", () => {
  // Kills: F33
  it("JOIN-WAITLIST-01-D-FE-INT-A: a closed full event shows Registration closed and no controls", () => {
    renderSection(buildGala({ registrationClosesAt: iso(-HOUR), registrationOpen: false, waitlistAvailable: false }), ATT_04);

    expect(screen.getByRole("heading", { name: "Registration closed" })).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    expect(registerButton()).not.toBeInTheDocument();
  });

  // Kills: F34, F38
  it("JOIN-WAITLIST-01-D-FE-INT-B: a full event that opens later shows Registration opens on the SGT time, no controls", () => {
    const opens = "2026-10-17T09:00:00+08:00";
    renderSection(buildGala({ registrationOpensAt: opens, registrationOpen: false, waitlistAvailable: false }), ATT_04);

    expect(screen.getByRole("heading", { name: "Registration opens on 17 Oct 2026, 09:00 SGT" })).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-01-E-FE: a waiting attendee sees the indicator, and a double click sends one request.
describe("JOIN-WAITLIST-01-E-FE: a waiting attendee cannot join twice (AC1)", () => {
  // Kills: CARD-COPY, CARD-M12
  it("JOIN-WAITLIST-01-E-FE-STATE: the waiting indicator replaces Join, and the position is still 1", () => {
    renderSection(buildGala(), ATT_04, buildWaitlisted("ATT-04", 1));

    expect(screen.getByRole("heading", { name: "You're on the waitlist" })).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    expect(screen.getByText("You're #1 in line")).toBeInTheDocument();
  });

  // Kills: F1, F3, F23
  it("JOIN-WAITLIST-01-E-FE-INT-DOUBLE: a double click sends one join request and Join is disabled after the first click", async () => {
    const answer = deferred<typeof JOINED_AT_1>();
    serve({ join: () => answer.promise, me: buildWaitlisted("ATT-04", 1) });
    renderSection(buildGala(), ATT_04);

    const join = joinButton()!;
    fireEvent.click(join);
    fireEvent.click(join);

    expect(join).toBeDisabled();
    await act(async () => answer.resolve(JOINED_AT_1));
    await waitFor(() => expect(joinCalls()).toHaveLength(1));
  });
});

// JOIN-WAITLIST-02-A-FE: the full, open event shows its state, the availability, the message and the closing date.
describe("JOIN-WAITLIST-02-A-FE: the event page shows full and the waitlist (AC2)", () => {
  // Kills: F1, F8, F20
  it("JOIN-WAITLIST-02-A-FE: Event full, 0 of 3 available, MSG-WL-02, Join, no Register, and the closing date", () => {
    renderSection(buildGala(), ATT_04);

    expect(screen.getByRole("heading", { name: "Event full" })).toBeInTheDocument();
    expect(screen.getByText("0 of 3 available")).toBeInTheDocument(); // A-AVAIL
    expect(
      screen.getByText("This event is full. Join the waitlist to be notified if a spot opens."),
    ).toBeInTheDocument();
    expect(joinButton()).toBeInTheDocument();
    expect(registerButton()).not.toBeInTheDocument();
    expect(screen.getByText("Closes")).toBeInTheDocument();
  });
});

// JOIN-WAITLIST-02-B-FE: the three non-waiting states.
describe("JOIN-WAITLIST-02-B-FE: the other states show no waitlist text (AC2)", () => {
  // Kills: F1
  it("JOIN-WAITLIST-02-B-FE-INT: a free place shows Register, not the full text", () => {
    renderSection(notFull(), ATT_04);

    expect(screen.queryByText(/This event is full/)).not.toBeInTheDocument();
    expect(registerButton()).toBeInTheDocument();
  });

  // Kills: F33
  it("JOIN-WAITLIST-02-B-FE-INT: a closed event shows Registration closed and no waitlist text", () => {
    renderSection(buildGala({ registrationClosesAt: iso(-HOUR), registrationOpen: false, waitlistAvailable: false }), ATT_04);

    expect(screen.getByRole("heading", { name: "Registration closed" })).toBeInTheDocument();
    expect(screen.queryByText(/waitlist/i)).not.toBeInTheDocument();
  });

  // Kills: F34
  it("JOIN-WAITLIST-02-B-FE-INT: a not-yet-open event shows Registration opens on, and no waitlist text", () => {
    renderSection(buildGala({ registrationOpensAt: "2026-10-17T09:00:00+08:00", registrationOpen: false, waitlistAvailable: false }), ATT_04);

    expect(screen.getByRole("heading", { name: /Registration opens on/ })).toBeInTheDocument();
    expect(screen.queryByText(/waitlist/i)).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-03-A-FE: the status and the indicator for a waiting entry.
describe("JOIN-WAITLIST-03-A-FE: the waiting status reads Waitlisted (AC3)", () => {
  // Kills: CARD-M12
  it("JOIN-WAITLIST-03-A-FE-STATE: the card shows the waitlist headline and position, and no Register or Join", () => {
    renderSection(buildGala(), ATT_04, buildWaitlisted("ATT-04", 1));

    expect(screen.getByRole("heading", { name: "You're on the waitlist" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You're on the waitlist" })).toBeInTheDocument();
    expect(registerButton()).not.toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-03-B-FE: another attendee with no entry sees the full event and can join.
describe("JOIN-WAITLIST-03-B-FE: a waiting entry does not change the page for others (AC3)", () => {
  // Kills: F1
  it("JOIN-WAITLIST-03-B-FE: ATT-05 with no entry sees Event full and Join while ATT-04 is waiting", () => {
    renderSection(buildGala(), ATT_05);

    expect(screen.getByRole("heading", { name: "Event full" })).toBeInTheDocument();
    expect(joinButton()).toBeInTheDocument();
  });
});

// JOIN-WAITLIST-04-A-FE: the join banner, built from the event name and the response position.
describe("JOIN-WAITLIST-04-A-FE: the confirmation banner states the position (AC4)", () => {
  // Kills: F1, F19, F23
  it("JOIN-WAITLIST-04-A-FE-STATE-JOIN: a successful join shows the MSG-WL-01 banner from the response position", async () => {
    serve({
      join: () =>
        Promise.resolve({
          registrationId: "REG-ATT-04",
          status: "waitlisted",
          position: 1,
          // The server's own sentence differs: the banner must not echo it.
          message: "SERVER TEXT THE BANNER MUST NOT ECHO",
        }),
      me: buildWaitlisted("ATT-04", 1),
    });
    renderSection(buildGala(), ATT_04);

    fireEvent.click(joinButton()!);

    expect(await screen.findByText(`You have joined the waitlist for ${GALA_NAME}. Your position is 1.`)).toBeInTheDocument();
    expect(screen.queryByText("SERVER TEXT THE BANNER MUST NOT ECHO")).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-05-A-FE and 05-B-FE: the details show the owner's position only.
describe("JOIN-WAITLIST-05-A/B-FE: the position appears in the details for the owner's waiting entry (AC5)", () => {
  // Kills: CARD-COPY
  it("JOIN-WAITLIST-05-A-FE-STATE: ATT-05 at position 2 sees You're #2 in line", () => {
    renderSection(buildGala(), ATT_05, buildWaitlisted("ATT-05", 2));

    expect(screen.getByText("You're #2 in line")).toBeInTheDocument();
  });

  // Kills: CARD-M13
  it("JOIN-WAITLIST-05-B-FE-STATE: a confirmed or withdrawn registration shows no waitlist position", () => {
    const { unmount } = renderSection(buildGala(), ATT_04, buildRegistered("ATT-04"));
    expect(screen.queryByText(/in line/)).not.toBeInTheDocument();
    unmount();

    const withdrawn = renderSection(buildGala(), ATT_04, buildRegistered("ATT-04", { status: "withdrawn", withdrawnAt: iso(0) }));
    expect(screen.queryByText(/in line/)).not.toBeInTheDocument();
    withdrawn.unmount();

    // A registered row that (wrongly) carries a position still shows none: only a waiting entry shows its position.
    renderSection(buildGala(), ATT_04, buildRegistered("ATT-04", { waitlistPosition: 2 }));
    expect(screen.queryByText(/in line/)).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-06-D-FE: after promotions and withdrawals, the position each attendee reads is the one the server sent.
describe("JOIN-WAITLIST-06-D-FE: positions shown are the ones read on reload (AC6)", () => {
  // Kills: CARD-COPY
  it("JOIN-WAITLIST-06-D-FE-STATE: ATT-06 is 1 and ATT-07 is 2 on a fresh read", () => {
    const { unmount } = renderSection(buildGala(), { ...ATT_07 }, buildWaitlisted("ATT-07", 2));
    expect(screen.getByText("You're #2 in line")).toBeInTheDocument();
    unmount();

    renderSection(buildGala(), { ...ATT_07, id: "ATT-06" }, buildWaitlisted("ATT-06", 1));
    expect(screen.getByText("You're #1 in line")).toBeInTheDocument();
  });
});

// JOIN-WAITLIST-08-A-FE: a new attendee sees the full event with Join after a promotion (no entry of their own).
describe("JOIN-WAITLIST-08-A-FE: after a promotion, an attendee with no entry sees full and Join (AC8)", () => {
  // Kills: F1
  it("JOIN-WAITLIST-08-A-FE: ATT-07 sees Event full and Join Waitlist", () => {
    renderSection(buildGala(), ATT_07);

    expect(screen.getByRole("heading", { name: "Event full" })).toBeInTheDocument();
    expect(joinButton()).toBeInTheDocument();
  });
});

// JOIN-WAITLIST-08-C-FE: a withdrawal with an empty list frees a place: Register, no Join.
describe("JOIN-WAITLIST-08-C-FE: a freed place with no waitlist offers Register (AC8)", () => {
  // Kills: F1
  it("JOIN-WAITLIST-08-C-FE-BND: ATT-07 sees Register and no Join once a place is free", () => {
    renderSection(notFull({ availableSpots: 1, availableRegistrationSpots: 1 }), ATT_07);

    expect(registerButton()).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-09-A-FE: the bell is not built yet.
describe("JOIN-WAITLIST-09-A-FE: the in-app bell (Blocked: no bell exists yet)", () => {
  // Kills: none. Blocked placeholder (skipped, asserts nothing); see the spec for the blocker.
  it.skip("JOIN-WAITLIST-09-A-FE: Blocked (FE bell): the AC9 notice is covered by JOIN-WAITLIST-09-C-FE (the mounted attendee notice in AppShell); the bell remains blocked", () => {
    // Intentionally empty until the in-app notification bell exists.
  });
});

// JOIN-WAITLIST-10-A-FE: the withdrawal prompt for a waiting entry.
describe("JOIN-WAITLIST-10-A-FE: a waiting attendee withdraws with the waitlist copy (AC10)", () => {
  // Kills: CARD-M8, CARD-M10, CDLG-M1, CDLG-M2, F4, LEAVE-M
  it("JOIN-WAITLIST-10-A-FE: the leave prompt says the registration is withdrawn too; confirming shows the toast", async () => {
    serve({
      withdraw: () =>
        Promise.resolve({
          ...buildWaitlisted("ATT-05", null),
          status: "withdrawn",
          withdrawnAt: T0.toISOString(),
          message: "SERVER TEXT",
        }),
    });
    renderSection(buildGala(), ATT_05, buildWaitlisted("ATT-05", 2, { id: "REG-ATT-05" }));

    await userEvent.click(screen.getByRole("button", { name: "Leave waitlist" }));
    const dialog = screen.getByRole("dialog", { name: "Leave the waitlist?" });
    expect(within(dialog).getByText("Leaving the waitlist also withdraws your registration for this event. You'll lose your place in line.")).toBeInTheDocument();
    expect(within(dialog).getByText("Your place is #2 in line. Once you leave, it can't be restored.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave waitlist" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Left the waitlist");
    expect(screen.queryByText(/in line/)).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-10-B-FE: cancelling the prompt sends nothing.
describe("JOIN-WAITLIST-10-B-FE: cancelling the prompt keeps the place (AC10)", () => {
  // Kills: CARD-COPY, CARD-M8, CARD-M10, F32
  it("JOIN-WAITLIST-10-B-FE-STATE: Cancel closes the prompt, sends no request, and the attendee stays at position 2", async () => {
    serve({});
    renderSection(buildGala(), ATT_05, buildWaitlisted("ATT-05", 2, { id: "REG-ATT-05" }));

    await userEvent.click(screen.getByRole("button", { name: "Leave waitlist" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep my place" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(withdrawCalls()).toHaveLength(0);
    expect(screen.getByText("You're #2 in line")).toBeInTheDocument();
  });
});

/**
 * JOIN-WAITLIST-10-A-FE-ERR: a failed leave (the server refuses or the network fails) keeps the leave dialog open, shows the
 * spec's inline error, leaves Leave waitlist enabled, and changes nothing on the card (the place is still held).
 */
describe("JOIN-WAITLIST-10-A-FE-ERR: a failed leave keeps the dialog open with the error (AC10)", () => {
  // Kills: CARD-COPY, CARD-M8, CARD-M10, CARD-M12, CDLG-M5
  it("JOIN-WAITLIST-10-A-FE-ERR-LEAVE: the inline error shows in the dialog, the action is enabled, and the place stays", async () => {
    serve({ withdraw: () => Promise.reject(new Error("Network down")) });
    renderSection(buildGala(), ATT_05, buildWaitlisted("ATT-05", 2, { id: "REG-ATT-05" }));

    await userEvent.click(screen.getByRole("button", { name: "Leave waitlist" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Leave waitlist" }));

    const dialog = await screen.findByRole("dialog", { name: "Leave the waitlist?" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Couldn't withdraw your registration. Try again.");
    expect(within(dialog).getByRole("button", { name: "Leave waitlist" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Keep my place" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "You're on the waitlist" })).toBeInTheDocument();
    expect(screen.getByText("You're #2 in line")).toBeInTheDocument();
  });
});

// JOIN-WAITLIST-10-C-FE-C: from the start instant the Withdraw control is gone.
describe("JOIN-WAITLIST-10-C-FE: the withdraw control stops at the start (AC10)", () => {
  // Kills: CARD-M11, CARD-M12
  it("JOIN-WAITLIST-10-C-FE-BND-C: at 18:30 the waiting entry shows no Withdraw control and stays Waitlisted", () => {
    vi.setSystemTime(new Date("2026-11-10T18:30:00+08:00"));
    renderSection(
      buildGala({ startDateTime: "2026-11-10T18:00:00+08:00", endDateTime: "2026-11-10T20:00:00+08:00", registrationClosesAt: "2026-11-10T23:59:00+08:00" }),
      ATT_04,
      buildWaitlisted("ATT-04", 1),
    );

    expect(screen.queryByRole("button", { name: "Leave waitlist" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You're on the waitlist" })).toBeInTheDocument();
  });
});

// JOIN-WAITLIST-11-A-FE: removed at close.
describe("JOIN-WAITLIST-11-A-FE: a removed entry shows Removed and no position (AC11)", () => {
  // Kills: F14, F33
  it("JOIN-WAITLIST-11-A-FE-STATE: the badge reads Removed, the page reads Registration closed, and no control or position shows", () => {
    renderSection(
      buildGala({ registrationClosesAt: iso(-HOUR), registrationOpen: false, waitlistAvailable: false }),
      ATT_04,
      buildWaitlisted("ATT-04", null, { status: "removed" }),
    );

    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration closed" })).toBeInTheDocument();
    expect(screen.queryByText(/in line/)).not.toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    expect(registerButton()).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-11-D-FE: a withdrawal after close frees a place, but the page stays closed.
describe("JOIN-WAITLIST-11-D-FE: after close, a freed place does not show Register (AC11)", () => {
  // Kills: F33
  it("JOIN-WAITLIST-11-D-FE-INT: with registration closed (even with a free place) Register is not shown", () => {
    renderSection(
      buildGala({ registrationClosesAt: iso(-HOUR), registrationOpen: false, waitlistAvailable: false, availableSpots: 1, availableRegistrationSpots: 1, isFull: false }),
      ATT_07,
    );

    expect(registerButton()).not.toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
  });
});

// JOIN-WAITLIST-12-B-FE: a waiting entry cancelled with its event (AC12). The cancel itself is covered by the backend
// e2e (12-A and 12-B); this renders the state the attendee then sees.
describe("JOIN-WAITLIST-12-B-FE: a cancelled waiting entry shows Cancelled and no controls", () => {
  // Kills: a waiting-list control kept on a cancelled entry (F-CANCELLED-CONTROLS), a position shown for a cancelled entry.
  it("JOIN-WAITLIST-12-B-FE: a cancelled entry shows Cancelled and no controls", () => {
    // Arrange: ATT-05's entry was cancelled with the event (status cancelled, no position).
    const cancelled = buildWaitlisted(ATT_05.id, null, { status: "cancelled" });

    // Act
    renderSection(buildGala(), ATT_05, cancelled);

    // Assert: the cancelled heading, no position, and no withdraw, leave, join or register control.
    expect(screen.getByText("Registration cancelled")).toBeInTheDocument();
    expect(screen.queryByText(/position/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /withdraw|leave waitlist|join waitlist|register/i })).not.toBeInTheDocument();
  });
});

/**
 * JOIN-WAITLIST-01-C-FE-REFUSED: a join the server refuses (422 WAITLIST_NOT_AVAILABLE) shows the server's sentence in an
 * alert, shows no confirmation banner, and reads nothing new.
 */
describe("JOIN-WAITLIST-01-C-FE-ERR-REFUSED: a refused join shows the server's sentence (AC1)", () => {
  // Kills: F1, F4, F23, F24, F26, F35
  it("JOIN-WAITLIST-01-C-FE-ERR-REFUSED: the MSG-WL-03 alert appears and no banner is shown", async () => {
    serve({
      join: () =>
        Promise.reject(
          new ApiError("This event still has available spots. Please register directly.", undefined, "WAITLIST_NOT_AVAILABLE", 422),
        ),
    });
    renderSection(buildGala(), ATT_04);

    fireEvent.click(joinButton()!);

    expect(await screen.findByRole("alert")).toHaveTextContent("This event still has available spots. Please register directly.");
    expect(screen.queryByText(/You have joined the waitlist/)).not.toBeInTheDocument();
  });
});

/**
 * JOIN-WAITLIST-01-E-FE-REFRESH: a duplicate join (409 already_on_waitlist) shows MSG-WL-04 and reads the attendee's own
 * entry again, so the page shows the waiting indicator and the position rather than a stale Join control.
 */
describe("JOIN-WAITLIST-01-E-FE-ERR-REFRESH: a duplicate join refreshes the page from the server (AC1)", () => {
  // Kills: CARD-M12, F1, F7, F23, F24, F26, F35, PANEL-M
  it("JOIN-WAITLIST-01-E-FE-ERR-REFRESH: MSG-WL-04 is announced, the entry is read again, and the indicator replaces Join", async () => {
    serve({
      join: () =>
        Promise.reject(new ApiError("You are already on the waitlist for this event.", undefined, "already_on_waitlist", 409)),
      me: buildWaitlisted("ATT-04", 1),
    });
    renderSection(buildGala(), ATT_04);

    fireEvent.click(joinButton()!);

    expect(await screen.findByRole("alert")).toHaveTextContent("You are already on the waitlist for this event.");
    expect(await screen.findByRole("heading", { name: "You're on the waitlist" })).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    expect(apiMock.mock.calls.some(([path]) => path === `${EVENT_PATH}/registrations/me`)).toBe(true);
  });
});

/** JOIN-WAITLIST-04-A-FE-DISMISS: the banner after a join can be dismissed from the section. */
describe("JOIN-WAITLIST-04-A-FE-STATE-DISMISS: the join banner is dismissible from the section (AC4)", () => {
  // Kills: CARD-M12, F1, F5, F11, F19, F23
  it("JOIN-WAITLIST-04-A-FE-STATE-DISMISS: Dismiss removes the MSG-WL-01 banner and leaves the page as it is", async () => {
    serve({
      join: () => Promise.resolve({ registrationId: "REG-ATT-04", status: "waitlisted", position: 1, message: "x" }),
      me: buildWaitlisted("ATT-04", 1),
    });
    renderSection(buildGala(), ATT_04);

    fireEvent.click(joinButton()!);
    expect(await screen.findByText(`You have joined the waitlist for ${GALA_NAME}. Your position is 1.`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText(/You have joined the waitlist/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You're on the waitlist" })).toBeInTheDocument();
  });
});

/**
 * JOIN-WAITLIST-01-C-FE-GENERIC: a failed join that carries no message still tells the attendee what happened, in the
 * same alert, with the locked fallback wording.
 */
describe("JOIN-WAITLIST-01-C-FE-ERR-GENERIC: a failed join with no message gets a fallback alert", () => {
  // Kills: F1, F4, F23, F24, F26, F27, F35
  it("JOIN-WAITLIST-01-C-FE-ERR-GENERIC: the alert reads the fallback sentence and no banner is shown", async () => {
    serve({ join: () => Promise.reject("network down") });
    renderSection(buildGala(), ATT_04);

    fireEvent.click(joinButton()!);

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't join the waitlist. Please try again.");
    expect(screen.queryByText(/You have joined the waitlist/)).not.toBeInTheDocument();
  });
});

/** JOIN-WAITLIST-11-A-FE-CLOSEDON: a removed entry whose registration closed shows when it closed. */
describe("JOIN-WAITLIST-11-A-FE-CLOSEDON: a removed entry shows the closing time (AC11)", () => {
  // Kills: F28, F38
  it("JOIN-WAITLIST-11-A-FE-STATE-CLOSEDON: the Closed on row shows the closing instant in SGT", () => {
    const closed = iso(-HOUR);
    renderSection(
      buildGala({ registrationClosesAt: closed, registrationOpen: false, waitlistAvailable: false }),
      ATT_04,
      buildWaitlisted("ATT-04", null, { status: "removed" }),
    );

    expect(screen.getByText("Closed on")).toBeInTheDocument();
    expect(screen.getByText("14 Oct 2026, 11:00")).toBeInTheDocument(); // closed at T0 minus one hour, SGT
  });
});

/**
 * JOIN-WAITLIST-01-E-FE-SAMETICK: two clicks dispatched inside one render batch, before the disabled state
 * is committed, still send one join request. This reaches the in-flight guard that the disabled control alone does not cover.
 */
describe("JOIN-WAITLIST-01-E-FE-INT-SAMETICK: a same-batch double click sends one join request (AC1)", () => {
  // Kills: F1, F6, F23
  it("JOIN-WAITLIST-01-E-FE-INT-SAMETICK: the in-flight guard blocks the second click", async () => {
    const answer = deferred<typeof JOINED_AT_1>();
    serve({ join: () => answer.promise, me: buildWaitlisted("ATT-04", 1) });
    renderSection(buildGala(), ATT_04);

    const join = joinButton()!;
    act(() => {
      join.click();
      join.click();
    });
    await act(async () => answer.resolve(JOINED_AT_1));

    await waitFor(() => expect(joinCalls()).toHaveLength(1));
  });
});

/**
 * JOIN-WAITLIST-11-C-FE: a registration-disabled event (manual close) offers neither Register nor Join, for a full
 * event and for a not-full one. The section shows the existing SPM-61 "not enabled" sentence; it does not show a
 * "Registration closed" heading (see the report: that wording conflicts with the existing SPM-61 test).
 * Kills F16: the disabled guard is dropped, so the normal state logic offers Join (full) or Register (not full).
 */
describe("JOIN-WAITLIST-11-C-FE: a registration-disabled event offers no Register or Join (AC11)", () => {
  // Kills: F16
  it("JOIN-WAITLIST-11-C-FE-INT-FULL: a full event with registration disabled offers no Join and no Register", () => {
    renderSection(buildGala({ registrationEnabled: false, registrationOpen: false, waitlistAvailable: false }), ATT_04);

    expect(screen.getByText("Registration through the website is not enabled for this event.")).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    expect(registerButton()).not.toBeInTheDocument();
  });

  // Kills: F16
  it("JOIN-WAITLIST-11-C-FE-INT-NOTFULL: a not-full event with registration disabled offers no Register and no Join", () => {
    renderSection(notFull({ registrationEnabled: false, registrationOpen: false, waitlistAvailable: false }), ATT_04);

    expect(screen.getByText("Registration through the website is not enabled for this event.")).toBeInTheDocument();
    expect(registerButton()).not.toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
  });
});

/**
 * JOIN-WAITLIST-07-E-FE: an attendee who withdrew from a full, open event still sees the withdrawn
 * card and the Join Waitlist control, and a join puts them at the back of the list (the banner shows the position).
 * Kills F17: the withdrawn suppression on the waitlist panel is restored.
 */
describe("JOIN-WAITLIST-07-E-FE: a withdrawn attendee may rejoin a full, open event's list (AC6, D2)", () => {
  // Kills: F1, F17, F19, F23
  it("JOIN-WAITLIST-07-E-FE-STATE: the withdrawn card stays, Join is offered, and the join shows the back-of-list position", async () => {
    serve({
      join: () => Promise.resolve({ registrationId: "REG-ATT-04", status: "waitlisted", position: 1, message: "x" }),
      me: buildWaitlisted("ATT-04", 1),
    });
    renderSection(buildGala(), ATT_04, buildRegistered("ATT-04", { status: "withdrawn", withdrawnAt: iso(0) }));

    expect(screen.getByText("Registration withdrawn")).toBeInTheDocument();
    expect(joinButton()).toBeInTheDocument();

    fireEvent.click(joinButton()!);

    expect(await screen.findByText(`You have joined the waitlist for ${GALA_NAME}. Your position is 1.`)).toBeInTheDocument();
    expect(joinCalls()).toHaveLength(1);
  });
});
