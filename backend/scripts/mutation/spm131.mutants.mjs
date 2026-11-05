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
  unit: { args: ['run', UNIT, CHECKLIST_UNIT, SOURCE_UNIT, 'src/equipment/requests/equipment-requests.repository.spec.ts', 'src/equipment/requests/equipment-requests.service.spec.ts', 'src/equipment/requests/dto/equipment-request-input.spec.ts', 'src/events/review/events.reject.spec.ts', 'src/events/events.service.spec.ts', 'src/events/review/events.approve.spec.ts', 'src/events/cancelled-notifications.spec.ts', 'src/events/queue/coordinator-queue.service.spec.ts', 'src/event-drafts/drafts.http.spec.ts', 'src/event-drafts/drafts.service.spec.ts'] },
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
    file: 'src/events/coordinator-notification-types.ts',
    suites: ['unit'],
    edits: [["  'coordinator_safety_response',\n", '']],
    testMappings: [{ suite: 'unit', file: 'src/events/review/events.reject.spec.ts', title: 'SAFETY-OUTCOME-01 lists safety response notices for the assigned coordinator' }],
  },
  {
    id: 'S131-BE-04',
    name: 'the coordinator planning read hides the Safety Officer decision comments (SAFETY-OUTCOME-02)',
    file: FEEDBACK_SOURCE,
    suites: ['backend-e2e', 'feedback-e2e'],
    edits: [['...(feedbackItems.length > 0 ? { feedback: feedbackItems } : {})', '...(false ? { feedback: feedbackItems } : {})']],
    testMappings: [
      e2e('SAFETY-OUTCOME-02 shows the safety decision and comments to the assigned coordinator'),
      feedback('SAFETY-OUTCOME-06 re-approves selected arrangements through staff workflows before re-request'),
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
    testMappings: [unit('SAFETY-OUTCOME-05 returns selected venue and equipment rows to review'), e2e('SAFETY-OUTCOME-05 keeps the event and bookings active when the Safety Officer rejects it')],
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
    edits: [["...(reviewVenueIds.has(b.id) && venueRequestStatus(b, input.now) !== 'confirmed'\n        ? { safetyReviewStatus: 'Pending review' as const }\n        : {})", '...{}'], ["...(reviewEquipmentIds.has(l.id) && equipmentRequestStatus(l) !== 'confirmed'\n      ? { safetyReviewStatus: 'Pending review' as const }\n      : {})", '...{}']],
    testMappings: [{ suite: 'unit', file: CHECKLIST_UNIT, title: 'SAFETY-OUTCOME-04 tags only selected pending venue and equipment rows' }],
  },
  {
    id: 'S131-BE-13',
    name: 'request-changes marks every venue and equipment arrangement Pending review (SAFETY-OUTCOME-04)',
    file: CHECKLIST_SOURCE,
    suites: ['unit'],
    edits: [['reviewVenueIds.has(b.id)', 'true'], ['reviewEquipmentIds.has(l.id)', 'true']],
    testMappings: [{ suite: 'unit', file: CHECKLIST_UNIT, title: 'SAFETY-OUTCOME-04 tags only selected pending venue and equipment rows' }],
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
    id: 'S131-BE-16',
    name: 'equipment revision re-requests every arrangement instead of only safety-selected rows (SAFETY-OUTCOME-06)',
    file: 'src/equipment/requests/equipment-requests.repository.ts',
    suites: ['feedback-e2e'],
    edits: [[
      "JOIN event_safety_checks safety ON safety.event_id = feedback.event_id\n          WHERE item.request_id = $1::uuid\n            AND safety.status IN ('changes_needed', 'rejected')\n            AND COALESCE(feedback.review_arrangements->'equipmentIds', '[]'::jsonb) ? reservation.id::text",
      "JOIN event_safety_checks safety ON safety.event_id = feedback.event_id\n          WHERE item.request_id = $1::uuid\n            AND safety.status IN ('changes_needed', 'rejected')\n            AND true",
    ]],
    testMappings: [feedback('SAFETY-OUTCOME-06 re-approves selected arrangements through staff workflows before re-request')],
  },
  {
    id: 'S131-BE-17',
    name: 'migration replay re-marks already re-approved safety arrangements for review (SAFETY-OUTCOME-06)',
    file: 'migrations/031_spm131_resource_reapproval.sql',
    suites: ['feedback-e2e'],
    edits: [['SET reapproval_backfilled_at = now()', 'SET reapproval_backfilled_at = NULL']],
    testMappings: [feedback('SAFETY-OUTCOME-06 re-approves selected arrangements through staff workflows before re-request')],
  },
  {
    id: 'S131-BE-18',
    name: 'staff approvals invalidate retained feedback while safety reapproval is in progress (SAFETY-OUTCOME-06)',
    file: 'migrations/031_spm131_resource_reapproval.sql',
    suites: ['feedback-e2e'],
    edits: [
      ["AND feedback.reapproval_started_at IS NOT NULL\n          AND COALESCE(feedback.review_arrangements->'venueIds', '[]'::jsonb) ? OLD.id::text", "AND false\n          AND COALESCE(feedback.review_arrangements->'venueIds', '[]'::jsonb) ? OLD.id::text"],
      ["AND feedback.reapproval_started_at IS NOT NULL\n          AND COALESCE(feedback.review_arrangements->'equipmentIds', '[]'::jsonb) ? OLD.id::text", "AND false\n          AND COALESCE(feedback.review_arrangements->'equipmentIds', '[]'::jsonb) ? OLD.id::text"],
    ],
    testMappings: [feedback('SAFETY-OUTCOME-06 re-approves selected arrangements through staff workflows before re-request')],
  },
  {
    id: 'S131-BE-19',
    name: 'initial safety requests ignore enabled registration settings that have not been saved completely (SAFETY-OUTCOME-06)',
    file: REQUEST_SOURCE,
    suites: ['backend-e2e'],
    edits: [[
      "const checklist = buildChecklist({\n        snapshot,\n        equipmentNeeds: row.equipment_needs,\n        equipmentConfirmedAt: row.equipment_confirmed_at,\n        registration: {\n          enabled: row.registration_enabled,\n          opensAt: row.registration_opens_at,\n          closesAt: row.registration_closes_at,\n        },\n        safety: { status: 'not_requested' },\n        now,\n      });\n      if (!checklist.canRequestSafetyCheck)",
      "const checklist = buildChecklist({\n        snapshot,\n        equipmentNeeds: row.equipment_needs,\n        equipmentConfirmedAt: row.equipment_confirmed_at,\n        registration: {\n          enabled: false,\n          opensAt: row.registration_opens_at,\n          closesAt: row.registration_closes_at,\n        },\n        safety: { status: 'not_requested' },\n        now,\n      });\n      if (!checklist.canRequestSafetyCheck)",
    ]],
    testMappings: [e2e('SAFETY-OUTCOME-06 gates initial and repeat safety requests on persisted enabled registration settings')],
  },
  {
    id: 'S131-BE-20',
    name: 'validated equipment revisions discard stable request-item identifiers (SAFETY-OUTCOME-06)',
    file: 'src/equipment/requests/dto/equipment-request-input.ts',
    suites: ['unit'],
    edits: [["...(typeof item.id === 'string' ? { id: item.id } : {})", '...{}']],
    testMappings: [{ suite: 'unit', file: 'src/equipment/requests/dto/equipment-request-input.spec.ts', title: 'SAFETY-OUTCOME-06 preserves a valid stable item identifier' }],
  },
  {
    id: 'S131-BE-21',
    name: 'a rejected safety response leaves selected venue bookings approved instead of returning them to venue review (SAFETY-OUTCOME-05)',
    file: SERVICE,
    suites: ['backend-e2e'],
    edits: [["UPDATE venue_bookings SET status = 'pending'", "UPDATE venue_bookings SET status = 'approved'"]],
    testMappings: [e2e('SAFETY-OUTCOME-05 keeps the event and bookings active when the Safety Officer rejects it')],
  },
  {
    id: 'S131-BE-22',
    name: 'a rejected safety response leaves selected equipment Reserved instead of returning it to Technical Support review (SAFETY-OUTCOME-05)',
    file: SERVICE,
    suites: ['backend-e2e'],
    edits: [["UPDATE equipment_reservations SET status = 'Requested', updated_at = now()", "UPDATE equipment_reservations SET status = 'Reserved', updated_at = now()"]],
    testMappings: [e2e('SAFETY-OUTCOME-05 keeps the event and bookings active when the Safety Officer rejects it')],
  },
  {
    id: 'S131-BE-23',
    name: 'a deliberately disabled registration configuration blocks an otherwise ready safety request (SAFETY-OUTCOME-06)',
    file: CHECKLIST_SOURCE,
    suites: ['backend-e2e'],
    edits: [['const registrationReady = !registration.enabled || (!!registration.opensAt && !!registration.closesAt);', 'const registrationReady = registration.enabled && !!registration.opensAt && !!registration.closesAt;']],
    testMappings: [e2e('SAFETY-OUTCOME-06 allows a safety request when registration is deliberately disabled')],
  },
  {
    id: 'S131-BE-24',
    name: 'a fully rectified and acknowledged safety outcome cannot be re-requested (SAFETY-OUTCOME-06)',
    file: REQUEST_SOURCE,
    suites: ['feedback-e2e'],
    edits: [['if (!checklist.canRequestSafetyCheck)', 'if (true)']],
    testMappings: [feedback('SAFETY-OUTCOME-06 re-approves selected arrangements through staff workflows before re-request')],
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
  {
    id: 'S131-BE-25',
    name: 'the notification feed lists every recipient\'s notices, so an unassigned coordinator sees the safety response notice (SAFETY-OUTCOME-01 isolation)',
    file: 'src/events/events.service.ts',
    suites: ['backend-e2e'],
    edits: [['WHERE n.recipient_id = $1 AND n.type = ANY($2)', 'WHERE ($1::uuid IS NOT NULL OR n.recipient_id = $1) AND n.type = ANY($2)']],
    testMappings: [
      e2e('SAFETY-OUTCOME-01-SUP-ISOLATION sends no safety response notice to a coordinator who is not assigned to the event'),
      e2e('SAFETY-OUTCOME-01-SUP-SECURITY keeps the coordinator safety response notice unreadable by an organiser or an unassigned coordinator'),
    ],
  },
  {
    id: 'S131-BE-26',
    name: 'any coordinator can mark another coordinator\'s safety response notice read (SAFETY-OUTCOME-01 security)',
    file: 'src/events/events.service.ts',
    suites: ['backend-e2e'],
    edits: [['WHERE id = $1 AND recipient_id = $2 AND type = ANY($3) RETURNING id', 'WHERE id = $1 AND ($2::uuid IS NOT NULL OR recipient_id = $2) AND type = ANY($3) RETURNING id']],
    testMappings: [e2e('SAFETY-OUTCOME-01-SUP-SECURITY keeps the coordinator safety response notice unreadable by an organiser or an unassigned coordinator')],
  },
  {
    id: 'S131-BE-27',
    name: 'the planning read serves the safety decision and comments to a user who is not the assigned coordinator (SAFETY-OUTCOME-02 security)',
    file: REQUEST_SOURCE,
    suites: ['backend-e2e'],
    edits: [['    const user = this.requireUser(identity);\n    await this.assignedEventOrThrow(user, eventId);\n    const now = this.clock.now();\n    const snapshot = await this.reader.read(this.database, eventId, { lock: false });\n    const result: ReadinessResult', '    this.requireUser(identity);\n    const now = this.clock.now();\n    const snapshot = await this.reader.read(this.database, eventId, { lock: false });\n    const result: ReadinessResult']],
    testMappings: [e2e('SAFETY-OUTCOME-02-SUP-SECURITY refuses the safety decision and comments to a coordinator who is not assigned to the event')],
  },
  {
    id: 'S131-BE-28',
    name: 'a safety check awaiting a decision already shows an approver name to the coordinator (SAFETY-OUTCOME-02 no-decision display)',
    file: FEEDBACK_SOURCE,
    suites: ['backend-e2e'],
    edits: [['...(row.approver_name ? { approverName: row.approver_name } : {}),', "approverName: row.approver_name ?? 'Safety Officer',"]],
    testMappings: [e2e('SAFETY-OUTCOME-02-SUP-NO-DECISION shows no decision or comments to the coordinator before the Safety Officer responds')],
  },
];
