import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentCreatePage } from "./EquipmentCreatePage";
import { ApiError } from "@/utils/api";

/**
 * Coverage note: the uncovered false arm of the locations effect's `active` guard occurs only
 * when its pending lookup resolves after unmount. The state update is unobservable after unmount,
 * so this defensive lifecycle branch has no meaningful UI assertion or matching story case.
 */

const { createEquipment, getEquipmentLocations, navigate } = vi.hoisted(() => ({
  createEquipment: vi.fn(),
  getEquipmentLocations: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/features/equipment/api/equipment-api", () => ({
  createEquipment,
  getEquipmentLocations,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

describe("EquipmentCreatePage", () => {
  beforeEach(() => {
    createEquipment.mockReset();
    getEquipmentLocations.mockReset();
    // Default: no previously-stored locations unless a test provides them.
    getEquipmentLocations.mockResolvedValue([]);
    navigate.mockReset();
  });

  /** EQUIP-AVAIL-08-A: a new inventory record submits the three quantities independently. */
  it("EQUIP-AVAIL-08-A creates the record with the 10/30/10 status breakdown", async () => {
    const user = userEvent.setup();
    createEquipment.mockResolvedValue({ message: "Equipment Record Created." });
    render(<EquipmentCreatePage />);
    await user.type(screen.getByLabelText(/equipment name/i), "Lighting");
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Lighting");
    await user.type(screen.getByLabelText(/active quantity/i), "10");
    await user.clear(screen.getByLabelText(/under maintenance quantity/i));
    await user.type(screen.getByLabelText(/under maintenance quantity/i), "30");
    await user.clear(screen.getByLabelText(/retired quantity/i));
    await user.type(screen.getByLabelText(/retired quantity/i), "10");
    await user.type(screen.getByLabelText(/location/i), "Jurong");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    expect(createEquipment).toHaveBeenCalledWith({
      name: "Lighting", type: "Lighting", activeQuantity: 10,
      underMaintenanceQuantity: 30, retiredQuantity: 10, location: "Jurong",
    });
  });

  /** EQUIP-AVAIL-08-BND-1: all-zero and aggregate-overflow allocations are refused before creation. */
  it("EQUIP-AVAIL-08-BND-1 refuses all-zero and aggregate-overflow breakdowns", async () => {
    const user = userEvent.setup();
    render(<EquipmentCreatePage />);
    await user.type(screen.getByLabelText(/equipment name/i), "Lighting");
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Lighting");
    await user.type(screen.getByLabelText(/location/i), "Jurong");

    await user.type(screen.getByLabelText(/active quantity/i), "-1");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));
    expect(await screen.findByText(/active quantity must be a non-negative whole number/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/active quantity/i));
    await user.type(screen.getByLabelText(/active quantity/i), "1.5");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));
    expect(await screen.findByText(/active quantity must be a non-negative whole number/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/active quantity/i));
    await user.type(screen.getByLabelText(/active quantity/i), "0");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    expect(await screen.findByText(/at least one equipment item is required/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/active quantity/i));
    await user.type(screen.getByLabelText(/active quantity/i), "2147483647");
    await user.clear(screen.getByLabelText(/under maintenance quantity/i));
    await user.type(screen.getByLabelText(/under maintenance quantity/i), "1");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    expect(await screen.findByText(/total quantity must not exceed 2147483647/i)).toBeInTheDocument();
    expect(createEquipment).not.toHaveBeenCalled();
  });

  // SPM-111 EQUIP-CRE-01-A: Technical Support sees the complete creation form.
  it("EQUIP-CRE-01-A renders name, type, quantity, status, location, and submit controls", () => {
    // Act: open the creation page.
    render(<EquipmentCreatePage />);

    // Assert: each required field and the submit action are available.
    expect(screen.getByLabelText(/equipment name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/equipment type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/active quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create equipment/i }),
    ).toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-07-A and EQUIP-CRE-06-A: dropdowns expose exactly the story values.
  it("EQUIP-CRE-06-A/EQUIP-CRE-07-A offers predefined types and all three status quantity fields", () => {
    // Act: render the selectable controls.
    render(<EquipmentCreatePage />);

    // Assert: option values exactly match the story's predefined lists.
    const types = screen.getByLabelText(/equipment type/i) as HTMLSelectElement;
        expect(
      [...types.options].map((option) => option.value).filter(Boolean),
    ).toEqual(["Audio", "Visual", "Furniture", "Lighting", "Other"]);
    expect(screen.getByLabelText(/active quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/under maintenance quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/retired quantity/i)).toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-02-A: the UI sends all values unchanged on valid submit.
  it("EQUIP-CRE-02-A submits equipment name, type, positive quantity, maintenance status, and location", async () => {
    // Arrange: the API acknowledges a valid record.
    const user = userEvent.setup();
    createEquipment.mockResolvedValue({
      equipment: {
        id: "equipment-1",
        name: "Conference projector",
        type: "Audio",
        activeQuantity: 5,
        underMaintenanceQuantity: 0,
        retiredQuantity: 0,
        location: "Storage Room A",
      },
      message: "Equipment Record Created.",
    });
    render(<EquipmentCreatePage />);

    // Act: complete and submit the form.
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: the API receives all fields without alteration.
    expect(createEquipment).toHaveBeenCalledWith({
      name: "Conference projector",
      type: "Audio",
      activeQuantity: 5,
        underMaintenanceQuantity: 0,
        retiredQuantity: 0,
      location: "Storage Room A",
    });
  });

  // SPM-111 EQUIP-CRE-02-C: the location field is a combobox populated from previously-stored locations.
  it("EQUIP-CRE-02-C renders the location combobox options from stored locations", async () => {
    // Arrange: the API returns previously-stored distinct locations.
    const user = userEvent.setup();
    getEquipmentLocations.mockResolvedValue(["Main Hall", "Storage Room A"]);
    render(<EquipmentCreatePage />);

    // Act: open the dropdown by focusing the combobox input.
    await user.click(screen.getByLabelText(/location/i));

    // Assert: the dropdown lists each stored location as a selectable option.
    expect(
      await screen.findByRole("option", { name: "Main Hall" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Storage Room A" }),
    ).toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-02-B: selecting an existing location submits it unchanged.
  it("EQUIP-CRE-02-B submits an existing location chosen from the dropdown", async () => {
    // Arrange: stored locations are available and the API accepts the record.
    const user = userEvent.setup();
    getEquipmentLocations.mockResolvedValue(["Main Hall", "Storage Room A"]);
    createEquipment.mockResolvedValue({ message: "Equipment Record Created." });
    render(<EquipmentCreatePage />);

    // Act: fill the form and choose an existing location from the dropdown.
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.click(screen.getByLabelText(/location/i));
    await user.click(await screen.findByRole("option", { name: "Main Hall" }));
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: the selected location is sent unchanged.
    expect(createEquipment).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Main Hall" }),
    );
  });

  // SPM-111 EQUIP-CRE-02-B: a newly typed location is trimmed of leading/trailing whitespace on submit.
  it("EQUIP-CRE-02-B trims leading/trailing whitespace from a newly typed location", async () => {
    // Arrange: no stored locations; the user types a brand-new padded value.
    const user = userEvent.setup();
    getEquipmentLocations.mockResolvedValue([]);
    createEquipment.mockResolvedValue({ message: "Equipment Record Created." });
    render(<EquipmentCreatePage />);

    // Act: fill the form and type a location padded with surrounding spaces.
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.type(
      screen.getByLabelText(/location/i),
      "  kirubakaran kishore  ",
    );
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: leading/trailing spaces are stripped while internal spacing is preserved.
    expect(createEquipment).toHaveBeenCalledWith(
      expect.objectContaining({ location: "kirubakaran kishore" }),
    );
  });

  // SPM-111 EQUIP-CRE-02-A: a padded equipment name is normalised before the API receives it.
  it("EQUIP-CRE-02-A trims leading and trailing whitespace from the equipment name", async () => {
    // Arrange: accept a valid record whose name was typed with accidental surrounding spaces.
    const user = userEvent.setup();
    createEquipment.mockResolvedValue({ message: "Equipment Record Created." });
    render(<EquipmentCreatePage />);

    // Act: complete and submit the form with a padded name.
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "  Conference projector  ",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: only meaningful name content crosses the client API boundary.
    expect(createEquipment).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Conference projector" }),
    );
  });

  // SPM-111 EQUIP-CRE-02-C: a newly created location becomes available in the dropdown.
  it("EQUIP-CRE-02-C adds a newly created location to the dropdown options", async () => {
    // Arrange: one stored location exists; the user creates a record with a brand-new location.
    const user = userEvent.setup();
    getEquipmentLocations.mockResolvedValue(["Main Hall"]);
    createEquipment.mockResolvedValue({ message: "Equipment Record Created." });
    render(<EquipmentCreatePage />);

    // Act: create a record with a new location value.
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.type(screen.getByLabelText(/location/i), "Loading Bay");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: re-opening the dropdown now offers the newly created location.
    await user.click(screen.getByLabelText(/location/i));
    expect(
      await screen.findByRole("option", { name: "Loading Bay" }),
    ).toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-03-A/B: incomplete or invalid non-location input is stopped before POST.
  it.each([
    [
      "name",
      {
        type: "Audio",
        quantity: "5",
        location: "Storage Room A",
      },
      /equipment name is required/i,
    ],
    [
      "type",
      {
        name: "Conference projector",
        quantity: "5",
        location: "Storage Room A",
      },
      /equipment type is required/i,
    ],
    [
      "quantity",
      {
        name: "Conference projector",
        type: "Audio",
        location: "Storage Room A",
      },
      /active quantity is required/i,
    ],
    [
      "all-zero breakdown",
      {
        name: "Conference projector",
        type: "Audio",
        quantity: "0",
        location: "Storage Room A",
      },
      /at least one equipment item is required/i,
    ],
    [
      "zero quantity",
      {
        name: "Conference projector",
        type: "Audio",
        quantity: "0",
        location: "Storage Room A",
      },
      /at least one equipment item is required/i,
    ],
    [
      "negative quantity",
      {
        name: "Conference projector",
        type: "Audio",
        quantity: "-1",
        location: "Storage Room A",
      },
      /non-negative whole number/i,
    ],
    [
      "decimal quantity",
      {
        name: "Conference projector",
        type: "Audio",
        quantity: "1.5",
        location: "Storage Room A",
      },
      /non-negative whole number/i,
    ],
    [
      "non-numeric quantity",
      {
        name: "Conference projector",
        type: "Audio",
        quantity: "abc",
        location: "Storage Room A",
      },
      /non-negative whole number/i,
    ],
    [
      "mixed quantity",
      {
        name: "Conference projector",
        type: "Audio",
        quantity: "5kg",
        location: "Storage Room A",
      },
      /non-negative whole number/i,
    ],
    [
      "whitespace quantity",
      {
        name: "Conference projector",
        type: "Audio",
        quantity: " ",
        location: "Storage Room A",
      },
      /non-negative whole number/i,
    ],
  ])(
    "EQUIP-CRE-03-A/B blocks %s and shows a field error",
    async (_caseName, values, error) => {
      // Arrange: render the blank form and supply only this case's values.
      const user = userEvent.setup();
      render(<EquipmentCreatePage />);
      if ("name" in values)
        await user.type(screen.getByLabelText(/equipment name/i), values.name);
      if ("type" in values)
        await user.selectOptions(
          screen.getByLabelText(/equipment type/i),
          values.type,
        );
      if ("quantity" in values)
        await user.type(screen.getByLabelText(/active quantity/i), values.quantity);
            if ("location" in values)
        await user.type(screen.getByLabelText(/location/i), values.location);

      // Act: attempt submission.
      await user.click(
        screen.getByRole("button", { name: /create equipment/i }),
      );

      // Assert: local validation explains the error and sends no create request.
      expect(await screen.findByText(error)).toBeInTheDocument();
      expect(createEquipment).not.toHaveBeenCalled();
    },
  );

  // SPM-111 EQUIP-CRE-03-D: a missing location blocks creation and identifies the field.
  it("EQUIP-CRE-03-D blocks a missing location and shows a field error", async () => {
    const user = userEvent.setup();
    render(<EquipmentCreatePage />);
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");

    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    expect(
      await screen.findByText(/location is required/i),
    ).toBeInTheDocument();
    expect(createEquipment).not.toHaveBeenCalled();
  });

  // SPM-111 EQUIP-CRE-03-A: an entirely blank form identifies every required field at once.
  it("EQUIP-CRE-03-A shows all five required-field errors on an empty submission", async () => {
    // Arrange: open the unfilled creation form.
    const user = userEvent.setup();
    render(<EquipmentCreatePage />);

    // Act: submit without providing any values.
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: every missing field has an actionable error and no request is sent.
    expect(
      await screen.findByText("Equipment name is required."),
    ).toBeInTheDocument();
    expect(screen.getByText("Equipment type is required.")).toBeInTheDocument();
    expect(screen.getByText("Active quantity is required.")).toBeInTheDocument();
    expect(screen.getByText("Location is required.")).toBeInTheDocument();
    expect(createEquipment).not.toHaveBeenCalled();
  });

  // EQUIP-CRE-03-BND-2: the UI prevents quantities that PostgreSQL cannot store.
  it("blocks a quantity above the PostgreSQL integer maximum", async () => {
    // Arrange: complete every non-quantity input with valid values.
    const user = userEvent.setup();
    render(<EquipmentCreatePage />);
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "2147483648");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");

    // Act: submit an integer one above the persistence limit.
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: validation occurs before the API call.
    expect(
      await screen.findByText(/total quantity must not exceed 2147483647/i),
    ).toBeInTheDocument();
    expect(createEquipment).not.toHaveBeenCalled();
  });

  // SPM-111 EQUIP-CRE-03-BND-1: the UI accepts the inclusive PostgreSQL integer maximum.
  it("EQUIP-CRE-03-BND-1 submits the maximum supported quantity", async () => {
    // Arrange: make the API accept an otherwise valid boundary-value submission.
    const user = userEvent.setup();
    createEquipment.mockResolvedValue({ message: "Equipment Record Created." });
    render(<EquipmentCreatePage />);
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "2147483647");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");

    // Act: submit the largest valid quantity.
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: the client does not reject or alter the inclusive boundary value.
    expect(createEquipment).toHaveBeenCalledWith(
      expect.objectContaining({ activeQuantity: 2147483647, underMaintenanceQuantity: 0, retiredQuantity: 0 }),
    );
  });

  // SPM-111 EQUIP-CRE-03-A: correcting an invalid form clears its old client-side errors.
  it("EQUIP-CRE-03-A clears field errors after the user corrects and resubmits", async () => {
    // Arrange: first submit an empty form, then make the API accept a corrected form.
    const user = userEvent.setup();
    createEquipment.mockResolvedValue({ message: "Equipment Record Created." });
    render(<EquipmentCreatePage />);
    await user.click(screen.getByRole("button", { name: /create equipment/i }));
    await screen.findByText("Equipment name is required.");

    // Act: fill all fields correctly and submit again.
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: stale required-field messages are removed once validation succeeds.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByText("Equipment name is required."),
    ).not.toBeInTheDocument();
  });

  // SPM-111 resilience: the submit control disables while its request is pending.
  it("disables duplicate submissions while a create request is pending", async () => {
    // Arrange: leave the creation request unresolved after a valid submission.
    const user = userEvent.setup();
    let resolveCreate: ((value: { message: string }) => void) | undefined;
    createEquipment.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<EquipmentCreatePage />);
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");

    // Act: submit once while the request remains outstanding.
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: a second request cannot be started from the UI.
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(createEquipment).toHaveBeenCalledTimes(1);
    resolveCreate?.({ message: "Equipment Record Created." });
  });

  // SPM-111 EQUIP-CRE-03-A: other valid entries remain intact when a status bucket is missing.
  it("EQUIP-CRE-03-A retains entered values when Under Maintenance quantity is missing", async () => {
    const user = userEvent.setup();
    render(<EquipmentCreatePage />);
    const type = screen.getByLabelText(/equipment type/i) as HTMLSelectElement;
    const quantity = screen.getByLabelText(/active quantity/i) as HTMLInputElement;
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(type, "Audio");
    await user.type(quantity, "5");
    const maintenanceQuantity = screen.getByLabelText(/under maintenance quantity/i) as HTMLInputElement;
    await user.clear(maintenanceQuantity);
    await user.type(screen.getByLabelText(/location/i), "Storage Room A");

    // Act: submit the incomplete form.
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: the field error does not discard the valid values already entered.
    expect(await screen.findByText("Under Maintenance quantity is required.")).toBeInTheDocument();
    expect(createEquipment).not.toHaveBeenCalled();
    expect(type.value).toBe("Audio");
    expect(quantity.value).toBe("5");
    expect(maintenanceQuantity.value).toBe("");
  });

  // SPM-111 EQUIP-CRE-04-A: a completed save opens a confirmation dialog and returns to availability after acknowledgement.
  it("EQUIP-CRE-04-A displays confirmation and returns to availability after acknowledgement", async () => {
    // Arrange: submit a valid record and return the server confirmation.
    const user = userEvent.setup();
    createEquipment.mockResolvedValue({ message: "Equipment Record Created." });
    render(<EquipmentCreatePage />);
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(
      screen.getByLabelText(/equipment type/i),
      "Visual",
    );
    await user.type(screen.getByLabelText(/active quantity/i), "10");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");

    // Act: submit the form.
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: the user receives confirmation, then the acknowledgement returns them to availability.
    expect(
      await screen.findByRole("dialog", { name: /equipment record created/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Equipment Record Created.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(navigate).toHaveBeenCalledWith("/equipment/inventory");
  });

  /**
   * EQUIP-CRE-02-D: a failed stored-location lookup still permits a new free-text location.
   */
  it("SPM-111 keeps free-text location usable when stored locations fail to load", async () => {
    getEquipmentLocations.mockRejectedValue(new Error("network unavailable"));
    const user = userEvent.setup();

    render(<EquipmentCreatePage />);
    const location = screen.getByLabelText(/location/i);
    await user.type(location, "Temporary Store");

    expect(location).toHaveValue("Temporary Store");
  });

  /**
   * EQUIP-CRE-04-B: closing the success dialog does not acknowledge it or navigate away.
   */
  it("SPM-111 dismisses creation confirmation without acknowledging it", async () => {
    const user = userEvent.setup();
    createEquipment.mockResolvedValue({ message: "Equipment record created." });
    render(<EquipmentCreatePage />);
    await user.type(screen.getByLabelText(/equipment name/i), "Conference projector");
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Visual");
    await user.type(screen.getByLabelText(/active quantity/i), "10");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");
    await user.click(screen.getByRole("button", { name: /create equipment/i }));
    expect(await screen.findByRole("dialog", { name: /equipment record created/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close dialog/i }));

    expect(screen.queryByRole("dialog", { name: /equipment record created/i })).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  // SPM-111 EQUIP-CRE-03-C: API validation errors are shown beside the relevant field.
  it("EQUIP-CRE-03-C displays a server-side field validation error", async () => {
    // Arrange: the API rejects an otherwise valid client submission with its field error.
    const user = userEvent.setup();
    createEquipment.mockRejectedValue(
      new ApiError("Invalid equipment record.", {
        activeQuantity: "Total quantity must not exceed 2147483647.",
      }),
    );
    render(<EquipmentCreatePage />);
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");

    // Act: submit and receive the server-side validation response.
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: server validation is visible to the Technical Support user.
    expect(
      await screen.findByText(
        /total quantity must not exceed 2147483647/i,
      ),
    ).toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-03-C: body-level API validation errors remain visible to the user.
  it("EQUIP-CRE-03-C displays a server-side body validation error", async () => {
    // Arrange: the API rejects a request before it can identify a field.
    const user = userEvent.setup();
    createEquipment.mockRejectedValue(
      new ApiError("Invalid equipment record.", {
        body: "Equipment details are required.",
      }),
    );
    render(<EquipmentCreatePage />);
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");

    // Act: submit and receive the body-level server validation response.
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: a response without a field key is not silently dropped.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Equipment details are required.",
    );
  });

  // SPM-111 resilience: a non-validation API failure is visible and does not imply creation succeeded.
  it("shows a recovery message when the create request fails unexpectedly", async () => {
    // Arrange: simulate a network or otherwise unstructured request failure.
    const user = userEvent.setup();
    createEquipment.mockRejectedValue(new Error("network unavailable"));
    render(<EquipmentCreatePage />);
    await user.type(
      screen.getByLabelText(/equipment name/i),
      "Conference projector",
    );
    await user.selectOptions(screen.getByLabelText(/equipment type/i), "Audio");
    await user.type(screen.getByLabelText(/active quantity/i), "5");
        await user.type(screen.getByLabelText(/location/i), "Storage Room A");

    // Act: submit the valid form.
    await user.click(screen.getByRole("button", { name: /create equipment/i }));

    // Assert: the UI gives an actionable failure message rather than confirmation.
    expect(
      await screen.findByText(/unable to create the equipment record/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Equipment Record Created."),
    ).not.toBeInTheDocument();
  });
});
