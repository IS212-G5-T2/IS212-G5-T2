/*
 * Story: SPM-120 Withdraw Registration (attendee), confirmation flow.
 * ACs: AC2 (prompt shows event name and consequences), AC3 (confirm or cancel),
 *      AC5 (status becomes Withdrawn), AC6 (on-screen confirmation message).
 * Test cases: WITHDRAW-EVENT-REG-02-A, 03-A (frontend half), 03-B, 07-A, 07-B.
 * Note: test IDs are from Confluence; AC numbers are Jira.
 *
 * The dialog is exercised through RegistrationSection, because the Withdraw
 * button, the badge, the banner and the focus return all live there. HTTP is
 * mocked at the boundary; the store is real. Every oracle is a literal from the
 * AC text or the Confluence pages. Suite clock T0 = 2026-10-04 12:00 SGT; all
 * timers are fake and advanced explicitly (no real waiting).
 * Status mapping: SPEC "Confirmed" is the repo's "Registered" (Q3a); "Withdrawn" is unchanged.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationSection } from "./RegistrationSection";
import { useAppStore } from "@/store/useAppStore";
import { ApiError, api } from "@/utils/api";
import type { EventRecord, Registration } from "@/types";
import { ATT_01, T0, buildEvent, buildRegistration, withdrawalResponse } from "./withdrawal.fixtures";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
/** Lets resolved mock promises and React state updates settle without real waiting. */
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const withdrawButton = () => screen.queryByRole("button", { name: "Withdraw" });
const confirmButton = () => screen.getByRole("button", { name: "Confirm Withdrawal" });
const banner = () => screen.queryByRole("status", { name: "Withdrawal confirmation" });

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

describe("SPM-120 AC2: the confirmation prompt shows the event name and the consequences", () => {
  // Oracle (SPEC 02-A): dialog named "Withdraw from Tech Talk: Cloud 101?", both consequences, two buttons.
  // Added: opening the dialog sends no request.
  // Mutants killed: event name missing/wrong; request fired on the first click; consequence text missing.
  it("WITHDRAW-EVENT-REG-02-A: clicking Withdraw opens the prompt and sends nothing", async () => {
    // Arrange
    const u = setup();
    mockWithdraw(() => Promise.resolve(withdrawalResponse(buildRegistration())));
    renderSection();

    // Act
    await u.click(withdrawButton()!);

    // Assert: title, consequences and buttons, exactly as in the test data
    const dialog = screen.getByRole("dialog", { name: "Withdraw from Tech Talk: Cloud 101?" });
    expect(within(dialog).getByText("This will free up a spot for other attendees.")).toBeInTheDocument();
    expect(within(dialog).getByText("You can re-register if the registration period is open.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Confirm Withdrawal" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe("SPM-120 AC3: confirming withdraws, cancelling changes nothing", () => {
  // Oracle (SPEC 03-A frontend): exactly one POST to /registrations/REG-9001/withdraw; dialog closes;
  // badge "Withdrawn"; "Withdrawn today at 12:00".
  // Mutants killed: two requests per click; wrong registration id; local state not updated from the response.
  it("WITHDRAW-EVENT-REG-03-A (frontend): Confirm sends one POST and shows the withdrawn status", async () => {
    // Arrange
    const u = setup();
    mockWithdraw(() => Promise.resolve(withdrawalResponse(buildRegistration())));
    renderSection();
    await u.click(withdrawButton()!);

    // Act
    await u.click(confirmButton());
    await flush();

    // Assert: one request to the right path, dialog gone, status area updated
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith("/registrations/REG-9001/withdraw", expect.objectContaining({ method: "POST" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn today at 12:00")).toBeInTheDocument();
  });

  // Oracle (SPEC 03-B + F12): Cancel closes the dialog with zero requests, badge stays, no message, focus returns.
  // Mutants killed: M9 Cancel sends the request; local state mutated on cancel.
  it("WITHDRAW-EVENT-REG-03-B: Cancel closes the prompt with no request and no change", async () => {
    // Arrange
    const u = setup();
    renderSection();
    await u.click(withdrawButton()!);

    // Act
    await u.click(screen.getByRole("button", { name: "Cancel" }));

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
    expect(screen.getByText("Registered")).toBeInTheDocument();
    expect(screen.queryByText("Withdrawn")).not.toBeInTheDocument();
    expect(banner()).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(withdrawButton()).toHaveFocus();
  });

  // Oracle (ASSUMED, F12): a click on the dimmed backdrop is ignored; the dialog stays and nothing is sent.
  // Mutants killed: M9 backdrop click closes or confirms.
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

describe("SPM-120 AC6: an on-screen message confirms the withdrawal", () => {
  // Oracle (SPEC 07-A A + D13): Confirm disabled and aria-busy while pending, no success text early;
  // after 200 the dialog is gone within 500 ms and a persistent, dismissible success banner shows exactly MSG-11.
  // Mutants killed: M7 success shown before the response; auto-dismiss under 3 s; dialog lingers over 500 ms.
  it("WITHDRAW-EVENT-REG-07-A (A): pending state, then a persistent dismissible success banner", async () => {
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
    expect(screen.queryByText(/has been processed/)).not.toBeInTheDocument();

    // Act 2: the server answers 200.
    release(withdrawalResponse(buildRegistration()));
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    // Assert 2: dialog closed within 500 ms; success banner (not an error), exact text
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const shown = banner()!;
    expect(shown).toHaveAttribute("data-variant", "success");
    expect(within(shown).getByText("Your withdrawal from Tech Talk: Cloud 101 has been processed.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Act 3 + Assert 3: still there after 10 s, details still shown, status updated; Dismiss removes it.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(banner()).toBeInTheDocument();
    expect(screen.getByText("Registration ID")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    await u.click(within(banner()!).getByRole("button", { name: "Dismiss" }));
    expect(banner()).not.toBeInTheDocument();
  });

  // Oracle (Added 07-A B): a 5xx or network failure shows an error inside the dialog, never the success text.
  // Mutants killed: success shown on failure; Confirm left disabled; local status changed on failure.
  it.each([
    ["a 503 response", new ApiError("The service is temporarily unavailable. Please try again.", undefined, undefined, 503)],
    ["a network failure", new ApiError("Unable to reach the server. Check your connection and try again.")],
  ])("WITHDRAW-EVENT-REG-07-A (B, added): %s -> error alert in the dialog and no success", async (_label, failure) => {
    // Arrange
    const u = setup();
    mockWithdraw(() => Promise.reject(failure));
    renderSection();
    await u.click(withdrawButton()!);

    // Act
    await u.click(confirmButton());
    await flush();

    // Assert
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(failure.message);
    expect(confirmButton()).toBeEnabled();
    expect(screen.queryByText(/has been processed/)).not.toBeInTheDocument();
    expect(screen.getByText("Registered")).toBeInTheDocument();
  });

  // Oracle (SPEC 07-B + D9 + F15): MSG-11 template per event name, built by the UI (the mock's text is different),
  // no timestamp in the banner; the status area shows "Withdrawn today at 14:30" (clock 14:30 SGT).
  // Mutants killed: hard-coded event name; name taken from another registration; template differing per event;
  // banner echoing the server message; a timestamp in the banner.
  it.each([
    ["REG-9001", "EVT-101", "Tech Talk: Cloud 101"],
    ["REG-9003", "EVT-103", "Annual Conference 2026"],
    ["REG-9005", "EVT-105", "Workshop: Docker Mastery"],
  ])("WITHDRAW-EVENT-REG-07-B: %s names %s correctly", async (registrationId, eventId, eventName) => {
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
    const sentence = `Your withdrawal from ${eventName} has been processed.`;
    const message = within(banner()!).getByText(sentence);
    expect(message.textContent).toBe(sentence);
    expect(message.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    expect(screen.queryByText("SERVER MESSAGE THE UI MUST NOT ECHO")).not.toBeInTheDocument();
    expect(screen.getByText("Withdrawn today at 14:30")).toBeInTheDocument();
  });
});
