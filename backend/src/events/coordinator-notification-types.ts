/** Notification types shown to an assigned Event Coordinator. */
export const COORDINATOR_NOTIFICATION_TYPES = [
  'coordinator_assignment',
  'coordinator_reassignment',
  'coordinator_unassignment',
  'EventCancelled',
  'coordinator_change_request',
  /** SPM-131 AC1: the Safety Officer responded to the event's safety check. */
  'coordinator_safety_response',
] as const;
