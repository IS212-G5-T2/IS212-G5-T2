// SPM-58 fault-injection mutants: reserve and availability overlap rules (AC3-AC6), Cannot Provide and its reason
// (AC8, AC9), the reservations view (AC7) and the reschedule rule (AC11, as the code behaves today: SC-SPM58-04).
// Run: node scripts/mutation/run.mjs --mutants spm58.mutants.mjs   (the e2e suite needs DATABASE_URL on the host LAN IP)
const REPO = 'src/equipment/requests/equipment-requests.repository.ts';
const SERVICE = 'src/equipment/requests/equipment-requests.service.ts';
const CONTROLLER = 'src/equipment/requests/equipment-requests.controller.ts';
const PLANNING = 'src/events/planning/event-planning.repository.ts';
const E2E = 'test/equipment-requests.e2e-spec.ts';
const E2E_SUITE = { suite: 'e2e', file: E2E };
const RS = { suite: 'service', file: 'src/equipment/requests/equipment-requests.service.spec.ts' };
const RR = { suite: 'repository', file: 'src/equipment/requests/equipment-requests.repository.spec.ts' };
const RC = { suite: 'controller', file: 'src/equipment/requests/equipment-requests.controller.spec.ts' };
const EPR_E2E = { suite: 'planning-e2e', file: 'test/events-planning.http.e2e-spec.ts' };
const EPR = { suite: 'planning', file: 'src/events/planning/event-planning.repository.spec.ts' };

export const SUITES = {
  repository: { args: ['run', 'src/equipment/requests/equipment-requests.repository.spec.ts'] },
  service: { args: ['run', 'src/equipment/requests/equipment-requests.service.spec.ts'] },
  controller: { args: ['run', 'src/equipment/requests/equipment-requests.controller.spec.ts'] },
  'planning-e2e': { args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-planning.http.e2e-spec.ts'], needsEnv: ['DATABASE_URL'] },
  planning: { args: ['run', 'src/events/planning/event-planning.repository.spec.ts'] },
  e2e: { args: ['run', '--config', './vitest.config.e2e.ts', 'test/equipment-requests.e2e-spec.ts'], needsEnv: ['DATABASE_URL'] },
};

const T05BND = 'EQUIP-RESERVE-05-BND-1 refuses an overlapping reserve but allows windows that only touch the held window';
const T06BND = 'EQUIP-RESERVE-06-BND-1 reserving the whole stock leaves an overlapping event at exactly zero and refuses another reserve';
const T02BND = 'EQUIP-RESERVE-02-BND-1 flips from sufficient to insufficient when one overlapping unit is reserved';
const T0301 = 'EQUIP-RESERVE-03-SEC-1 refuses the review queue and reserve to unauthenticated and non-Technical-Support callers and creates nothing';
const T01A = 'EQUIP-RESERVE-01-A lists a Pending Review request with its event name, window and item details in the queue';
const T01B = 'EQUIP-RESERVE-01-B leaves resolved requests out of the queue and keeps the Pending Review one';
const T03B = 'EQUIP-RESERVE-03-B refuses a reserve when an overlapping event holds every unit and creates nothing';
const T03BND = 'EQUIP-RESERVE-03-BND-1 reserves the entire available quantity, leaves zero and refuses a further reserve';
const T04A = 'EQUIP-RESERVE-04-A refuses a reserve for more units than are available and persists nothing';
const T04BND = 'EQUIP-RESERVE-04-BND-1 reserves exactly the free quantity and refuses one more';
const T05B = 'EQUIP-RESERVE-05-B refuses to reserve stock that is only %s';
const T05C = 'EQUIP-RESERVE-05-C refuses the overlapping request and accepts the disjoint one';
const T06A = 'EQUIP-RESERVE-06-A reduces the available quantity of an overlapping event by exactly the reserved amount';
const T06B = 'EQUIP-RESERVE-06-B leaves the available quantity of a disjoint event unchanged';
const T08BND = 'EQUIP-RESERVE-08-BND-1 keeps the Reserved, Cannot Provide and Pending Review statuses of separate requests independent';
const T10B = 'EQUIP-RESERVE-10-B hides Technical Support status updates from a coordinator who does not own the event';
const T12A = 'EQUIP-RESERVE-12-A accepts and persists an edit while the event is Approved';
const T12B = 'EQUIP-RESERVE-12-B refuses Technical Support reserve and Cannot Provide on a Confirmed event and leaves the request unchanged';
const T12BND = 'EQUIP-RESERVE-12-BND-1 accepts the last pre-Confirmed update and refuses the next one once Confirmed';
const T09A = 'records a Cannot Provide decision with its reason, retires placeholders, and shows it to the coordinator';

export const MUTANTS = [
  { id: 'BE-58-01', name: 'reserve counts a hold that ends exactly when the requested window starts (end >= start)', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T05BND }],
    edits: [['AND e.end_date_time > $2::timestamptz', 'AND e.end_date_time >= $2::timestamptz']] },
  { id: 'BE-58-02', name: 'reserve counts a hold that starts exactly when the requested window ends (start <= end)', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T05BND }],
    edits: [['AND e.start_date_time < $3::timestamptz', 'AND e.start_date_time <= $3::timestamptz']] },
  { id: 'BE-58-03', name: 'reserve refuses when the request exactly equals the remaining stock', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T06BND }, { ...E2E_SUITE, title: T03BND }, { ...E2E_SUITE, title: T04BND }],
    edits: [['return remaining < item.requested_quantity;', 'return remaining <= item.requested_quantity;']] },
  { id: 'BE-58-04', name: 'reserve ignores units already reserved for overlapping events', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T05BND }, { ...E2E_SUITE, title: T06BND }, { ...E2E_SUITE, title: T03B }, { ...E2E_SUITE, title: T04BND }, { ...E2E_SUITE, title: T05C }],
    edits: [['record.active_quantity - (reservedByName.get(item.equipment_name) ?? 0)', 'record.active_quantity']] },
  { id: 'BE-58-05', name: 'review queue also lists Reserved requests', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: 'EQUIP-REQUEST-07-A excludes non-Pending Review requests from the support queue' }, { ...E2E_SUITE, title: T01B }],
    edits: [["WHERE r.status = 'Pending Review' AND e.status NOT IN ('Cancelled', 'Rejected')", "WHERE r.status IN ('Pending Review', 'Reserved') AND e.status NOT IN ('Cancelled', 'Rejected')"]] },
  { id: 'BE-58-06', name: 'shown availability counts a hold that ends exactly when the event starts', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T05BND }],
    edits: [['AND other_event.end_date_time > e.start_date_time', 'AND other_event.end_date_time >= e.start_date_time']] },
  { id: 'BE-58-07', name: 'shown availability counts a hold that starts exactly when the event ends', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T05BND }],
    edits: [['AND other_event.start_date_time < e.end_date_time', 'AND other_event.start_date_time <= e.end_date_time']] },
  { id: 'BE-58-08', name: 'an item is sufficient only when strictly more is available than requested', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T02BND }],
    edits: [['sufficient: row.available_quantity >= row.quantity', 'sufficient: row.available_quantity > row.quantity']] },
  { id: 'BE-58-09', name: 'the reservations view shows the equipment name as the owning event', file: REPO, suites: ['repository'],
    testMappings: [{ ...RR, title: 'lists Reserved equipment with the event it belongs to' }],
    edits: [['eventId: row.event_id,\n      eventName: row.event_name,', 'eventId: row.event_id,\n      eventName: row.equipment_name,']] },
  { id: 'BE-58-10', name: 'the review queue drops the event name', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [{ ...RR, title: 'maps every required field for a single item at quantity 1' }, { ...E2E_SUITE, title: T01A }],
    edits: [['id: row.id, reference: `ER-${row.id.replaceAll(\'-\', \'\').slice(0, 8).toUpperCase()}`,\n          eventId: row.event_id, eventName: row.event_name,', 'id: row.id, reference: `ER-${row.id.replaceAll(\'-\', \'\').slice(0, 8).toUpperCase()}`,\n          eventId: row.event_id, eventName: \'\',']] },
  { id: 'BE-58-11', name: 'a Cannot Provide reason is not trimmed', file: SERVICE, suites: ['service', 'e2e'],
    testMappings: [{ ...RS, title: 'accepts a one-character reason and stores it trimmed' }, { ...E2E_SUITE, title: T09A }],
    edits: [["typeof value === 'string' ? value.trim() : ''", "typeof value === 'string' ? value : ''"]] },
  { id: 'BE-58-12', name: 'a blank Cannot Provide reason is accepted', file: SERVICE, suites: ['service', 'e2e'],
    testMappings: [{ ...RS, title: 'requires a non-empty reason to mark Cannot Provide' }, { ...E2E_SUITE, title: T09A }],
    edits: [['if (!reason) throw new BadRequestException(', 'if (false) throw new BadRequestException(']] },
  { id: 'BE-58-13', name: 'the Cannot Provide reason cap is 501 characters', file: SERVICE, suites: ['service'],
    testMappings: [{ ...RS, title: 'bounds the Cannot Provide reason to 500 characters' }],
    edits: [['reason.length > 500', 'reason.length > 501']] },
  { id: 'BE-58-14', name: 'a coordinator can reserve (role check removed)', file: SERVICE, suites: ['service', 'e2e'],
    testMappings: [{ ...RS, title: 'refuses coordinators and non-pending request transitions' }, { ...E2E_SUITE, title: T0301 }],
    edits: [["async reserve(user: AuthenticatedUser | undefined, requestId: string) {\n    if (!user?.uid) throw new UnauthorizedException('Authentication required.');\n    if (!user.roles.includes('TECH_SUPPORT')) throw new ForbiddenException('Technical Support access required.');", "async reserve(user: AuthenticatedUser | undefined, requestId: string) {\n    if (!user?.uid) throw new UnauthorizedException('Authentication required.');"]] },
  { id: 'BE-58-15', name: 'an unauthenticated caller can reach reserve (authentication check removed)', file: SERVICE, suites: ['service'],
    testMappings: [{ ...RS, title: 'refuses an unauthenticated reserve without touching the repository' }],
    edits: [["async reserve(user: AuthenticatedUser | undefined, requestId: string) {\n    if (!user?.uid) throw new UnauthorizedException('Authentication required.');\n", 'async reserve(user: AuthenticatedUser | undefined, requestId: string) {\n']] },
  { id: 'BE-58-16', name: 'a coordinator can read the review queue (role check removed)', file: SERVICE, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T0301 }],
    edits: [["    if (!user.roles.includes('TECH_SUPPORT')) throw new ForbiddenException('Technical Support access required.');\n    return this.repository.listQueue();", '    return this.repository.listQueue();']] },
  { id: 'BE-58-17', name: 'an end that moves one minute earlier releases the reservation (start comparison <=)', file: PLANNING, suites: ['planning'],
    testMappings: [{ ...EPR, title: 'returns the request to Pending Review and retains reservations for a one-minute change of only the end to earlier' }],
    edits: [['updated.start_date_time.getTime() < previous.start_date_time.getTime()', 'updated.start_date_time.getTime() <= previous.start_date_time.getTime()']] },
  { id: 'BE-58-18', name: 'a start that moves one minute later releases the reservation (end comparison >=)', file: PLANNING, suites: ['planning'],
    testMappings: [{ ...EPR, title: 'returns the request to Pending Review and retains reservations for a one-minute change of only the start' }],
    edits: [['updated.end_date_time.getTime() > previous.end_date_time.getTime()', 'updated.end_date_time.getTime() >= previous.end_date_time.getTime()']] },
  { id: 'BE-58-19', name: 'a reschedule returns every request to Pending Review, not only Reserved ones', file: PLANNING, suites: ['planning'],
    testMappings: [{ ...EPR, title: 'returns equipment to Pending Review and releases reservations when the event moves outside its window' }],
    edits: [["updated_at = $2 WHERE event_id = $1 AND status = 'Reserved'\",\n      [eventId, now],\n    );\n    const outsideWindow", 'updated_at = $2 WHERE event_id = $1",\n      [eventId, now],\n    );\n    const outsideWindow']] },
  { id: 'BE-58-20', name: 'every reschedule releases reservations, even inside the held window', file: PLANNING, suites: ['planning', 'planning-e2e'],
    testMappings: [{ ...EPR, title: 'returns equipment to Pending Review but keeps reservations when the event stays within its window' }, { ...EPR_E2E, title: 'EVENT-UPDATE-HTTP-AC11-within re-opens the request and keeps reservations for an in-window reschedule' }],
    edits: [['    if (outsideWindow)\n', '    if (true)\n']] },
  { id: 'BE-58-21', name: 'a non-temporal event edit also triggers the equipment review', file: PLANNING, suites: ['planning'],
    testMappings: [{ ...EPR, title: 'leaves equipment untouched when the date/time is unchanged' }],
    edits: [['const reschedules = patch.startDateTime !== undefined || patch.endDateTime !== undefined;', 'const reschedules = true;']] },
  { id: 'BE-58-22', name: 'an out-of-window move keeps the reservation Reserved instead of releasing it', file: PLANNING, suites: ['planning', 'planning-e2e'],
    testMappings: [{ ...EPR, title: 'returns equipment to Pending Review and releases reservations when the event moves outside its window' }, { ...EPR_E2E, title: 'EVENT-UPDATE-HTTP-AC11-outside re-opens the request and releases equipment for an out-of-window reschedule' }],
    edits: [["UPDATE equipment_reservations SET status = 'Released'", "UPDATE equipment_reservations SET status = 'Reserved'"]] },
  { id: 'BE-58-23', name: 'the reserve route drops the authenticated caller', file: CONTROLLER, suites: ['controller'],
    testMappings: [{ ...RC, title: 'forwards a reserve decision to the service' }],
    edits: [['return this.requests.reserve(request[CURRENT_USER_REQUEST_KEY], requestId);', 'return this.requests.reserve(undefined, requestId);']] },
  { id: 'BE-58-24', name: 'the reservations route drops the authenticated caller', file: CONTROLLER, suites: ['controller'],
    testMappings: [{ ...RC, title: 'forwards the reservation read' }],
    edits: [['return this.requests.listReservations(request[CURRENT_USER_REQUEST_KEY]);', 'return this.requests.listReservations(undefined);']] },
  { id: 'BE-58-25', name: 'reserve no longer refuses a Confirmed event', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T12B }],
    edits: [["if (request.event_status === 'Confirmed') return { kind: 'event-confirmed' as const };\n      if (request.status !== 'Pending Review') return { kind: 'not-pending' as const };\n\n      // Lock", "if (request.status !== 'Pending Review') return { kind: 'not-pending' as const };\n\n      // Lock"]] },
  { id: 'BE-58-26', name: 'Cannot Provide no longer refuses a Confirmed event', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T12B }],
    edits: [["if (request.event_status === 'Confirmed') return { kind: 'event-confirmed' as const };\n      if (request.status !== 'Pending Review') return { kind: 'not-pending' as const };\n\n      const now", "if (request.status !== 'Pending Review') return { kind: 'not-pending' as const };\n\n      const now"]] },
  { id: 'BE-58-27', name: 'the coordinator request list returns every coordinator\'s requests', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T10B }],
    edits: [["WHERE e.coordinator_id = $1::text AND e.status NOT IN ('Cancelled', 'Rejected')\", [coordinatorId]", "WHERE ($1::text IS NOT NULL OR e.coordinator_id = $1::text) AND e.status NOT IN ('Cancelled', 'Rejected')\", [coordinatorId]"]] },
  { id: 'BE-58-28', name: 'reserve never refuses for too few units', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T04A }],
    edits: [['return remaining < item.requested_quantity;', 'return false;']] },
  { id: 'BE-58-29', name: 'shown availability ignores units already Reserved', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T06A }],
    edits: [["WHERE res.equipment_name = i.equipment_name AND res.status = 'Reserved'", "WHERE res.equipment_name = i.equipment_name AND res.status = 'Requested'"]] },
  { id: 'BE-58-30', name: 'shown availability is reduced by reservations of every event, not only overlapping ones', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T06B }],
    edits: [["                   AND other_event.start_date_time < e.end_date_time\n                   AND other_event.end_date_time > e.start_date_time), 0), 0)::integer AS available_quantity", "                   ), 0), 0)::integer AS available_quantity"]] },
  { id: 'BE-58-31', name: 'reserve counts Under Maintenance and Retired units as available (all physical units)', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T05B }],
    edits: [["`SELECT equipment_name, active_quantity, is_available\n           FROM equipment", "`SELECT equipment_name, quantity AS active_quantity, is_available\n           FROM equipment"]] },
  { id: 'BE-58-32', name: 'marking one request Cannot Provide changes every Pending Review request', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T08BND }],
    edits: [["            SET status = 'Cannot Provide', decision_reason = $2, updated_at = $3::timestamptz\n          WHERE id = $1::uuid`", "            SET status = 'Cannot Provide', decision_reason = $2, updated_at = $3::timestamptz\n          WHERE status = 'Pending Review' AND $1::uuid IS NOT NULL`"]] },
  { id: 'BE-58-33', name: 'an Approved event no longer allows a request update', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T12A }],
    edits: [["if (!['Approved', 'Planning'].includes(row.event_status)) return { kind: 'event-not-open' as const };", "if (!['Planning'].includes(row.event_status)) return { kind: 'event-not-open' as const };"]] },
  { id: 'BE-58-34', name: 'an update is accepted after the event is Confirmed', file: REPO, suites: ['e2e'],
    testMappings: [{ ...E2E_SUITE, title: T12BND }],
    edits: [["if (row.event_status === 'Confirmed') return { kind: 'event-confirmed' as const };\n      if (!['Approved'", "if (!['Approved'"]] },
];
