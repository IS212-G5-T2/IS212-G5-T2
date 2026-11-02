// SPM-77 backend mutants: the coordinator_assignment notification written by the Lead's assign call (message wording and
// Singapore proposed date, recipient, type, event link, single insert, unread start and persistence, refused assignments
// write nothing, Lead-only). Each mutant maps to its ASSIGN-NOTIFY test by ID prefix; the runner matches the prefix by name.
const UNIT = 'src/lead/lead-assignment.service.spec.ts';
const E2E = 'test/lead-assignment.e2e-spec.ts';
const SERVICE = 'src/lead/lead-assignment.service.ts';
const EVENTS = 'src/events/events.service.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `ASSIGN-NOTIFY-${id} ` }));
const unit = (...ids) => map('backendUnit', UNIT, ...ids);
const e2e = (...ids) => map('backendE2E', E2E, ...ids);

export const SUITES = {
  backendUnit: {
    args: ['run', UNIT],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

const INSERT_HEAD = "await client.query(\n        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)\n         VALUES ($1, $2, 'coordinator_assignment', $3, $4)`,";
const MESSAGE = '`"${event.event_name}" on ${formatSgtDate(new Date(event.start_date_time))} has been assigned to you.`';
const ASSIGNED_CHECK = "if (event.coordinator_id)\n        throw new ConflictException('This event request has already been assigned.');";
const UPDATE_THEN_INSERT =
  "      await client.query(\n        `UPDATE events\n            SET coordinator_id = $2, coordinator_name = $3, updated_at = now()\n          WHERE id = $1`,\n        [eventId, coordinator.id, coordinator.display_name],\n      );\n      " +
  INSERT_HEAD;

export const MUTANTS = [
  {
    id: 'SPM77-BE-01',
    name: 'message keeps the old "awaiting your review" wording without the proposed date',
    file: SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...unit('02-A', '02-BND-1'), ...e2e('02-B')],
    edits: [[MESSAGE, '`New event request "${event.event_name}" is awaiting your review.`']],
  },
  {
    id: 'SPM77-BE-02',
    name: 'proposed date shown in UTC instead of the Singapore day',
    file: SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...unit('02-A', '02-BND-1'), ...e2e('02-B')],
    edits: [['${formatSgtDate(new Date(event.start_date_time))} has been', "${new Date(event.start_date_time).toISOString().slice(0, 10)} has been"]],
  },
  {
    id: 'SPM77-BE-03',
    name: 'proposed date not taken from the event (epoch shown)',
    file: SERVICE,
    suites: ['backendUnit'],
    testMappings: unit('02-A', '02-BND-1'),
    edits: [['formatSgtDate(new Date(event.start_date_time))} has', 'formatSgtDate(new Date(0))} has']],
  },
  {
    id: 'SPM77-BE-04',
    name: 'notification addressed to the Lead instead of the assigned coordinator',
    file: SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...unit('01-A'), ...e2e('01-B')],
    edits: [["          randomUUID(),\n          coordinator.id,\n          `\"", "          randomUUID(),\n          requireLead(identity).uid,\n          `\""]],
  },
  {
    id: 'SPM77-BE-05',
    name: 'notification written without the event id (nothing for the bell to link to)',
    file: SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...unit('01-A'), ...e2e('03-A')],
    edits: [["formatSgtDate(new Date(event.start_date_time))} has been assigned to you.`,\n          eventId,\n        ],", "formatSgtDate(new Date(event.start_date_time))} has been assigned to you.`,\n          null,\n        ],"]],
  },
  {
    id: 'SPM77-BE-06',
    name: 'assignment notification written twice',
    file: SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...unit('01-A'), ...e2e('01-B')],
    edits: [[INSERT_HEAD, 'for (const _copy of [1, 2]) ' + INSERT_HEAD]],
  },
  {
    id: 'SPM77-BE-07',
    name: 'assignment notification written with the reassignment type',
    file: SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...unit('01-A'), ...e2e('02-B')],
    edits: [["VALUES ($1, $2, 'coordinator_assignment', $3, $4)`,", "VALUES ($1, $2, 'coordinator_reassignment', $3, $4)`,"]],
  },
  {
    id: 'SPM77-BE-08',
    name: 'notification created already read',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: e2e('04-A'),
    edits: [[
      "`INSERT INTO notifications (id, recipient_id, type, message, related_event_id)\n         VALUES ($1, $2, 'coordinator_assignment', $3, $4)`,",
      "`INSERT INTO notifications (id, recipient_id, type, message, related_event_id, read)\n         VALUES ($1, $2, 'coordinator_assignment', $3, $4, true)`,",
    ]],
  },
  {
    id: 'SPM77-BE-09',
    name: 'marking a notification read is not stored',
    file: EVENTS,
    suites: ['backendE2E'],
    testMappings: e2e('04-A'),
    edits: [['SET read = true', 'SET read = false']],
  },
  {
    id: 'SPM77-BE-10',
    name: 'any coordinator can mark another coordinator\'s notification read',
    file: EVENTS,
    suites: ['backendE2E'],
    testMappings: e2e('04-B'),
    edits: [['AND recipient_id = $2 AND type = ANY($3)', 'AND $2::text IS NOT NULL AND type = ANY($3)']],
  },
  {
    id: 'SPM77-BE-11',
    name: 'assignment to an unavailable coordinator is accepted (notification written)',
    file: SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...unit('05-A'), ...e2e('05-D')],
    edits: [["    if (!coordinator.is_available) throw new ConflictException('This coordinator is unavailable.');\n", '']],
  },
  {
    id: 'SPM77-BE-12',
    name: 'an already-assigned request is assigned again (second notification written)',
    file: SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...unit('05-A'), ...e2e('05-E', '05-G')],
    edits: [[ASSIGNED_CHECK, '']],
  },
  {
    id: 'SPM77-BE-13',
    name: 'a request that is no longer Submitted is assigned and notified',
    file: SERVICE,
    suites: ['backendUnit'],
    testMappings: unit('05-A'),
    edits: [["      if (event.status !== 'Submitted')\n        throw new ConflictException('This event request is no longer awaiting assignment.');\n\n      const coordinator = await this.availableCoordinator(client, coordinatorId);\n\n      await client.query(\n        `UPDATE events\n            SET coordinator_id = $2, coordinator_name = $3, updated_at = now()\n          WHERE id = $1`,\n        [eventId, coordinator.id, coordinator.display_name],\n      );\n      await client.query(\n        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)\n         VALUES ($1, $2, 'coordinator_assignment'", "      const coordinator = await this.availableCoordinator(client, coordinatorId);\n\n      await client.query(\n        `UPDATE events\n            SET coordinator_id = $2, coordinator_name = $3, updated_at = now()\n          WHERE id = $1`,\n        [eventId, coordinator.id, coordinator.display_name],\n      );\n      await client.query(\n        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)\n         VALUES ($1, $2, 'coordinator_assignment'"]],
  },
  {
    id: 'SPM77-BE-14',
    name: 'assignment by a caller without the Lead role is accepted',
    file: SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...unit('05-B'), ...e2e('05-F')],
    edits: [["  if (!user.roles.includes('COORDINATOR_LEAD'))\n    throw new ForbiddenException('Event Coordinator Lead access required.');\n", '']],
  },
  {
    id: 'SPM77-BE-15',
    name: 'an account holding both the Lead and Coordinator roles may assign',
    file: SERVICE,
    suites: ['backendUnit'],
    testMappings: unit('05-B'),
    edits: [["  if (user.roles.includes('COORDINATOR'))\n    throw new ForbiddenException('An Event Coordinator Lead cannot also be an Event Coordinator.');\n", '']],
  },
  {
    id: 'SPM77-BE-16',
    name: 'a failed assignment save is swallowed and the notification is still written',
    file: SERVICE,
    suites: ['backendUnit'],
    testMappings: unit('05-C'),
    edits: [[UPDATE_THEN_INSERT, "      try {\n        await client.query(\n        `UPDATE events\n            SET coordinator_id = $2, coordinator_name = $3, updated_at = now()\n          WHERE id = $1`,\n        [eventId, coordinator.id, coordinator.display_name],\n      );\n      } catch {\n        // swallowed\n      }\n      " + INSERT_HEAD]],
  },
  {
    id: 'SPM77-BE-17',
    name: 'date-only formatter drops the Singapore timezone (server timezone used)',
    file: 'src/registrations/helpers/messages.ts',
    suites: ['backendUnit'],
    testMappings: unit('02-BND-1'),
    edits: [["const SGT_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {\n  timeZone: 'Asia/Singapore',", "const SGT_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {\n  timeZone: 'UTC',"]],
  },
  {
    id: 'SPM77-BE-18',
    name: 'assign SELECT without FOR UPDATE (no row lock, racing assignments overlap)',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: e2e('05-G'),
    edits: [["'SELECT id, event_name, status, coordinator_id, start_date_time FROM events WHERE id = $1 FOR UPDATE',", "'SELECT id, event_name, status, coordinator_id, start_date_time FROM events WHERE id = $1',"]],
  },
];
