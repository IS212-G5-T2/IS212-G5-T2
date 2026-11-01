/*
 * SPM-155 message catalogue (MSG-CR-01 to MSG-CR-06 from docs/specs/SPM-155-test-cases.md, plus the new error
 * codes). The code is the machine-readable part of every refusal; the frontend shows the message. Wording marked
 * ASSUMED is not in the catalogue and needs product-owner confirmation. Tests copy these literals; they never
 * import this module.
 */
export const CANCELLATION_REQUEST_CODES = {
  notFound: 'EVENT_NOT_FOUND',
  forbidden: 'FORBIDDEN',
  notCancellable: 'EVENT_NOT_CANCELLABLE',
  pending: 'CANCELLATION_REQUEST_PENDING',
  decided: 'CANCELLATION_REQUEST_DECIDED',
  invalidReason: 'INVALID_REASON',
  invalidDecision: 'INVALID_DECISION',
  invalidRequest: 'INVALID_REQUEST',
} as const;

export const CANCELLATION_REQUEST_MESSAGES = {
  /** MSG-CR-01 */
  requested: 'Cancellation request sent to your Event Coordinator.',
  /** MSG-CR-02 (same text as SPM-136 MSG-CN-06) */
  notCancellable: 'This event can no longer be cancelled.',
  /** MSG-CR-03 */
  pending: 'You already have a pending cancellation request for this event.',
  /** MSG-CR-04; `{eventName}` is the event name. */
  accepted: (eventName: string) => `Cancellation request accepted. ${eventName} is cancelled.`,
  /** MSG-CR-05 */
  declined: 'Cancellation request declined.',
  /** MSG-CR-06 */
  decided: 'This request has already been decided.',
  /** MSG-08 (existing catalogue entry) */
  forbidden: 'You do not have permission to perform this action.',
  /** ASSUMED wording (the 500 limit is the Gate-1 decision). */
  invalidReason: 'Use 500 characters or fewer.',
  /** ASSUMED wording. */
  invalidDecision: 'Choose accept or decline.',
  /** ASSUMED wording. */
  invalidRequest: 'The request is not valid.',
  notFound: 'Event not found.',
  /** D4 lines for a pending request whose event has ended (ASSUMED text). */
  closedCancelled: 'The event is already cancelled.',
  closedCompleted: 'The event is already completed.',
} as const;
