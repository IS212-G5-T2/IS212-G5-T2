/*
 * Story: registration status cards (SPM-120 withdraw, SPM-138 leave waitlist). ConfirmDialog, both variants.
 * Test cases: CDLG-01 (the leave-waitlist copy and warning), CDLG-02 (the loading state while the request runs),
 * CDLG-03 (the inline error and the dialog staying open). The flows through the section are in the withdrawal and
 * waitlist section tests.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

const baseProps = { pending: false, error: "", onConfirm: () => undefined, onCancel: () => undefined };

describe("CDLG-01: the leave-waitlist variant states that the registration is withdrawn too", () => {
  // Kills: CDLG-M1, CDLG-M2
  it("CDLG-01-A-STATE: the copy, the place in line and the two buttons match the spec", () => {
    render(<ConfirmDialog {...baseProps} variant="leave-waitlist" position={3} />);

    const dialog = screen.getByRole("dialog", { name: "Leave the waitlist?" });
    expect(within(dialog).getByText("Leaving the waitlist also withdraws your registration for this event. You'll lose your place in line.")).toBeInTheDocument();
    expect(within(dialog).getByText("Your place is #3 in line. Once you leave, it can't be restored.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Keep my place" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Leave waitlist" })).toBeInTheDocument();
  });

  // Kills: CDLG-M12
  it("CDLG-01-B-STATE: initial focus is on Keep my place", () => {
    render(<ConfirmDialog {...baseProps} variant="leave-waitlist" position={1} />);

    expect(screen.getByRole("button", { name: "Keep my place" })).toHaveFocus();
  });
});

describe("CDLG-02: the danger button shows a loading state while the request runs", () => {
  // Kills: CDLG-M3, CDLG-M4
  it("CDLG-02-A-STATE: while pending both buttons are disabled and the danger button is busy", () => {
    render(<ConfirmDialog {...baseProps} variant="withdraw" pending />);

    const danger = screen.getByRole("button", { name: "Withdraw" });
    expect(danger).toBeDisabled();
    expect(danger).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Keep registration" })).toBeDisabled();
    expect(danger.querySelector("svg.animate-spin")).not.toBeNull();
  });
});

describe("CDLG-03: an error keeps the dialog open with the message and enabled buttons", () => {
  // Kills: CDLG-M5
  it("CDLG-03-A-ERR: the inline error shows in the dialog and both buttons are enabled again", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        variant="leave-waitlist"
        position={2}
        error="Couldn't withdraw your registration. Try again."
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Couldn't withdraw your registration. Try again.");
    expect(screen.getByRole("button", { name: "Leave waitlist" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Keep my place" })).toBeEnabled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
