import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import {
  createEquipment,
  getEquipment,
  getEquipmentLocations,
  updateEquipmentAvailability,
  getEquipmentAuditTrail,
} from "./equipment-api";

vi.mock("@/utils/api", () => ({ api: vi.fn() }));
const apiMock = vi.mocked(api);

beforeEach(() => apiMock.mockReset());

describe("equipment API contracts", () => {
  /**
   * EQUIP-CRE-02-A / EQUIP-CRE-02-B: create submits type, quantity, status, and location unchanged.
   * Confluence: https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/19922946/EQUIP-CRE-02
   */
  it("SPM-111 posts the complete equipment creation payload", () => {
    const input = {
      name: "Conference projector",
      type: "Visual" as const,
      quantity: 10,
      maintenanceStatus: "Active" as const,
      location: "Storage Room A",
    };

    createEquipment(input);

    expect(apiMock).toHaveBeenCalledWith("/equipment", {
      method: "POST",
      body: JSON.stringify(input),
    });
  });

  /**
   * EQUIP-VIEW-02-C: stored locations are read from the dedicated locations endpoint.
   * Confluence: https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/21102712/EQUIP-VIEW-02#C
   */
  it("SPM-117 gets equipment locations from the dedicated endpoint", () => {
    getEquipmentLocations();
    expect(apiMock).toHaveBeenCalledWith("/equipment/locations");
  });

  /**
   * EQUIP-UNAVAIL-04-A / EQUIP-UNAVAIL-04-C: default inventory hides unavailable items; opt-in reveals them.
   * Confluence: https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/21528785/EQUIP-UNAVAIL-04
   */
  it.each([
    [undefined, "/equipment"],
    [{ includeUnavailable: false }, "/equipment"],
    [{ includeUnavailable: true }, "/equipment?includeUnavailable=true"],
  ] as const)("gets equipment for options %j", (options, endpoint) => {
    getEquipment(options);
    expect(apiMock).toHaveBeenCalledWith(endpoint);
  });

  /**
   * EQUIP-UNAVAIL-01-A: marking an available record unavailable submits its ID and reason by PATCH.
   * Confluence: https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/21495947/EQUIP-UNAVAIL-01#A
   */
  it("SPM-119 patches an equipment availability payload", () => {
    const input = { isAvailable: false, reason: "Lens sent for repair" };
    updateEquipmentAvailability("equipment-1", input);
    expect(apiMock).toHaveBeenCalledWith("/equipment/equipment-1/availability", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  });

  /**
   * EQUIP-UNAVAIL-05-A: audit history is retrieved from the shared audit-trail endpoint.
   * Confluence: https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/21037353/EQUIP-UNAVAIL-05#A
   */
  it("SPM-119 gets the shared equipment audit trail", () => {
    getEquipmentAuditTrail();
    expect(apiMock).toHaveBeenCalledWith("/equipment/audit-trail");
  });
});
