// SPM-177: the three clarification notice types (written by ClarificationsService, SPM-39) are the only place their
// names are written down. The Organiser's and the Coordinator's read allow-lists in EventsService, the previous
// Coordinator's read-marking in LeadAssignmentService and the frontend bell list the same strings.
export const CLARIFICATION_REQUESTED_NOTICE = 'clarification';
export const CLARIFICATION_REPLY_NOTICE = 'clarification_reply';
export const CLARIFICATION_RESOLVED_NOTICE = 'clarification_resolved';

export const CLARIFICATION_NOTICE_TYPES = [
  CLARIFICATION_REQUESTED_NOTICE,
  CLARIFICATION_REPLY_NOTICE,
  CLARIFICATION_RESOLVED_NOTICE,
] as const;
