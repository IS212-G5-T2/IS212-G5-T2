/*
 * SPM-135 message catalogue (test-case document D8). The wording is the
 * catalogue text; API errors carry these strings and the codes below, and UI
 * copies them from here. Tests copy the literals from the catalogue; they never
 * import this module.
 */
export const STATUS_CODES = {
  confirmBlocked: 'CONFIRM_BLOCKED',
  alreadyConfirmed: 'EVENT_ALREADY_CONFIRMED',
  notConfirmable: 'EVENT_NOT_CONFIRMABLE',
  unsupportedTarget: 'UNSUPPORTED_TARGET_STATUS',
  prerequisitesNotMet: 'SAFETY_PREREQUISITES_NOT_MET',
  safetyCheckNotRequestable: 'SAFETY_CHECK_NOT_REQUESTABLE',
  equipmentRequired: 'EQUIPMENT_REQUIRED',
  feedbackUnresolved: 'SAFETY_FEEDBACK_UNRESOLVED',
  feedbackNotFound: 'SAFETY_FEEDBACK_NOT_FOUND',
  venueRequestNotFound: 'VENUE_REQUEST_NOT_FOUND',
  venueRequestNotRemovable: 'VENUE_REQUEST_NOT_REMOVABLE',
  equipmentRequestNotFound: 'EQUIPMENT_REQUEST_NOT_FOUND',
  equipmentRequestNotRemovable: 'EQUIPMENT_REQUEST_NOT_REMOVABLE',
} as const;

export const STATUS_MESSAGES = {
  /** MSG-CF-01; `{eventName}` is the event's name. */
  confirmed: (eventName: string) => `${eventName} has been confirmed.`,
  /** MSG-CF-02; `{list}` is the outstanding items joined with "; " (PO confirmed 22 Oct 2026, SC-136-009). */
  outstanding: (list: string) => `This event cannot be confirmed yet. Outstanding: ${list}`,
  /** MSG-CF-03 */
  notAssigned: 'You do not have permission to confirm this event.',
  /** MSG-CF-04 */
  alreadyConfirmed: 'This event is already confirmed.',
  /** MSG-CF-05 */
  rejectedOrCancelled: 'A rejected or cancelled event cannot be confirmed.',
  /** Other source statuses (PO confirmed 22 Oct 2026, SC-136-010). */
  notPlanning: 'Only events in Planning can be confirmed.',
  unsupportedTarget: 'This status change is not supported.',
  notFound: 'Event not found.',
  notPlanningForUpdate: 'Only events in Planning can be updated.',
  /** `{blocking}` is "venue", "equipment" or "venue and equipment". */
  prerequisitesNotMet: (blocking: string) => `Pending ${blocking} confirmation to proceed.`,
  safetyCheckPending: 'A safety check is already pending.',
  safetyCheckApproved: 'This event has already passed its safety check.',
  equipmentRequired: 'This event needs equipment, so it cannot be marked as having none.',
  /** `{count}` is the number of feedback items not yet resolved. */
  feedbackUnresolved: (count: number) => `${count} safety feedback item(s) still need resolving before re-requesting.`,
  feedbackNotFound: 'This feedback item was not found for the safety check.',
  venueRequestNotFound: 'This venue request was not found for the event.',
  venueRequestNotRemovable: 'Only a venue request that is unavailable can be removed.',
  equipmentRequestNotFound: 'This equipment request was not found for the event.',
  equipmentRequestNotRemovable: 'Only an equipment request that is unavailable can be removed.',
} as const;
