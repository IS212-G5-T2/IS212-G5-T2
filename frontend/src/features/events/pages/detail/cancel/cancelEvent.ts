/*
 * SPM-136 client call. Contract (backend/src/events/cancel): POST /events/:id/status-change with
 * { targetStatus: "Cancelled", confirmed: true } -> { eventId, status, message }. The literal `true` is the
 * confirmation the server requires; the dialog is the only caller and sends it after the user confirms.
 */
import { api } from "@/utils/api";

export interface CancelEventResult {
  eventId: string;
  status: string;
  message: string;
}

export function cancelEvent(eventId: string): Promise<CancelEventResult> {
  return api<CancelEventResult>(`/events/${eventId}/status-change`, {
    method: "POST",
    body: JSON.stringify({ targetStatus: "Cancelled", confirmed: true }),
  });
}
