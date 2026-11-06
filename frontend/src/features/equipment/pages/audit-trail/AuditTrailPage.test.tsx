/*
 * Story: SPM-119 Mark Equipment as Unavailable
 * ACs: AC5, AC7
 * Test cases: EQUIP-UNAVAIL-05-A, EQUIP-UNAVAIL-05-B, EQUIP-UNAVAIL-05-C
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditTrailPage } from "./AuditTrailPage";
import type { EquipmentAuditEntry } from "@/types";

const { getEquipmentAuditTrail } = vi.hoisted(() => ({
  getEquipmentAuditTrail: vi.fn(),
}));

vi.mock("@/features/equipment/api/equipment-api", () => ({ getEquipmentAuditTrail }));

function makeEntry(
  overrides: Partial<EquipmentAuditEntry> & { id: string },
): EquipmentAuditEntry {
  return {
    equipmentId: "equipment-119",
    equipmentName: "Light bulbs",
    equipmentType: "Lighting",
    location: "Tampines",
    maintenanceStatus: "Active",
    activeQuantity: 10,
    underMaintenanceQuantity: 30,
    retiredQuantity: 10,
    quantity: 50,
    isAvailable: false,
    changeType: "Marked unavailable",
    reason: "Under repair",
    changedBy: "techsupport1@connectsphere.com",
    timestamp: "2026-10-07T08:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  getEquipmentAuditTrail.mockReset();
});

describe("AuditTrailPage: SPM-119 availability history", () => {
  /** EQUIP-UPDATE-06-A / EQUIP-AVAIL-08-B: equipment edits appear in shared history with all three quantity buckets and the derived total. */
  it("EQUIP-UPDATE-06-A displays equipment detail updates in the shared history", async () => {
    getEquipmentAuditTrail.mockResolvedValue([
      makeEntry({
        id: "audit-spm118",
        equipmentName: "Updated projector",
        equipmentType: "Visual",
        location: "Main Hall",
        maintenanceStatus: "Under Maintenance",
        activeQuantity: 0,
        underMaintenanceQuantity: 7,
        retiredQuantity: 0,
        quantity: 7,
        isAvailable: true,
        changeType: "Equipment record updated",
        changedBy: "support@example.test",
        reason: 'Updated fields: Equipment name, Quantity available.',
      }),
    ]);

    render(<AuditTrailPage />);

    expect(await screen.findByText("Updated projector")).toBeInTheDocument();
    expect(screen.getByText("Visual")).toBeInTheDocument();
    expect(screen.getByText("Main Hall")).toBeInTheDocument();
    expect(screen.getByText("Under Maintenance", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("Total: 7")).toBeInTheDocument();
    expect(screen.getByText("Active: 0")).toBeInTheDocument();
    expect(screen.getByText("Under Maintenance: 7")).toBeInTheDocument();
    expect(screen.getByText("Retired: 0")).toBeInTheDocument();
    expect(screen.getByText("Total: 7")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Equipment record updated")).toBeInTheDocument();
    expect(
      screen.getByText("Updated fields: Equipment name, Quantity available."),
    ).toBeInTheDocument();
    expect(screen.getByText("support@example.test")).toBeInTheDocument();
    expect(screen.getByText("History of all equipment changes.")).toBeInTheDocument();
  });

  // EQUIP-AVAIL-08-B: an edited equipment record retains all quantity buckets in its audit snapshot.
  it("EQUIP-AVAIL-08-B displays each quantity bucket and the derived total in the audit snapshot", async () => {
    getEquipmentAuditTrail.mockResolvedValue([
      makeEntry({
        id: "audit-ac8-edit",
        equipmentName: "Lighting",
        activeQuantity: 10,
        underMaintenanceQuantity: 30,
        retiredQuantity: 10,
        quantity: 50,
        changeType: "Equipment record updated",
      }),
    ]);

    render(<AuditTrailPage />);

    expect((await screen.findAllByText("Lighting")).length).toBeGreaterThan(0);
    expect(screen.getByText("Active: 10")).toBeInTheDocument();
    expect(screen.getByText("Under Maintenance: 30")).toBeInTheDocument();
    expect(screen.getByText("Retired: 10")).toBeInTheDocument();
    expect(screen.getByText("Total: 50")).toBeInTheDocument();
  });

  // EQUIP-UNAVAIL-05-A: the page renders every persisted mark-unavailable snapshot field.
  it("EQUIP-UNAVAIL-05-A displays the full Marked unavailable audit snapshot", async () => {
    // Arrange: the shared audit API returns the exact case entry.
    getEquipmentAuditTrail.mockResolvedValue([makeEntry({ id: "audit-05-a" })]);

    // Act: open the Audit Trail page.
    render(<AuditTrailPage />);

    // Assert: each required audit value is visible to Technical Support staff.
    expect(await screen.findByText("Light bulbs")).toBeInTheDocument();
    expect(screen.getByText("Lighting")).toBeInTheDocument();
    expect(screen.getByText("Tampines")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Total: 50")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Marked unavailable")).toBeInTheDocument();
    expect(screen.getByText("Under repair")).toBeInTheDocument();
    expect(
      screen.getByText("techsupport1@connectsphere.com"),
    ).toBeInTheDocument();
  });

  // EQUIP-UNAVAIL-05-B: a reactivation is visibly distinct from marking unavailable.
  it("EQUIP-UNAVAIL-05-B displays a Reactivated entry with no unavailability reason", async () => {
    // Arrange: the API returns a later reactivation entry for the same equipment.
    getEquipmentAuditTrail.mockResolvedValue([
      makeEntry({
        id: "audit-05-b",
        equipmentName: "Broken projector",
        changeType: "Reactivated",
        isAvailable: true,
        reason: null,
      }),
    ]);

    // Act: open the Audit Trail page.
    render(<AuditTrailPage />);

    // Assert: the event label and intentionally absent reason are both rendered.
    expect(await screen.findByText("Broken projector")).toBeInTheDocument();
    expect(screen.getByText("Reactivated")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  // EQUIP-UNAVAIL-05-C: entries from different Technical Support users remain visible together.
  it("EQUIP-UNAVAIL-05-C displays audit entries created by different technicians", async () => {
    // Arrange: the API returns shared history containing two distinct actors.
    getEquipmentAuditTrail.mockResolvedValue([
      makeEntry({
        id: "audit-author",
        changedBy: "techsupport1@connectsphere.com",
      }),
      makeEntry({
        id: "audit-reader",
        equipmentId: "equipment-120",
        equipmentName: "Shared projector",
        changedBy: "techsupport2@connectsphere.com",
      }),
    ]);

    // Act: open the Audit Trail page as a Technical Support user.
    render(<AuditTrailPage />);

    // Assert: no client-side actor filter hides another technician's history.
    expect(
      await screen.findByText("techsupport1@connectsphere.com"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("techsupport2@connectsphere.com"),
    ).toBeInTheDocument();
    expect(screen.getByText("Shared projector")).toBeInTheDocument();
  });

  /**
   * EQUIP-UNAVAIL-05-D: an audit-trail load failure is announced and no table is shown.
   */
  it("SPM-119 AC5 displays the audit-trail load error", async () => {
    getEquipmentAuditTrail.mockRejectedValue(new Error("network unavailable"));

    render(<AuditTrailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load the audit trail. Please try again.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
