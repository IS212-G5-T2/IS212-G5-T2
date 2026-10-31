/*
 * SPM-155 client rules for the cancellation request flow. The server is the authority (ownership, assignment,
 * the eligible set and the decision order are enforced there); these only decide what to show.
 */
import { CANCELLABLE_EVENT_STATUSES } from "@/features/events/lib/cancellation";
import type { CancellationDisplayStatus } from "@/features/events/types/cancellationRequest";
import type { EventRecord } from "@/types";

/** Reason limit in code points (matches the server's 0 to 500). */
export const REASON_MAX = 500;

interface RuleInput {
  event: Pick<EventRecord, "status" | "organiserId" | "coordinatorId">;
  currentUser: { id: string; role: string };
}

/** The submitting Organiser, on an event in the SPM-136 cancellable set (imported, never copied: D5). */
export function canRequestCancellation({ event, currentUser }: RuleInput): boolean {
  return (
    currentUser.role === "organiser" &&
    event.organiserId === currentUser.id &&
    (CANCELLABLE_EVENT_STATUSES as readonly string[]).includes(event.status)
  );
}

/** The Coordinator assigned to the event now (D3): never the requester, never an unassigned Lead. */
export function canDecideCancellation({ event, currentUser }: RuleInput): boolean {
  return currentUser.role === "coordinator" && event.coordinatorId === currentUser.id;
}

const STATUS_LABELS: Record<CancellationDisplayStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  closed: "Closed",
};

const LIST_LABELS: Record<CancellationDisplayStatus, string> = {
  pending: "Cancellation requested",
  accepted: "Cancellation accepted",
  declined: "Cancellation declined",
  closed: "Cancellation request closed",
};

export const statusLabelFor = (status: CancellationDisplayStatus): string => STATUS_LABELS[status];
export const listLabelFor = (status: CancellationDisplayStatus): string => LIST_LABELS[status];

export const codePointLength = (text: string): number => Array.from(text).length;
