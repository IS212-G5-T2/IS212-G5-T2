/*
 * SPM-136 message catalogue (MSG-CN-01 to MSG-CN-06). The wording is the Confluence catalogue text; the
 * dialog in the frontend copies these literals. Tests copy the literals; they never import this module.
 */
export const CANCEL_CODES = {
  notConfirmed: 'CANCEL_NOT_CONFIRMED',
  notCancellable: 'EVENT_NOT_CANCELLABLE',
  forbidden: 'FORBIDDEN',
  invalidTransition: 'INVALID_STATUS_TRANSITION',
} as const;

export const CANCEL_MESSAGES = {
  /** MSG-CN-02; `{eventName}` is the event name. Also the EventCancelled notification text. */
  cancelled: (eventName: string) => `${eventName} has been cancelled.`,
  /** MSG-CN-03 */
  notConfirmed: 'Cancellation must be confirmed.',
  /** MSG-CN-05 */
  notAllowed: 'You do not have permission to cancel this event.',
  /** MSG-CN-06 */
  notCancellable: 'This event can no longer be cancelled.',
  /** ASSUMED (not in the Confluence pages): a status change this module does not allow for a cancelled event. */
  invalidTransition: 'This status change is not allowed for this event.',
  notFound: 'Event not found.',
} as const;
