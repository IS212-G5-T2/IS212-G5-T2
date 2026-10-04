import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentAvailabilityPage } from "./EquipmentAvailabilityPage";

const { getEquipment, navigate } = vi.hoisted(() => ({
  getEquipment: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/utils/equipment-api", () => ({ getEquipment }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

describe("EquipmentAvailabilityPage", () => {
  beforeEach(() => {
    getEquipment.mockReset();
    navigate.mockReset();
  });

  // SPM-111 EQUIP-CRE-05-A: inventory displays all persisted details, including location.
  it("EQUIP-CRE-05-A displays the equipment location in the inventory", async () => {
    // Arrange: the Technical Support inventory API returns a named equipment record.
    getEquipment.mockResolvedValue([
      {
        id: "equipment-1",
        name: "Conference projector",
        type: "Visual",
        quantity: 10,
        maintenanceStatus: "Active",
        location: "Storage Room A",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
    ]);

    // Act: load the Technical Support equipment inventory.
    render(<EquipmentAvailabilityPage />);

    // Assert: the persisted location is visible with the rest of the record details.
    expect(await screen.findByText("Conference projector")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /equipment name/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Visual")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /location/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Storage Room A")).toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-05-A: an empty but successful inventory is distinguishable from a load failure.
  it("EQUIP-CRE-05-A shows an empty-state message when no equipment exists", async () => {
    // Arrange: the API responds successfully with no persisted records.
    getEquipment.mockResolvedValue([]);

    // Act: load the availability page.
    render(<EquipmentAvailabilityPage />);

    // Assert: the page accurately communicates an empty inventory.
    expect(
      await screen.findByText("No equipment records found."),
    ).toBeInTheDocument();
  });

  // SPM-111 resilience: a failed inventory request is visible instead of masquerading as an empty list.
  it("shows a recovery message when equipment inventory loading fails", async () => {
    // Arrange: the API is unavailable.
    getEquipment.mockRejectedValue(new Error("network unavailable"));

    // Act: load the availability page.
    render(<EquipmentAvailabilityPage />);

    // Assert: the user receives a distinct recoverable failure message.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load equipment records. Please try again.",
    );
  });
});
