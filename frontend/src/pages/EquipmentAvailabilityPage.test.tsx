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

  // SPM-117 EQUIP-VIEW-01-A: the dedicated type box filters by type on exact and partial case-insensitive terms.
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
        name: "Wireless mic",
        type: "Audio",
        quantity: 25,
        maintenanceStatus: "Active",
        location: "Storage Room A",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
      {
        id: "equipment-3",
        name: "Folding table",
        type: "Furniture",
        quantity: 5,
        maintenanceStatus: "Active",
        location: "Storage Room B",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Conference projector")).toBeInTheDocument();
    const typeSearch = screen.getByRole("searchbox", {
      name: /search by type/i,
    });

    // Act: in the type box, search first by the exact type, then by a partial lowercase substring.
    await user.type(typeSearch, "Visual");

    // Assert: the exact type search returns only the matching record.
    expect(screen.getByText("Conference projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless mic")).not.toBeInTheDocument();
    expect(screen.queryByText("Folding table")).not.toBeInTheDocument();

    // Act: replace the exact term with its partial lowercase equivalent.
    await user.clear(typeSearch);
    await user.type(typeSearch, "vis");

    // Assert: the partial case-insensitive search produces the same filtered result.
    expect(screen.getByText("Conference projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless mic")).not.toBeInTheDocument();
    expect(screen.queryByText("Folding table")).not.toBeInTheDocument();
  });

  // SPM-117 EQUIP-VIEW-01-B: the dedicated location box filters by location on exact and partial case-insensitive terms.
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
    const locationSearch = screen.getByRole("searchbox", {
      name: /search by location/i,
    });

    // Act: in the location box, search first by the exact location, then by a partial lowercase substring.
    await user.type(locationSearch, "Storage Room B");

    // Assert: the exact location search returns only the matching record.
    expect(screen.getByText("Portable screen")).toBeInTheDocument();
    expect(screen.queryByText("Mixing console")).not.toBeInTheDocument();

    // Act: replace the exact term with its partial lowercase equivalent.
    await user.clear(locationSearch);
    await user.type(locationSearch, "room b");

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

    // Act: in the type box, enter a term that matches no record.
    await user.type(
      screen.getByRole("searchbox", { name: /search by type/i }),
      "nonexistent",
    );

    // Assert: the search-specific empty state is shown instead of the inventory-empty message.
    expect(
      screen.getByText("No equipment records match your search."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No equipment records found."),
    ).not.toBeInTheDocument();
  });

  // SPM-117 EQUIP-VIEW-01-D: the type and location boxes combine with AND.
  it("EQUIP-VIEW-01-D combines the type and location boxes with AND", async () => {
    // Arrange: load records that overlap on type and on location so AND is distinguishable from OR.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      {
        id: "equipment-1",
        name: "Projector",
        type: "Visual",
        quantity: 4,
        maintenanceStatus: "Active",
        location: "Room A",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
      {
        id: "equipment-2",
        name: "Screen",
        type: "Visual",
        quantity: 2,
        maintenanceStatus: "Active",
        location: "Room B",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
      {
        id: "equipment-3",
        name: "Microphone",
        type: "Audio",
        quantity: 8,
        maintenanceStatus: "Active",
        location: "Room A",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Projector")).toBeInTheDocument();

    // Act: constrain type to Visual and location to Room A in their respective boxes.
    await user.type(
      screen.getByRole("searchbox", { name: /search by type/i }),
      "Visual",
    );
    await user.type(
      screen.getByRole("searchbox", { name: /search by location/i }),
      "Room A",
    );

    // Assert: only the record matching BOTH constraints remains; the type-only and location-only matches are hidden.
    expect(screen.getByText("Projector")).toBeInTheDocument();
    expect(screen.queryByText("Screen")).not.toBeInTheDocument();
    expect(screen.queryByText("Microphone")).not.toBeInTheDocument();
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

  // SPM-117 EQUIP-VIEW-03-A: the inventory shows every field of a record, including quantity.
  it("EQUIP-VIEW-03-A displays all equipment record fields in the inventory", async () => {
    // Arrange: the inventory API returns a single fully-populated record.
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
    expect(await screen.findByText("Conference projector")).toBeInTheDocument();

    // Assert: every AC2 field has a column header.
    expect(screen.getByRole("columnheader", { name: /equipment name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /equipment type/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /quantity/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /maintenance status/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /location/i })).toBeInTheDocument();

    // Assert: the record's value for each field is visible, including the quantity (10).
    expect(screen.getByText("Visual")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Storage Room A")).toBeInTheDocument();
  });
});
