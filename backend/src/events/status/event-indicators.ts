/*
 * SPM-94 Track My Event Status (Organiser). Pure indicator derivations: they
 * take the event status, coordinator assignment and safety-check state as
 * inputs, never read the clock or the database, and show nothing when a source
 * is missing rather than guess.
 */

export type SafetyIndicator = 'AWAITING_CHECK' | 'CHANGES_REQUESTED' | 'CLEARED';

// SPM-94 D5: terminal statuses show no safety indicator (PO confirmed 22 Oct 2026, SC-SPM94-10).
const SAFETY_SUPPRESSED_STATUSES = ['Completed', 'Cancelled', 'Rejected'] as const;

// Safety-check rows use the snake_case states written by SPM-135 (event_safety_checks.status).
const SAFETY_INDICATOR_BY_STATE: Record<string, SafetyIndicator> = {
  pending: 'AWAITING_CHECK',
  changes_needed: 'CHANGES_REQUESTED',
  approved: 'CLEARED',
};

/** SPM-94 AC2 / R3: awaiting assignment iff Submitted and no Coordinator is assigned. */
export function deriveAssignmentIndicator(
  status: string,
  coordinatorId: string | null | undefined,
): boolean {
  return status === 'Submitted' && !coordinatorId;
}

/** SPM-94 AC3 / R4: at most one safety indicator; no record, an unknown state or a terminal event shows none. */
export function deriveSafetyIndicator(
  state: string | null | undefined,
  status: string,
): SafetyIndicator | null {
  if ((SAFETY_SUPPRESSED_STATUSES as readonly string[]).includes(status)) return null;
  if (!state) return null;
  // Owner decision (18 Oct 2026): a confirmed event needs no 'cleared' indicator; confirmation already implies it.
  if (status === 'Confirmed' && state === 'approved') return null;
  // Owner decision (18 Oct 2026): the awaiting Safety Officer check is a planning-phase state only.
  if (state === 'pending' && status !== 'Planning') return null;
  return SAFETY_INDICATOR_BY_STATE[state] ?? null;
}
