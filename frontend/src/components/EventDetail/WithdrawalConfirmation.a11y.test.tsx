/*
 * Story: SPM-120 Withdraw Registration (attendee), dialog accessibility.
 * AC: AC2. Test case: WITHDRAW-EVENT-REG-02-B, Subtest C subset that jsdom can check.
 *
 * Automated here: dialog semantics, initial focus, focus trap, Escape, button
 * names and an axe scan with the colour-contrast rule disabled (jsdom cannot
 * compute colour). NOT automated (needs a real browser or assistive technology,
 * recorded in docs/specs/SPM-120-test-results.md): Subtest A (375 px layout and
 * truncation), Subtest B (200% zoom, 44x44 px targets, 4.5:1 contrast) and
 * screen-reader announcements.
 * Decision D10 (B): initial focus is on Cancel, the least destructive action,
 * so a held or repeated Enter from the Withdraw button cannot confirm at once.
 * Only Date is faked; timers stay real because axe uses them.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { RegistrationSection } from "./RegistrationSection";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import { ATT_01, T0, buildEvent, buildRegistration } from "./withdrawal.fixtures";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const withdrawButton = () => screen.getByRole("button", { name: "Withdraw" });
const cancelButton = () => screen.getByRole("button", { name: "Cancel" });
const confirmButton = () => screen.getByRole("button", { name: "Confirm Withdrawal" });

/** Renders REG-9001 on EVT-101 and opens the confirmation dialog. */
async function openDialog() {
  const registration = buildRegistration();
  useAppStore.setState({ isAuthenticated: true, currentUser: ATT_01, registrations: [registration] });
  const u = userEvent.setup();
  const view = render(<RegistrationSection event={buildEvent()} currentUser={ATT_01} registration={registration} />);
  await u.click(withdrawButton());
  return { u, view };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
  apiMock.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("SPM-120 AC2: the confirmation dialog is accessible (jsdom subset of 02-B Subtest C)", () => {
  // Oracle (SPEC 02-B C): role dialog, aria-modal, accessible name = title; buttons expose role button + names.
  // Mutants killed: dialog unlabeled; no modal semantics; button without a name.
  it("WITHDRAW-EVENT-REG-02-B: dialog semantics and button names", async () => {
    await openDialog();

    const dialog = screen.getByRole("dialog", { name: "Withdraw from Tech Talk: Cloud 101?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(confirmButton().tagName).toBe("BUTTON");
    expect(cancelButton().tagName).toBe("BUTTON");
  });

  // Oracle (D10 B, amends 02-B C): on open, focus is on Cancel.
  // Mutant killed: focus not moved into the dialog (stays on the Withdraw button).
  it("WITHDRAW-EVENT-REG-02-B: initial focus is on Cancel", async () => {
    await openDialog();

    expect(cancelButton()).toHaveFocus();
  });

  // Oracle (D10 B): Tab cycles Cancel -> Confirm -> Cancel; Shift+Tab reverses; focus never leaves the dialog.
  // Mutants killed: M12 focus trap removed (focus escapes to the page behind).
  it("WITHDRAW-EVENT-REG-02-B: Tab and Shift+Tab are trapped inside the dialog", async () => {
    // Arrange
    const { u } = await openDialog();
    const dialog = screen.getByRole("dialog");

    // Act + Assert: forward cycle
    await u.tab();
    expect(confirmButton()).toHaveFocus();
    await u.tab();
    expect(cancelButton()).toHaveFocus();
    // Act + Assert: backward cycle
    await u.tab({ shift: true });
    expect(confirmButton()).toHaveFocus();
    await u.tab({ shift: true });
    expect(cancelButton()).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  // Oracle (SPEC 02-B C, Escape = Cancel): closes with zero requests and focus returns to "Withdraw".
  // Mutants killed: Escape ignored; Escape confirms; focus lost after close.
  it("WITHDRAW-EVENT-REG-02-B: Escape closes the dialog, sends nothing and restores focus", async () => {
    const { u } = await openDialog();

    await u.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
    expect(withdrawButton()).toHaveFocus();
  });

  // Oracle (SPEC 02-B C): axe finds no violations in the open dialog (colour-contrast disabled for jsdom).
  // Mutants killed: missing label, missing roles or names that axe can detect.
  it("WITHDRAW-EVENT-REG-02-B: axe reports no violations in the open dialog", async () => {
    await openDialog();

    const results = await axe(document.body, { rules: { "color-contrast": { enabled: false } } });

    // Compared to an empty list so a failure names the violated rules.
    expect(results.violations).toEqual([]);
  });
});
