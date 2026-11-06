/** A coordinator can resolve feedback after either non-approval Safety Officer outcome. */
export function safetyFeedbackCanBeResolved(status: string | undefined): boolean {
  return status === 'changes_needed' || status === 'rejected';
}
