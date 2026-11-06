/*
 * SPM-155 cancellation request as the API returns it (backend/src/events/cancellation-requests). `status` is the
 * stored state; `displayStatus` is what to show (a pending request on a Completed or Cancelled event is closed).
 */
export type CancellationRequestStatus = "pending" | "accepted" | "declined";
export type CancellationDisplayStatus = CancellationRequestStatus | "closed";
export type CancellationDecision = "accept" | "decline";

export interface CancellationRequest {
  id: string;
  eventId: string;
  eventName: string;
  status: CancellationRequestStatus;
  displayStatus: CancellationDisplayStatus;
  /** Present only when displayStatus is closed. */
  closedNote?: string;
  reason: string | null;
  requestedBy: string;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

/** POST create and decision answer with the request and the catalogue message (MSG-CR-01, 04, 05). */
export interface CancellationRequestResult {
  request: CancellationRequest;
  message: string;
}
