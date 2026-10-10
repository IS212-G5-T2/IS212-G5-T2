// SPM-63 backend mutants, run by run.mjs:  node scripts/mutation/run.mjs --mutants spm63.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// IDs M1 to M20 match the task prompt's list; X* are extra mutants added while reviewing the suite.
// Not expressible as one textual edit: M5 (the export routes skip the access check). The check lives in ONE shared
// method, RegistrationsService.getReport, that the report and both exports call (R3), so no export-only bypass exists to
// inject. The three-door `it.each` in registrations.report.e2e-spec.ts (05-A/05-B/05-D) is what would catch one.
export const SUITES = {
  // Pure specs for the SPM-63 formatters, the access rule and the CSV writer.
  unit: {
    args: ['run', 'src/registrations/report/report-format.spec.ts', 'src/registrations/report/report-access.spec.ts', 'src/registrations/report/export.service.spec.ts'],
  },
  // PostgreSQL integration suite; needs DATABASE_URL with database/postgresql/init 001 to 007 applied.
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/registrations.report'],
    needsEnv: ['DATABASE_URL'],
  },
};

const SERVICE = 'src/registrations/registrations.service.ts';
const ACCESS = 'src/registrations/report/report-access.ts';
const EXPORT = 'src/registrations/report/export.service.ts';
const FORMAT = 'src/registrations/report/report-format.ts';
const CONTROLLER = 'src/registrations/registrations.controller.ts';
const both = ['unit', 'e2e'];

export const MUTANTS = [
  { id: 'M1', name: "status filter `= 'Registered'` -> `<> 'Withdrawn'` (equivalent: the CHECK constraint allows only these two statuses, Q8)", file: SERVICE, equivalent: true,
    edits: [["WHERE event_id = $1 AND status = 'Registered'\n        ORDER BY created_at ASC", "WHERE event_id = $1 AND status <> 'Withdrawn'\n        ORDER BY created_at ASC"]], suites: ['e2e'] },
  { id: 'M2', name: 'assignment check removed (any coordinator)', file: ACCESS,
    edits: [["user.roles.includes('COORDINATOR') && event.coordinatorId === user.uid", "user.roles.includes('COORDINATOR')"]], suites: both },
  { id: 'M3', name: 'ownership check removed (any organiser)', file: ACCESS,
    edits: [["user.roles.includes('ORGANISER') && event.organiserId === user.uid", "user.roles.includes('ORGANISER')"]], suites: both },
  { id: 'M4', name: 'identity read from the query string instead of the session (report route)', file: CONTROLLER,
    edits: [[
      "  report(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {\n    return this.registrations.getReport(request[CURRENT_USER_REQUEST_KEY], eventId);",
      "  report(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {\n    const user = request[CURRENT_USER_REQUEST_KEY];\n    const asked = request.query.coordinatorId ?? request.query.organiserId;\n    return this.registrations.getReport(asked && user ? { ...user, uid: String(asked) } : user, eventId);",
    ]], suites: ['e2e'] },
  { id: 'M6a', name: 'service backstop 401 -> 403 (equivalent: the authentication middleware answers 401 first)', file: SERVICE, equivalent: true,
    edits: [["    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');\n    this.requireEventId(eventId);\n\n    const found", "    if (!identity?.uid) throw new ForbiddenException('Authentication required.');\n    this.requireEventId(eventId);\n\n    const found"]], suites: ['e2e'] },
  { id: 'M6b', name: 'authentication middleware no longer applied to the registrations routes (every request loses its identity)', file: 'src/app.module.ts',
    edits: [['        DraftsController,\n        RegistrationsController,\n        EquipmentController,', '        DraftsController,\n        EquipmentController,']], suites: ['e2e'] },
  { id: 'M7', name: 'an attendee is allowed', file: ACCESS,
    edits: [['return isAssignedCoordinator || isOwningOrganiser;', "return isAssignedCoordinator || isOwningOrganiser || user.roles.includes('ATTENDEE');"]], suites: both },
  { id: 'M8', name: 'rows sorted by registration date descending', file: SERVICE,
    edits: [['ORDER BY created_at ASC, id ASC', 'ORDER BY created_at DESC, id ASC']], suites: ['e2e'] },
  { id: 'M8b', name: 'rows sorted by registration id only', file: SERVICE,
    edits: [['ORDER BY created_at ASC, id ASC', 'ORDER BY id ASC']], suites: ['e2e'] },
  { id: 'M10', name: 'comma no longer forces quoting', file: EXPORT,
    edits: [['/[",\\r\\n]/.test(cell)', '/["\\r\\n]/.test(cell)']], suites: both },
  { id: 'M11', name: 'inner quote escaped as \\" instead of ""', file: EXPORT,
    edits: [["cell.replaceAll('\"', '\"\"')", "cell.replaceAll('\"', '\\\\\"')"]], suites: both },
  { id: 'M12a', name: 'formula neutralisation removed', file: EXPORT,
    edits: [['  const cell = neutralizeCsvCell(value);', '  const cell = value;']], suites: both },
  { id: 'M12b', name: 'quote first, then prefix (wrong order)', file: EXPORT,
    edits: [[
      "  const cell = neutralizeCsvCell(value);\n  return /[\",\\r\\n]/.test(cell) ? `\"${cell.replaceAll('\"', '\"\"')}\"` : cell;",
      "  const quoted = /[\",\\r\\n]/.test(value) ? `\"${value.replaceAll('\"', '\"\"')}\"` : value;\n  return neutralizeCsvCell(quoted);",
    ]], suites: both },
  { id: 'M13', name: 'neutralisation applied at input (the report JSON would carry the prefix)', file: SERVICE,
    edits: [
      ["import { canViewEventRegistrations } from './report/report-access.js';", "import { canViewEventRegistrations } from './report/report-access.js';\nimport { neutralizeCsvCell } from './sanitization.js';"],
      ["fullName: (row.full_name ?? '') as string,", "fullName: neutralizeCsvCell((row.full_name ?? '') as string),"],
    ], suites: ['e2e'] },
  { id: 'M14', name: 'the whole event row spread into the response', file: SERVICE,
    edits: [
      ['SELECT id, event_name, start_date_time, end_date_time, registration_limit, organiser_id, coordinator_id\n         FROM events WHERE id = $1', 'SELECT * FROM events WHERE id = $1'],
      ['        capacity: event.registration_limit,\n      },', '        capacity: event.registration_limit,\n        ...event,\n      },'],
    ], suites: ['e2e'] },
  { id: 'M18', name: 'CSV header skipped when there are no rows', file: EXPORT,
    edits: [["const lines = [CSV_HEADER.join(','), ...rows];", "const lines = rows.length ? [CSV_HEADER.join(','), ...rows] : [];"]], suites: both },
  { id: 'M19a', name: 'PDF empty state never shown', file: EXPORT,
    edits: [['if (report.registrations.length === 0) {', 'if (false) {']], suites: ['e2e'] },
  { id: 'M19b', name: 'PDF summary count off by one', file: EXPORT,
    edits: [['attendeeCountLine(report.totalConfirmed, report.event.capacity)', 'attendeeCountLine(report.totalConfirmed + 1, report.event.capacity)']], suites: ['e2e'] },
  { id: 'M20', name: 'count wording always plural', file: FORMAT,
    edits: [["const noun = count === 1 ? 'Attendee' : 'Attendees';", "const noun = 'Attendees';"]], suites: ['unit'] },
  { id: 'X1', name: 'available spots not clamped at zero', file: SERVICE,
    edits: [['Math.max(event.registration_limit - registrations.length, 0)', 'event.registration_limit - registrations.length']], suites: ['e2e'] },
  { id: 'X2', name: 'Cache-Control header removed from the report route', file: CONTROLLER,
    edits: [["  @Header('Cache-Control', 'no-store')\n  report(", '  report(']], suites: ['e2e'] },
  { id: 'X3', name: 'byte order mark removed', file: EXPORT,
    edits: [["const BOM = '﻿';", "const BOM = '';"]], suites: both },
  { id: 'X4', name: 'LF instead of CRLF record endings', file: EXPORT,
    edits: [["const CRLF = '\\r\\n';", "const CRLF = '\\n';"]], suites: both },
  { id: 'X5', name: 'tie-break by registration id dropped', file: SERVICE,
    edits: [['ORDER BY created_at ASC, id ASC', 'ORDER BY created_at ASC']], suites: ['e2e'] },
  { id: 'X6', name: 'denial not logged', file: SERVICE,
    edits: [['      this.logger.warn({\n        message:', '      void ({\n        message:']], suites: ['e2e'] },
  { id: 'X7', name: 'export format validated before access is checked', file: CONTROLLER,
    edits: [[
      "    const report = await this.registrations.getReport(request[CURRENT_USER_REQUEST_KEY], eventId);\n    if (format !== 'csv' && format !== 'pdf') throw new BadRequestException(MESSAGES.exportFormatInvalid);",
      "    if (format !== 'csv' && format !== 'pdf') throw new BadRequestException(MESSAGES.exportFormatInvalid);\n    const report = await this.registrations.getReport(request[CURRENT_USER_REQUEST_KEY], eventId);",
    ]], suites: ['e2e'] },
  { id: 'X8', name: 'an unknown export format falls back to PDF', file: CONTROLLER,
    edits: [["if (format !== 'csv' && format !== 'pdf') throw new BadRequestException(MESSAGES.exportFormatInvalid);", 'if (false) throw new BadRequestException(MESSAGES.exportFormatInvalid);']], suites: ['e2e'] },
  { id: 'X9', name: 'dates formatted in UTC instead of Asia/Singapore', file: FORMAT,
    edits: [["const SGT_PARTS = new Intl.DateTimeFormat('en-GB', {\n  timeZone: SGT_TIME_ZONE,", "const SGT_PARTS = new Intl.DateTimeFormat('en-GB', {\n  timeZone: 'UTC',"]], suites: both },
  { id: 'X10', name: 'coordinator matched on the organiser column', file: ACCESS,
    edits: [["user.roles.includes('COORDINATOR') && event.coordinatorId === user.uid", "user.roles.includes('COORDINATOR') && event.organiserId === user.uid"]], suites: both },
  { id: 'X11', name: 'organiser matched on the coordinator column', file: ACCESS,
    edits: [["user.roles.includes('ORGANISER') && event.organiserId === user.uid", "user.roles.includes('ORGANISER') && event.coordinatorId === user.uid"]], suites: both },
  { id: 'X12', name: 'both rules required (AND instead of OR)', file: ACCESS,
    edits: [['return isAssignedCoordinator || isOwningOrganiser;', 'return isAssignedCoordinator && isOwningOrganiser;']], suites: both },
  { id: 'X13', name: 'the SGT suffix is dropped from the on-screen and PDF dates', file: FORMAT,
    edits: [['return `${formatReportDateTime(value)} SGT`;', 'return formatReportDateTime(value);']], suites: ['unit', 'e2e'] },
  { id: 'X14', name: 'PDF page-break handling removed (no repeated headings on continuation pages)', file: EXPORT,
    edits: [['if (doc.y + rowHeight > bottom) {', 'if (false) {']], suites: ['unit'] },
  { id: 'X15', name: 'lenient export format parsing (first value of a repeated parameter, any case)', file: CONTROLLER,
    edits: [["if (format !== 'csv' && format !== 'pdf') throw", "if (!['csv', 'pdf'].includes(String(format).toLowerCase().split(',')[0])) throw"]], suites: ['e2e'] },
  { id: 'X16', name: 'a missing or unknown export format no longer rejected', file: CONTROLLER,
    edits: [["if (format !== 'csv' && format !== 'pdf') throw", "if (format === 'xlsx') throw"]], suites: ['e2e'] },
  { id: 'X17', name: 're-registration keeps the original registration date (SPM-61 reactivation no longer resets created_at)', file: SERVICE,
    edits: [['withdrawn_at = NULL, created_at = now(), updated_at = now()', 'withdrawn_at = NULL, updated_at = now()']], suites: ['e2e'] },
  { id: 'X18', name: 'special requirements column omitted from CSV (2026-10-07 add: omit the value)', file: EXPORT,
    edits: [['      row.specialRequirements ?? \'\',\n      formatReportDateTime(', '      formatReportDateTime(']], suites: both },
  { id: 'X19', name: 'special requirements column omitted from PDF (2026-10-07 add: omit the value)', file: EXPORT,
    edits: [['        row.specialRequirements ?? \'\',\n        formatReportDateTimeSgt(', '        formatReportDateTimeSgt(']], suites: ['unit'] },
  { id: 'X20', name: 'CSV header order changed (2026-10-07: special requirements after date instead of before)', file: EXPORT,
    edits: [["  'Special Requirements',\n  'Registration Date',", "  'Registration Date',\n  'Special Requirements',"]], suites: both },
  { id: 'X21', name: 'PDF not landscape (2026-10-07: portrait mode)', file: EXPORT,
    edits: [['      layout: \'landscape\',', '']], suites: ['unit'] },
  { id: 'X22', name: 'PDF special requirements column too narrow (2026-10-07: 20pt instead of 205pt)', file: EXPORT,
    edits: [["{ title: 'Special Requirements', width: 205 }", "{ title: 'Special Requirements', width: 20 }"]], suites: ['unit'] },
  { id: 'X23', name: 'filename not lowercased (2026-10-07: filename keeps uppercase)', file: EXPORT,
    edits: [['    .toLowerCase()', '']], suites: both },
  { id: 'X24', name: 'filename keeps spaces instead of underscores (2026-10-07)', file: EXPORT,
    edits: [[".replace(/\\s+/g, '_')", ".replace(/\\s+/g, ' ')"]], suites: both },
  { id: 'X25', name: 'filename keeps unsafe characters (2026-10-07)', file: EXPORT,
    edits: [[".replace(/[\\u0000-\\u001f\\u007f\\\\/:*?\"<>|]/g, ' ')", ".replace(/[\\u0000-\\u001f\\u007f]/g, ' ')"]], suites: both },
];
