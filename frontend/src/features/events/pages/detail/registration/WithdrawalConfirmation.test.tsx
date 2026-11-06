/*
 * Story: SPM-120 Withdraw Registration (attendee), confirmation flow, after the registration status cards redesign.
 * ACs: AC2 (the prompt names the consequences), AC3 (confirm or cancel), AC5 (status becomes Withdrawn), AC6 (on-screen
 *      confirmation, now a toast that times out).
 * Test cases: WITHDRAW-EVENT-REG-02-A, 03-A (frontend half), 03-B, 06-A, 06-B.
 * Note: test IDs follow the six-AC matrix (docs/specs/SPM-120-test-results.md, "Test ID map", lists the former Confluence IDs); AC numbers are Jira.
 *
 * The dialog (ConfirmDialog, variant "withdraw") is exercised through RegistrationSection, because the Withdraw action on the
 * card, the dialog, the toast and the focus return all live there. HTTP is mocked at the boundary; the store is real. Every
 * oracle is a literal from the registration status cards spec. Suite clock T0 = 2026-10-04 12:00 SGT; all timers are fake and
 * advanced explicitly (no real waiting).
 * Status mapping: the spec's "Confirmed" is the repo's "Registered"; the card headline reads "You're registered".
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationSection } from "./RegistrationSection";
import { useAppStore } from "@/store/useAppStore";
import { ApiError, api } from "@/utils/api";
import type { EventRecord, Registration } from "@/types";
import { ATT_01, T0, buildEvent, buildRegistration, timelineEntry, withdrawalResponse } from "./withdrawal.fixtures";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
/** Lets resolved mock promises and React state updates settle without real waiting. */
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
/** The card's Withdraw action (only when no dialog is open, so the name is unique). */
const withdrawButton = () => screen.queryByRole("button", { name: "Withdraw" });
/** The dialog's buttons, scoped to the dialog so they do not clash with the card's action. */
const dialogOf = () => screen.getByRole("dialog");
const confirmButton = () => within(dialogOf()).getByRole("button", { name: "Withdraw" });
const keepButton = () => within(dialogOf()).getByRole("button", { name: "Keep registration" });
const WITHDRAW_FAILED = "Couldn't withdraw your registration. Try again.";

/** Renders the section for an owned registration; the store holds the same registration. */
function renderSection(event: EventRecord = buildEvent(), registration: Registration = buildRegistration()) {
  useAppStore.setState({ isAuthenticated: true, currentUser: ATT_01, registrations: [registration] });
  return render(<RegistrationSection event={event} currentUser={ATT_01} registration={registration} />);
}

/** Answers the withdraw POST with the given outcome; anything else gets "no registration". */
function mockWithdraw(outcome: () => Promise<unknown>) {
  apiMock.mockImplementation((path: string, init?: RequestInit) =>
    path.endsWith("/withdraw") && init?.method === "POST" ? outcome() : Promise.resolve({ registration: null }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  // Testing Library only drains its internal timer when a global `jest` exists; give it the Vitest equivalent.
  vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime });
  apiMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SPM-120 AC2: the confirmation prompt names the consequences", () => {
  // WITHDRAW-EVENT-REG-02-A
  // Oracle (registration status cards spec, withdraw variant): title "Withdraw your registration?", body "You'll give up
  // your spot for this event.", buttons "Keep registration" (safe) and "Withdraw" (danger). Opening sends nothing.
  // Kills: the title or body copy changed; the request fired on the first click.
  // Kills (frontend spm138): CARD-M10
  it("WITHDRAW-EVENT-REG-02-A: clicking Withdraw opens the prompt and sends nothing", async () => {
    // Arrange
    const u = setup();
    mockWithdraw(() => Promise.resolve(withdrawalResponse(buildRegistration())));
    renderSection();

    // Act
    await u.click(withdrawButton()!);

    // Assert: title, consequence and buttons, exactly as in the spec
    const dialog = screen.getByRole("dialog", { name: "Withdraw your registration?" });
    expect(within(dialog).getByText("You'll give up your spot for this event.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Keep registration" })).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe("SPM-120 AC3: confirming withdraws, cancelling changes nothing", () => {
  // WITHDRAW-EVENT-REG-03-A
  // Oracle (SPEC 03-A frontend): exactly one POST to /registrations/REG-9001/withdraw; dialog closes; toast "Registration
  // withdrawn"; withdrawn card with Registered 3 Oct 2026, 12:00 and Withdrawn 4 Oct 2026, 12:00 in its timeline.
  // Kills: two requests per click; wrong registration id; local state not updated from the response.
  // Kills (frontend spm138): CARD-M10, F38
  it("WITHDRAW-EVENT-REG-03-A (frontend): Confirm sends one POST and shows the withdrawn status", async () => {
    // Arrange
    const u = setup();
    mockWithdraw(() => Promise.resolve(withdrawalResponse(buildRegistration())));
    renderSection();
    await u.click(withdrawButton()!);

    // Act
    await u.click(confirmButton());
    await flush();

    // Assert: one request to the right path, dialog gone, toast and withdrawn status shown
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith("/registrations/REG-9001/withdraw", expect.objectContaining({ method: "POST" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The toast is the only status region here; the withdrawn card's own heading repeats the words.
    expect(screen.getByRole("status")).toHaveTextContent("Registration withdrawn");
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    // SPM-120 card redesign: each timeline entry carries its own absolute SGT timestamp.
    expect(timelineEntry("Registered").getByText("3 Oct 2026, 12:00")).toBeInTheDocument();
    expect(timelineEntry("Withdrawn").getByText("4 Oct 2026, 12:00")).toBeInTheDocument();
  });

  // WITHDRAW-EVENT-REG-03-A
  // Oracle (SPEC 03-A: exactly one POST): two activations of Withdraw before React re-renders (a fast double click)
  // still send a single request; the second would be refused as "already withdrawn" and show a false error.
  // Kills: M40 the in-flight guard (`withdrawInFlight`) removed, so a double activation sends two requests.
  // Kills (frontend spm138): CARD-M10
  it("WITHDRAW-EVENT-REG-03-A (double activation): two Withdraw clicks in one tick send one POST", async () => {
    // Arrange: the first request stays in flight.
    const u = setup();
    mockWithdraw(() => new Promise(() => {}));
    renderSection();
    await u.click(withdrawButton()!);
    const confirm = confirmButton();

    // Act: both clicks land before any re-render can disable the button.
    act(() => {
      confirm.click();
      confirm.click();
    });
    await flush();

    // Assert
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  // WITHDRAW-EVENT-REG-03-B
  // Oracle (SPEC 03-B + F12): "Keep registration" closes the dialog with zero requests, the card stays registered, no
  // toast, focus returns to the card's Withdraw action.
  // Kills: M9 Keep sends the request; local state mutated on cancel.
  // Kills (frontend spm138): CARD-M10, CARD-M5, F32
  it("WITHDRAW-EVENT-REG-03-B: Keep registration closes the prompt with no request and no change", async () => {
    // Arrange
    const u = setup();
    renderSection();
    await u.click(withdrawButton()!);

    // Act
    await u.click(keepButton());

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "You're registered" })).toBeInTheDocument();
    expect(screen.queryByText("Withdrawn")).not.toBeInTheDocument();
    expect(screen.queryByText("Registration withdrawn")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(withdrawButton()).toHaveFocus();
  });

  // WITHDRAW-EVENT-REG-03-B
  // Oracle (ASSUMED, F12): a click on the dimmed backdrop is ignored; the dialog stays and nothing is sent.
  // Kills: M9 backdrop click closes or confirms.
  // Kills (frontend spm138): CARD-M10
  it("WITHDRAW-EVENT-REG-03-B (backdrop, ASSUMED F12): clicking outside the dialog does nothing", async () => {
    // Arrange
    const u = setup();
    renderSection();
    await u.click(withdrawButton()!);
    const backdrop = screen.getByRole("dialog").parentElement!;

    // Act
    await u.click(backdrop);

    // Assert
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe("SPM-120 AC6: a toast confirms the withdrawal, then times out", () => {
  // WITHDRAW-EVENT-REG-06-A
  // Oracle (SPEC 06-A A, toast): Withdraw disabled and aria-busy while pending, no success text early; after 200 the
  // dialog is gone within 500 ms and a status toast reads "Registration withdrawn". The toast dismisses itself after
  // 5 seconds (the shared Toast timer); it has no Dismiss button.
  // Kills: M7 success shown before the response; dialog lingers over 500 ms; toast never times out.
  // Kills (frontend spm138): CARD-M10, CDLG-M4, TOAST-M1
  it("WITHDRAW-EVENT-REG-06-A (A): pending state, then a status toast that times out", async () => {
    // Arrange: the response is held back until we release it.
    const u = setup();
    let release!: (value: unknown) => void;
    mockWithdraw(() => new Promise((resolve) => { release = resolve; }));
    renderSection();
    await u.click(withdrawButton()!);

    // Act 1: confirm; the request is still pending.
    await u.click(confirmButton());
    await flush();

    // Assert 1: busy, disabled, and no success text yet
    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Registration withdrawn")).not.toBeInTheDocument();

    // Act 2: the server answers 200.
    release(withdrawalResponse(buildRegistration()));
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    // Assert 2: dialog closed within 500 ms; the toast is a polite status, not an error
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const shown = screen.getByRole("status");
    expect(shown).toHaveTextContent("Registration withdrawn");
    expect(shown).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Act 3 + Assert 3: still there at 4 s, then gone after the 5 s timeout.
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(screen.getByRole("status")).toHaveTextContent("Registration withdrawn");
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
  });

  // WITHDRAW-EVENT-REG-06-A
  // Oracle (Added 06-A B, the spec's error copy): a 5xx, a network failure, a plain Error or a rejection with no value
  // shows the inline error "Couldn't withdraw your registration. Try again." inside the dialog. The dialog stays open,
  // Withdraw is enabled again, and no success text appears. (The server's own wording is not shown.)
  // Kills: success shown on failure; Withdraw left disabled; the server's wording echoed; the dialog closed on failure.
  it.each([
    ["a 503 response", new ApiError("The service is temporarily unavailable. Please try again.", undefined, undefined, 503)],
    ["a network failure", new ApiError("Unable to reach the server. Check your connection and try again.")],
    ["a plain Error", new Error("Something broke")],
    ["a rejection with no value", undefined],
  ])("WITHDRAW-EVENT-REG-06-A (B, added): %s -> the spec's inline error in the dialog and no success", async (_label, failure) => {
    // Arrange
    const u = setup();
    mockWithdraw(() => Promise.reject(failure));
    renderSection();
    await u.click(withdrawButton()!);

    // Act
    await u.click(confirmButton());
    await flush();

    // Assert: the dialog stays open with the spec's error; the action is enabled again; no success
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(WITHDRAW_FAILED);
    expect(confirmButton()).toBeEnabled();
    expect(screen.queryByText("Registration withdrawn")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You're registered" })).toBeInTheDocument();
  });

  // WITHDRAW-EVENT-REG-06-B
  // Oracle (SPEC 06-B + D9 + F15): the toast text is built by the UI, not echoed from the server ("SERVER MESSAGE..." in the
  // response is never shown); the toast has no timestamp; the Withdrawn timeline entry shows 4 Oct 2026, 14:30 (clock 14:30 SGT).
  // Kills: banner echoing the server message; a timestamp in the toast; the timestamp moved out of the timeline.
  it.each([
    ["REG-9001", "EVT-101", "Tech Talk: Cloud 101"],
    ["REG-9003", "EVT-103", "Annual Conference 2026"],
    ["REG-9005", "EVT-105", "Workshop: Docker Mastery"],
  ])("WITHDRAW-EVENT-REG-06-B: %s on %s shows the UI's own toast text", async (registrationId, eventId, eventName) => {
    // Arrange: clock 14:30 SGT; ATT-01 owns the registration.
    const at1430 = new Date("2026-10-04T14:30:00+08:00");
    vi.setSystemTime(at1430);
    const u = setup();
    const registration = buildRegistration({ id: registrationId, eventId });
    mockWithdraw(() => Promise.resolve(withdrawalResponse(registration, at1430)));
    renderSection(buildEvent({ id: eventId, name: eventName }), registration);
    await u.click(withdrawButton()!);

    // Act
    await u.click(confirmButton());
    await flush();

    // Assert
    const message = screen.getByRole("status");
    expect(message.textContent).toBe("✓ Registration withdrawn");
    expect(message.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    expect(screen.queryByText("SERVER MESSAGE THE UI MUST NOT ECHO")).not.toBeInTheDocument();
    // SPM-120 card redesign: the Withdrawn timeline entry (not the toast) carries the absolute SGT timestamp.
    expect(timelineEntry("Withdrawn").getByText("4 Oct 2026, 14:30")).toBeInTheDocument();
  });
});

/*
 * SPM-120 assumption index. Decision IDs (A*, D*, F*) are defined in docs/specs/SPM-120-test-results.md,
 * "Decision and assumption IDs". assumption -> tests that rely on it:
 *  F12  a click on the dialog backdrop is ignored, ASSUMED -> 03-B (backdrop)
 *  D9   the toast text is built by the UI, never echoed from the response -> 06-B
 *  A11  RETIRED: the spec now fixes one inline error for every failed withdrawal ("Couldn't withdraw your registration.
 *       Try again."); the 06-A (B) rows assert it
 *  D13  the toast is announced politely and times out after 5 s (registration status cards spec); replaces the earlier
 *       persistent banner -> 06-A (A)
 *  F15  the toast carries no timestamp; the time is in the withdrawn card's timeline -> 06-B
 *  MAP  SPEC "Confirmed" is the repo's "Registered" -> every test
 */
