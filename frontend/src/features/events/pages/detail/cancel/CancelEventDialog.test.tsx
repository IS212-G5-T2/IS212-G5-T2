import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CancelEventDialog } from "@/features/events/pages/detail/cancel/CancelEventDialog";
import { ApiError, api } from "@/utils/api";
import { deferred } from "@/test/deferred";

/*
 * SPM-136 Cancel an Event, dialog (CANCEL-EVENT-02-A and 02-B). The HTTP layer is the boundary and is
 * mocked; the dialog and its states are real. Literals are the MSG-CN-01 and MSG-CN-02 catalogue text.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000301";
const EVENT_NAME = "Annual Gala Dinner";
// MSG-CN-01 is split across the heading (the question) and the paragraph (the consequences).
const MSG_CN_01_CONSEQUENCES = "Venue bookings and equipment will be released and attendees notified. This cannot be undone.";

function renderDialog(overrides: Partial<React.ComponentProps<typeof CancelEventDialog>> = {}) {
  const props = {
    eventId: EVENT_ID,
    eventName: EVENT_NAME,
    onClose: vi.fn(),
    onCancelled: vi.fn(),
    ...overrides,
  };
  render(<CancelEventDialog {...props} />);
  return props;
}


/** Renders the dialog between two page controls so a Tab that escapes the modal has somewhere visible to land. */
function renderDialogWithPageControls() {
  const props = {
    eventId: EVENT_ID,
    eventName: EVENT_NAME,
    onClose: vi.fn(),
    onCancelled: vi.fn(),
  };
  render(
    <>
      <button type="button">Page control before</button>
      <CancelEventDialog {...props} />
      <button type="button">Page control after</button>
    </>,
  );
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("CANCEL-EVENT-02-A: the cancelling user confirms in a dialog before anything takes effect", () => {
  // Kills: F13
  it("CANCEL-EVENT-02-A: opens a modal with the MSG-CN-01 text, the two buttons and Keep event focused, and sends nothing", () => {
    // Arrange
    // Act: render the dialog with its default props
    renderDialog();

    // Assert: modal dialog, exact consequence text, initial focus on the safe choice, zero requests
    const dialog = screen.getByRole("dialog", { name: "Cancel Annual Gala Dinner?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText(MSG_CN_01_CONSEQUENCES)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep event" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Kills: F10, F14
  it("CANCEL-EVENT-02-A: confirm sends one cancel request with confirmed true and announces MSG-CN-02", async () => {
    // Arrange
    apiMock.mockResolvedValue({ eventId: EVENT_ID, status: "Cancelled", message: "Annual Gala Dinner has been cancelled." } as never);
    const user = userEvent.setup();
    const props = renderDialog();

    // Act
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    // Assert: the exact request, once; the success line; the parent is told
    await waitFor(() => expect(props.onCancelled).toHaveBeenCalledWith("Annual Gala Dinner has been cancelled."));
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith(`/events/${EVENT_ID}/status-change`, {
      method: "POST",
      body: JSON.stringify({ targetStatus: "Cancelled", confirmed: true }),
    });
    expect(screen.getByRole("status")).toHaveTextContent("Annual Gala Dinner has been cancelled.");
  });

  // Kills: F14
  it("CANCEL-EVENT-02-A: after success the dialog stays open showing MSG-CN-02 with only a Close button, which sends nothing", async () => {
    // Arrange
    apiMock.mockResolvedValue({ eventId: EVENT_ID, status: "Cancelled", message: "Annual Gala Dinner has been cancelled." } as never);
    const user = userEvent.setup();
    const props = renderDialog();

    // Act
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Annual Gala Dinner has been cancelled."));

    // Assert: the dialog is still shown; the cancel button is gone; Close closes without another request
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm cancellation" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  // Kills: F9, F14
  it("CANCEL-EVENT-02-A: while the request is pending the confirm button is disabled and busy, and a second click sends nothing", async () => {
    // Arrange: the server answer is held until the test releases it
    const answer = deferred<unknown>();
    apiMock.mockReturnValue(answer.promise as never);
    const user = userEvent.setup();
    renderDialog();
    const confirm = screen.getByRole("button", { name: "Confirm cancellation" });

    // Act
    await user.click(confirm);
    await user.click(confirm);

    // Assert
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toHaveAttribute("aria-busy", "true");
    expect(apiMock).toHaveBeenCalledTimes(1);
    answer.resolve({ eventId: EVENT_ID, status: "Cancelled", message: "Annual Gala Dinner has been cancelled." });
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });

  // Kills: F36 (the error alert not rendered, so a refused cancel shows nothing)
  it("CANCEL-EVENT-02-A: a refused cancel (409) is shown as an alert and the dialog stays open", async () => {
    // Arrange: the event is no longer cancellable on the server
    apiMock.mockRejectedValue(new ApiError("This event can no longer be cancelled.", undefined, "EVENT_NOT_CANCELLABLE", 409));
    const user = userEvent.setup();
    const props = renderDialog();

    // Act
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("This event can no longer be cancelled.");
    expect(props.onCancelled).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("CANCEL-EVENT-02-A (TR-136-09): a failed cancel can be retried from the same dialog", () => {
  // Regression guard: the retry path already clears the alert; this pins it so a later change cannot leave the error stuck.
  // Kills: F14
  it("TR-136-09: a rejected request shows the alert, the retry succeeds, the alert clears and MSG-CN-02 is shown", async () => {
    // Arrange: the first request fails on the network, the second is accepted
    apiMock
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({ eventId: EVENT_ID, status: "Cancelled", message: "Annual Gala Dinner has been cancelled." } as never);
    const user = userEvent.setup();
    const props = renderDialog();
    const confirm = screen.getByRole("button", { name: "Confirm cancellation" });

    // Act: the first attempt is rejected
    await user.click(confirm);

    // Assert 1: the failure is announced and the dialog remains available for a retry
    expect(await screen.findByRole("alert")).toHaveTextContent("Network request failed");
    expect(props.onCancelled).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeEnabled();

    // Act: the user retries
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    // Assert 2: the alert is gone, the success line is shown, and both attempts were the same request
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Annual Gala Dinner has been cancelled."));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(props.onCancelled).toHaveBeenCalledWith("Annual Gala Dinner has been cancelled.");
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(apiMock.mock.calls[1]).toEqual(apiMock.mock.calls[0]);
  });
});

describe("CANCEL-EVENT-02-B: dismissing the dialog leaves the event untouched", () => {
  // Kills: F8
  it("CANCEL-EVENT-02-B-A: Keep event closes the dialog with no cancel request", async () => {
    // Arrange
    const user = userEvent.setup();
    const props = renderDialog();

    // Act
    await user.click(screen.getByRole("button", { name: "Keep event" }));

    // Assert: closed once, no request
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Kills: F11, F13
  it("CANCEL-EVENT-02-B-B: Escape closes the dialog with no cancel request", async () => {
    // Arrange
    const user = userEvent.setup();
    const props = renderDialog();

    // Act
    await user.keyboard("{Escape}");

    // Assert: closed once, no request
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Kills: F12
  it("CANCEL-EVENT-02-B-C: a click outside the dialog closes it with no cancel request", async () => {
    // Arrange
    const user = userEvent.setup();
    const props = renderDialog();

    // Act
    await user.click(screen.getByTestId("cancel-event-backdrop"));

    // Assert: closed once, no request
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Kills: P2
  it("CANCEL-EVENT-02-B: Tab from the last button returns to Keep event, and Shift+Tab from Keep event goes to the confirm button", async () => {
    // Arrange: focus starts on Keep event
    const user = userEvent.setup();
    renderDialog();
    const keep = screen.getByRole("button", { name: "Keep event" });
    const confirm = screen.getByRole("button", { name: "Confirm cancellation" });

    // Act: Shift+Tab wraps backwards, then Tab from the last button wraps forwards
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    // Assert: Shift+Tab lands on the confirm button
    expect(confirm).toHaveFocus();
    await user.keyboard("{Tab}");
    // Assert: Tab from the last button lands on Keep event
    expect(keep).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Kills: F38 (every key closes the dialog, so the letter key closes it)
  it("CANCEL-EVENT-02-B: a letter key does nothing: no close, no request", async () => {
    // Enter would activate the focused Keep event button (a real click), so a plain letter is the probe.
    // Arrange
    const user = userEvent.setup();
    const props = renderDialog();

    // Act
    await user.keyboard("a");

    // Assert: nothing closes and nothing is sent

    expect(props.onClose).not.toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // Kills: F37 (the fallback text dropped: a bare rejection shows no alert text)
  it("CANCEL-EVENT-02-A: a failure that is not an Error is shown with the fallback text and the dialog stays open", async () => {
    // Arrange: the transport rejects with a bare value
    apiMock.mockRejectedValue("network down");
    const user = userEvent.setup();
    renderDialog();

    // Act: confirm the cancellation
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not cancel the event.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

/*
 * CQ F2 (SPM-136 review): after a successful cancel only the Close button remains, so the Tab trap must be computed
 * from the dialog's currently focusable elements, and focus must leave the modal on a stable element when it closes.
 */
function SuccessfulHarness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">Stable target</button>
      {open && (
        <CancelEventDialog
          eventId={EVENT_ID}
          eventName={EVENT_NAME}
          onClose={() => {
            setOpen(false);
            onOpenChange(false);
          }}
          onCancelled={vi.fn()}
          returnFocus={() => document.querySelector<HTMLElement>("button[data-stable]") ?? undefined}
        />
      )}
    </>
  );
}

describe("CQ F2 edge cases: the trap and the return focus with no enabled control or no stable element", () => {
  // Kills: F14
  it("CANCEL-EVENT-02-D1: CQ F2: Tab while the request is pending does nothing and sends no second request", async () => {
    // Arrange: the request is held, so both buttons are disabled
    const answer = deferred<unknown>();
    apiMock.mockReturnValue(answer.promise as never);
    const user = userEvent.setup();
    const props = renderDialog();
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    // Act
    await user.keyboard("{Tab}");

    // Assert: the dialog stays open and no extra request is sent
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(props.onCancelled).not.toHaveBeenCalled();
    answer.resolve({ eventId: EVENT_ID, status: "Cancelled", message: "Annual Gala Dinner has been cancelled." });
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });

  // Kills: F13
  it("CANCEL-EVENT-02-D2: CQ F2: Tab from Keep event moves forward to the confirm button without leaving the dialog", async () => {
    // Arrange: focus starts on Keep event
    const user = userEvent.setup();
    renderDialog();

    // Act
    await user.keyboard("{Tab}");

    // Assert: the forward move is the browser's own, between the two enabled buttons
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // Kills: F14
  it("CANCEL-EVENT-02-D3: CQ F2: a click outside the dialog while the request is pending does not close it", async () => {
    // Arrange: the request is held; the confirm button is disabled, so focus has left the dialog
    const answer = deferred<unknown>();
    apiMock.mockReturnValue(answer.promise as never);
    const user = userEvent.setup();
    const props = renderDialog();
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    // Act
    await user.click(screen.getByTestId("cancel-event-backdrop"));

    // Assert: the cancel is still in flight, so the dialog stays and nothing closes
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
    answer.resolve({ eventId: EVENT_ID, status: "Cancelled", message: "Annual Gala Dinner has been cancelled." });
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });

  // Kills: F8
  it("CANCEL-EVENT-02-D4: CQ F2: closing when no stable element is available still closes the dialog", async () => {
    // Arrange: returnFocus finds nothing to focus
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = render(
      <CancelEventDialog eventId={EVENT_ID} eventName={EVENT_NAME} onClose={onClose} onCancelled={vi.fn()} returnFocus={() => null} />,
    );

    // Act
    await user.click(screen.getByRole("button", { name: "Keep event" }));
    unmount();

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe("CQ F2: keyboard focus stays inside the modal and returns to a stable element", () => {
  // Kills: F18, F20
  it("CANCEL-EVENT-02-D5: CQ F2: after success, Tab from the only remaining button stays inside the dialog", async () => {
    // Arrange: cancel succeeds, leaving Close as the only focusable control
    apiMock.mockResolvedValue({ eventId: EVENT_ID, status: "Cancelled", message: "Annual Gala Dinner has been cancelled." } as never);
    const user = userEvent.setup();
    renderDialogWithPageControls();
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Annual Gala Dinner has been cancelled."));
    const dialog = screen.getByRole("dialog");
    // After success focus moves to the remaining Close button rather than being lost to the document body.
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    // Act
    await user.keyboard("{Tab}");

    // Assert: focus has not escaped the aria-modal dialog to the page control behind it
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  // Kills: F19, F20, P2
  it("CANCEL-EVENT-02-D6: CQ F2: after success, Shift+Tab from the only remaining button stays inside the dialog", async () => {
    // Arrange
    apiMock.mockResolvedValue({ eventId: EVENT_ID, status: "Cancelled", message: "Annual Gala Dinner has been cancelled." } as never);
    const user = userEvent.setup();
    renderDialogWithPageControls();
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Annual Gala Dinner has been cancelled."));
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    // Act
    await user.keyboard("{Shift>}{Tab}{/Shift}");

    // Assert: focus has not escaped to the page control before the dialog
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  // Kills: F8, F21
  it("CANCEL-EVENT-02-D7: CQ F2: Keep event returns focus to the stable element that was focused before the dialog closed", async () => {
    // Arrange: the page passes a stable element to return focus to
    const user = userEvent.setup();
    render(<SuccessfulHarness onOpenChange={vi.fn()} />);
    const stable = screen.getByRole("button", { name: "Stable target" });
    stable.setAttribute("data-stable", "");

    // Act
    await user.click(screen.getByRole("button", { name: "Keep event" }));

    // Assert: the dialog is gone and focus is on the stable element, not lost to the document body
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(stable).toHaveFocus();
  });

  // Kills: F14, F21
  it("CANCEL-EVENT-02-D8: CQ F2: Close after success returns focus to the stable element", async () => {
    // Arrange
    apiMock.mockResolvedValue({ eventId: EVENT_ID, status: "Cancelled", message: "Annual Gala Dinner has been cancelled." } as never);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SuccessfulHarness onOpenChange={onOpenChange} />);
    const stable = screen.getByRole("button", { name: "Stable target" });
    stable.setAttribute("data-stable", "");
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Annual Gala Dinner has been cancelled."));

    // Act
    await user.click(screen.getByRole("button", { name: "Close" }));

    // Assert
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(stable).toHaveFocus();
  });
});

describe("CANCEL-EVENT-02-B (TR-136-13): the Shift+Tab trap keeps focus inside the dialog from its first control", () => {
  /**
   * TR-136-13: focus starts on Keep event, the first control. Shift+Tab wraps backwards to Confirm cancellation (the last
   * control) and never reaches the page control before the dialog. Page controls surround the dialog so an escape is visible.
   */
  // Kills: F13, P2
  it("TR-136-13: Shift Tab from Keep event, the first control, wraps to Confirm cancellation and does not leave the dialog", async () => {
    // Arrange: focus starts on Keep event (initial focus), with a page control on each side of the dialog
    const user = userEvent.setup();
    renderDialogWithPageControls();
    const keep = screen.getByRole("button", { name: "Keep event" });
    const confirm = screen.getByRole("button", { name: "Confirm cancellation" });
    const pageBefore = screen.getByRole("button", { name: "Page control before" });
    expect(keep).toHaveFocus();

    // Act
    await user.keyboard("{Shift>}{Tab}{/Shift}");

    // Assert: focus is on the confirm button inside the dialog, not on the page control before it
    expect(confirm).toHaveFocus();
    expect(pageBefore).not.toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  /**
   * TR-136-13: from Confirm cancellation, Shift+Tab moves back to Keep event inside the dialog, and a further Tab
   * returns to Confirm cancellation. Nothing is sent to the server by moving focus.
   */
  // Kills: F13
  it("TR-136-13: Tab to Confirm cancellation then Shift Tab returns to Keep event, all inside the dialog, with no request", async () => {
    // Arrange
    const user = userEvent.setup();
    renderDialogWithPageControls();
    const keep = screen.getByRole("button", { name: "Keep event" });
    const confirm = screen.getByRole("button", { name: "Confirm cancellation" });

    // Act: Tab moves forward to confirm, then Shift+Tab moves back to Keep event
    await user.keyboard("{Tab}");
    // Assert: focus is on Confirm cancellation after the forward move
    expect(confirm).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    // Assert: focus is back on Keep event, inside the dialog
    expect(keep).toHaveFocus();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    expect(apiMock).not.toHaveBeenCalled();
  });
});
