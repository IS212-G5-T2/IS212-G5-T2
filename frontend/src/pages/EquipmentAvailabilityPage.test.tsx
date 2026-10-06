// SPM-117 "View Equipment Records" (Technical Support Staff). AC1 access, AC2 all
// fields, AC3 search by type/location, AC4 status values. This file also carries
// four pre-existing SPM-111 "Create Equipment Records" tests (EQUIP-CRE-*) that
// already exercised this same page before SPM-117 existed; they are grouped
// separately below and were not re-authored for this story.
//
// Traceability (AC -> test ID):
//   AC1 -> no page-level test here; see App.test.tsx EQUIP-VIEW-04-A/B/D and
//          RouteAccess.test.tsx EQUIP-VIEW-04-E for route-guard coverage, and
//          navConfig.test.ts EQUIP-VIEW-04-C for nav discoverability.
//   AC2 -> EQUIP-VIEW-03-A
//   AC3 -> EQUIP-VIEW-01-A, 01-B, 01-C, 01-D, 01-E, 01-F
//   AC4 -> EQUIP-VIEW-02-A
//
// Assumption index (assumption -> tests relying on it):
//   A1 (two boxes combine with AND, not a single OR box): EQUIP-VIEW-01-D.
//       Confirmed directly by the requester in the story's working session, not
//       an inferred guess left open for a Jira owner to confirm.
//   A2 (matching is case-insensitive and substring, so an exact term is just a
//       special case of a partial term): EQUIP-VIEW-01-A, 01-B.
//   A3 (whitespace-padded terms are trimmed before matching): EQUIP-VIEW-01-E.
//   A4 (exact empty-state wording "No equipment records match your search."
//       distinct from "No equipment records found."): EQUIP-VIEW-01-C.
//   A5 (maintenance status renders as plain text, not a coloured badge):
//       EQUIP-VIEW-02-A.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentAvailabilityPage } from "./EquipmentAvailabilityPage";
import type { EquipmentRecord } from "@/types";

const { getEquipment, navigate } = vi.hoisted(() => ({
  getEquipment: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/utils/equipment-api", () => ({ getEquipment }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

/**
 * Builds one equipment record with sensible, irrelevant-to-most-tests defaults.
 * Callers pass the fields their test's oracle actually depends on; everything
 * else keeps a fixed, readable default so each test stays a short literal diff
 * rather than a full ~9-field object repeated at every call site.
 */
function makeRecord(overrides: Partial<EquipmentRecord> & { id: string }): EquipmentRecord {
  return {
    name: "Conference projector",
    type: "Visual",
    quantity: 10,
    maintenanceStatus: "Active",
    location: "Storage Room A",
    createdAt: "2026-10-03T00:00:00.000Z",
    updatedAt: "2026-10-03T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  getEquipment.mockReset();
  navigate.mockReset();
});

describe("EquipmentAvailabilityPage: inherited SPM-111 coverage", () => {
  // SPM-111 EQUIP-CRE-05-A: inventory displays all persisted details, including location.
  it("EQUIP-CRE-05-A displays the equipment location in the inventory", async () => {
    // Arrange: the Technical Support inventory API returns a named equipment record.
    getEquipment.mockResolvedValue([makeRecord({ id: "equipment-1" })]);

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
});

describe("EquipmentAvailabilityPage: AC3 search by type or location", () => {
  // EQUIP-VIEW-01-A. Assumption A2. Kills: reading the wrong state variable for
  // the type box (e.g. swapped with locationSearch), an OR instead of per-field
  // AND against the other (empty) box, or losing case-insensitivity.
  it("EQUIP-VIEW-01-A searches equipment records by exact or partial equipment type", async () => {
    // Arrange: load records with distinct equipment types and prepare a user interaction.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      makeRecord({ id: "equipment-1", name: "Conference projector", type: "Visual" }),
      makeRecord({ id: "equipment-2", name: "Wireless mic", type: "Audio" }),
      makeRecord({
        id: "equipment-3",
        name: "Folding table",
        type: "Furniture",
        location: "Storage Room B",
      }),
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Conference projector")).toBeInTheDocument();
    const typeSearch = screen.getByRole("searchbox", { name: /search by type/i });

    // Act: search first by the exact type, then by a partial lowercase substring.
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

  // EQUIP-VIEW-01-B. Assumption A2. Kills: reading the wrong state variable for
  // the location box (e.g. swapped with typeSearch), or losing case-insensitivity
  // specifically on the location path (type and location are separate code paths).
  it("EQUIP-VIEW-01-B searches equipment records by exact or partial location", async () => {
    // Arrange: load records in distinct locations and prepare a user interaction.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      makeRecord({ id: "equipment-1", name: "Portable screen", quantity: 3, location: "Storage Room B" }),
      makeRecord({
        id: "equipment-2",
        name: "Mixing console",
        type: "Audio",
        maintenanceStatus: "Under Maintenance",
        location: "Control Room A",
      }),
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Portable screen")).toBeInTheDocument();
    const locationSearch = screen.getByRole("searchbox", { name: /search by location/i });

    // Act: search first by the exact location, then by a partial lowercase substring.
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

  // EQUIP-VIEW-01-C. Assumption A4. Kills: the search-specific empty-state
  // condition always falling back to "No equipment records found.", or firing
  // only when BOTH boxes are non-empty instead of either one. Parametrized over
  // both boxes so a box-specific regression in the condition cannot hide behind
  // the other box still working.
  it.each([
    ["type", /search by type/i],
    ["location", /search by location/i],
  ] as const)(
    "EQUIP-VIEW-01-C shows a distinct message when no equipment matches the search (%s box)",
    async (_boxName, boxLabel) => {
      // Arrange: load a non-empty inventory and prepare a user interaction.
      const user = userEvent.setup();
      getEquipment.mockResolvedValue([makeRecord({ id: "equipment-1" })]);
      render(<EquipmentAvailabilityPage />);
      expect(await screen.findByText("Conference projector")).toBeInTheDocument();

      // Act: in the given box, enter a term that matches no record.
      await user.type(screen.getByRole("searchbox", { name: boxLabel }), "nonexistent");

      // Assert: the search-specific empty state is shown instead of the inventory-empty message.
      expect(
        screen.getByText("No equipment records match your search."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("No equipment records found."),
      ).not.toBeInTheDocument();
    },
  );

  // EQUIP-VIEW-01-D. Assumption A1. Kills: `||` (OR) instead of `&&` (AND) when
  // combining the two filter predicates. Records are chosen so OR and AND give
  // different answers: Screen shares Visual's type but not its location, and
  // Microphone shares its location but not its type, so only AND leaves exactly
  // one record when both boxes are filled.
  it("EQUIP-VIEW-01-D combines the type and location boxes with AND", async () => {
    // Arrange: load records that overlap on type and on location so AND is distinguishable from OR.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      makeRecord({ id: "equipment-1", name: "Projector", quantity: 4, location: "Room A" }),
      makeRecord({ id: "equipment-2", name: "Screen", quantity: 2, location: "Room B" }),
      makeRecord({
        id: "equipment-3",
        name: "Microphone",
        type: "Audio",
        quantity: 8,
        location: "Room A",
      }),
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Projector")).toBeInTheDocument();

    // Act: constrain type to Visual and location to Room A in their respective boxes.
    await user.type(screen.getByRole("searchbox", { name: /search by type/i }), "Visual");
    await user.type(screen.getByRole("searchbox", { name: /search by location/i }), "Room A");

    // Assert: only the record matching BOTH constraints remains; the type-only and location-only matches are hidden.
    expect(screen.getByText("Projector")).toBeInTheDocument();
    expect(screen.queryByText("Screen")).not.toBeInTheDocument();
    expect(screen.queryByText("Microphone")).not.toBeInTheDocument();
  });

  // EQUIP-VIEW-01-E. Assumption A3. Kills: removing `.trim()` from either box's
  // search query before matching. Parametrized over both boxes, since type and
  // location trimming are independent code paths (confirmed by mutation testing:
  // trimming only the type box left the location box's trim mutant alive).
  it.each([
    ["type", /search by type/i, "  Visual  "],
    ["location", /search by location/i, "  Storage Room A  "],
  ] as const)(
    "EQUIP-VIEW-01-E trims whitespace-padded terms in the %s box before matching",
    async (_boxName, boxLabel, paddedTerm) => {
      // Arrange: load a record and prepare a user interaction.
      const user = userEvent.setup();
      getEquipment.mockResolvedValue([makeRecord({ id: "equipment-1" })]);
      render(<EquipmentAvailabilityPage />);
      expect(await screen.findByText("Conference projector")).toBeInTheDocument();

      // Act: surround the otherwise-matching term with leading/trailing spaces.
      await user.type(screen.getByRole("searchbox", { name: boxLabel }), paddedTerm);

      // Assert: the padded term still matches, rather than failing the padded whole-string compare.
      expect(screen.getByText("Conference projector")).toBeInTheDocument();
    },
  );

  // EQUIP-VIEW-01-F. Kills: a stale filtered array not recomputed once the search
  // text returns to empty, or an empty string treated as "match nothing" instead
  // of "no constraint".
  it("EQUIP-VIEW-01-F restores all rows once the search boxes are cleared", async () => {
    // Arrange: load two records of different types and prepare a user interaction.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      makeRecord({ id: "equipment-1" }),
      makeRecord({ id: "equipment-2", name: "Wireless mic", type: "Audio", quantity: 25 }),
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Conference projector")).toBeInTheDocument();
    const typeSearch = screen.getByRole("searchbox", { name: /search by type/i });

    // Act: filter down to one record, then clear the box again.
    await user.type(typeSearch, "Visual");
    expect(screen.queryByText("Wireless mic")).not.toBeInTheDocument();
    await user.clear(typeSearch);

    // Assert: every record is visible again once the filter is removed.
    expect(screen.getByText("Conference projector")).toBeInTheDocument();
    expect(screen.getByText("Wireless mic")).toBeInTheDocument();
  });
});

describe("EquipmentAvailabilityPage: AC4 view each item's status", () => {
  // EQUIP-VIEW-02-A. Assumption A5. Record names are deliberately neutral (no
  // status word in the name itself) so the Active/Retired assertions can only
  // pass via the actual status column, not the name text. Kills: the status
  // column rendering a hard-coded or swapped value, or status leaking in from
  // the name field instead of maintenanceStatus (the original "Active
  // projector"/"Retired lighting rig" names let this bug hide, since the name
  // text itself contained the expected substring).
  it("EQUIP-VIEW-02-A renders Active, Under Maintenance, and Retired statuses", async () => {
    // Arrange: load one equipment record in each supported maintenance status.
    getEquipment.mockResolvedValue([
      makeRecord({ id: "equipment-1", name: "Projector unit A", quantity: 3 }),
      makeRecord({
        id: "equipment-2",
        name: "Microphone unit B",
        type: "Audio",
        quantity: 25,
        maintenanceStatus: "Under Maintenance",
        location: "Workshop",
      }),
      makeRecord({
        id: "equipment-3",
        name: "Lighting rig unit C",
        type: "Lighting",
        quantity: 10,
        maintenanceStatus: "Retired",
        location: "Archive",
      }),
    ]);

    // Act: load the Technical Support equipment inventory.
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Projector unit A")).toBeInTheDocument();

    // Assert: each record row displays its corresponding maintenance status.
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Projector unit A");
    expect(rows[1]).toHaveTextContent("Active");
    expect(rows[2]).toHaveTextContent("Microphone unit B");
    expect(rows[2]).toHaveTextContent("Under Maintenance");
    expect(rows[3]).toHaveTextContent("Lighting rig unit C");
    expect(rows[3]).toHaveTextContent("Retired");
  });
});

describe("EquipmentAvailabilityPage: AC2 see all record fields", () => {
  // EQUIP-VIEW-03-A. Kills: a missing or mislabeled column (most importantly
  // Quantity, which previously had no assertion anywhere in this file), or a
  // field rendered under the wrong header (e.g. id shown instead of quantity).
  it("EQUIP-VIEW-03-A displays all equipment record fields in the inventory", async () => {
    // Arrange: the inventory API returns a single fully-populated record.
    getEquipment.mockResolvedValue([makeRecord({ id: "equipment-1" })]);

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
