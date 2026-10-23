import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentAvailabilityCheckPage } from "./EquipmentAvailabilityCheckPage";
import { ApiError } from "@/utils/api";

const { getEquipmentAvailability } = vi.hoisted(() => ({ getEquipmentAvailability: vi.fn() }));

vi.mock("@/features/equipment/api/equipment-api", () => ({ getEquipmentAvailability }));

beforeEach(() => getEquipmentAvailability.mockReset());

function enterPeriod() {
  fireEvent.change(screen.getByLabelText(/start date and time/i), { target: { value: "2030-02-01T09:00" } });
  fireEvent.change(screen.getByLabelText(/end date and time/i), { target: { value: "2030-02-01T10:00" } });
}

describe("EquipmentAvailabilityCheckPage", () => {
  /** EQUIP-AVAIL-01: date/time entry invokes the period-specific availability API. */
  it("checks the selected event period and renders the returned equipment quantities", async () => {
    const user = userEvent.setup();
    getEquipmentAvailability.mockResolvedValue([{
      id: "lights", name: "Stage lighting", type: "Lighting", location: "Hall A",
      activeQuantity: 10, reservedQuantity: 4, underMaintenanceQuantity: 3,
      retiredQuantity: 1, availableQuantity: 6, isAvailable: true,
      reason: "Under maintenance; Retired; Reserved", reservedUntil: "2030-02-01T11:00:00.000Z",
    }]);
    render(<EquipmentAvailabilityCheckPage />);

    enterPeriod();
    await user.click(screen.getByRole("button", { name: "Check availability" }));

    expect(getEquipmentAvailability).toHaveBeenCalledWith({
      startDateTime: new Date("2030-02-01T09:00").toISOString(),
      endDateTime: new Date("2030-02-01T10:00").toISOString(),
    });
    const row = await screen.findByRole("row", { name: /Stage lighting Lighting Hall A/ });
    expect(row).toHaveTextContent("Active: 10");
    expect(row).toHaveTextContent("Reserved: 4");
    expect(row).toHaveTextContent("Under Maintenance: 3");
    expect(row).toHaveTextContent("Retired: 1");
    expect(row).toHaveTextContent("Available: 6");
    expect(row).toHaveTextContent("Available");
    expect(row).toHaveTextContent("reserved until");
  });

  /** EQUIP-AVAIL-02: records with no remaining Active stock are visibly unavailable with the server reason. */
  it("renders an unavailable result and its reason", async () => {
    const user = userEvent.setup();
    getEquipmentAvailability.mockResolvedValue([{
      id: "projector", name: "Projector", type: "Visual", location: "Store",
      activeQuantity: 2, reservedQuantity: 2, underMaintenanceQuantity: 0,
      retiredQuantity: 0, availableQuantity: 0, isAvailable: false,
      reason: "Reserved", reservedUntil: null,
    }]);
    render(<EquipmentAvailabilityCheckPage />);

    enterPeriod();
    await user.click(screen.getByRole("button", { name: "Check availability" }));

    const row = await screen.findByRole("row", { name: /Projector Visual Store/ });
    expect(row).toHaveTextContent("Unavailable");
    expect(row).toHaveTextContent("Reserved");
    expect(row).toHaveTextContent("Available: 0");
  });

  /** EQUIP-AVAIL-03: the equipment type selector applies an exact server-side type filter. */
  it("sends the selected equipment type with the availability query", async () => {
    const user = userEvent.setup();
    getEquipmentAvailability.mockResolvedValue([]);
    render(<EquipmentAvailabilityCheckPage />);

    enterPeriod();
    await user.selectOptions(screen.getByLabelText("Equipment type"), "Audio");
    await user.click(screen.getByRole("button", { name: "Check availability" }));

    expect(getEquipmentAvailability).toHaveBeenCalledWith(expect.objectContaining({ equipmentType: "Audio" }));
    expect(await screen.findByText("No equipment matches this availability check.")).toBeInTheDocument();
  });

  /** EQUIP-AVAIL-04: missing dates refuse a request and identify the fields to correct. */
  it("requires both start and end date-times before checking", async () => {
    const user = userEvent.setup();
    render(<EquipmentAvailabilityCheckPage />);

    await user.click(screen.getByRole("button", { name: "Check availability" }));

    expect(screen.getByText("Start date and time are required.")).toBeInTheDocument();
    expect(screen.getByText("End date and time are required.")).toBeInTheDocument();
    expect(getEquipmentAvailability).not.toHaveBeenCalled();
  });

  /** EQUIP-AVAIL-05: an end at or before the start is rejected locally and no stale result remains. */
  it("requires an end at least one minute after the start and clears previous results", async () => {
    const user = userEvent.setup();
    getEquipmentAvailability.mockResolvedValueOnce([{
      id: "speaker", name: "Speaker", type: "Audio", location: "Hall",
      activeQuantity: 1, reservedQuantity: 0, underMaintenanceQuantity: 0,
      retiredQuantity: 0, availableQuantity: 1, isAvailable: true, reason: null, reservedUntil: null,
    }]);
    render(<EquipmentAvailabilityCheckPage />);

    enterPeriod();
    await user.click(screen.getByRole("button", { name: "Check availability" }));
    expect(await screen.findByText("Speaker")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/end date and time/i));
    fireEvent.change(screen.getByLabelText(/end date and time/i), { target: { value: "2030-02-01T09:00" } });
    await user.click(screen.getByRole("button", { name: "Check availability" }));

    expect(screen.getByText("End date and time must be at least one minute after the start.")).toBeInTheDocument();
    expect(screen.queryByText("Speaker")).not.toBeInTheDocument();
    expect(getEquipmentAvailability).toHaveBeenCalledTimes(1);
  });

  /** EQUIP-AVAIL-06: API validation failures clear prior results and leave values available for retry. */
  it("shows a server error, clears stale results, and allows a corrected retry", async () => {
    const user = userEvent.setup();
    getEquipmentAvailability
      .mockResolvedValueOnce([{
        id: "speaker", name: "Speaker", type: "Audio", location: "Hall",
        activeQuantity: 1, reservedQuantity: 0, underMaintenanceQuantity: 0,
        retiredQuantity: 0, availableQuantity: 1, isAvailable: true, reason: null, reservedUntil: null,
      }])
      .mockRejectedValueOnce(new ApiError("Invalid availability period.", { endDateTime: "Choose a later end date and time." }))
      .mockResolvedValueOnce([]);
    render(<EquipmentAvailabilityCheckPage />);

    enterPeriod();
    await user.click(screen.getByRole("button", { name: "Check availability" }));
    expect(await screen.findByText("Speaker")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check availability" }));
    expect(await screen.findByText("Choose a later end date and time.")).toBeInTheDocument();
    expect(screen.queryByText("Speaker")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/end date and time/i));
    fireEvent.change(screen.getByLabelText(/end date and time/i), { target: { value: "2030-02-01T11:00" } });
    await user.click(screen.getByRole("button", { name: "Check availability" }));
    expect(await screen.findByText("No equipment matches this availability check.")).toBeInTheDocument();
  });

  /** EQUIP-AVAIL-06: a connection failure gives a retryable page-level error and clears results. */
  it("shows a retryable generic error when the availability service cannot be reached", async () => {
    const user = userEvent.setup();
    getEquipmentAvailability.mockRejectedValueOnce(new Error("network unavailable"));
    render(<EquipmentAvailabilityCheckPage />);

    enterPeriod();
    await user.click(screen.getByRole("button", { name: "Check availability" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to check equipment availability. Please try again.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
