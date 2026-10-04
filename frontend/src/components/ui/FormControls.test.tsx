import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ComboBox } from "./FormControls";

function renderComboBox(
  options = ["Main Hall", "Storage Room A", "Loading Bay"],
) {
  const onChange = vi.fn();
  function ControlledComboBox() {
    const [value, setValue] = useState("");
    return (
      <ComboBox
        label="Location"
        options={options}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        required
      />
    );
  }
  render(<ControlledComboBox />);
  return {
    onChange,
    input: screen.getByRole("combobox", { name: /Location/ }),
  };
}

describe("ComboBox", () => {
  // SPM-111 EQUIP-CRE-02-C: focusing shows every stored location.
  it("EQUIP-CRE-02-C displays saved locations and filters them as the user types", async () => {
    // Arrange: render a location combobox with multiple saved choices.
    const user = userEvent.setup();
    const { input } = renderComboBox();

    // Act: focus then enter a partial search term.
    await user.click(input);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    await user.type(input, "storage");

    // Assert: only matching options remain visible.
    expect(
      screen.getByRole("option", { name: "Storage Room A" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Main Hall" }),
    ).not.toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-02-B: selecting a saved location updates the parent form and closes the list.
  it("EQUIP-CRE-02-B selects a stored location", async () => {
    // Arrange: expose the saved-location list.
    const user = userEvent.setup();
    const { onChange, input } = renderComboBox();

    // Act: choose a saved option.
    await user.click(input);
    await user.click(screen.getByRole("option", { name: "Main Hall" }));

    // Assert: the selection is emitted and the popup is closed.
    expect(onChange).toHaveBeenCalledWith("Main Hall");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-02-B: new free-text locations remain valid input.
  it("EQUIP-CRE-02-B emits a newly typed location", async () => {
    // Arrange: start with an empty combobox.
    const user = userEvent.setup();
    const { onChange, input } = renderComboBox([]);

    // Act: type a location that is not in saved options.
    await user.type(input, "Recording Studio");

    // Assert: free text is passed to the owning form.
    expect(onChange).toHaveBeenLastCalledWith("Recording Studio");
  });

  // SPM-111 EQUIP-CRE-02-C: Escape and clicks outside close the suggestion list.
  it("EQUIP-CRE-02-C closes on Escape and outside click", async () => {
    // Arrange: render a sibling outside the combobox.
    const user = userEvent.setup();
    function ControlledComboBox() {
      const [value, setValue] = useState("");
      return (
        <ComboBox
          label="Location"
          options={["Main Hall"]}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(
      <>
        <ControlledComboBox />
        <button>Outside</button>
      </>,
    );
    const input = screen.getByRole("combobox", { name: /Location/ });

    // Act and assert: Escape closes an open list.
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    // Act and assert: a pointer interaction outside also closes it.
    await user.click(input);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
