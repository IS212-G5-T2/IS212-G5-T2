import { api } from "@/utils/api";

export type EquipmentReservation = {
  id: string;
  eventId: string;
  eventName: string;
  eventStart: string;
  eventEnd: string;
  equipmentName: string;
  equipmentType: string;
  quantity: number;
  status: string;
  coordinatorEmail: string;
};

/** SPM-58 AC7: reads persisted Reserved equipment with its owning event. */
export function getEquipmentReservations(): Promise<EquipmentReservation[]> {
  return api<EquipmentReservation[]>("/equipment/requests/reservations");
}
