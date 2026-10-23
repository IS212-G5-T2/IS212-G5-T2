/*
 * SPM-48 Monitor Workspace Queue & Status: the wording of the coordinator queue's indicators
 * (rendered by components/QueueIndicators.tsx).
 */
import type { QueueAction, QueueSafety } from "@/types";
import type { StateLabelInfo } from "@/features/events/components/StatusLabels";

/** AC6, AC7: the safety state's text. Awaiting, changes requested and cleared keep the SPM-94 wording. */
export const QUEUE_SAFETY_LABELS: Record<QueueSafety, StateLabelInfo> = {
  AWAITING_CHECK: { label: "Awaiting Safety Officer Check", tone: "amber" },
  CHANGES_REQUESTED: { label: "Safety Changes Requested", tone: "amber" },
  REJECTED: { label: "Safety Arrangement Rejected", tone: "red" },
  RESET: { label: "Safety Check Reset: Re-request Needed", tone: "amber" },
  CLEARED: { label: "Safety Check Cleared", tone: "green" },
};

/** AC5: each reason an event needs action, as read out with the marker. */
export const QUEUE_ACTION_LABELS: Record<QueueAction, string> = {
  AWAITING_REVIEW: "awaiting your review",
  SAFETY_CHANGES_REQUESTED: "safety changes requested",
  SAFETY_REJECTED: "safety arrangement rejected",
  SAFETY_RESET: "safety check must be requested again",
  VENUE_UNAVAILABLE: "venue unavailable",
  HOLD_EXPIRED: "venue hold expired",
};
