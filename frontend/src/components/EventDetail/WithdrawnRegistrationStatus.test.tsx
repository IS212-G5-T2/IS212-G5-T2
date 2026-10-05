/*
 * Withdrawn registration card redesign (SPM-120 follow-up: timeline + action
 * footer, Option A). Test cases use the WITHDRAW-EVENT-REG-CARD-0X convention
 * requested for this UI task, distinct from the Confluence-sourced
 * WITHDRAW-EVENT-REG-0X-Y ids already used elsewhere in this suite.
 *
 * This component is pure and prop-driven (no store, no network), so these are
 * plain component tests. Suite clock T0 = 2026-10-04 12:00 SGT (shared fixture).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WithdrawnRegistrationStatus } from "./WithdrawnRegistrationStatus";
import { HOUR, T0, buildEvent, buildRegistration, iso, timelineEntry } from "./withdrawal.fixtures";

const noop = () => {};

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: T0 }));
afterEach(() => vi.useRealTimers());

describe("WITHDRAW-EVENT-REG-CARD-01: badge, timeline and the Register again button", () => {
  // Oracle (task spec): the badge, both timeline entries with correct absolute timestamps,
  // and the Register again button all render for an open, spots-available event.
  // Mutants killed: badge text/icon missing; a timeline entry dropped; the two timestamps swapped; button missing.
  it("renders the withdrawn badge, both timeline entries and an enabled Register again button", () => {
    const registration = buildRegistration({ registeredAt: iso(-24 * HOUR), withdrawnAt: T0.toISOString() });
    render(
      <WithdrawnRegistrationStatus event={buildEvent()} registration={registration} now={T0} onRegisterAgain={noop} />,
    );

    expect(screen.getByText("Registration withdrawn")).toBeInTheDocument();
    // Each timestamp is asserted inside its own entry, so swapped timestamps fail.
    expect(timelineEntry("Registered").getByText("3 Oct 2026, 12:00")).toBeInTheDocument();
    expect(timelineEntry("Withdrawn").getByText("4 Oct 2026, 12:00")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Register again" })).toBeEnabled();
  });
});

describe("WITHDRAW-EVENT-REG-CARD-02: the old layout is gone", () => {
  // Oracle (task spec): the old relative "Withdrawn today at ..." line and the old plain
  // "Register" button must not be rendered anywhere in the new card.
  // Mutants killed: the old relative-time line left in; the plain Register label kept.
  it("does not render the old relative timestamp line or a plain Register button", () => {
    const registration = buildRegistration({ withdrawnAt: T0.toISOString() });
    render(
      <WithdrawnRegistrationStatus event={buildEvent()} registration={registration} now={T0} onRegisterAgain={noop} />,
    );

    expect(screen.queryByText(/Withdrawn today at/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Withdrawn on \d/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register again" })).toBeInTheDocument();
  });
});

describe("WITHDRAW-EVENT-REG-CARD-03: the detail disclosure is collapsed by default", () => {
  // Oracle (task spec): collapsed by default, keyboard-operable, expands to show exactly
  // Registration ID, Full name, Email, Contact number.
  // Mutants killed: expanded by default; details missing a field; not keyboard operable.
  it("is collapsed by default and shows ID, name, email and contact number once opened", async () => {
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const registration = buildRegistration({
      id: "REG-9001",
      fullName: "Alice Tan",
      email: "alice@example.com",
      contactNumber: "+65 9123 4567",
      withdrawnAt: T0.toISOString(),
    });
    render(
      <WithdrawnRegistrationStatus event={buildEvent()} registration={registration} now={T0} onRegisterAgain={noop} />,
    );

    const summary = screen.getByText("View previous registration details").closest("summary")!;
    // Collapsed by default: jsdom keeps <details> content in the tree, but jest-dom's
    // toBeVisible knows a closed <details> hides everything except its <summary>.
    expect(screen.getByText("REG-9001")).not.toBeVisible();

    // <summary> is natively focusable and activatable; a real browser also toggles it on
    // Enter/Space (native HTML behaviour jsdom does not simulate, so clicking proves
    // activation here and keyboard focus is checked separately).
    summary.focus();
    expect(summary).toHaveFocus();
    await u.click(summary);

    expect(within(screen.getByText("Registration ID").parentElement!).getByText("REG-9001")).toBeVisible();
    expect(within(screen.getByText("Full name").parentElement!).getByText("Alice Tan")).toBeVisible();
    expect(within(screen.getByText("Email").parentElement!).getByText("alice@example.com")).toBeVisible();
    expect(within(screen.getByText("Contact number").parentElement!).getByText("+65 9123 4567")).toBeVisible();
  });
});

describe("WITHDRAW-EVENT-REG-CARD-04: open with spots available", () => {
  // Oracle (task spec state matrix, row 1): "Changed your mind?" + availability line, button enabled,
  // one click calls the handler once.
  // Mutants killed: button disabled when it should be enabled; handler called more than once.
  it("shows the availability footer and calls the handler once per click", async () => {
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onRegisterAgain = vi.fn();
    const event = buildEvent({ availableRegistrationSpots: 45, registrationClosesAt: iso(9 * 24 * HOUR) });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={onRegisterAgain}
      />,
    );

    expect(screen.getByText("Changed your mind?")).toBeInTheDocument();
    expect(screen.getByText("45 spots left · Closes 13 Oct 2026, 12:00 (9 days)")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Register again" });
    expect(button).toBeEnabled();

    await u.click(button);
    expect(onRegisterAgain).toHaveBeenCalledTimes(1);
  });

  // Oracle (DERIVED, calendar-day rule shared with the SPM-61 heading): "today" on the closing day, "1 day" the next
  // SGT day even when only minutes apart. Clock T0 is 4 Oct 12:00 SGT.
  // Mutants killed: hours / 24 instead of SGT calendar days; "0 days" instead of "today".
  it.each([
    ["closes later today", "2026-10-04T23:59:00+08:00", "Closes 4 Oct 2026, 23:59 (today)"],
    ["closes just after SGT midnight", "2026-10-05T00:01:00+08:00", "Closes 5 Oct 2026, 00:01 (1 day)"],
  ])("footer day count: %s", (_label, closesAt, expected) => {
    const event = buildEvent({ availableRegistrationSpots: 5, registrationClosesAt: closesAt });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={noop}
      />,
    );
    expect(screen.getByText(`5 spots left \u00b7 ${expected}`)).toBeInTheDocument();
  });

  // Singular "1 spot left", matching the plural rule used elsewhere on this card (SPM-61 D-series).
  it("uses the singular for exactly 1 spot", () => {
    const event = buildEvent({ availableRegistrationSpots: 1, registrationClosesAt: iso(24 * HOUR) });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={noop}
      />,
    );
    expect(screen.getByText(/^1 spot left/)).toBeInTheDocument();
  });
});

describe("WITHDRAW-EVENT-REG-CARD-05: full event", () => {
  // Oracle (task spec state matrix, row 3): with no spots left the footer says "This event is full." and the button is hidden.
  // Mutants killed: button still shown when full; wrong wording.
  it("shows 'This event is full.' and hides the button", () => {
    const event = buildEvent({ availableRegistrationSpots: 0 });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={noop}
      />,
    );
    expect(screen.getByText("This event is full.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register/ })).not.toBeInTheDocument();
  });
});

describe("WITHDRAW-EVENT-REG-CARD-06: not yet open, closed, and event started", () => {
  // Oracle (task spec state matrix, rows 4-6): each state hides the button and shows its own message.
  // Mutants killed: button shown in a blocked state; wrong message for the state.
  it("not yet open: shows the opening time, no button", () => {
    const event = buildEvent({ registrationOpensAt: iso(2 * HOUR), registrationClosesAt: iso(10 * 24 * HOUR) });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={noop}
      />,
    );
    expect(screen.getByText("Registration opens 4 Oct 2026, 14:00.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register/ })).not.toBeInTheDocument();
  });

  it("closed: shows the closed-on time, no button", () => {
    const event = buildEvent({ registrationOpensAt: iso(-48 * HOUR), registrationClosesAt: iso(-HOUR) });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={noop}
      />,
    );
    expect(screen.getByText("Registration closed on 4 Oct 2026, 11:00.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register/ })).not.toBeInTheDocument();
  });

  it("event already started: shows 'Event has already started.', no button, even if the window is open", () => {
    const event = buildEvent({
      startDateTime: iso(-HOUR),
      endDateTime: iso(HOUR),
      registrationOpensAt: iso(-48 * HOUR),
      registrationClosesAt: iso(48 * HOUR),
    });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={noop}
      />,
    );
    expect(screen.getByText("Event has already started.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register/ })).not.toBeInTheDocument();
  });
});

describe("WITHDRAW-EVENT-REG-CARD-07: boundary instants match the initial register rules", () => {
  // Oracle (DERIVED from SPM-61 D6 + SPM-120 hasEventStarted): closing is exclusive (closed AT the
  // instant), the event start is inclusive (started AT the instant) - the same rules
  // registrationState/hasEventStarted already enforce for the initial register action.
  // Mutants killed: boundary off by one in either direction; footer disagrees with registrationState.
  it("exactly at registrationClosesAt: closed, no button", () => {
    const event = buildEvent({ registrationOpensAt: iso(-48 * HOUR), registrationClosesAt: T0.toISOString() });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={noop}
      />,
    );
    expect(screen.getByText(/^Registration closed on/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register/ })).not.toBeInTheDocument();
  });

  it("exactly at the event start instant: started, no button", () => {
    const event = buildEvent({
      startDateTime: T0.toISOString(),
      endDateTime: iso(2 * HOUR),
      registrationOpensAt: iso(-48 * HOUR),
      registrationClosesAt: iso(48 * HOUR),
    });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={noop}
      />,
    );
    expect(screen.getByText("Event has already started.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register/ })).not.toBeInTheDocument();
  });

  it("one second before the event start: not yet started, the open-window footer applies", () => {
    const event = buildEvent({
      startDateTime: new Date(T0.getTime() + 1000).toISOString(),
      endDateTime: iso(2 * HOUR),
      registrationOpensAt: iso(-48 * HOUR),
      registrationClosesAt: iso(48 * HOUR),
      availableRegistrationSpots: 5,
    });
    render(
      <WithdrawnRegistrationStatus
        event={event}
        registration={buildRegistration({ withdrawnAt: T0.toISOString() })}
        now={T0}
        onRegisterAgain={noop}
      />,
    );
    expect(screen.getByText("Changed your mind?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register again" })).toBeEnabled();
  });
});

describe("WITHDRAW-EVENT-REG-CARD-08: timestamps render in Singapore time", () => {
  // Oracle (SPEC, mirrors the SPM-120 06-C convention): an instant whose UTC calendar day differs
  // from its Singapore calendar day must still show the SGT day and time, not the UTC one.
  // Mutants killed: formatting in UTC or the browser's local zone instead of Asia/Singapore
  // (the day AND the hour differ, so either part of the output would catch it).
  it("shows the Singapore date and time even when the UTC day differs", () => {
    // 2026-10-05T01:30:00+08:00 is 2026-10-04T17:30:00Z: the same instant, but a different calendar day in UTC.
    const withdrawnAt = "2026-10-05T01:30:00+08:00";
    const registration = buildRegistration({ registeredAt: iso(-24 * HOUR), withdrawnAt });
    render(
      <WithdrawnRegistrationStatus event={buildEvent()} registration={registration} now={T0} onRegisterAgain={noop} />,
    );

    const withdrawnTime = timelineEntry("Withdrawn").getByText("5 Oct 2026, 01:30");
    expect(withdrawnTime.tagName).toBe("TIME");
    expect(withdrawnTime).toHaveAttribute("datetime", withdrawnAt);
  });
});
