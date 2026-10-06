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
  // Kills: dialog unlabeled; no modal semantics; button without a name.
  it("WITHDRAW-EVENT-REG-02-B: dialog semantics and button names", async () => {
    await openDialog();

    const dialog = screen.getByRole("dialog", { name: "Withdraw from Tech Talk: Cloud 101?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(confirmButton().tagName).toBe("BUTTON");
    expect(cancelButton().tagName).toBe("BUTTON");
  });

  // Oracle (D10 B, amends 02-B C): on open, focus is on Cancel.
  // Kills: focus not moved into the dialog (stays on the Withdraw button).
  it("WITHDRAW-EVENT-REG-02-B: initial focus is on Cancel", async () => {
    await openDialog();

    expect(cancelButton()).toHaveFocus();
  });

  // Oracle (D10 B): Tab cycles Cancel -> Confirm -> Cancel; Shift+Tab reverses; focus never leaves the dialog.
  // Kills: M12 focus trap removed (focus escapes to the page behind).
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

  // Oracle (D10 B + the trap's own rule, "pull focus back in if it ever left the dialog"): with focus on the page
  // behind, Tab lands on the first dialog button (Cancel) and Shift+Tab on the last (Confirm).
  // Starting points are chosen so the browser's own tab order would give a different answer: from <body> Tab would
  // reach the Withdraw button, and from Withdraw Shift+Tab would wrap to the extra button after the dialog.
  // Kills: the "focus left the dialog" branch removed (focus stays on the page behind the modal).
  it("WITHDRAW-EVENT-REG-02-B: Tab and Shift+Tab from outside the dialog pull focus back in", async () => {
    // Arrange: an extra tabbable element after the dialog, and focus on <body>.
    const { u } = await openDialog();
    const outsider = document.body.appendChild(document.createElement("button"));
    try {
      (document.activeElement as HTMLElement).blur();

      // Act + Assert: forward
      await u.tab();
      expect(cancelButton()).toHaveFocus();

      // Act + Assert: backward, starting from the page's Withdraw button
      withdrawButton().focus();
      await u.tab({ shift: true });
      expect(confirmButton()).toHaveFocus();
    } finally {
      outsider.remove();
    }
  });

  // Oracle (the component's own contract: "while the request is pending both buttons are disabled" and focus must
  // not escape to the page): with nothing focusable inside, focus stays on the dialog for Tab and Shift+Tab.
  // Kills: the "no focusable buttons" branch removed (Tab leaves the dialog while a withdrawal is pending).
  it("WITHDRAW-EVENT-REG-02-B: while the withdrawal is pending, Tab and Shift+Tab keep focus on the dialog", async () => {
    // Arrange: the request never answers, so both buttons stay disabled.
    const { u } = await openDialog();
    apiMock.mockImplementation(() => new Promise(() => {}));
    await u.click(confirmButton());
    const dialog = screen.getByRole("dialog");
    expect(confirmButton()).toBeDisabled();
    expect(cancelButton()).toBeDisabled();
    expect(dialog).toHaveFocus();

    // Act + Assert
    await u.tab();
    expect(dialog).toHaveFocus();
    await u.tab({ shift: true });
    expect(dialog).toHaveFocus();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  // Oracle (the component's contract: "while the request is pending both buttons are disabled and Escape does nothing"):
  // the withdrawal is in flight, so Escape must not close the dialog or start a second request.
  // Kills: M39 Escape cancelling the dialog while the withdrawal is still in flight.
  it("WITHDRAW-EVENT-REG-02-B: Escape does nothing while the withdrawal is pending", async () => {
    // Arrange: the request never answers.
    const { u } = await openDialog();
    apiMock.mockImplementation(() => new Promise(() => {}));
    await u.click(confirmButton());

    // Act
    await u.keyboard("{Escape}");

    // Assert
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  // Oracle (SPEC 02-B C, Escape = Cancel): closes with zero requests and focus returns to "Withdraw".
  // Kills: Escape ignored; Escape confirms; focus lost after close.
  it("WITHDRAW-EVENT-REG-02-B: Escape closes the dialog, sends nothing and restores focus", async () => {
    const { u } = await openDialog();

    await u.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
    expect(withdrawButton()).toHaveFocus();
  });

  // Oracle (SPEC 02-B C): axe finds no violations in the open dialog (colour-contrast disabled for jsdom).
  // Kills: missing label, missing roles or names that axe can detect.
  it("WITHDRAW-EVENT-REG-02-B: axe reports no violations in the open dialog", async () => {
    await openDialog();

    const results = await axe(document.body, { rules: { "color-contrast": { enabled: false } } });

    // Compared to an empty list so a failure names the violated rules.
    expect(results.violations).toEqual([]);
  });
});

/*
 * SPM-120 assumption index. Decision IDs (A*, D*, F*) are defined in docs/specs/SPM-120-test-results.md,
 * "Decision and assumption IDs". assumption -> tests that rely on it:
 *  D10  initial focus is on Cancel (amends the Confluence case) -> initial focus, Tab cycle
 *  TRAP the dialog's documented focus rule (pull focus back in; keep it on the dialog while both buttons are disabled), DERIVED from the component's contract -> outside-focus and pending-focus tests
 */
