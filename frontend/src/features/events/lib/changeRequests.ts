/*
 * SPM-64 rules shared by the change request form, list and badges. The server
 * decides authoritatively; these only decide what to offer in the UI.
 */
import type { ChangeRequest, ChangeRequestField, ChangeRequestStatus, EventRecord, EventStatus } from "@/types";
import { fieldLabel } from "@/utils/planning";

/** Event statuses that accept a change request (agreed: Submitted to Confirmed). */
export const CHANGE_REQUEST_OPEN_STATUSES: readonly EventStatus[] = ["submitted", "approved", "planning", "confirmed"];

/** Statuses past approval, where the event can have a safety check that an approved change resets. */
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

/** SPM-64 note: past approval the event may have a safety check, so the form says one would be needed again. */
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
  Closed: "Closed",
};

export const STATUS_CLASSES: Record<ChangeRequestStatus, string> = {
  Pending: "bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300",
  Approved: "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300",
  Denied: "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300",
  Withdrawn: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  Closed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

/** SPM-65 AC5: a denial needs a reason of this length (the server checks it too). */
export const DENIAL_REASON_MIN = 10;
export const DENIAL_REASON_MAX = 500;

/** SPM-65 AC5: the denial reason's error, or "" when it is valid. */
export function denialReasonError(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return "Please give a reason for denying this change.";
  if (trimmed.length < DENIAL_REASON_MIN || trimmed.length > DENIAL_REASON_MAX)
    return `Use between ${DENIAL_REASON_MIN} and ${DENIAL_REASON_MAX} characters.`;
  return "";
}

/** SPM-65 AC1: pending requests, oldest first, so the longest-waiting is reviewed first. */
export function oldestFirst(requests: readonly ChangeRequest[]): ChangeRequest[] {
  return [...requests].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** The pending request, if any, from a list. */
export function pendingRequest(requests: readonly ChangeRequest[]): ChangeRequest | undefined {
  return requests.find((request) => request.status === "Pending");
}
