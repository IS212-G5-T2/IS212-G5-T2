/* SPM-157: the GET /api/events/:eventId/history contract (backend/src/events/history/event-history.types.ts). */
export type HistorySection = "event" | "venueBookings" | "equipment" | "registrations";

export interface HistoryChange {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
}

export interface HistoryEntry {
  id: string;
  section: HistorySection;
  action: string;
  summary: string;
  subject?: string;
  changes: HistoryChange[];
  reason?: string;
  actor: { kind: "user" | "system" | "unrecorded"; name: string };
  occurredAt: string;
}

export interface EventHistory {
  eventId: string;
  eventName: string;
  eventStatus: string;
  viewer: "coordinator" | "organiser";
  sections: Partial<Record<HistorySection, HistoryEntry[]>>;
}
