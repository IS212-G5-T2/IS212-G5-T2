/*
 * SPM-64 change request API (backend/src/events/change-requests):
 *   POST /events/:id/change-requests                       submit { changes, reason? } → 201 ChangeRequest
 *   GET  /events/:id/change-requests                       the event's requests, newest first
 *   POST /events/:id/change-requests/:requestId/withdraw   withdraw a pending request
 *   GET  /change-requests[?status=Pending]                 the caller's requests (dashboard)
 * SPM-65 review (assigned coordinator):
 *   GET  /events/:id/change-requests/:requestId/conflicts  read-only conflict preview
 *   POST /events/:id/change-requests/:requestId/approve    apply the change
 *   POST /events/:id/change-requests/:requestId/deny       { reason } (10-500 characters)
 *   POST /events/:id/change-requests/:requestId/recheck/:itemId  mark an arrangement re-checked
 *   GET  /events/:id/change-requests/audit                 audit log (owner and assigned coordinator)
 * SPM-64 AC3 notices (coordinator_change_request) are read through /notifications: the coordinator's
 * pending list tags requests with an unread notice as New, and opening the review marks them read.
 */
import type {
  ChangeRequest,
  ChangeRequestApproval,
  ChangeRequestAuditEntry,
  ChangeRequestConflicts,
  ChangeRequestStatus,
  ChangeRequestSubmission,
  Notification,
} from "@/types";
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

const requestPath = (eventId: string, requestId: string) => `/events/${eventId}/change-requests/${requestId}`;

export function previewChangeRequestConflicts(eventId: string, requestId: string) {
  return api<ChangeRequestConflicts>(`${requestPath(eventId, requestId)}/conflicts`);
}

export function approveChangeRequest(eventId: string, requestId: string) {
  return api<ChangeRequestApproval>(`${requestPath(eventId, requestId)}/approve`, { method: "POST", body: "{}" });
}

export function denyChangeRequest(eventId: string, requestId: string, reason: string) {
  return api<{ request: ChangeRequest }>(`${requestPath(eventId, requestId)}/deny`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function markArrangementRechecked(eventId: string, requestId: string, itemId: string) {
  return api<ChangeRequest>(`${requestPath(eventId, requestId)}/recheck/${itemId}`, { method: "POST" });
}

export function fetchChangeRequestAudit(eventId: string) {
  return api<ChangeRequestAuditEntry[]>(`/events/${eventId}/change-requests/audit`);
}

const isUnreadChangeRequestNotice = (notification: Notification) =>
  notification.type === "coordinator_change_request" && !notification.read && Boolean(notification.relatedEventId);

/** SPM-64 AC3 / SPM-65 AC1: events with a change request the coordinator has not opened yet. */
export async function fetchNewChangeRequestEventIds(): Promise<Set<string>> {
  const notices = await api<Notification[]>("/notifications");
  return new Set(notices.filter(isUnreadChangeRequestNotice).map((notice) => notice.relatedEventId!));
}

/** Opening the review marks the event's change request notices read, so the request is no longer New. */
export async function markChangeRequestNoticesRead(eventId: string): Promise<void> {
  const notices = await api<Notification[]>("/notifications");
  await Promise.all(
    notices
      .filter((notice) => isUnreadChangeRequestNotice(notice) && notice.relatedEventId === eventId)
      .map((notice) => api(`/notifications/${notice.id}/read`, { method: "POST" })),
  );
}
