import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CancelEventDialog } from "@/features/events/pages/detail/cancel/CancelEventDialog";
import { api } from "@/utils/api";

/*
 * SPM-155 D13a (frontend counterpart): the Accept control reuses CancelEventDialog (F7) but must confirm through the
 * request's decision route, not through POST status-change. The dialog therefore takes an optional `confirm` action;
 * without it the dialog behaves exactly as in SPM-136 (CancelEventDialog.test.tsx). Mutant IDs in each "Kills:" line
 * are defined in frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWith(confirm: () => Promise<{ message: string }>) {
  const props = { eventId: "evt-1", eventName: "Annual Gala Dinner", onClose: vi.fn(), onCancelled: vi.fn(), confirm };
  render(<CancelEventDialog {...props} />);
  return props;
}

describe("SPM-155 CancelEventDialog with a confirm action (AC4)", () => {
  // Kills: FM9
  /** CANCEL-REQUEST-04-SUP-DIALOG (DERIVED, F7): Confirm cancellation runs the supplied action and never calls POST status-change. */
  it("CANCEL-REQUEST-04-SUP-DIALOG: confirming runs the supplied action, shows its message and reports it, with no status-change call", async () => {
    // Arrange: the decision route's MSG-CR-04 text
    const confirm = vi.fn().mockResolvedValue({ message: "Cancellation request accepted. Annual Gala Dinner is cancelled." });
    const props = renderWith(confirm);

    // Act
    await userEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    // Assert: the action ran once; its message is shown and passed on; the SPM-136 route was not used
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Cancellation request accepted. Annual Gala Dinner is cancelled.");
    expect(props.onCancelled).toHaveBeenCalledWith("Cancellation request accepted. Annual Gala Dinner is cancelled.");
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Kills: FM52, FM9
  /** CANCEL-REQUEST-04-C (UI): a failing action shows the error and keeps the dialog open for a retry. */
  it("CANCEL-REQUEST-04-C: a failing action shows its message in an alert and offers the confirm button again", async () => {
    // Arrange
    const confirm = vi.fn().mockRejectedValue(new Error("The service is temporarily unavailable. Please try again."));
    const props = renderWith(confirm);

    // Act
    await userEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("The service is temporarily unavailable. Please try again.");
    expect(props.onCancelled).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeEnabled();
  });

  // Kills: FM53
  /** CANCEL-REQUEST-03-A (F7): Keep event closes with no action. */
  it("CANCEL-REQUEST-03-A: Keep event closes the dialog without running the action", async () => {
    // Arrange
    const confirm = vi.fn();
    const props = renderWith(confirm);

    // Act
    await userEvent.click(screen.getByRole("button", { name: "Keep event" }));

    // Assert
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });
});
