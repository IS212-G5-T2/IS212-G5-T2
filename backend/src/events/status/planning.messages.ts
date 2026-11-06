/*
 * SPM-148 message catalogue. API errors carry these codes and strings; the
 * frontend builds MSG-PL-01 itself. Tests copy the literals; they never import
 * this module.
 */
export const PLANNING_CODES = {
  eventNotOpenForBooking: 'EVENT_NOT_OPEN_FOR_BOOKING',
  clarificationsClosed: 'CLARIFICATIONS_CLOSED',
  unsupportedFields: 'UNSUPPORTED_BOOKING_FIELDS',
} as const;

export const PLANNING_MESSAGES = {
  /** MSG-PL-02 */
  eventNotOpenForBooking: 'This event is not open for venue booking requests.',
  /** MSG-PL-03 */
  clarificationsClosed:
    'Clarifications are closed because this event is confirmed.',
  unsupportedFields: 'The booking request contains unsupported fields.',
  /** Allow-header response for PUT and DELETE on the append-only history. */
  historyReadOnly: 'Status history cannot be changed.',
} as const;
