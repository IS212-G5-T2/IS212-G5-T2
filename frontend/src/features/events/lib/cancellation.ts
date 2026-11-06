/*
 * SPM-136 Cancel an Event: the client rule for offering the action (AC1, AC3). The server is the authority
 * (assignment, confirmation and the cancellable set are enforced there); this only decides what to show.
 */
import type { EventRecord } from "@/types";

/** Statuses from which the server accepts a cancellation (backend cancel-rules.ts). */
export const CANCELLABLE_EVENT_STATUSES = ["submitted", "approved", "planning", "confirmed"] as const;

interface CancelRuleInput {
  event: Pick<EventRecord, "status" | "organiserId" | "coordinatorId">;
  currentUser: { id: string; role: string };
}

/** The assigned coordinator only, on a cancellable event. The submitting organiser is not offered the action. */
export function canCancelEvent({ event, currentUser }: CancelRuleInput): boolean {
  const assigned = currentUser.role === "coordinator" && event.coordinatorId === currentUser.id;
  return assigned && (CANCELLABLE_EVENT_STATUSES as readonly string[]).includes(event.status);
}
