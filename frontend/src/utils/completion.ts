/*
 * SPM-153 client helpers: marking an event Completed and its completion record. The server is authoritative;
 * `hasEventEnded` only decides when the panel enables its button (BR10).
 */
import { api } from "@/utils/api";

export interface CompletionRecord {
  attendanceCount: number | null;
  operationalNotes: string | null;
  issues: { description: string }[];
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * A save may carry any subset of the three items; an omitted item keeps its saved value. Text that is not a whole
 * number is sent as typed, so the server refuses it with the field named instead of the value being cleared.
 */
export type CompletionRecordInput = Partial<{
  attendanceCount: number | string | null;
  operationalNotes: string | null;
  issues: { description: string }[];
}>;

export interface CompleteEventResult {
  eventId: string;
  status: string;
  message: string;
}

/** True from the event's end instant, inclusive. */
export function hasEventEnded(endDateTime: string, now: number = Date.now()): boolean {
  return now >= Date.parse(endDateTime);
}

export function completeEvent(eventId: string) {
  return api<CompleteEventResult>(`/events/${eventId}/status-change`, {
    method: "POST",
    body: JSON.stringify({ targetStatus: "Completed" }),
  });
}

export function fetchCompletionRecord(eventId: string) {
  return api<CompletionRecord>(`/events/${eventId}/completion-record`);
}

export function saveCompletionRecord(eventId: string, input: CompletionRecordInput) {
  return api<CompletionRecord & { message: string }>(`/events/${eventId}/completion-record`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
