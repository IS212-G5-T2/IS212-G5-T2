/*
 * SPM-136 pure cancellation rules (AC2, AC3). No I/O; the service applies them inside its transaction.
 * D5: confirmation is the boolean true only. D9/F9: the cancellable set is fixed here, nowhere else.
 */
export const CANCELLABLE_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed'] as const;

export function isCancellable(status: string): boolean {
  return (CANCELLABLE_STATUSES as readonly string[]).includes(status);
}

/** True only when the body carries `confirmed` as the boolean true. Missing, false, "true", 1 and null all refuse. */
export function isConfirmed(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return (body as { confirmed?: unknown }).confirmed === true;
}
