import { api } from "./api";

// SPM-123: the Event Coordinator Lead's queue and assignment endpoints.
export interface QueuedRequest {
  id: string;
  name: string;
  purpose: string;
  startDateTime: string;
  endDateTime: string;
  expectedAttendance: number;
  submittedAt: string;
}

export interface LeadCoordinator {
  id: string;
  name: string;
  available: boolean;
  activeAssignments: number;
}

export function getLeadQueue() {
  return api<QueuedRequest[]>("/lead/queue");
}

export function getLeadCoordinators() {
  return api<LeadCoordinator[]>("/lead/coordinators");
}

export function assignRequest(eventId: string, coordinatorId: string) {
  return api<{ message: string }>(`/lead/queue/${eventId}/assign`, {
    method: "POST",
    body: JSON.stringify({ coordinatorId }),
  });
}
