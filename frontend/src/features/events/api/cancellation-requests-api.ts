/*
 * SPM-155 cancellation request API (backend/src/events/cancellation-requests):
 *   POST /events/:id/cancellation-requests         the submitting Organiser files { reason? } -> 201
 *   GET  /events/:id/cancellation-requests         owner or assigned Coordinator, newest first
 *   GET  /cancellation-requests                    the caller's latest request per event (list indicator)
 *   POST /cancellation-requests/:id/decision       assigned Coordinator { decision: accept | decline }
 * Accepting is done through CancelEventDialog (it asks for confirmation first); declining is direct.
 */
import type {
  CancellationDecision,
  CancellationRequest,
  CancellationRequestResult,
} from "@/features/events/types/cancellationRequest";
import { api } from "@/utils/api";

/** A blank reason is left out of the body: the server stores no reason as null. */
export function submitCancellationRequest(eventId: string, reason: string) {
  const trimmed = reason.trim();
  return api<CancellationRequestResult>(`/events/${eventId}/cancellation-requests`, {
    method: "POST",
    body: JSON.stringify(trimmed ? { reason: trimmed } : {}),
  });
}

export function fetchEventCancellationRequests(eventId: string) {
  return api<CancellationRequest[]>(`/events/${eventId}/cancellation-requests`);
}

export function fetchMyCancellationRequests() {
  return api<CancellationRequest[]>("/cancellation-requests");
}

export function decideCancellationRequest(requestId: string, decision: CancellationDecision) {
  return api<CancellationRequestResult>(`/cancellation-requests/${requestId}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}
