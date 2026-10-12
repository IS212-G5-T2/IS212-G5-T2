// Event statuses that still count toward an assigned coordinator's workload.
export const ACTIVE_COORDINATOR_EVENT_STATUSES = [
  'Submitted',
  'Approved',
  'Confirmed',
] as const;
