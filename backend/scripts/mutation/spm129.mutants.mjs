export const SUITES = {
  unit: { args: ['run', 'src/events/safety-officer/safety-officer.service.spec.ts'] },
  e2e: { args: ['run', '--config', './vitest.config.e2e.ts', 'test/safety-officer.e2e-spec.ts'] },
};

const SERVICE = 'src/events/safety-officer/safety-officer.service.ts';
const E2E = 'test/safety-officer.e2e-spec.ts';
const UNIT = 'src/events/safety-officer/safety-officer.service.spec.ts';
const unit = (title) => ({ suite: 'unit', file: UNIT, title });
const e2e = (title) => ({ suite: 'e2e', file: E2E, title });

export const MUTANTS = [
  {
    id: 'S129-01', name: 'a non-Safety-Officer can read or decide (SAFETY-QUEUE-01)', file: SERVICE, suites: ['unit', 'e2e'],
    edits: [["if (!identity.roles.includes('SAFETY_OFFICER'))", 'if (false)']],
    testMappings: [unit('SAFETY-QUEUE-01 requires the Safety Officer role before reading the queue'), e2e('SAFETY-QUEUE-01 refuses unauthenticated and non-Safety-Officer reads')],
  },
  {
    id: 'S129-02', name: 'the queue includes an event with an unconfirmed venue (SAFETY-QUEUE-06)', file: SERVICE, suites: ['e2e'],
    edits: [["   WHERE e.status = 'Planning'\n     AND e.equipment_confirmed_at IS NOT NULL\n     AND EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id AND b.status = 'approved' AND b.request_kind = 'booking')", "   WHERE e.status = 'Planning'\n     AND e.equipment_confirmed_at IS NOT NULL\n     AND EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id AND b.status = 'pending' AND b.request_kind = 'booking')"]],
    testMappings: [e2e('SAFETY-QUEUE-06 excludes each event with incomplete venue or technical arrangements')],
  },
  {
    id: 'S129-03', name: 'the queue includes an event without technical confirmation (SAFETY-QUEUE-06)', file: SERVICE, suites: ['e2e'],
    edits: [["   WHERE e.status = 'Planning'\n     AND e.equipment_confirmed_at IS NOT NULL\n", "   WHERE e.status = 'Planning'\n"]],
    testMappings: [e2e('SAFETY-QUEUE-06 excludes each event with incomplete venue or technical arrangements')],
  },
  {
    id: 'S129-04', name: 'the detail projection changes venue capacity (SAFETY-QUEUE-02)', file: SERVICE, suites: ['e2e'],
    edits: [["'name', v.name, 'location', v.location, 'capacity', v.capacity,", "'name', v.name, 'location', v.location, 'capacity', v.capacity + 1,"]],
    testMappings: [e2e('SAFETY-QUEUE-02 reads attendance, capacity, layout, and accessibility from linked database rows')],
  },
  {
    id: 'S129-05', name: 'known venue restrictions are replaced in the detail projection (SAFETY-QUEUE-04)', file: SERVICE, suites: ['e2e'],
    edits: [["'restrictions', v.operating_information,", "'restrictions', v.name,"]],
    testMappings: [e2e('SAFETY-QUEUE-04 returns the venue restrictions from PostgreSQL')],
  },
  {
    id: 'S129-06', name: 'a decision does not persist its status (SAFETY-QUEUE-05)', file: SERVICE, suites: ['e2e'],
    edits: [["UPDATE event_safety_checks SET status = $2,", "UPDATE event_safety_checks SET status = 'pending',"]],
    testMappings: [e2e('SAFETY-QUEUE-05 persists a response and removes the event from the subsequent queue'), e2e('SAFETY-QUEUE-05 persists an approval without feedback')],
  },
  {
    id: 'S129-07', name: 'a rejection does not persist its feedback row (SAFETY-QUEUE-05)', file: SERVICE, suites: ['e2e'],
    edits: [["INSERT INTO safety_check_feedback_items (event_id, feedback_text) VALUES ($1, $2)", "SELECT $1, $2 WHERE false"]],
    testMappings: [e2e('SAFETY-QUEUE-05 persists a response and removes the event from the subsequent queue')],
  },
  {
    id: 'S129-08', name: 'a stale pending check can receive a decision after its venue becomes unconfirmed (SAFETY-QUEUE-05)', file: SERVICE, suites: ['e2e'],
    edits: [["            AND e.equipment_confirmed_at IS NOT NULL\n            AND EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id AND b.status = 'approved' AND b.request_kind = 'booking')\n            AND NOT EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id AND b.status <> 'approved')", "            AND e.equipment_confirmed_at IS NOT NULL\n            AND EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id)"]],
    testMappings: [e2e('SAFETY-QUEUE-05 refuses a response when the venue is no longer confirmed')],
  },
  {
    id: 'S129-09', name: 'an approved tentative hold qualifies as a confirmed venue (SAFETY-QUEUE-06)', file: SERVICE, suites: ['e2e'],
    edits: [["   WHERE e.status = 'Planning'\n     AND e.equipment_confirmed_at IS NOT NULL\n     AND EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id AND b.status = 'approved' AND b.request_kind = 'booking')", "   WHERE e.status = 'Planning'\n     AND e.equipment_confirmed_at IS NOT NULL\n     AND EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id AND b.status = 'approved')"]],
    testMappings: [e2e('SAFETY-QUEUE-06 excludes an approved tentative hold without a confirmed booking')],
  },
  {
    id: 'S129-10', name: 'an incomplete extra venue booking does not block queue eligibility (SAFETY-QUEUE-06)', file: SERVICE, suites: ['e2e'],
    edits: [["   WHERE e.status = 'Planning'\n     AND e.equipment_confirmed_at IS NOT NULL\n     AND EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id AND b.status = 'approved' AND b.request_kind = 'booking')\n     AND NOT EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id AND b.status <> 'approved')", "   WHERE e.status = 'Planning'\n     AND e.equipment_confirmed_at IS NOT NULL\n     AND EXISTS (SELECT 1 FROM venue_bookings b WHERE b.event_id = e.id AND b.status = 'approved' AND b.request_kind = 'booking')"]],
    testMappings: [e2e('SAFETY-QUEUE-06 excludes an event with approved and pending venue bookings')],
  },
  {
    id: 'S129-11', name: 'the technical requirements are projected from the wrong event field (SAFETY-QUEUE-03)', file: SERVICE, suites: ['e2e'],
    edits: [['equipmentNeeds: row.equipment_needs,', 'equipmentNeeds: null,']],
    testMappings: [e2e('SAFETY-QUEUE-03 returns technical arrangements and reserved equipment from PostgreSQL')],
  },
  {
    id: 'S129-12', name: 'reserved equipment is omitted from Safety Officer event details (SAFETY-QUEUE-03)', file: SERVICE, suites: ['e2e'],
    edits: [["WHERE r.event_id = e.id AND r.status = 'Reserved'", "WHERE r.event_id = e.id AND r.status = 'Requested'"]],
    testMappings: [e2e('SAFETY-QUEUE-03 returns technical arrangements and reserved equipment from PostgreSQL')],
  },
];
