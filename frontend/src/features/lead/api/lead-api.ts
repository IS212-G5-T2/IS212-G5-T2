import { api } from "@/utils/api";

// SPM-123: the Event Coordinator Lead's queue and assignment endpoints;
// SPM-47: the reassignment list and reassign endpoint.
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

export interface AssignedEvent {
  id: string;
  name: string;
  status: string;
  startDateTime: string;
  endDateTime: string;
  coordinatorId: string;
  coordinatorName: string;
  coordinatorAvailable: boolean;
}

export function getAssignedEvents() {
  return api<AssignedEvent[]>("/lead/assigned");
}

// Sends the coordinator the page showed, so the server can refuse a stale page.
export function reassignEvent(eventId: string, coordinatorId: string, currentCoordinatorId: string) {
  return api<{ message: string }>(`/lead/events/${eventId}/reassign`, {
    method: "POST",
    body: JSON.stringify({ coordinatorId, currentCoordinatorId }),
  });
}
