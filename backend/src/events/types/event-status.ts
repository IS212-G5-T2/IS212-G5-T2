// One definition per list of statuses (SPM-148 R9, D9): the workload number,
// the Lead's coordinator list and the unavailability notice all import
// ACTIVE_WORKLOAD_STATUSES, so a status cannot be forgotten in one copy.

// Event statuses that still count toward an assigned coordinator's workload.
// SPM-148 PLAN-STATUS-06-A, 06-C: Planning counts toward the active workload (Lead list and availability notice use this list).
export const ACTIVE_WORKLOAD_STATUSES = [
  'Submitted',
  'Approved',
  'Planning',
  'Confirmed',
] as const;

// Statuses that accept a venue booking request. Submitted events are not yet
// in the planning phase, so they answer 409 like every other closed status.
// SPM-148 PLAN-STATUS-01-B: statuses that accept venue booking requests.
export const BOOKING_OPEN_STATUSES = [
  'Approved',
  'Planning',
  'Confirmed',
] as const;

// Statuses in which the organiser and coordinator may post clarifications.
// Confirmed closes the thread for writes (SPM-148 AC7); threads stay readable.
// SPM-148 PLAN-STATUS-07-A, 07-D: clarifications open in Planning; Confirmed closes them.
export const CLARIFICATION_OPEN_STATUSES = [
  'Submitted',
  'Approved',
  'Planning',
] as const;

/** The only status a venue booking request moves to Planning (SPM-148 R1). */
// SPM-148 PLAN-STATUS-01-B: the single transition rule: only Approved.
export function shouldTransitionToPlanning(status: string): boolean {
  return status === 'Approved';
}
