/*
 * SPM-61 attendee registration UI. Test Case IDs are ASSUMED from the task's
 * matrix (docs/specs/SPM-61-test-cases.md is absent); quotes are Jira AC
 * wording. Time is frozen with setSystemTime; windows are offsets from it.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationSection } from "./RegistrationSection";
import { useAppStore } from "@/store/useAppStore";
import { ApiError, api } from "@/utils/api";
import { formatSgt } from "@/utils/registration";
import type { EventRecord, Registration, User } from "@/types";
import { ATT_01, T0, buildEvent, buildPastEvent, buildRegistration } from "./withdrawal.fixtures";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const NOW = new Date("2030-06-01T00:00:00.000Z");
const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

const attendee: User = { id: "attendee-1", name: "Alice Tan", email: "alice@example.com", role: "attendee" };
const baseEvent: EventRecord = {
  id: "event-1", name: "Innovation Expo", purpose: "p", description: "d",
  organiserId: "o", organiserName: "O", status: "confirmed",
  startDateTime: iso(48 * HOUR), endDateTime: iso(50 * HOUR), expectedAttendance: 50,
  venueRequirements: { minCapacity: 50, accessibility: [], facilities: [], layout: "" },
  equipmentNeeds: "", registrationEnabled: true,
  registrationOpensAt: iso(-HOUR), registrationClosesAt: iso(24 * HOUR), availableRegistrationSpots: 48,
  changeRequests: [], createdAt: iso(-HOUR), updatedAt: iso(-HOUR),
};
const created: Registration = {
  id: "REG-9001", eventId: "event-1", attendeeId: attendee.id, attendeeName: "Alice Tan",
  status: "registered", registeredAt: iso(0),
};

/** Renders the section with the event and optional existing registration. */
function renderSection(event: EventRecord = baseEvent, registration?: Registration) {
  return render(<RegistrationSection event={event} currentUser={attendee} registration={registration} />);
}
const registerButton = () => screen.queryByRole("button", { name: "Register" });

/** Answers the registration POST with the given outcome. */
function mockPost(outcome: () => Promise<unknown>) {
  apiMock.mockImplementation((path: string, init?: RequestInit) => {
    if (path.endsWith("/registrations") && init?.method === "POST") return outcome();
    return Promise.resolve({ registration: null });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  apiMock.mockReset();
  useAppStore.setState({ isAuthenticated: true, currentUser: attendee, registrations: [] });
});
afterEach(() => vi.useRealTimers());

describe("EVENT-REG-01-A/B/C: register button only while open (AC1)", () => {
  // 01-A: "I can see the registration button only if the registration period is open"
  it("01-A open: Register button is shown", () => {
    renderSection();
    expect(registerButton()).toBeInTheDocument();
  });
  // 01-B: before opening there is no button and the SGT opening time is shown.
  it("01-B not yet open: no button, shows the opening time in SGT", () => {
    renderSection({ ...baseEvent, registrationOpensAt: iso(2 * HOUR) });
    expect(registerButton()).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `Registration opens on ${formatSgt(iso(2 * HOUR))}` })).toBeInTheDocument();
  });
  // 01-C[A]: after the close time there is no button, only status text.
  it("01-C[A] closed by time: no button, closed text", () => {
    renderSection({ ...baseEvent, registrationOpensAt: iso(-48 * HOUR), registrationClosesAt: iso(-HOUR) });
    expect(registerButton()).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration closed" })).toBeInTheDocument();
  });
  // 01-C[B]: manual close needs a schema field that does not exist (D17).
  it.todo("01-C[B] Blocked: no manual_close_at field exists (D17)");
  // 01-BND-1[D] / 02-BND-1: at the exact closing instant the button is gone.
  it("BND-1[D] exactly at close: no button", () => {
    renderSection({ ...baseEvent, registrationClosesAt: NOW.toISOString() });
    expect(registerButton()).not.toBeInTheDocument();
  });
  // 05-C (capacity, locked hard limit): a full event renders no button.
  it("full event: no button", () => {
    renderSection({ ...baseEvent, availableRegistrationSpots: 0 });
    expect(registerButton()).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "This event is fully booked." })).toBeInTheDocument();
  });
});

describe("SPM-61 registration heading states (design)", () => {
  // NOW is 2030-06-01 08:00 SGT. Closing times are 23:59 SGT on the target day.
  const closesOn = (isoDay: string) => `${isoDay}T15:59:00.000Z`;
  const withCloses = (closes: string, extra: Partial<EventRecord> = {}) => ({
    ...baseEvent, registrationOpensAt: iso(-HOUR), registrationClosesAt: closes, availableRegistrationSpots: 45, ...extra,
  });

  // State 1: open, closes in more than 1 day: X-days heading, Available and Closes, Register shown.
  it("State 1: open, closes in more than 1 day", () => {
    renderSection(withCloses(closesOn("2030-06-04")));
    expect(screen.getByRole("heading", { name: "Registration closes in 3 days" })).toBeInTheDocument();
    expect(within(screen.getByText("Available").parentElement!).getByText("45 spots")).toBeInTheDocument();
    expect(within(screen.getByText("Opens").parentElement!).getByText("1 Jun 2030, 07:00")).toBeInTheDocument();
    expect(within(screen.getByText("Closes").parentElement!).getByText("4 Jun 2030, 23:59")).toBeInTheDocument();
    expect(registerButton()).toBeInTheDocument();
  });
  // Singular: "1 day", never "1 days".
  it("uses the singular for 1 day", () => {
    renderSection(withCloses(closesOn("2030-06-02")));
    expect(screen.getByRole("heading", { name: "Registration closes in 1 day" })).toBeInTheDocument();
    expect(within(screen.getByText("Opens").parentElement!).getByText("1 Jun 2030, 07:00")).toBeInTheDocument();
  });
  // State 2: open, closing day (SGT): a 23:59 close never reads "1 day" on the closing day.
  it("State 2: open, closes today (same SGT calendar day)", () => {
    renderSection(withCloses(closesOn("2030-06-01")));
    expect(screen.getByRole("heading", { name: "Registration closes today" })).toBeInTheDocument();
    expect(within(screen.getByText("Opens").parentElement!).getByText("1 Jun 2030, 07:00")).toBeInTheDocument();
    expect(within(screen.getByText("Closes").parentElement!).getByText("1 Jun 2030, 23:59")).toBeInTheDocument();
    expect(registerButton()).toBeInTheDocument();
  });
  // State 3: closed: "Closed on" replaces "Closes", Available is dropped, no button.
  it("State 3: closed shows Closed on, drops Available, hides Register", () => {
    renderSection(withCloses(iso(-HOUR), { registrationOpensAt: iso(-48 * HOUR) }));
    expect(screen.getByRole("heading", { name: "Registration closed" })).toBeInTheDocument();
    expect(screen.getByText("Closed on")).toBeInTheDocument();
    expect(screen.queryByText("Closes")).not.toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(registerButton()).not.toBeInTheDocument();
  });
  // Not yet open: MSG-02 heading in SGT, Register hidden.
  it("not yet open shows the opening time and hides Register", () => {
    renderSection(withCloses(closesOn("2030-06-10"), { registrationOpensAt: "2030-06-03T01:00:00.000Z" }));
    expect(screen.getByRole("heading", { name: "Registration opens on 3 Jun 2030, 09:00 SGT" })).toBeInTheDocument();
    expect(registerButton()).not.toBeInTheDocument();
  });
  // Singular spot count.
  it("uses the singular for 1 spot", () => {
    renderSection(withCloses(closesOn("2030-06-04"), { availableRegistrationSpots: 1 }));
    expect(screen.getByText("1 spot")).toBeInTheDocument();
    expect(within(screen.getByText("Opens").parentElement!).getByText("1 Jun 2030, 07:00")).toBeInTheDocument();
  });
});

describe("EVENT-REG-03-A / EVENT-REG-04-A: submit and confirmation (AC3, AC4)", () => {
  // 03-A: fields are prefilled from the profile, submit posts the details.
  // 04-A: "I receive a confirmation message upon successful registration" with
  // the event name and registration ID, staying until dismissed.
  it("submits details and shows MSG-06 with the registration ID until dismissed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockPost(() => Promise.resolve({ registration: created }));
    renderSection();

    await user.click(registerButton()!);
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Alice Tan");
    expect(screen.getByLabelText(/Email/)).toHaveValue("alice@example.com");
    await user.type(screen.getByLabelText("Contact number"), "9123 4567");
    await user.type(screen.getByLabelText("Special requirements"), "Vegetarian meal");
    await user.click(screen.getByRole("button", { name: "Submit registration" }));

    const post = apiMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/events/event-1/registrations");
    expect(JSON.parse(post[1]!.body as string)).toEqual({
      fullName: "Alice Tan", email: "alice@example.com", contactNumber: "9123 4567", specialRequirements: "Vegetarian meal",
    });
    const confirmation = await screen.findByText("Registration successful. You are registered for Innovation Expo.");
    expect(confirmation.closest("[role=status]")).toHaveTextContent("REG-9001");
    // No auto-dismiss: still there after 10 seconds.
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByText(/Registration successful/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Registration successful/)).not.toBeInTheDocument();
  });

  // Submit is disabled and busy while the request is in flight; a double click posts once.
  it("disables submit while submitting and posts only once", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolve!: (value: unknown) => void;
    mockPost(() => new Promise((r) => { resolve = r; }));
    renderSection();
    await user.click(registerButton()!);
    const submit = screen.getByRole("button", { name: "Submit registration" });
    await user.dblClick(submit);
    expect(screen.getByRole("button", { name: /Submitting/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Submitting/ })).toHaveAttribute("aria-busy", "true");
    expect(apiMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await act(async () => resolve({ registration: created }));
  });
});

describe("EVENT-REG-03-B / 03-C: form validation (AC3)", () => {
  // Invalid input shows field errors and never calls the server.
  it("blank name and bad email show errors and send nothing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSection();
    await user.click(registerButton()!);
    await user.clear(screen.getByLabelText(/Full name/));
    await user.clear(screen.getByLabelText(/Email/));
    await user.type(screen.getByLabelText(/Email/), "nope");
    await user.click(screen.getByRole("button", { name: "Submit registration" }));

    expect(await screen.findByText("Full name is required.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute("aria-invalid", "true");
    expect(apiMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });
  // Server field errors (400) are shown and typed values are kept.
  it("shows server validation errors and keeps the typed values", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockPost(() => Promise.reject(new ApiError("Please correct the highlighted fields.", { contactNumber: "Contact number must have 8 to 15 digits." }, "validation_error", 400)));
    renderSection();
    await user.click(registerButton()!);
    await user.type(screen.getByLabelText("Special requirements"), "keep me");
    await user.click(screen.getByRole("button", { name: "Submit registration" }));
    expect(await screen.findByText("Contact number must have 8 to 15 digits.")).toBeInTheDocument();
    expect(screen.getByLabelText("Special requirements")).toHaveValue("keep me");
  });
});

describe("EVENT-REG-02-B: registration closes while the form is open (AC2)", () => {
  // Expected: the form stays mounted with values, a notice appears, and the
  // server's 422 MSG-01 is shown on submit.
  it("keeps the form and values, shows MSG-01 after the 422", async () => {
    // Only Date and the section's re-check interval are faked; Testing Library needs real setTimeout.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: NOW });
    const user = userEvent.setup({ delay: null });
    mockPost(() => Promise.reject(new ApiError("Registration has closed for this event.", undefined, "registration_closed", 422)));
    renderSection({ ...baseEvent, registrationClosesAt: iso(60_000) });
    await user.click(registerButton()!);
    await user.type(screen.getByLabelText("Special requirements"), "Vegetarian meal");

    // The re-check detects the closure while the form is open.
    await act(() => vi.advanceTimersByTimeAsync(70_000));
    expect(screen.getByLabelText("Special requirements")).toHaveValue("Vegetarian meal");
    expect(screen.getAllByText("Registration has closed for this event.").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Submit registration" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("Registration has closed for this event."))).toBe(true);
    expect(screen.getByLabelText("Special requirements")).toHaveValue("Vegetarian meal");
  });
});

describe("EVENT-REG-03-SEC-1: escape on output", () => {
  // Markup in a stored registration is rendered as text, never as HTML.
  it("renders script text literally in the form values", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSection();
    await user.click(registerButton()!);
    const payload = "<img src=x onerror=alert(1)>";
    await user.type(screen.getByLabelText("Special requirements"), payload);
    expect(screen.getByLabelText("Special requirements")).toHaveValue(payload);
    expect(document.querySelector("img")).toBeNull();
  });
  // A registrant name with markup in the confirmation is escaped by React.
  it("escapes markup in the confirmation event name", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockPost(() => Promise.resolve({ registration: created }));
    renderSection({ ...baseEvent, name: "<b>Bold</b> Expo" });
    await user.click(registerButton()!);
    await user.click(screen.getByRole("button", { name: "Submit registration" }));
    expect(await screen.findByText("Registration successful. You are registered for <b>Bold</b> Expo.")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });
});

describe("EVENT-REG-05-A / 05-C: already registered (AC5)", () => {
  // 05-A: "I cannot register twice for the same event": no button when registered.
  it("05-A registered attendee sees status and ID, no Register button", () => {
    renderSection(baseEvent, created);
    expect(registerButton()).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You're registered" })).toBeInTheDocument();
    expect(screen.getByText("REG-9001")).toBeInTheDocument();
    expect(within(screen.getByText("Registered on").parentElement!).getByText("1 Jun 2030, 08:00")).toBeInTheDocument();
  });
  // 05-A via the server: a 409 shows MSG-05 and syncs to the registered state.
  it("a 409 shows MSG-05 and reloads the registration", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.reject(new ApiError("You are already registered for this event.", undefined, "already_registered", 409));
      return Promise.resolve({ registration: created });
    });
    renderSection();
    await user.click(registerButton()!);
    await user.click(screen.getByRole("button", { name: "Submit registration" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => within(a).queryByText("You are already registered for this event.") !== null || a.textContent?.includes("You are already registered"))).toBe(true);
    expect(apiMock).toHaveBeenCalledWith("/events/event-1/registrations/me");
  });
  // 05-C: a withdrawn registration does not block registering again.
  it("05-C withdrawn registration still shows the Register button", () => {
    renderSection(baseEvent, { ...created, status: "withdrawn" });
    expect(registerButton()).toBeInTheDocument();
  });
});

describe("SPM-62 AC2/AC3: registered attendee sees their registration details", () => {
  // AC3: "I can see my registration details" - full name, email, contact
  // number and special requirements captured at registration, alongside the
  // existing Registration ID and Registered on.
  const full: Registration = {
    ...created,
    fullName: "Alice Tan",
    email: "alice@example.com",
    contactNumber: "+65 9123 4567",
    specialRequirements: "Wheelchair access",
  };

  it("AC3 shows full name, email, contact number and special requirements", () => {
    renderSection(baseEvent, full);
    expect(within(screen.getByText("Full name").parentElement!).getByText("Alice Tan")).toBeInTheDocument();
    expect(within(screen.getByText("Email").parentElement!).getByText("alice@example.com")).toBeInTheDocument();
    expect(within(screen.getByText("Contact number").parentElement!).getByText("+65 9123 4567")).toBeInTheDocument();
    expect(within(screen.getByText("Special requirements").parentElement!).getByText("Wheelchair access")).toBeInTheDocument();
  });

  // Optional fields captured at registration (contact number, special
  // requirements) must never render as blank rows when absent.
  it("AC3 omits contact number and special requirements rows when absent", () => {
    renderSection(baseEvent, created);
    expect(screen.queryByText("Contact number")).not.toBeInTheDocument();
    expect(screen.queryByText("Special requirements")).not.toBeInTheDocument();
  });

  // Older records may lack fullName (SPM-61 comment on the Registration
  // type); the attendee's stored name is still shown via the fallback.
  it("AC3 falls back to attendeeName when fullName is absent on older records", () => {
    renderSection(baseEvent, created);
    expect(within(screen.getByText("Full name").parentElement!).getByText("Alice Tan")).toBeInTheDocument();
  });
});

describe("SPM-62 AC4: registration details stay visible before and after the event", () => {
  // AC4: "I can view my registration at any time before or after the
  // event" - the registered branch is checked before any event-timing
  // branch, so a Completed or Cancelled event never hides the registration.
  const full: Registration = {
    ...created,
    fullName: "Alice Tan",
    email: "alice@example.com",
  };

  it("shows full registration details once the event has completed", () => {
    renderSection({ ...baseEvent, status: "completed" }, full);
    expect(screen.getByRole("heading", { name: "You're registered" })).toBeInTheDocument();
    expect(within(screen.getByText("Full name").parentElement!).getByText("Alice Tan")).toBeInTheDocument();
  });

  it("shows full registration details for a cancelled event", () => {
    renderSection({ ...baseEvent, status: "cancelled" }, full);
    expect(screen.getByRole("heading", { name: "You're registered" })).toBeInTheDocument();
    expect(within(screen.getByText("Email").parentElement!).getByText("alice@example.com")).toBeInTheDocument();
  });
});

describe("D14: failed POST is not retried automatically", () => {
  // A network failure keeps the values, shows MSG-04, and offers a manual Retry.
  it("shows MSG-04 and a manual Retry that resubmits", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let calls = 0;
    mockPost(() => (++calls === 1 ? Promise.reject(new ApiError("Unable to reach the server. Check your connection and try again.")) : Promise.resolve({ registration: created })));
    renderSection();
    await user.click(registerButton()!);
    await user.type(screen.getByLabelText("Special requirements"), "keep");
    await user.click(screen.getByRole("button", { name: "Submit registration" }));
    expect(await screen.findByText("We couldn't complete your registration. Please try again.")).toBeInTheDocument();
    expect(calls).toBe(1);
    expect(screen.getByLabelText("Special requirements")).toHaveValue("keep");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/Registration successful/)).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

/*
 * Story: SPM-120 Withdraw Registration (attendee), registration-details half.
 * ACs: AC1 (withdraw option), AC4 (not after the event date), AC5 (the blocked message),
 *      AC6 (already-withdrawn conflict). Test cases: WITHDRAW-EVENT-REG-01-A, 01-B, 04-A,
 *      05-A, and an added 06-B frontend case. The 01-B, 04-A and 05-A cases share one
 *      past-event fixture (document defect F5); each asserts its own focus.
 * Suite clock T0 = 2026-10-04 12:00 SGT. "Confirmed" in the cases is the repo's "Registered".
 * The Withdraw control is not rendered for a past event (D11); there is no availability flag.
 */
describe("SPM-120 registration details: the withdraw option and the event-started rule", () => {
  const section = () => screen.getByRole("region", { name: "Withdrawal" });
  const withdraw = () => screen.queryByRole("button", { name: "Withdraw" });

  /** Renders an owned, registered registration with the store holding the same record. */
  function renderOwned(event: EventRecord, registration: Registration = buildRegistration({ eventId: event.id })) {
    useAppStore.setState({ isAuthenticated: true, currentUser: ATT_01, registrations: [registration] });
    return render(<RegistrationSection event={event} currentUser={ATT_01} registration={registration} />);
  }

  beforeEach(() => vi.setSystemTime(T0));

  // Oracle (SPEC 01-A): REG-9001 on future EVT-101 shows an enabled button named "Withdraw" and no unavailable text.
  // Not automated: styling prominence (visual). No availability flag exists (D11).
  // Mutants killed: button absent or disabled for a future registered event; wrong label.
  it("WITHDRAW-EVENT-REG-01-A: a future registered event offers an enabled Withdraw button", () => {
    renderOwned(buildEvent());

    expect(within(section()).getByRole("button", { name: "Withdraw" })).toBeEnabled();
    expect(screen.queryByText("Event has already occurred")).not.toBeInTheDocument();
  });

  // Oracle (SPEC 01-B + D6): REG-9002 on started EVT-104 has no actionable control and shows the AC5 text.
  // The "Event has occurred" badge bullet was removed from the case (no such badge in this app).
  // Mutants killed: control active for a past event.
  it("WITHDRAW-EVENT-REG-01-B: a started event has no Withdraw control and no dialog", () => {
    renderOwned(buildPastEvent(), buildRegistration({ id: "REG-9002", eventId: "EVT-104" }));

    expect(screen.queryByRole("button", { name: /withdraw/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(section()).getByText("Event has already occurred")).toBeInTheDocument();
  });

  // Oracle (SPEC 04-A + D11): nothing can start a withdrawal for REG-9002; no request is made.
  // Mutants killed: past-event control opens the prompt.
  it("WITHDRAW-EVENT-REG-04-A: nothing can start a withdrawal for a started event", () => {
    renderOwned(buildPastEvent(), buildRegistration({ id: "REG-9002", eventId: "EVT-104" }));

    expect(withdraw()).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Oracle (DERIVED from AC4/[A7]): the cut-off is the START, not the end. An event that started a minute
  // ago and has not ended is already blocked.
  // Mutants killed: boundary read from the event end instead of its start.
  it("WITHDRAW-EVENT-REG-04-A (boundary): an in-progress event is already blocked", () => {
    renderOwned(buildEvent({ startDateTime: new Date(T0.getTime() - 60_000).toISOString(), endDateTime: new Date(T0.getTime() + 3_600_000).toISOString() }));

    expect(withdraw()).not.toBeInTheDocument();
    expect(within(section()).getByText("Event has already occurred")).toBeInTheDocument();
  });

  // Oracle (SPEC 05-A A + AC5): exactly "Event has already occurred", visible, in the withdrawal area.
  // Mutants killed: wording differs from AC5; generic text.
  it("WITHDRAW-EVENT-REG-05-A (A): the AC5 message is shown, exactly, for a started event", () => {
    renderOwned(buildPastEvent(), buildRegistration({ id: "REG-9002", eventId: "EVT-104" }));

    const message = within(section()).getByText("Event has already occurred");
    expect(message.textContent).toBe("Event has already occurred");
    expect(message).toBeVisible();
  });

  // Oracle (Added 05-A B): the page loaded before the start; the server answers 422 on confirm.
  // The dialog closes, the AC5 text appears, Withdraw disappears, the status stays Registered.
  // Mutants killed: a 422 swallowed or shown as a generic error.
  it("WITHDRAW-EVENT-REG-05-A (B, added): a 422 on confirm swaps Withdraw for the AC5 message", async () => {
    // Arrange
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    apiMock.mockRejectedValue(new ApiError("Event has already occurred", undefined, "event_already_occurred", 422));
    renderOwned(buildEvent());
    await u.click(withdraw()!);

    // Act
    await u.click(screen.getByRole("button", { name: "Confirm Withdrawal" }));

    // Assert
    expect(await within(section()).findByText("Event has already occurred")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(withdraw()).not.toBeInTheDocument();
    expect(screen.getByText("Registered")).toBeInTheDocument();
  });

  // Oracle (Added 06-B frontend): "already withdrawn" (e.g. done in another tab) closes the dialog and
  // reloads the registration, so the page shows the withdrawn status instead of a stale Registered.
  // Mutants killed: stale status kept after an already-withdrawn conflict.
  it("WITHDRAW-EVENT-REG-06-B (frontend, added): an already-withdrawn conflict reloads the registration", async () => {
    // Arrange: the confirm is refused, and the reload returns the withdrawn registration.
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const withdrawn = buildRegistration({ status: "withdrawn", withdrawnAt: T0.toISOString() });
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/withdraw")
        ? Promise.reject(new ApiError("This registration has already been withdrawn.", undefined, "registration_already_withdrawn", 422))
        : Promise.resolve({ registration: withdrawn }),
    );
    renderOwned(buildEvent());
    await u.click(withdraw()!);

    // Act
    await u.click(screen.getByRole("button", { name: "Confirm Withdrawal" }));

    // Assert: the section follows the reloaded store record
    expect(await screen.findByText("Withdrawn")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
