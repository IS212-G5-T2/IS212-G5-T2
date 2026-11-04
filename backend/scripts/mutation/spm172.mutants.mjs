// SPM-172 backend mutants: the equipment request decision notification written when Technical Support reserve a request or
// mark it cannot be provided (message wording, recipient, type, event and request links, decision time, written in the
// decision transaction after the status update, refused decisions write nothing, the Coordinator's feed allow-list and
// reassignment clearing). Each mutant maps to its EQUIP-REQ-NOTIF tests by ID prefix; the runner matches the prefix by name.
const NOTICE_SPEC = 'src/equipment/requests/equipment-decision-notice.spec.ts';
const FEED_SPEC = 'src/events/equipment-request-notifications.spec.ts';
const LEAD_SPEC = 'src/lead/lead-assignment.service.spec.ts';
const E2E = 'test/equipment-request-decision-notifications.e2e-spec.ts';
const NOTICE = 'src/equipment/requests/equipment-decision-notice.ts';
const REPO = 'src/equipment/requests/equipment-requests.repository.ts';
const MESSAGES = 'src/registrations/helpers/messages.ts';
const EVENTS = 'src/events/events.service.ts';
const LEAD = 'src/lead/lead-assignment.service.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `EQUIP-REQ-NOTIF-${id} ` }));
const notice = (...ids) => map('backendUnit', NOTICE_SPEC, ...ids);
const feed = (...ids) => map('backendUnit', FEED_SPEC, ...ids);
const lead = (...ids) => map('backendUnit', LEAD_SPEC, ...ids);
const e2e = (...ids) => map('backendE2E', E2E, ...ids);

export const SUITES = {
  backendUnit: {
    args: ['run', NOTICE_SPEC, FEED_SPEC, LEAD_SPEC],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

const RESERVE_NOTIFY = "      await notifyEquipmentDecision(client, this.decisionContext(request, 'reserved', now));\n";
const CANNOT_NOTIFY = "      await notifyEquipmentDecision(client, this.decisionContext(request, 'cannot-provide', now));\n";
const NOT_PENDING = "      if (request.status !== 'Pending Review') return { kind: 'not-pending' as const };\n";
const RESERVE_SQL = "      await client.query(\n        \"UPDATE equipment_requests SET status = 'Reserved'";

export const MUTANTS = [
  {
    id: 'SPM172-BE-01',
    name: 'reserved message wording changed ("was reserved" instead of "has been reserved")',
    file: MESSAGES,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('02-A', '01-A'), ...e2e('02-E')],
    edits: [["'has been reserved'", "'was reserved'"]],
  },
  {
    id: 'SPM172-BE-02',
    name: 'cannot-provide message wording changed ("could not be provided")',
    file: MESSAGES,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('02-B', '01-B'), ...e2e('02-E')],
    edits: [["'cannot be provided'", "'could not be provided'"]],
  },
  {
    id: 'SPM172-BE-03',
    name: 'the event name is not quoted in the message',
    file: MESSAGES,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('02-A', '02-B'), ...e2e('02-E')],
    edits: [['request for "${eventName}" ${decision', 'request for ${eventName} ${decision']],
  },
  {
    id: 'SPM172-BE-04',
    name: 'notification addressed to the event id instead of the Coordinator',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('01-A', '01-B'), ...e2e('01-E', '01-F')],
    edits: [['      context.coordinatorId,\n      context.decision', '      context.eventId,\n      context.decision']],
  },
  {
    id: 'SPM172-BE-05',
    name: 'reserved and cannot-provide notification types swapped',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('01-A', '01-B'), ...e2e('01-E', '01-F')],
    edits: [["context.decision === 'reserved' ? EQUIPMENT_RESERVED_NOTICE : EQUIPMENT_CANNOT_PROVIDE_NOTICE", "context.decision === 'reserved' ? EQUIPMENT_CANNOT_PROVIDE_NOTICE : EQUIPMENT_RESERVED_NOTICE"]],
  },
  {
    id: 'SPM172-BE-06',
    name: 'notification written without the request link',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('01-A', '01-B'), ...e2e('03-B', '01-E')],
    edits: [['      context.requestId,\n      context.decidedAt,', '      null,\n      context.decidedAt,']],
  },
  {
    id: 'SPM172-BE-07',
    name: 'notification written without the event link',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('01-A', '01-B'), ...e2e('01-E')],
    edits: [['      context.eventId,\n      context.requestId,', '      null,\n      context.requestId,']],
  },
  {
    id: 'SPM172-BE-08',
    name: 'notification stamped with the real time instead of the decision time',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('02-C'), ...e2e('02-E')],
    edits: [['      context.decidedAt,\n    ],', '      new Date(),\n    ],']],
  },
  {
    id: 'SPM172-BE-09',
    name: 'an event with no Coordinator is still given a notification (null recipient)',
    file: NOTICE,
    suites: ['backendUnit'],
    testMappings: notice('01-C'),
    edits: [['  if (!context.coordinatorId) return;\n', '']],
  },
  {
    id: 'SPM172-BE-10',
    name: 'notification written twice for one decision',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('01-A', '01-B'), ...e2e('01-E', '01-F', '05-B')],
    edits: [['  await client.query(\n    `INSERT INTO notifications', '  for (const _copy of [1, 2]) await client.query(\n    `INSERT INTO notifications']],
  },
  {
    id: 'SPM172-BE-11',
    name: 'the equipment decision notice is inserted already read',
    file: NOTICE,
    suites: ['backendE2E'],
    testMappings: e2e('04-B'),
    edits: [[
      'related_equipment_request_id, created_at)\n     VALUES ($1, $2, $3, $4, $5, $6::uuid, $7)`',
      'related_equipment_request_id, created_at, read)\n     VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, true)`',
    ]],
  },
  {
    id: 'SPM172-BE-12',
    name: 'reserving a request writes no notification',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('01-A', '02-C', '02-D', '06-A'), ...e2e('01-E', '06-B')],
    edits: [[RESERVE_NOTIFY, '']],
  },
  {
    id: 'SPM172-BE-13',
    name: 'marking a request cannot-provide writes no notification',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('01-B', '02-C', '02-D', '06-A'), ...e2e('01-F')],
    edits: [[CANNOT_NOTIFY, '']],
  },
  {
    id: 'SPM172-BE-14',
    name: 'a reservation is notified as cannot-provide',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('01-A'), ...e2e('01-E')],
    edits: [[RESERVE_NOTIFY, "      await notifyEquipmentDecision(client, this.decisionContext(request, 'cannot-provide', now));\n"]],
  },
  {
    id: 'SPM172-BE-15',
    name: 'a reserve attempt on a request that is not Pending Review writes a notification',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('07-A'), ...e2e('05-B')],
    // The first occurrence of the guard is in reserve (it comes before markCannotProvide in the file).
    edits: [[NOT_PENDING + '\n      // Lock the matching', "      if (request.status !== 'Pending Review') {\n        await notifyEquipmentDecision(client, this.decisionContext(request, 'reserved', this.clock.now()));\n        return { kind: 'not-pending' as const };\n      }\n\n      // Lock the matching"]],
  },
  {
    id: 'SPM172-BE-16',
    name: 'a cannot-provide attempt on a request that is not Pending Review writes a notification',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('07-A'), ...e2e('05-B')],
    edits: [[NOT_PENDING + '\n      const now = this.clock.now();\n      await client.query(\n        `UPDATE equipment_requests\n            SET status = \'Cannot Provide\'', "      if (request.status !== 'Pending Review') {\n        await notifyEquipmentDecision(client, this.decisionContext(request, 'cannot-provide', this.clock.now()));\n        return { kind: 'not-pending' as const };\n      }\n\n      const now = this.clock.now();\n      await client.query(\n        `UPDATE equipment_requests\n            SET status = 'Cannot Provide'"]],
  },
  {
    id: 'SPM172-BE-17',
    name: 'a reservation refused for insufficient stock writes a notification',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('07-B'), ...e2e('07-C')],
    edits: [["      if (unavailable) return { kind: 'insufficient-active-stock'", "      if (unavailable) await notifyEquipmentDecision(client, this.decisionContext(request, 'reserved', this.clock.now()));\n      if (unavailable) return { kind: 'insufficient-active-stock'"]],
  },
  {
    id: 'SPM172-BE-18',
    name: 'the reservation notification is written before the status update (not after the saved decision)',
    file: REPO,
    suites: ['backendUnit'],
    testMappings: notice('02-D'),
    edits: [
      [RESERVE_NOTIFY, ''],
      [RESERVE_SQL, RESERVE_NOTIFY + RESERVE_SQL],
    ],
  },
  {
    id: 'SPM172-BE-19',
    name: 'a failed cannot-provide notification is swallowed so the decision still commits',
    file: REPO,
    suites: ['backendUnit'],
    testMappings: notice('05-A'),
    edits: [[CANNOT_NOTIFY, "      try {\n  " + CANNOT_NOTIFY.trimStart() + "      } catch { /* ignore */ }\n"]],
  },
  {
    id: 'SPM172-BE-20',
    name: 'the recipient is a remembered Coordinator instead of the one on the locked event row',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('06-A'), ...e2e('06-B')],
    edits: [['      coordinatorId: request.coordinator_id,', "      coordinatorId: 'coo-01',"]],
  },
  {
    id: 'SPM172-BE-21',
    name: "the Coordinator's feed allow-list does not include the equipment decision types",
    file: EVENTS,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...feed('01-D', '04-A'), ...e2e('01-E', '04-B')],
    edits: [['            ...EQUIPMENT_DECISION_NOTICE_TYPES,\n', '']],
  },
  {
    id: 'SPM172-BE-22',
    name: "the Organiser's feed allow-list also includes the equipment decision types",
    file: EVENTS,
    suites: ['backendUnit'],
    testMappings: feed('01-D'),
    edits: [['            CANCELLATION_DECLINED_NOTICE,\n          ]', '            CANCELLATION_DECLINED_NOTICE,\n            ...EQUIPMENT_DECISION_NOTICE_TYPES,\n          ]']],
  },
  {
    id: 'SPM172-BE-23',
    name: 'the feed omits the request id of an equipment notice',
    file: EVENTS,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...feed('03-A'), ...e2e('03-B')],
    edits: [['relatedEquipmentRequestId: row.related_equipment_request_id ?? null,', 'relatedEquipmentRequestId: null,']],
  },
  {
    id: 'SPM172-BE-24',
    name: 'an equipment notice is labelled an Organiser notice',
    file: EVENTS,
    suites: ['backendUnit'],
    testMappings: feed('03-A'),
    edits: [["if ((EQUIPMENT_DECISION_NOTICE_TYPES as readonly string[]).includes(row.type)) return 'coordinator';", "if ((EQUIPMENT_DECISION_NOTICE_TYPES as readonly string[]).includes(row.type)) return 'organiser';"]],
  },
  {
    id: 'SPM172-BE-25',
    name: "reassignment no longer marks the previous Coordinator's equipment decision notices read",
    file: LEAD,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...lead('06-D'), ...e2e('06-C')],
    edits: [["                         ${EQUIPMENT_DECISION_NOTICE_TYPES.map((type) => `'${type}'`).join(', ')},\n", '']],
  },
  {
    id: 'SPM172-BE-26',
    name: 'the reservation notice is written after the transaction commits (through the database, not the transaction client)',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('02-D'), ...e2e('05-A')],
    edits: [
      ['    return this.database.transaction(async (client) => {\n      const found = await client.query<{ id: string; status: string; event_id: string; event_status: string; start_date_time', '    const outcome = await this.database.transaction(async (client) => {\n      const found = await client.query<{ id: string; status: string; event_id: string; event_status: string; start_date_time'],
      [RESERVE_NOTIFY + "      return { kind: 'reserved' as const, id: request.id };\n    });\n", "      return { kind: 'reserved' as const, id: request.id, ctx: this.decisionContext(request, 'reserved', now) };\n    });\n    if ('ctx' in outcome) await notifyEquipmentDecision(this.database, outcome.ctx);\n    return outcome;\n"],
    ],
  },
  {
    id: 'SPM172-BE-27',
    name: 'the cannot-provide notice is written after the transaction commits (through the database, not the transaction client)',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...notice('02-D'), ...e2e('05-A')],
    edits: [
      ['  async markCannotProvide(requestId: string, reason: string) {\n    return this.database.transaction(', '  async markCannotProvide(requestId: string, reason: string) {\n    const outcome = await this.database.transaction('],
      [CANNOT_NOTIFY + "      return { kind: 'cannot-provided' as const, id: request.id };\n    });\n", "      return { kind: 'cannot-provided' as const, id: request.id, ctx: this.decisionContext(request, 'cannot-provide', now) };\n    });\n    if ('ctx' in outcome) await notifyEquipmentDecision(this.database, outcome.ctx);\n    return outcome;\n"],
    ],
  },
  {
    id: 'SPM172-BE-28',
    name: 'every notification in the feed is labelled a Coordinator notice',
    file: EVENTS,
    suites: ['backendUnit'],
    testMappings: feed('03-A'),
    edits: [["(EQUIPMENT_DECISION_NOTICE_TYPES as readonly string[]).includes(row.type)) return 'coordinator';", "(EQUIPMENT_DECISION_NOTICE_TYPES as readonly string[]).includes(row.type) || true) return 'coordinator';"]],
  },
];
