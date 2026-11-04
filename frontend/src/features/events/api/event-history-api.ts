/* SPM-157: read-only client for the event history. There is no call that changes it (AC10). */
import { api } from "@/utils/api";
import type { EventHistory } from "@/features/events/types/eventHistory";

export function fetchEventHistory(eventId: string): Promise<EventHistory> {
  return api<EventHistory>(`/events/${encodeURIComponent(eventId)}/history`);
}
