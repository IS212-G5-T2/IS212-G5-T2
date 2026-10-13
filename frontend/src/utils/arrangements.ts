/*
 * SPM-135 Confirm an Event: client helpers. Contract (backend/src/events/status):
 *   POST /events/:id/status-change              { targetStatus: "Confirmed" }  -> { eventId, status, message }
 *   GET  /events/:id/arrangements-status        assigned coordinator           -> { eventId, ready, outstanding[] }
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

export interface ArrangementsStatus {
  eventId: string;
  ready: boolean;
  outstanding: OutstandingArrangement[];
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

export async function fetchConfirmedArrangements(eventId: string): Promise<ConfirmedArrangements> {
  const view = await api<unknown>(`/events/${eventId}/confirmed-arrangements`);
  if (!isConfirmedArrangements(view)) throw new Error("Confirmed arrangements could not be read.");
  return view;
}
