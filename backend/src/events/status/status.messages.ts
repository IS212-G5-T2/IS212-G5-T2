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
} as const;

export const STATUS_MESSAGES = {
  /** MSG-CF-01; `{eventName}` is the event's name. */
  confirmed: (eventName: string) => `${eventName} has been confirmed.`,
  /** MSG-CF-02; `{list}` is the outstanding items joined with "; " (ASSUMED, D7). */
  outstanding: (list: string) => `This event cannot be confirmed yet. Outstanding: ${list}`,
  /** MSG-CF-03 */
  notAssigned: 'You do not have permission to confirm this event.',
  /** MSG-CF-04 */
  alreadyConfirmed: 'This event is already confirmed.',
  /** MSG-CF-05 */
  rejectedOrCancelled: 'A rejected or cancelled event cannot be confirmed.',
  /** Other source statuses (ASSUMED text, D5). */
  notPlanning: 'Only events in Planning can be confirmed.',
  unsupportedTarget: 'This status change is not supported.',
  notFound: 'Event not found.',
} as const;
