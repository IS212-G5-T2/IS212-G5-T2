/*
 * SPM-64 change request API (backend/src/events/change-requests):
 *   POST /events/:id/change-requests                       submit { changes, reason? } → 201 ChangeRequest
 *   GET  /events/:id/change-requests                       the event's requests, newest first
 *   POST /events/:id/change-requests/:requestId/withdraw   withdraw a pending request
 *   GET  /change-requests[?status=Pending]                 the caller's requests (dashboard)
 */
import type { ChangeRequest, ChangeRequestStatus, ChangeRequestSubmission } from "@/types";
import { api } from "@/utils/api";

export function submitChangeRequest(eventId: string, submission: ChangeRequestSubmission) {
  return api<ChangeRequest>(`/events/${eventId}/change-requests`, {
    method: "POST",
    body: JSON.stringify(submission),
  });
}

export function fetchEventChangeRequests(eventId: string) {
  return api<ChangeRequest[]>(`/events/${eventId}/change-requests`);
}

export function withdrawChangeRequest(eventId: string, requestId: string) {
  return api<ChangeRequest>(`/events/${eventId}/change-requests/${requestId}/withdraw`, { method: "POST" });
}

export function fetchMyChangeRequests(status?: ChangeRequestStatus) {
  return api<ChangeRequest[]>(`/change-requests${status ? `?status=${status}` : ""}`);
}
