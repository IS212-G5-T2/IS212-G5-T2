/*
 * SPM-97 / SPM-49 / SPM-85 — shared helpers for event information during the
 * planning phase: API calls, field labels and value formatting.
 *
 * Backend contract (backend/src/events/event-planning.controller.ts):
 *   GET   /events/:id/planning                            PlanningView
 *   PATCH /events/:id/planning                            PlanningUpdateResult
 *   POST  /events/:id/planning/changes/:changeId/resolve  { decision, bookingId? }
 *   GET   /events/:id/planning/history                    ChangeHistoryEntry[]
 */
import { api } from "@/utils/api";
import { formatDateTime, formatDateTimeRange } from "@/utils/format";
import type {
  ChangeHistoryEntry,
  EventStatus,
  PlanningFieldCondition,
  PlanningUpdatePatch,
  PlanningUpdateResult,
  PlanningView,
  ResolveChangeRequest,
} from "@/types";

/**
 * How often the planning panel re-reads the server (SPM-97 AC5). Polling keeps
 * the organiser's view current without a push channel; 15s balances freshness
 * against load for a page that is usually open briefly.
 */
export const PLANNING_REFRESH_MS = 15_000;

/** "Once the event has entered the planning process" (matches the backend). */
export const PLANNING_STATUSES: readonly EventStatus[] = ["approved", "planning", "confirmed"];

// Mirrors backend/src/events/event-input.ts; keep the lists in sync.
export const LAYOUTS = ["Theatre", "Classroom", "Banquet", "Boardroom", "U-shape", "Standing"];
export const FACILITIES = ["Catering", "AV System", "Parking", "Stage", "Projector", "Whiteboard"];
export const ACCESSIBILITY = ["Wheelchair ramps", "Accessible restrooms", "Hearing loop", "Elevator access"];

export const FIELD_LABELS: Record<string, string> = {
  name: "Event name",
  purpose: "Purpose",
  description: "Description",
  startDateTime: "Start date & time",
  endDateTime: "End date & time",
  expectedAttendance: "Expected attendance",
  layout: "Room layout",
  facilities: "Required facilities",
  accessibility: "Accessibility needs",
  equipmentNeeds: "Equipment requirements",
  venue: "Venue",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** Human-readable value for any planning field. */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "None";
  if ((field === "startDateTime" || field === "endDateTime") && typeof value === "string")
    return formatDateTime(value);
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (typeof value === "string") return value.trim() ? value : "None";
  return String(value);
}

/**
 * SPM-49 AC2: plain-English rule for a "conditional" field, i.e. when a change
 * to it applies immediately and when it is held for review.
 */
export function describeCondition(condition: PlanningFieldCondition): string {
  switch (condition.kind) {
    case "within_window":
      return `Applies immediately while the event stays within ${formatDateTimeRange(condition.start, condition.end)}; moving outside it needs review.`;
    case "max_attendance":
      return `Applies immediately up to ${condition.max} attendees; more needs review.`;
    case "remove_only":
      return "Removing facilities applies immediately; adding any needs review.";
  }
}

/** The values being proposed, with the stored facilities for comparison. */
export interface ConditionProposal {
  startDateTime?: string;
  endDateTime?: string;
  expectedAttendance?: number;
  facilities?: string[];
  currentFacilities?: string[];
}

/**
 * Mirrors the backend's compatibility rules (event-impact.ts /
 * event-planning.service.ts) so the form can say, before saving, whether a
 * change will apply immediately. The server decides authoritatively.
 */
export function satisfiesCondition(condition: PlanningFieldCondition, proposal: ConditionProposal): boolean {
  switch (condition.kind) {
    case "within_window": {
      const start = Date.parse(proposal.startDateTime ?? "");
      const end = Date.parse(proposal.endDateTime ?? "");
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
      return start < end && start >= Date.parse(condition.start) && end <= Date.parse(condition.end);
    }
    case "max_attendance":
      return proposal.expectedAttendance !== undefined && proposal.expectedAttendance <= condition.max;
    case "remove_only": {
      const current = proposal.currentFacilities ?? [];
      return (proposal.facilities ?? []).every((facility) => current.includes(facility));
    }
  }
}

/** Guards against a malformed response so the page never crashes on it. */
export function isPlanningView(value: unknown): value is PlanningView {
  const view = value as Partial<PlanningView> | null;
  return (
    !!view &&
    typeof view === "object" &&
    !!view.event &&
    Array.isArray(view.venueBookings) &&
    Array.isArray(view.equipmentArrangements) &&
    Array.isArray(view.pendingChanges) &&
    Array.isArray(view.editableFields)
  );
}

export async function fetchPlanningView(eventId: string): Promise<PlanningView> {
  const view = await api<unknown>(`/events/${eventId}/planning`);
  if (!isPlanningView(view)) throw new Error("Planning information could not be read.");
  return view;
}

export function updatePlanning(eventId: string, patch: PlanningUpdatePatch) {
  return api<PlanningUpdateResult>(`/events/${eventId}/planning`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function resolvePlanningChange(eventId: string, { changeId, decision, bookingId }: ResolveChangeRequest) {
  return api<unknown>(`/events/${eventId}/planning/changes/${changeId}/resolve`, {
    method: "POST",
    body: JSON.stringify(bookingId ? { decision, bookingId } : { decision }),
  });
}

export async function fetchChangeHistory(eventId: string): Promise<ChangeHistoryEntry[]> {
  const history = await api<unknown>(`/events/${eventId}/planning/history`);
  return Array.isArray(history) ? (history as ChangeHistoryEntry[]) : [];
}
