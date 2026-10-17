/*
 * SPM-135 Confirm an Event: client helpers. Contract (backend/src/events/status):
 *   POST /events/:id/status-change              { targetStatus: "Confirmed" }  -> { eventId, status, message }
 *   GET  /events/:id/arrangements-status        assigned coordinator           -> { eventId, ready, outstanding[], checklist }
 *   POST /events/:id/confirm-no-equipment       assigned coordinator           -> { eventId, equipmentConfirmedAt }
 *   POST /events/:id/safety-check/request       assigned coordinator           -> { eventId, status, requestedDate }
 *   POST /events/:id/safety-check/feedback/:feedbackId/resolve  -> { eventId, feedbackId, resolvedAt }
 *   DELETE /events/:id/safety-check/feedback/:feedbackId/resolve -> { eventId, feedbackId }
 *   DELETE /events/:id/venue-requests/:venueRequestId            -> { eventId, venueRequestId, removed }
 *   DELETE /events/:id/equipment-reservations/:equipmentReservationId -> { eventId, equipmentReservationId, removed }
 *   GET  /events/:id/confirmed-arrangements     submitting organiser           -> ConfirmedArrangements
 * Errors arrive as ApiError with the server `code` (CONFIRM_BLOCKED, ...).
 */
import { api } from "@/utils/api";

export type OutstandingType = "venue" | "equipment" | "safety";

export interface OutstandingArrangement {
  type: OutstandingType;
  label: string;
  detail: string;
  state: string;
}

export type RequestStatus = "not_requested" | "pending" | "confirmed" | "unavailable";
export type SafetyCheckStatus = "not_requested" | "pending" | "changes_needed" | "approved";

export interface SafetyCheckFeedback {
  id: string;
  text: string;
  requestedAt: string;
  resolvedByCoordinatorAt?: string;
}

export interface VenueRequestItem {
  id: string;
  venueName: string;
  status: RequestStatus;
  requestedDate?: string;
}

export interface EquipmentRequestItem {
  id: string;
  name: string;
  quantity: number;
  status: RequestStatus;
  requestedDate?: string;
}

/** What the coordinator's planning page shows for venues, equipment and the safety check. */
export interface PlanningChecklist {
  venue: { status: RequestStatus; items: VenueRequestItem[]; requestedDate?: string };
  equipment: {
    /** False when the event lists no equipment: the coordinator confirms "none" instead. */
    required: boolean;
    status: RequestStatus;
    items: EquipmentRequestItem[];
    requestedDate?: string;
    confirmedByCoordinator: boolean;
    confirmedDate?: string;
  };
  safetyCheck: {
    status: SafetyCheckStatus;
    requestedDate?: string;
    approverName?: string;
    feedback?: SafetyCheckFeedback[];
    /** Why an earlier safety check was reset; present only while status is not_requested. */
    resetReason?: string;
    resetDate?: string;
  };
  canRequestSafetyCheck: boolean;
  /** Prerequisites still blocking a safety check request. */
  blocking: ("venue" | "equipment")[];
}

export interface ArrangementsStatus {
  eventId: string;
  ready: boolean;
  outstanding: OutstandingArrangement[];
  checklist?: PlanningChecklist;
}

export interface ConfirmedArrangements {
  eventId: string;
  status: string;
  venueBookings: { venueName: string; start: string; end: string; status: string }[];
  equipment: { name: string; quantity: number; status: string }[];
  safety: { state: string };
}

export interface StatusChangeResult {
  eventId: string;
  status: string;
  message: string;
}

/** The visible text of one outstanding item (D7). */
export function outstandingText(item: OutstandingArrangement): string {
  return `${item.label}: ${item.detail}`;
}

function isArrangementsStatus(value: unknown): value is ArrangementsStatus {
  const view = value as ArrangementsStatus | null;
  return !!view && typeof view.ready === "boolean" && Array.isArray(view.outstanding);
}

function isConfirmedArrangements(value: unknown): value is ConfirmedArrangements {
  const view = value as ConfirmedArrangements | null;
  return !!view && Array.isArray(view.venueBookings) && Array.isArray(view.equipment) && !!view.safety;
}

export async function fetchArrangementsStatus(eventId: string): Promise<ArrangementsStatus> {
  const view = await api<unknown>(`/events/${eventId}/arrangements-status`);
  if (!isArrangementsStatus(view)) throw new Error("Arrangements could not be read.");
  return view;
}

export function confirmEvent(eventId: string) {
  return api<StatusChangeResult>(`/events/${eventId}/status-change`, {
    method: "POST",
    body: JSON.stringify({ targetStatus: "Confirmed" }),
  });
}

export function confirmNoEquipment(eventId: string) {
  return api<{ eventId: string; equipmentConfirmedAt: string }>(`/events/${eventId}/confirm-no-equipment`, {
    method: "POST",
  });
}

export function requestSafetyCheck(eventId: string) {
  return api<{ eventId: string; status: string; requestedDate: string }>(`/events/${eventId}/safety-check/request`, {
    method: "POST",
  });
}

export function resolveFeedbackItem(eventId: string, feedbackId: string) {
  return api<{ eventId: string; feedbackId: string; resolvedAt: string }>(
    `/events/${eventId}/safety-check/feedback/${feedbackId}/resolve`,
    { method: "POST" },
  );
}

export function removeVenueRequest(eventId: string, venueRequestId: string) {
  return api<{ eventId: string; venueRequestId: string; removed: boolean }>(
    `/events/${eventId}/venue-requests/${venueRequestId}`,
    { method: "DELETE" },
  );
}

export function removeEquipmentRequest(eventId: string, equipmentReservationId: string) {
  return api<{ eventId: string; equipmentReservationId: string; removed: boolean }>(
    `/events/${eventId}/equipment-reservations/${equipmentReservationId}`,
    { method: "DELETE" },
  );
}

export function unresolveFeedbackItem(eventId: string, feedbackId: string) {
  return api<{ eventId: string; feedbackId: string }>(
    `/events/${eventId}/safety-check/feedback/${feedbackId}/resolve`,
    { method: "DELETE" },
  );
}

export async function fetchConfirmedArrangements(eventId: string): Promise<ConfirmedArrangements> {
  const view = await api<unknown>(`/events/${eventId}/confirmed-arrangements`);
  if (!isConfirmedArrangements(view)) throw new Error("Confirmed arrangements could not be read.");
  return view;
}
