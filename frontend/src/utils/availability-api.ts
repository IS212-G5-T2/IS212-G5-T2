import { api } from "./api";

export interface Availability {
  available: boolean;
}

// SPM-80: the signed-in coordinator's own availability for new event assignments.
export function getMyAvailability() {
  return api<Availability>("/coordinators/me/availability");
}

export function saveMyAvailability(available: boolean) {
  return api<Availability>("/coordinators/me/availability", {
    method: "PUT",
    body: JSON.stringify({ available }),
  });
}
