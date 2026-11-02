/*
 * SPM-153 message catalogue (MSG-CP-01 to MSG-CP-07). The wording is the catalogue text; API errors carry these
 * strings and the codes below, and the UI copies them from the test-case document. Tests copy the literals.
 * Codes marked ASSUMED in the Decision Register (D6, D8, D10) are the repo-style names chosen here.
 */
export const COMPLETION_CODES = {
  notCompletable: 'EVENT_NOT_COMPLETABLE',
  notEnded: 'EVENT_NOT_ENDED',
  recordNotAllowed: 'COMPLETION_RECORD_NOT_ALLOWED',
  arrangementsLocked: 'EVENT_COMPLETED',
  invalidRecord: 'INVALID_COMPLETION_RECORD',
} as const;

export const COMPLETION_MESSAGES = {
  /** MSG-CP-01; `{eventName}` is the event's name. */
  completed: (eventName: string) => `${eventName} has been marked as Completed.`,
  /** MSG-CP-02 */
  notEnded: 'An event can only be marked as Completed after its event date has passed.',
  /** MSG-CP-03 */
  notCompletable: 'Only a Confirmed event can be marked as Completed.',
  /** MSG-CP-04 */
  recordSaved: 'Completion details saved.',
  /** MSG-CP-05 */
  recordNotAllowed: 'Completion details can only be recorded for a Completed event.',
  /** MSG-CP-06 */
  arrangementsLocked: 'The date, time, venue and equipment of a Completed event cannot be changed.',
  /** MSG-CP-07 */
  invalidRecord: 'Please enter a valid attendance, notes and issues.',
} as const;
