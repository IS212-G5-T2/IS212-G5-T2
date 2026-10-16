/*
 * SPM-64 rules shared by the change request form, list and badges. The server
 * decides authoritatively; these only decide what to offer in the UI.
 */
import type { ChangeRequest, ChangeRequestField, ChangeRequestStatus, EventRecord, EventStatus } from "@/types";
import { fieldLabel } from "@/utils/planning";

/** Event statuses that accept a change request (agreed: Submitted to Confirmed). */
export const CHANGE_REQUEST_OPEN_STATUSES: readonly EventStatus[] = ["submitted", "approved", "planning", "confirmed"];

/** Statuses past approval, where an approved change resets the safety check. */
const SAFETY_CHECK_STATUSES: readonly EventStatus[] = ["approved", "planning", "confirmed"];

/** The permitted change types, in form order (SPM-64 AC1). */
export const CHANGE_FIELDS: readonly ChangeRequestField[] = [
  "description",
  "startDateTime",
  "endDateTime",
  "expectedAttendance",
  "layout",
  "facilities",
  "accessibility",
  "equipmentNeeds",
];

/** Whether the event can take a new change request right now (it may still have one pending). */
export function acceptsChangeRequests(event: Pick<EventRecord, "status" | "startDateTime">, now = Date.now()): boolean {
  return CHANGE_REQUEST_OPEN_STATUSES.includes(event.status) && Date.parse(event.startDateTime) > now;
}

/** SPM-64 note: past approval, a change may need a new safety check. */
export function mayNeedSafetyCheck(event: Pick<EventRecord, "status">): boolean {
  return SAFETY_CHECK_STATUSES.includes(event.status);
}

/** Field label as organisers see it; accessibility needs are the event's special requirements. */
export function changeFieldLabel(field: string): string {
  return field === "accessibility" ? "Accessibility / special requirements" : fieldLabel(field);
}

export const STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  Pending: "Pending review",
  Approved: "Approved",
  Denied: "Denied",
  Withdrawn: "Withdrawn",
};

export const STATUS_CLASSES: Record<ChangeRequestStatus, string> = {
  Pending: "bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300",
  Approved: "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300",
  Denied: "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300",
  Withdrawn: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

/** The pending request, if any, from a list. */
export function pendingRequest(requests: readonly ChangeRequest[]): ChangeRequest | undefined {
  return requests.find((request) => request.status === "Pending");
}
