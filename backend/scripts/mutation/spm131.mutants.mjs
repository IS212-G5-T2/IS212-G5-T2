const SERVICE = 'src/events/safety-officer/safety-officer.service.ts';
const UNIT = 'src/events/safety-officer/safety-officer.service.spec.ts';
const CHECKLIST_SOURCE = 'src/events/status/checklist.ts';
const CHECKLIST_UNIT = 'src/events/status/checklist.spec.ts';
const SOURCE_UNIT = 'src/events/status/safety-check.source.spec.ts';
const E2E = 'test/safety-officer.e2e-spec.ts';
const FEEDBACK_SOURCE = 'src/events/status/safety-check.source.ts';
const CONFIRM_SOURCE = 'src/events/status/safety-check.source.ts';
const REQUEST_SOURCE = 'src/events/status/status.service.ts';
const CONFIRM_E2E = 'test/events-confirm-safety-source.e2e-spec.ts';
const FEEDBACK_E2E = 'test/events-safety-feedback.e2e-spec.ts';
const unit = (title) => ({ suite: 'unit', file: UNIT, title });
const e2e = (title) => ({ suite: 'backend-e2e', file: E2E, title });
const confirm = (title) => ({ suite: 'confirm-e2e', file: CONFIRM_E2E, title });
const feedback = (title) => ({ suite: 'feedback-e2e', file: FEEDBACK_E2E, title });

export const SUITES = {
  unit: { args: ['run', UNIT, CHECKLIST_UNIT, SOURCE_UNIT, 'src/events/review/events.reject.spec.ts', 'src/events/events.service.spec.ts', 'src/events/review/events.approve.spec.ts', 'src/events/cancelled-notifications.spec.ts', 'src/events/queue/coordinator-queue.service.spec.ts', 'src/event-drafts/drafts.http.spec.ts', 'src/event-drafts/drafts.service.spec.ts'] },
  'backend-e2e': {
    args: ['run', '--config', 'vitest.config.e2e.ts', E2E],
    env: {},
    needsEnv: ['TEST_DATABASE_URL'],
  },
  'confirm-e2e': {
    args: ['run', '--config', 'vitest.config.e2e.ts', CONFIRM_E2E],
    env: {},
    needsEnv: ['TEST_DATABASE_URL'],
  },
  'feedback-e2e': {
    args: ['run', '--config', 'vitest.config.e2e.ts', FEEDBACK_E2E],
    env: {},
    needsEnv: ['TEST_DATABASE_URL'],
  },
};

export const MUTANTS = [
  {
    id: 'S131-BE-01',
    name: 'a Safety Officer response omits the assigned coordinator notification (SAFETY-OUTCOME-01)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [['if (event.rows[0].coordinator_id) {', 'if (false) {']],
    testMappings: [
      unit('notifies the assigned coordinator when the Safety Officer responds'),
      e2e('SAFETY-OUTCOME-01 notifies the assigned coordinator of a safety response'),
    ],
  },
  {
    id: 'S131-BE-02',
    name: 'the coordinator response notification is persisted under a different type (SAFETY-OUTCOME-01)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [["'coordinator_safety_response'", "'coordinator_assignment'"]],
    testMappings: [
      unit('notifies the assigned coordinator when the Safety Officer responds'),
      e2e('SAFETY-OUTCOME-01 notifies the assigned coordinator of a safety response'),
    ],
  },
  {
    id: 'S131-BE-03',
    name: 'the coordinator notification feed omits Safety Officer response notices (SAFETY-OUTCOME-01)',
    file: 'src/events/events.service.ts',
    suites: ['unit'],
    edits: [['? COORDINATOR_NOTIFICATION_TYPES', '? []']],
    testMappings: [{ suite: 'unit', file: 'src/events/review/events.reject.spec.ts', title: 'SAFETY-OUTCOME-01 lists safety response notices for the assigned coordinator' }],
  },
  {
    id: 'S131-BE-04',
    name: 'the coordinator planning read hides the Safety Officer decision comments (SAFETY-OUTCOME-02)',
    file: FEEDBACK_SOURCE,
    suites: ['backend-e2e'],
    edits: [['...(feedbackItems.length > 0 ? { feedback: feedbackItems } : {})', '...(false ? { feedback: feedbackItems } : {})']],
    testMappings: [
      e2e('SAFETY-OUTCOME-02 shows the safety decision and comments to the assigned coordinator'),
      e2e('SAFETY-OUTCOME-04 marks only selected arrangements and queues the event again after coordinator resubmission'),
    ],
  },
  {
    id: 'S131-BE-05',
    name: 'a changes-needed safety decision is treated as approved for confirmation (SAFETY-OUTCOME-03)',
    file: CONFIRM_SOURCE,
    suites: ['confirm-e2e'],
    edits: [["changes_needed: 'Changes Requested'", "changes_needed: 'Approved'"]],
    testMappings: [confirm('SAFETY-OUTCOME-03 SAFETY-SOURCE-02: a changes_needed safety check blocks Confirmed until approved')],
  },
  {
    id: 'S131-BE-06',
    name: 'a safety check can be re-requested while feedback remains unresolved (SAFETY-OUTCOME-06)',
    file: REQUEST_SOURCE,
    suites: ['feedback-e2e'],
    edits: [['if (count > 0)', 'if (false && count > 0)']],
    testMappings: [feedback('SAFETY-OUTCOME-06 SAFETY-FEEDBACK-02: re-requests safety review after revising equipment and restoring readiness')],
  },
  {
    id: 'S131-BE-07',
    name: 'a rejected safety outcome cancels the existing venue booking (SAFETY-OUTCOME-05)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [["INSERT INTO notifications (id, recipient_id, type, message, related_event_id)\n           VALUES ($1, $2, 'coordinator_safety_response', $3, $4)", "UPDATE venue_bookings SET status = 'cancelled' WHERE event_id = $1"], ['[randomUUID(), event.rows[0].coordinator_id, `The Safety Officer responded to the safety check for ${event.rows[0].event_name}.`, eventId]', '[eventId]']],
    testMappings: [unit('SAFETY-OUTCOME-05 does not change venue or equipment arrangement state'), e2e('SAFETY-OUTCOME-05 keeps the event and bookings active when the Safety Officer rejects it')],
  },
  {
    id: 'S131-BE-08',
    name: 'a response creates an orphan notice when no coordinator is assigned (SAFETY-OUTCOME-01)',
    file: SERVICE,
    suites: ['unit'],
    edits: [['if (event.rows[0].coordinator_id) {', 'if (true) {']],
    testMappings: [unit('does not write a coordinator notification when no coordinator is assigned')],
  },
  {
    id: 'S131-BE-09',
    name: 'an approved safety outcome is refused at the confirmation gate (SAFETY-OUTCOME-03)',
    file: CONFIRM_SOURCE,
    suites: ['confirm-e2e'],
    edits: [["approved: 'Approved'", "approved: 'Rejected'"]],
    testMappings: [confirm('SAFETY-OUTCOME-03 SAFETY-SOURCE-04: approved safety permits confirmation')],
  },
  {
    id: 'S131-BE-10',
    name: 'planning checklist drops safety-specific venue and equipment review markers (SAFETY-OUTCOME-04/05)',
    file: CHECKLIST_SOURCE,
    suites: ['unit'],
    edits: [["...(reviewVenueIds.has(b.id) ? { safetyReviewStatus: 'Pending review' as const } : {})", '...{}'], ["...(reviewEquipmentIds.has(l.id) ? { safetyReviewStatus: 'Pending review' as const } : {})", '...{}']],
    testMappings: [{ suite: 'unit', file: CHECKLIST_UNIT, title: 'SAFETY-OUTCOME-04 exposes Pending review only for selected arrangements' }],
  },
  {
    id: 'S131-BE-13',
    name: 'request-changes marks every venue and equipment arrangement Pending review (SAFETY-OUTCOME-04)',
    file: CHECKLIST_SOURCE,
    suites: ['backend-e2e'],
    edits: [['reviewVenueIds.has(b.id)', 'true'], ['reviewEquipmentIds.has(l.id)', 'true']],
    testMappings: [e2e('SAFETY-OUTCOME-04 marks only selected arrangements and queues the event again after coordinator resubmission')],
  },
  {
    id: 'S131-BE-14',
    name: 'legacy string feedback is accepted with empty arrangement review IDs (SAFETY-OUTCOME-04)',
    file: SERVICE,
    suites: ['unit'],
    edits: [[
      "if (!change || typeof change !== 'object' || Array.isArray(change))\n            throw new BadRequestException(`Change ${index + 1} must include a description and arrangement selections.`);",
      "if (typeof change === 'string' && change.trim()) return { text: change, reviewArrangements: { venueIds: [], equipmentIds: [] } };\n          if (!change || typeof change !== 'object' || Array.isArray(change))\n            throw new BadRequestException(`Change ${index + 1} must include a description and arrangement selections.`);",
    ]],
    testMappings: [unit('SAFETY-OUTCOME-04 refuses legacy string change rows before a transaction')],
  },
  {
    id: 'S131-BE-15',
    name: 'legacy reason-only feedback is accepted with empty arrangement review IDs (SAFETY-OUTCOME-04)',
    file: SERVICE,
    suites: ['unit'],
    edits: [
      ["if (hasReason)\n        throw new BadRequestException('Each requested change must identify at least one arrangement for review.');", "if (false && hasReason)\n        throw new BadRequestException('Each requested change must identify at least one arrangement for review.');"],
      ["throw new BadRequestException('Add at least one change and select arrangements for review.');", "feedbackItems = [{ text: String(input?.reason ?? ''), reviewArrangements: { venueIds: [], equipmentIds: [] } }];"],
    ],
    testMappings: [unit('SAFETY-OUTCOME-04 refuses legacy reason-only change requests before a transaction')],
  },
  {
    id: 'S131-BE-11',
    name: 'the safety outcome reader discards persisted arrangement review markers (SAFETY-OUTCOME-04/05)',
    file: FEEDBACK_SOURCE,
    suites: ['unit'],
    edits: [['reviewArrangements: row.review_arrangements ?? { venueIds: [], equipmentIds: [] }', 'reviewArrangements: { venueIds: [], equipmentIds: [] }']],
    testMappings: [{ suite: 'unit', file: SOURCE_UNIT, title: 'SAFETY-OUTCOME-04 reads review arrangement identifiers from safety feedback' }],
  },
  {
    id: 'S131-BE-12',
    name: 'rejection omits the all-arrangements safety review mapping (SAFETY-OUTCOME-05)',
    file: SERVICE,
    suites: ['unit', 'backend-e2e'],
    edits: [["const reviewArrangements = decision === 'rejected' ? selectedArrangements : feedbackItem.reviewArrangements;", 'const reviewArrangements = feedbackItem.reviewArrangements;']],
    testMappings: [e2e('SAFETY-OUTCOME-05 keeps the event and bookings active when the Safety Officer rejects it')],
  },
];
