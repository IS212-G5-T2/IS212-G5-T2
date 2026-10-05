import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  // SPM-111 EQUIP-CRE-01-A: the availability-page action opens the equipment creation form.
  it("EQUIP-CRE-01-A navigates to the create-equipment form", async () => {
    // Arrange: render an otherwise empty inventory and prepare a user interaction.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([]);
    render(<EquipmentAvailabilityPage />);

    // Act: select the page's creation action.
    await user.click(
      screen.getByRole("button", { name: /create equipment record/i }),
    );

    // Assert: navigation uses the intended protected route.
    expect(navigate).toHaveBeenCalledWith("/equipment/create");
  });

  // SPM-117 EQUIP-VIEW-01-A: equipment type search supports exact and partial case-insensitive terms.
  it("EQUIP-VIEW-01-A searches equipment records by exact or partial equipment type", async () => {
    // Arrange: load records with distinct equipment types and prepare a user interaction.
    const user = userEvent.setup();
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
      {
        id: "equipment-2",
        name: "Wireless microphone",
        type: "Audio",
        quantity: 25,
        maintenanceStatus: "Active",
        location: "Auditorium",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Conference projector")).toBeInTheDocument();
    const search = screen.getByRole("searchbox", {
      name: /search by type or location/i,
    });

    // Act: search first by the exact type, then by a partial lowercase substring.
    await user.type(search, "Visual");

    // Assert: the exact type search returns only the matching record.
    expect(screen.getByText("Conference projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless microphone")).not.toBeInTheDocument();

    // Act: replace the exact term with its partial lowercase equivalent.
    await user.clear(search);
    await user.type(search, "vis");

    // Assert: the partial case-insensitive search produces the same filtered result.
    expect(screen.getByText("Conference projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless microphone")).not.toBeInTheDocument();
  });

  // SPM-117 EQUIP-VIEW-01-B: location search supports exact and partial case-insensitive terms.
  it("EQUIP-VIEW-01-B searches equipment records by exact or partial location", async () => {
    // Arrange: load records in distinct locations and prepare a user interaction.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      {
        id: "equipment-1",
        name: "Portable screen",
        type: "Visual",
        quantity: 3,
        maintenanceStatus: "Active",
        location: "Storage Room B",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
      {
        id: "equipment-2",
        name: "Mixing console",
        type: "Audio",
        quantity: 10,
        maintenanceStatus: "Under Maintenance",
        location: "Control Room A",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Portable screen")).toBeInTheDocument();
    const search = screen.getByRole("searchbox", {
      name: /search by type or location/i,
    });

    // Act: search first by the exact location, then by a partial lowercase substring.
    await user.type(search, "Storage Room B");

    // Assert: the exact location search returns only the matching record.
    expect(screen.getByText("Portable screen")).toBeInTheDocument();
    expect(screen.queryByText("Mixing console")).not.toBeInTheDocument();

    // Act: replace the exact term with its partial lowercase equivalent.
    await user.clear(search);
    await user.type(search, "room b");

    // Assert: the partial case-insensitive search produces the same filtered result.
    expect(screen.getByText("Portable screen")).toBeInTheDocument();
    expect(screen.queryByText("Mixing console")).not.toBeInTheDocument();
  });

  // SPM-117 EQUIP-VIEW-01-C: an unmatched search has a distinct state from an empty inventory.
  it("EQUIP-VIEW-01-C shows a distinct message when no equipment matches the search", async () => {
    // Arrange: load a non-empty inventory and prepare a user interaction.
    const user = userEvent.setup();
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
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Conference projector")).toBeInTheDocument();

    // Act: enter a term that matches neither equipment type nor location.
    await user.type(
      screen.getByRole("searchbox", { name: /search by type or location/i }),
      "nonexistent location",
    );

    // Assert: the search-specific empty state is shown instead of the inventory-empty message.
    expect(
      screen.getByText("No equipment records match your search."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No equipment records found."),
    ).not.toBeInTheDocument();
  });

  // SPM-117 EQUIP-VIEW-02-A: every supported maintenance status is paired with its record.
  it("EQUIP-VIEW-02-A renders Active, Under Maintenance, and Retired statuses", async () => {
    // Arrange: load one equipment record in each supported maintenance status.
    getEquipment.mockResolvedValue([
      {
        id: "equipment-1",
        name: "Active projector",
        type: "Visual",
        quantity: 3,
        maintenanceStatus: "Active",
        location: "Storage Room A",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
      {
        id: "equipment-2",
        name: "Microphone under repair",
        type: "Audio",
        quantity: 25,
        maintenanceStatus: "Under Maintenance",
        location: "Workshop",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
      {
        id: "equipment-3",
        name: "Retired lighting rig",
        type: "Lighting",
        quantity: 10,
        maintenanceStatus: "Retired",
        location: "Archive",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
    ]);

    // Act: load the Technical Support equipment inventory.
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Active projector")).toBeInTheDocument();

    // Assert: each record row displays its corresponding maintenance status.
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Active projector");
    expect(rows[1]).toHaveTextContent("Active");
    expect(rows[2]).toHaveTextContent("Microphone under repair");
    expect(rows[2]).toHaveTextContent("Under Maintenance");
    expect(rows[3]).toHaveTextContent("Retired lighting rig");
    expect(rows[3]).toHaveTextContent("Retired");
  });

  // SPM-117 EQUIP-VIEW-03-A: quantity sorting is numeric and toggles direction.
  it("EQUIP-VIEW-03-A sorts quantity numerically ascending then descending", async () => {
    // Arrange: load deliberately non-lexicographic quantities and prepare a user interaction.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      { id: "equipment-1", name: "Three", type: "Visual", quantity: 3, maintenanceStatus: "Active", location: "Room C", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
      { id: "equipment-2", name: "Twenty-five", type: "Audio", quantity: 25, maintenanceStatus: "Active", location: "Room A", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
      { id: "equipment-3", name: "Ten", type: "Lighting", quantity: 10, maintenanceStatus: "Active", location: "Room B", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Three")).toBeInTheDocument();
    const quantityHeader = screen.getByRole("columnheader", { name: /quantity/i });

    // Act: select the Quantity header once.
    await user.click(quantityHeader);

    // Assert: rows are ordered by numeric quantity ascending.
    expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Three"),
      expect.stringContaining("Ten"),
      expect.stringContaining("Twenty-five"),
    ]);

    // Act: select the Quantity header a second time.
    await user.click(quantityHeader);

    // Assert: rows are ordered by numeric quantity descending.
    expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Twenty-five"),
      expect.stringContaining("Ten"),
      expect.stringContaining("Three"),
    ]);
  });

  // SPM-117 EQUIP-VIEW-03-B: equipment type sorting is alphabetical and toggles direction.
  it("EQUIP-VIEW-03-B sorts equipment type alphabetically in both directions", async () => {
    // Arrange: load equipment types out of alphabetical order and prepare a user interaction.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      { id: "equipment-1", name: "Visual item", type: "Visual", quantity: 3, maintenanceStatus: "Active", location: "Room C", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
      { id: "equipment-2", name: "Audio item", type: "Audio", quantity: 25, maintenanceStatus: "Active", location: "Room A", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
      { id: "equipment-3", name: "Lighting item", type: "Lighting", quantity: 10, maintenanceStatus: "Active", location: "Room B", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Visual item")).toBeInTheDocument();
    const typeHeader = screen.getByRole("columnheader", { name: /equipment type/i });

    // Act: select the Equipment type header once.
    await user.click(typeHeader);

    // Assert: rows are ordered alphabetically by type ascending.
    expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Audio item"),
      expect.stringContaining("Lighting item"),
      expect.stringContaining("Visual item"),
    ]);

    // Act: select the Equipment type header a second time.
    await user.click(typeHeader);

    // Assert: rows are ordered alphabetically by type descending.
    expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Visual item"),
      expect.stringContaining("Lighting item"),
      expect.stringContaining("Audio item"),
    ]);
  });

  // SPM-117 EQUIP-VIEW-03-C: location sorting is alphabetical and toggles direction.
  it("EQUIP-VIEW-03-C sorts location alphabetically in both directions", async () => {
    // Arrange: load equipment locations out of alphabetical order and prepare a user interaction.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      { id: "equipment-1", name: "Room C item", type: "Visual", quantity: 3, maintenanceStatus: "Active", location: "Room C", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
      { id: "equipment-2", name: "Room A item", type: "Audio", quantity: 25, maintenanceStatus: "Active", location: "Room A", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
      { id: "equipment-3", name: "Room B item", type: "Lighting", quantity: 10, maintenanceStatus: "Active", location: "Room B", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Room C item")).toBeInTheDocument();
    const locationHeader = screen.getByRole("columnheader", { name: /location/i });

    // Act: select the Location header once.
    await user.click(locationHeader);

    // Assert: rows are ordered alphabetically by location ascending.
    expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Room A item"),
      expect.stringContaining("Room B item"),
      expect.stringContaining("Room C item"),
    ]);

    // Act: select the Location header a second time.
    await user.click(locationHeader);

    // Assert: rows are ordered alphabetically by location descending.
    expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Room C item"),
      expect.stringContaining("Room B item"),
      expect.stringContaining("Room A item"),
    ]);
  });
});
