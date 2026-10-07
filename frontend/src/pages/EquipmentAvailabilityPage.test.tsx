// SPM-117 "View Equipment Records" (Technical Support Staff). AC1 access, AC2 all
// fields, AC3 search by type/location, AC4 status values. This file also carries
// four pre-existing SPM-111 "Create Equipment Records" tests (EQUIP-CRE-*) that
// already exercised this same page before SPM-117 existed; they are grouped
// separately below and were not re-authored for this story.
//
// Traceability (AC -> test ID). This map lists every test ID for the AC, even
// when the test itself lives in another file (e.g. backend specs); keep it in
// sync whenever a test is added anywhere in the AC1-AC4 surface, not just here.
//   AC1 -> no page-level test here; see App.test.tsx EQUIP-VIEW-01-A/B/D,
//          RouteAccess.test.tsx EQUIP-VIEW-01-E, navConfig.test.ts
//          EQUIP-VIEW-01-C, and equipment.e2e-spec.ts EQUIP-VIEW-01-F
//          (backend) for route-guard, nav, and HTTP-boundary coverage.
//   AC2 -> EQUIP-VIEW-02-A
//   AC3 -> EQUIP-VIEW-03-A, 03-B, 03-C, 03-D, 03-E, 03-F, 03-G, 03-H
//   AC4 -> EQUIP-VIEW-04-A (page); equipment.service.spec.ts EQUIP-VIEW-04-B
//          and equipment.e2e-spec.ts EQUIP-VIEW-04-C (backend)
//
// Assumption index (assumption -> tests relying on it):
//   A1 (two boxes combine with AND, not a single OR box): EQUIP-VIEW-03-D.
//       Confirmed directly by the requester in the story's working session, not
//       an inferred guess left open for a Jira owner to confirm.
//   A2 (matching is case-insensitive and substring, so an exact term is just a
//       special case of a partial term): EQUIP-VIEW-03-A, 03-B.
//   A3 (whitespace-padded terms are trimmed before matching): EQUIP-VIEW-03-E.
//   A4 (exact empty-state wording "No equipment records match your search."
//       distinct from "No equipment records found."): EQUIP-VIEW-03-C.
//   A5 (maintenance status renders as plain text, not a coloured badge):
//       EQUIP-VIEW-04-A.
//   A6 (each box matches only its own field: type box never reads name or
//       location, location box never reads name or type): EQUIP-VIEW-03-G, 03-H.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentAvailabilityPage } from "./EquipmentAvailabilityPage";
import type { EquipmentRecord } from "@/types";

const { getEquipment, updateEquipmentAvailability, navigate } = vi.hoisted(
  () => ({
    getEquipment: vi.fn(),
    updateEquipmentAvailability: vi.fn(),
    navigate: vi.fn(),
  }),
);

vi.mock("@/utils/equipment-api", () => ({
  getEquipment,
  updateEquipmentAvailability,
}));
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
  updateEquipmentAvailability.mockReset();
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
  // EQUIP-VIEW-03-A. Assumption A2. Kills: reading the wrong state variable for
  // the type box (e.g. swapped with locationSearch), an OR instead of per-field
  // AND against the other (empty) box, or losing case-insensitivity.
  it("EQUIP-VIEW-03-A searches equipment records by exact or partial equipment type", async () => {
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

  // EQUIP-VIEW-03-B. Assumption A2. Kills: reading the wrong state variable for
  // the location box (e.g. swapped with typeSearch), or losing case-insensitivity
  // specifically on the location path (type and location are separate code paths).
  it("EQUIP-VIEW-03-B searches equipment records by exact or partial location", async () => {
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

  // EQUIP-VIEW-03-C. Assumption A4. Kills: the search-specific empty-state
  // condition always falling back to "No equipment records found.", or firing
  // only when BOTH boxes are non-empty instead of either one. Parametrized over
  // both boxes so a box-specific regression in the condition cannot hide behind
  // the other box still working.
  it.each([
    ["type", /search by type/i],
    ["location", /search by location/i],
  ] as const)(
    "EQUIP-VIEW-03-C shows a distinct message when no equipment matches the search (%s box)",
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

  // EQUIP-VIEW-03-D. Assumption A1. Kills: `||` (OR) instead of `&&` (AND) when
  // combining the two filter predicates. Records are chosen so OR and AND give
  // different answers: Screen shares Visual's type but not its location, and
  // Microphone shares its location but not its type, so only AND leaves exactly
  // one record when both boxes are filled.
  it("EQUIP-VIEW-03-D combines the type and location boxes with AND", async () => {
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

  // EQUIP-VIEW-03-E. Assumption A3. Kills: removing `.trim()` from either box's
  // search query before matching. Parametrized over both boxes, since type and
  // location trimming are independent code paths (confirmed by mutation testing:
  // trimming only the type box left the location box's trim mutant alive).
  it.each([
    ["type", /search by type/i, "  Visual  "],
    ["location", /search by location/i, "  Storage Room A  "],
  ] as const)(
    "EQUIP-VIEW-03-E trims whitespace-padded terms in the %s box before matching",
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

  // EQUIP-VIEW-03-F. Kills: a stale filtered array not recomputed once the search
  // text returns to empty, or an empty string treated as "match nothing" instead
  // of "no constraint". Parametrized over both boxes: each is independent state,
  // so clearing one box correctly is not evidence the other box clears correctly.
  it.each([
    ["type", /search by type/i, "Visual"],
    ["location", /search by location/i, "Storage Room A"],
  ] as const)(
    "EQUIP-VIEW-03-F restores all rows once the %s box is cleared",
    async (_boxName, boxLabel, matchingTerm) => {
      // Arrange: load two records that differ in both type and location, and prepare a user interaction.
      const user = userEvent.setup();
      getEquipment.mockResolvedValue([
        makeRecord({ id: "equipment-1" }),
        makeRecord({
          id: "equipment-2",
          name: "Wireless mic",
          type: "Audio",
          quantity: 25,
          location: "Control Room B",
        }),
      ]);
      render(<EquipmentAvailabilityPage />);
      expect(await screen.findByText("Conference projector")).toBeInTheDocument();
      const search = screen.getByRole("searchbox", { name: boxLabel });

      // Act: filter down to one record, then clear the box again.
      await user.type(search, matchingTerm);
      expect(screen.queryByText("Wireless mic")).not.toBeInTheDocument();
      await user.clear(search);

      // Assert: every record is visible again once the filter is removed.
      expect(screen.getByText("Conference projector")).toBeInTheDocument();
      expect(screen.getByText("Wireless mic")).toBeInTheDocument();
    },
  );

  // EQUIP-VIEW-03-G. Assumption A6. Kills: the type box's filter predicate also
  // checking record.name or record.location (e.g. a copy-paste that ORs in an
  // extra field). "Visual Display Case" and "Visual Suite" are decoys whose name
  // and location (not type) contain the search term "Visual"; only the record
  // whose actual TYPE is Visual should remain.
  it("EQUIP-VIEW-03-G searches the type box by type only, not by name or location", async () => {
    // Arrange: a genuine type match plus a name-decoy and a location-decoy, neither of which is actually Visual-typed.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      makeRecord({ id: "equipment-1", name: "Conference projector", type: "Visual" }),
      makeRecord({
        id: "equipment-2",
        name: "Visual Display Case",
        type: "Audio",
        location: "Storage Room B",
      }),
      makeRecord({
        id: "equipment-3",
        name: "Mixer",
        type: "Audio",
        location: "Visual Suite",
      }),
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Conference projector")).toBeInTheDocument();

    // Act: search the type box for a term that coincides with decoys' name/location.
    await user.type(screen.getByRole("searchbox", { name: /search by type/i }), "Visual");

    // Assert: only the genuinely Visual-typed record remains.
    expect(screen.getByText("Conference projector")).toBeInTheDocument();
    expect(screen.queryByText("Visual Display Case")).not.toBeInTheDocument();
    expect(screen.queryByText("Mixer")).not.toBeInTheDocument();
  });

  // EQUIP-VIEW-03-H. Assumption A6. Kills: the location box's filter predicate
  // also checking record.name or record.type. "Mixer" has TYPE "Visual" (a
  // valid enum value) but a different location; "Visual Suite Case" has a NAME
  // containing the search term but a different actual location. Only the record
  // whose actual LOCATION contains "Visual" should remain.
  it("EQUIP-VIEW-03-H searches the location box by location only, not by name or type", async () => {
    // Arrange: a genuine location match plus a type-decoy and a name-decoy, neither of which is actually at that location.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      makeRecord({ id: "equipment-1", name: "Projector", type: "Audio", location: "Visual Suite" }),
      makeRecord({ id: "equipment-2", name: "Mixer", type: "Visual", location: "Workshop" }),
      makeRecord({
        id: "equipment-3",
        name: "Visual Suite Case",
        type: "Furniture",
        location: "Workshop",
      }),
    ]);
    render(<EquipmentAvailabilityPage />);
    expect(await screen.findByText("Projector")).toBeInTheDocument();

    // Act: search the location box for a term that coincides with decoys' type/name.
    await user.type(screen.getByRole("searchbox", { name: /search by location/i }), "Visual");

    // Assert: only the record genuinely located at "Visual Suite" remains.
    expect(screen.getByText("Projector")).toBeInTheDocument();
    expect(screen.queryByText("Mixer")).not.toBeInTheDocument();
    expect(screen.queryByText("Visual Suite Case")).not.toBeInTheDocument();
  });
});

describe("EquipmentAvailabilityPage: AC4 view each item's status", () => {
  // EQUIP-VIEW-04-A. Assumption A5. Record names are deliberately neutral (no
  // status word in the name itself) so the Active/Retired assertions can only
  // pass via the actual status column, not the name text. Kills: the status
  // column rendering a hard-coded or swapped value, or status leaking in from
  // the name field instead of maintenanceStatus (the original "Active
  // projector"/"Retired lighting rig" names let this bug hide, since the name
  // text itself contained the expected substring).
  it("EQUIP-VIEW-04-A renders Active, Under Maintenance, and Retired statuses", async () => {
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
  // EQUIP-VIEW-02-A. Kills: a missing or mislabeled column (most importantly
  // Quantity, which previously had no assertion anywhere in this file), or a
  // field rendered under the wrong header (e.g. id shown instead of quantity).
  it("EQUIP-VIEW-02-A displays all equipment record fields in the inventory", async () => {
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

/*
 * SPM-119 Mark Equipment as Unavailable — RED component tests.
 * Covers: AC1–AC4 and AC6.
 * Test cases: EQUIP-UNAVAIL-01-A, 01-B, 02-A, 02-B, 03-A, 04-A, 04-B, 04-C, 06-A, 06-B.
 * The literals below are the approved Confluence test-case oracles. This file
 * intentionally fails until the SPM-119 availability UI and API client exist.
 */
type AvailabilityRecord = EquipmentRecord & { isAvailable: boolean };
function availableRecord(
  overrides: Partial<AvailabilityRecord> & { id: string },
): AvailabilityRecord {
  return { ...makeRecord(overrides), isAvailable: true, ...overrides };
}

describe("SPM-119 EquipmentAvailabilityPage", () => {
  // EQUIP-UNAVAIL-01-B: an available row exposes only the unavailable action.
  it("EQUIP-UNAVAIL-01-B renders Mark unavailable only for an available row", async () => {
    // Arrange: the opt-in availability list contains one row in each state.
    getEquipment.mockResolvedValue([
      availableRecord({ id: "available-light", name: "Light bulbs" }),
      availableRecord({
        id: "unavailable-projector",
        name: "Broken projector",
        isAvailable: false,
      }),
    ]);

    // Act: reveal unavailable records.
    const user = userEvent.setup();
    render(<EquipmentAvailabilityPage />);
    await user.click(
      await screen.findByRole("checkbox", { name: /show unavailable/i }),
    );

    // Assert: the available row has its permitted action and no reactivation action.
    const availableRow = screen.getByText("Light bulbs").closest("tr");
    const unavailableRow = screen.getByText("Broken projector").closest("tr");
    expect(availableRow).toHaveTextContent("Mark unavailable");
    expect(availableRow).not.toHaveTextContent("Reactivate");
    expect(unavailableRow).toBeInTheDocument();
  });

  // EQUIP-UNAVAIL-06-B: an unavailable row exposes only the reactivation action.
  it("EQUIP-UNAVAIL-06-B renders Reactivate only for an unavailable row", async () => {
    // Arrange: the opt-in list contains an unavailable equipment row.
    getEquipment.mockResolvedValue([availableRecord({ id: "broken-projector", name: "Broken projector", isAvailable: false })]);

    // Act: reveal unavailable equipment.
    const user = userEvent.setup();
    render(<EquipmentAvailabilityPage />);
    await user.click(await screen.findByRole("checkbox", { name: /show unavailable/i }));

    // Assert: the unavailable row shows only Reactivate.
    const unavailableRow = screen.getByText("Broken projector").closest("tr");
    expect(unavailableRow).toHaveTextContent("Reactivate");
    expect(unavailableRow).not.toHaveTextContent("Mark unavailable");
  });

  // EQUIP-UNAVAIL-01-A: confirmation changes an available row and removes it from the default list.
  it("EQUIP-UNAVAIL-01-A marks Light bulbs unavailable after confirmation", async () => {
    // Arrange: an available Light bulbs record can be changed successfully.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      availableRecord({
        id: "light-bulbs",
        name: "Light bulbs",
        type: "Lighting",
        location: "Tampines",
      }),
    ]);
    updateEquipmentAvailability.mockResolvedValue({
      equipment: availableRecord({
        id: "light-bulbs",
        name: "Light bulbs",
        isAvailable: false,
      }),
    });
    render(<EquipmentAvailabilityPage />);

    // Act: open the confirmation dialog and provide the specified reason.
    await user.click(
      await screen.findByRole("button", { name: /mark unavailable/i }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /reason/i }),
      "Damaged during transport",
    );
    await user.click(
      screen.getByRole("button", { name: /^mark unavailable$/i }),
    );

    // Assert: the API receives the literal payload and the default list no longer contains the record.
    expect(updateEquipmentAvailability).toHaveBeenCalledWith("light-bulbs", {
      isAvailable: false,
      reason: "Damaged during transport",
    });
    expect(screen.queryByText("Light bulbs")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Equipment marked unavailable.",
    );
  });

  // EQUIP-UNAVAIL-02-A: the dialog passes the supplied reason through unchanged.
  it("EQUIP-UNAVAIL-02-A submits the specified unavailability reason", async () => {
    // Arrange: an available projector is ready for a valid reason.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      availableRecord({ id: "projector", name: "Projector" }),
    ]);
    updateEquipmentAvailability.mockResolvedValue({
      equipment: availableRecord({
        id: "projector",
        name: "Projector",
        isAvailable: false,
      }),
    });
    render(<EquipmentAvailabilityPage />);

    // Act: submit the exact reason from the Confluence case.
    await user.click(
      await screen.findByRole("button", { name: /mark unavailable/i }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /reason/i }),
      "Broken lens, sent for repair",
    );
    await user.click(
      screen.getByRole("button", { name: /^mark unavailable$/i }),
    );

    // Assert: the API contract preserves the literal reason text.
    expect(updateEquipmentAvailability).toHaveBeenCalledWith("projector", {
      isAvailable: false,
      reason: "Broken lens, sent for repair",
    });
  });

  // EQUIP-UNAVAIL-02-B: the client stops empty and whitespace-only reasons before making an API call.
  it.each(["", "   "])(
    "EQUIP-UNAVAIL-02-B shows the exact validation error for a %j reason and does not submit",
    async (reason) => {
      // Arrange: an available record is selected for an invalid submission.
      const user = userEvent.setup();
      getEquipment.mockResolvedValue([
        availableRecord({ id: "light-bulbs", name: "Light bulbs" }),
      ]);
      render(<EquipmentAvailabilityPage />);
      await user.click(
        await screen.findByRole("button", { name: /mark unavailable/i }),
      );
      if (reason)
        await user.type(
          screen.getByRole("textbox", { name: /reason/i }),
          reason,
        );

      // Act: confirm without a substantive reason.
      await user.click(
        screen.getByRole("button", { name: /^mark unavailable$/i }),
      );

      // Assert: the defined client-side message appears and persistence is untouched.
      expect(screen.getByText("Enter a reason first")).toBeInTheDocument();
      expect(updateEquipmentAvailability).not.toHaveBeenCalled();
    },
  );

  // EQUIP-UNAVAIL-03-A: cancellation is a pure UI operation and discards its draft input.
  it("EQUIP-UNAVAIL-03-A closes Cancel without an API call and reopens with an empty reason", async () => {
    // Arrange: an operator has typed but not confirmed an unavailability reason.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      availableRecord({ id: "light-bulbs", name: "Light bulbs" }),
    ]);
    render(<EquipmentAvailabilityPage />);
    await user.click(
      await screen.findByRole("button", { name: /mark unavailable/i }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /reason/i }),
      "Damaged",
    );

    // Act: cancel then reopen the dialog.
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByRole("button", { name: /mark unavailable/i }));

    // Assert: nothing was persisted, the record remains visible, and the draft is cleared.
    expect(updateEquipmentAvailability).not.toHaveBeenCalled();
    expect(screen.getByText("Light bulbs")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /reason/i })).toHaveValue("");
  });

  // EQUIP-UNAVAIL-04-A: default discovery excludes unavailable equipment.
  it("EQUIP-UNAVAIL-04-A hides unavailable equipment from the default list", async () => {
    // Arrange: the inventory contains one record in each availability state.
    getEquipment.mockResolvedValue([
      availableRecord({ id: "light-bulbs", name: "Light bulbs" }),
      availableRecord({ id: "broken-projector", name: "Broken projector", isAvailable: false }),
    ]);

    // Act: load the page without changing its default toggle state.
    render(<EquipmentAvailabilityPage />);

    // Assert: only available equipment is initially discoverable.
    expect(await screen.findByText("Light bulbs")).toBeInTheDocument();
    expect(screen.queryByText("Broken projector")).not.toBeInTheDocument();
  });

  // EQUIP-UNAVAIL-04-B: a matching type filter cannot reveal an unavailable result.
  it("EQUIP-UNAVAIL-04-B excludes unavailable Visual equipment from type-search results", async () => {
    // Arrange: an available record and unavailable decoy share the Visual type.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      availableRecord({ id: "harini", name: "Harini", type: "Visual", location: "Tampines" }),
      availableRecord({ id: "broken-projector", name: "Broken projector", type: "Visual", location: "Tampines", isAvailable: false }),
    ]);
    render(<EquipmentAvailabilityPage />);

    // Act: filter by the shared type.
    await user.type(await screen.findByRole("searchbox", { name: /search by type/i }), "Visual");

    // Assert: only the available matching record remains visible.
    expect(screen.getByText("Harini")).toBeInTheDocument();
    expect(screen.queryByText("Broken projector")).not.toBeInTheDocument();
  });

  // EQUIP-UNAVAIL-04-C: explicit opt-in reveals unavailable rows with their distinct state affordances.
  it("EQUIP-UNAVAIL-04-C reveals unavailable equipment with Show unavailable", async () => {
    // Arrange: a real Visual match and an unavailable Visual decoy share the same location.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      availableRecord({
        id: "harini",
        name: "Harini",
        type: "Visual",
        location: "Tampines",
      }),
      availableRecord({
        id: "broken-projector",
        name: "Broken projector",
        type: "Visual",
        location: "Tampines",
        isAvailable: false,
      }),
    ]);
    render(<EquipmentAvailabilityPage />);
    // Act: turn on the unavailable opt-in.
    await user.click(
      screen.getByRole("checkbox", { name: /show unavailable/i }),
    );

    // Assert: the previously excluded row returns as a clearly unavailable, reactivateable row.
    const unavailableRow = screen.getByText("Broken projector").closest("tr");
    expect(unavailableRow).toHaveTextContent("No");
    expect(unavailableRow).toHaveTextContent("Reactivate");
    expect(unavailableRow).toHaveClass(/opacity-/);
    expect(getEquipment).toHaveBeenLastCalledWith({ includeUnavailable: true });
  });

  // EQUIP-UNAVAIL-06-A: reactivation returns the record to the default list and swaps its action.
  it("EQUIP-UNAVAIL-06-A reactivates Broken projector and restores Mark unavailable", async () => {
    // Arrange: the unavailable record is visible only through the opt-in toggle.
    const user = userEvent.setup();
    getEquipment.mockResolvedValue([
      availableRecord({
        id: "broken-projector",
        name: "Broken projector",
        isAvailable: false,
      }),
    ]);
    updateEquipmentAvailability.mockResolvedValue({
      equipment: availableRecord({
        id: "broken-projector",
        name: "Broken projector",
        isAvailable: true,
      }),
    });
    render(<EquipmentAvailabilityPage />);
    await user.click(
      await screen.findByRole("checkbox", { name: /show unavailable/i }),
    );

    // Act: confirm reactivation.
    await user.click(screen.getByRole("button", { name: /reactivate/i }));
    await user.click(screen.getByRole("button", { name: /^reactivate$/i }));

    // Assert: the resulting availability state makes it a normal default-list row again.
    expect(updateEquipmentAvailability).toHaveBeenCalledWith(
      "broken-projector",
      { isAvailable: true },
    );
    expect(
      screen.getByText("Broken projector").closest("tr"),
    ).toHaveTextContent("Mark unavailable");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Equipment reactivated.",
    );
  });
});
