// One definition per list of statuses (SPM-148 R9, D9): the workload number,
// the Lead's coordinator list and the unavailability notice all import
// ACTIVE_WORKLOAD_STATUSES, so a status cannot be forgotten in one copy.

// Event statuses that still count toward an assigned coordinator's workload.
export const ACTIVE_WORKLOAD_STATUSES = [
  'Submitted',
  'Approved',
  'Planning',
  'Confirmed',
] as const;

// Statuses that accept a venue booking request. Submitted stays open because
// the repo already accepted bookings for it (SPM-51); closed statuses answer 409.
export const BOOKING_OPEN_STATUSES = [
  'Submitted',
  'Approved',
  'Planning',
  'Confirmed',
] as const;

// Statuses in which the organiser and coordinator may post clarifications.
// Confirmed closes the thread for writes (SPM-148 AC7); threads stay readable.
export const CLARIFICATION_OPEN_STATUSES = [
  'Submitted',
  'Approved',
  'Planning',
] as const;

/** The only status a venue booking request moves to Planning (SPM-148 R1). */
export function shouldTransitionToPlanning(status: string): boolean {
  return status === 'Approved';
}
