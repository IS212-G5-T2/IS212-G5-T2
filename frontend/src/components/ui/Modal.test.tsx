import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

function FocusHarness() {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState("");
  const [closedWith, setClosedWith] = useState("not closed");
  const [closeCount, setCloseCount] = useState(0);

  return <>
    <button onClick={() => setOpen(true)}>Open modal</button>
    <output data-testid="closed-with">{closedWith}</output>
    <output data-testid="close-count">{closeCount}</output>
    <Modal
      open={open}
      onClose={() => {
        setClosedWith(value);
        setCloseCount((count) => count + 1);
        setOpen(false);
      }}
      title="Feedback"
    >
      <label htmlFor="feedback">Feedback</label>
      <input id="feedback" value={value} onChange={(event) => setValue(event.target.value)} />
    </Modal>
  </>;
}

describe("Modal focus and dismissal behavior", () => {
  /** SAFETY-DECISION-02: a changing parent callback keeps rejection input focused and Escape closes with the latest handler once. */
  it("SAFETY-DECISION-02 keeps feedback focus during controlled typing and cleans up the current Escape listener", async () => {
    const user = userEvent.setup();
    render(<FocusHarness />);
    const input = screen.getByRole("textbox", { name: "Feedback" });
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();

    await user.click(input);
    await user.type(input, "multi word feedback");
    expect(input).toHaveValue("multi word feedback");
    expect(input).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("closed-with")).toHaveTextContent("multi word feedback");
    expect(screen.getByTestId("close-count")).toHaveTextContent("1");

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("close-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Open modal" }));
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("close-count")).toHaveTextContent("2");
  });

  /** Backdrop clicks close the dialog, clicks inside do not, and optional wide/footer rendering remains supported. */
  it("handles backdrop propagation and optional large-dialog footer", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Wide dialog" size="lg" footer={<button>Save</button>}>
        <button>Inside</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Wide dialog" });
    expect(dialog.querySelector(".max-w-2xl")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
