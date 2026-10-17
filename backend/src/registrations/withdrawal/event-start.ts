/*
 * SPM-120 AC4: the one definition of "the event has already occurred". The
 * cut-off is the event start instant and it is exclusive: at or after the start
 * a withdrawal is refused (assumption [A7], pinned by the 04-C boundary tests).
 * It reads the start timestamp, not the status label, because an event's status
 * can lag the clock.
 */
export function hasEventStarted(event: { startDateTime: Date }, now: Date): boolean {
  return now.getTime() >= event.startDateTime.getTime();
}
