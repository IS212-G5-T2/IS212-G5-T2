import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentPage } from "./EquipmentPage";

const { getEquipmentReservations } = vi.hoisted(() => ({ getEquipmentReservations: vi.fn() }));
vi.mock("@/features/equipment/api/equipment-reservations-api", () => ({ getEquipmentReservations }));

describe("EquipmentPage", () => {
  // A block body is required: an arrow that implicitly returns mockReset() (the mock
  // itself) makes Vitest treat the mock as an after-test teardown and call it, which
  // surfaces the rejected-mock case below as an unhandled rejection.
  beforeEach(() => { getEquipmentReservations.mockReset(); });

  /** EQUIP-RESERVE-07-A: Technical Support sees each persisted reservation with its event. */
  it("renders persisted reservations rather than browser-local equipment state", async () => {
    getEquipmentReservations.mockResolvedValue([{
      id: "reservation-1", equipmentName: "Stage lighting", equipmentType: "Lighting", quantity: 4,
      eventId: "event-1", eventName: "Open Day", eventStart: "2030-02-01T09:00:00.000Z",
      eventEnd: "2030-02-01T11:00:00.000Z", status: "Reserved", coordinatorEmail: "coordinator@example.com",
    }]);

    render(<EquipmentPage />);

    const row = await screen.findByRole("row", { name: /Open Day/ });
    expect(within(row).getByText("Stage lighting")).toBeInTheDocument();
    expect(within(row).getByText("Open Day")).toHaveClass("font-bold");
    expect(within(row).getByText("Stage lighting")).toHaveClass("font-bold");
    expect(within(row).getByText("Type: Lighting · Qty: 4")).toBeInTheDocument();
    expect(within(row).getByText("coordinator@example.com")).toBeInTheDocument();
    expect(getEquipmentReservations).toHaveBeenCalledTimes(1);
  });

  /** SPM-58 AC7: all reservations for one event share a row with each equipment type and quantity attached. */
  it("groups multiple equipment items into one event row with their own types and quantities", async () => {
    getEquipmentReservations.mockResolvedValue([
      { id: "reservation-1", equipmentName: "Stage lighting", equipmentType: "Lighting", quantity: 4,
        eventId: "event-1", eventName: "Open Day", eventStart: "2030-02-01T09:00:00.000Z", eventEnd: "2030-02-01T11:00:00.000Z", status: "Reserved" },
      { id: "reservation-2", equipmentName: "Wireless microphones", equipmentType: "Audio", quantity: 6,
        eventId: "event-1", eventName: "Open Day", eventStart: "2030-02-01T09:00:00.000Z", eventEnd: "2030-02-01T11:00:00.000Z", status: "Reserved" },
    ]);

    render(<EquipmentPage />);

    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("Stage lightingType: Lighting · Qty: 4");
    expect(rows[1]).toHaveTextContent("Wireless microphonesType: Audio · Qty: 6");
  });

  /** SPM-58 AC7: event identity, rather than a repeated event name, determines reservation grouping. */
  it("keeps records with identical event names separate when their event IDs differ", async () => {
    getEquipmentReservations.mockResolvedValue([
      { id: "reservation-1", equipmentName: "Projector", equipmentType: "Visual", quantity: 2,
        eventId: "event-1", eventName: "Open Day", eventStart: "2030-02-01T09:00:00.000Z", eventEnd: "2030-02-01T11:00:00.000Z", status: "Reserved" },
      { id: "reservation-2", equipmentName: "Speaker", equipmentType: "Audio", quantity: 3,
        eventId: "event-2", eventName: "Open Day", eventStart: "2030-02-02T09:00:00.000Z", eventEnd: "2030-02-02T11:00:00.000Z", status: "Reserved" },
    ]);

    render(<EquipmentPage />);

    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("ProjectorType: Visual · Qty: 2");
    expect(rows[1]).not.toHaveTextContent("SpeakerType: Audio · Qty: 3");
    expect(rows[2]).toHaveTextContent("SpeakerType: Audio · Qty: 3");
    expect(rows[2]).not.toHaveTextContent("ProjectorType: Visual · Qty: 2");
  });

  /** EQUIP-RESERVE-07-B: a failed reservation lookup is visible rather than misrepresented as empty. */
  it("shows a load failure instead of the empty reservation state", async () => {
    getEquipmentReservations.mockRejectedValue(new Error("offline"));
    render(<EquipmentPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load equipment reservations. Please try again.");
    expect(screen.queryByText("No equipment currently reserved.")).not.toBeInTheDocument();
  });
});
