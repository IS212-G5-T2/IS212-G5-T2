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

vi.mock("@/utils/equipment-api", () => ({ getEquipmentAuditTrail }));

function makeEntry(
  overrides: Partial<EquipmentAuditEntry> & { id: string },
): EquipmentAuditEntry {
  return {
    equipmentId: "equipment-119",
    equipmentName: "Light bulbs",
    equipmentType: "Lighting",
    location: "Tampines",
    maintenanceStatus: "Active",
    quantity: 50,
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
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("Marked unavailable")).toBeInTheDocument();
    expect(screen.getByText("Under repair")).toBeInTheDocument();
    expect(screen.getByText("techsupport1@connectsphere.com")).toBeInTheDocument();
  });

  // EQUIP-UNAVAIL-05-B: a reactivation is visibly distinct from marking unavailable.
  it("EQUIP-UNAVAIL-05-B displays a Reactivated entry with no unavailability reason", async () => {
    // Arrange: the API returns a later reactivation entry for the same equipment.
    getEquipmentAuditTrail.mockResolvedValue([
      makeEntry({
        id: "audit-05-b",
        equipmentName: "Broken projector",
        changeType: "Reactivated",
        reason: null,
      }),
    ]);

    // Act: open the Audit Trail page.
    render(<AuditTrailPage />);

    // Assert: the event label and intentionally absent reason are both rendered.
    expect(await screen.findByText("Broken projector")).toBeInTheDocument();
    expect(screen.getByText("Reactivated")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  // EQUIP-UNAVAIL-05-C: entries from different Technical Support users remain visible together.
  it("EQUIP-UNAVAIL-05-C displays audit entries created by different technicians", async () => {
    // Arrange: the API returns shared history containing two distinct actors.
    getEquipmentAuditTrail.mockResolvedValue([
      makeEntry({ id: "audit-author", changedBy: "techsupport1@connectsphere.com" }),
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
    expect(await screen.findByText("techsupport1@connectsphere.com")).toBeInTheDocument();
    expect(screen.getByText("techsupport2@connectsphere.com")).toBeInTheDocument();
    expect(screen.getByText("Shared projector")).toBeInTheDocument();
  });
});
