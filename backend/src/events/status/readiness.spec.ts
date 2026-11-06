// Story: SPM-135 Confirm an Event (Coordinator)
// ACs: AC1, AC2, AC3
// Test cases: CONFIRM-EVENT-03-A (rule unit, DERIVED); CONFIRM-EVENT-02-C (rule level);
//             CONFIRM-EVENT-03-A/B (outstanding list shape, rule level)
// Oracle: spec literals from the test-case matrix and the Decision Register (D6, D7).

import { describe, expect, it } from 'vitest';
import {
  evaluateReadiness,
  formatOutstanding,
  type ReadinessSnapshot,
} from './readiness.js';

// Suite clock T0 = 2026-10-12T12:00:00+08:00 (= 04:00:00Z), per the spec's Section 2.6.
const NOW = new Date('2026-10-12T04:00:00Z');
const FUTURE_HOLD = new Date('2026-10-12T05:00:00Z'); // 1 h after NOW: hold still live
const PAST_HOLD = new Date('2026-10-12T03:00:00Z'); // 1 h before NOW: hold expired

const approvedVenue = (id: string, venueName: string, unavailable = false) => ({
  id,
  venueId: 'venue-1',
  venueName,
  status: 'approved' as const,
  holdExpiresAt: null,
  venueUnavailable: unavailable,
  start: '2030-01-12T04:00:00.000Z',
  end: '2030-01-12T05:00:00.000Z',
});
const venue = (
  id: string,
  venueName: string,
  status: 'pending' | 'rejected',
  holdExpiresAt: Date | null = null,
) => ({ id, venueId: 'venue-1', venueName, status, holdExpiresAt, venueUnavailable: false, start: '2030-01-12T04:00:00.000Z', end: '2030-01-12T05:00:00.000Z' });
const reserved = (id: string, name: string, quantity: number) => ({
  id,
  name,
  quantity,
  status: 'Reserved',
});
const equipment = (
  id: string,
  name: string,
  quantity: number,
  status: string,
) => ({
  id,
  name,
  quantity,
  status,
});
const ready = (
  overrides: Partial<ReadinessSnapshot> = {},
): ReadinessSnapshot => ({
  venueBookings: [approvedVenue('vb-1', 'Main Hall')],
  equipment: [reserved('eq-1', 'Projector', 1)],
  safety: { state: 'Approved' },
  ...overrides,
});

describe('SPM-135 AC1: a fully arranged event is ready', () => {
  it('CONFIRM-EVENT-01-A (rule level): one Approved venue, Reserved equipment and Approved safety is ready with nothing outstanding', () => {
    // Arrange: EVT-201 per fixtures (VB-201 Main Hall Approved; EQ-201 Projector x1 Reserved; Safety Approved)
    const snapshot = ready();

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result).toEqual({ ready: true, outstanding: [] });
  });

  it('CONFIRM-EVENT-01-B (rule level): two Approved bookings and two equipment lines, all satisfied, are ready', () => {
    // Arrange: EVT-211 per fixtures (VB-211a Main Hall, VB-211b Breakout Room 2; EQ-211 Projector x2, Microphone x4)
    const snapshot = ready({
      venueBookings: [
        approvedVenue('vb-211a', 'Main Hall'),
        approvedVenue('vb-211b', 'Breakout Room 2'),
      ],
      equipment: [
        reserved('eq-211a', 'Projector', 2),
        reserved('eq-211b', 'Microphone', 4),
      ],
    });

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result).toEqual({ ready: true, outstanding: [] });
  });
});

describe('SPM-129 SAFETY-QUEUE-06: rejected venue history and Confirm readiness agree', () => {
  /** SAFETY-QUEUE-06: Confirm requires an approved booking covering the entire rejected slot at the same venue. */
  it('SAFETY-QUEUE-06-SUP-HISTORY confirms Confirm is blocked without a same-venue full-slot replacement', () => {
    const rejected = { ...venue('rejected', 'Main Hall', 'rejected'), venueId: 'venue-main' };
    const otherVenue = { ...approvedVenue('other-venue', 'Annex'), venueId: 'venue-annex' };
    const laterSlot = { ...approvedVenue('later-slot', 'Main Hall'), venueId: 'venue-main', start: '2030-01-12T05:00:00.000Z', end: '2030-01-12T06:00:00.000Z' };
    const coveringSlot = { ...approvedVenue('covering', 'Main Hall'), venueId: 'venue-main' };
    const overlappingSlot = { ...coveringSlot, start: '2030-01-12T04:30:00.000Z', end: '2030-01-12T05:30:00.000Z' };
    const sameId = { ...overlappingSlot, id: rejected.id };
    const pending = { ...overlappingSlot, status: 'pending' as const };
    const unavailable = { ...overlappingSlot, venueUnavailable: true };
    const tentative = { ...overlappingSlot, requestKind: 'tentative_hold' as const };

    const mismatch = (replacement: typeof otherVenue) => evaluateReadiness(ready({ venueBookings: [rejected, replacement] }), NOW);
    expect(mismatch(otherVenue).ready).toBe(false);
    expect(mismatch(laterSlot).outstanding).toContainEqual(expect.objectContaining({ detail: 'Main Hall (Rejected)' }));
    expect(mismatch(overlappingSlot).ready).toBe(false);
    expect(mismatch({ ...coveringSlot, end: '2030-01-12T04:30:00.000Z' }).ready).toBe(false);
    expect(mismatch(coveringSlot)).toEqual({ ready: true, outstanding: [] });
    expect(mismatch({ ...coveringSlot, start: '2030-01-12T03:00:00.000Z', end: '2030-01-12T06:00:00.000Z' }).ready).toBe(true);
    // Legacy snapshots omit requestKind: an expiry alone does not turn an ordinary approved booking into a hold.
    expect(mismatch({ ...coveringSlot, holdExpiresAt: FUTURE_HOLD }).ready).toBe(true);
    expect(mismatch(sameId).ready).toBe(false);
    expect(mismatch(pending).ready).toBe(false);
    expect(mismatch(unavailable).ready).toBe(false);
    expect(mismatch(tentative).ready).toBe(false);
    expect(mismatch({ ...overlappingSlot, start: 'not-a-date' }).ready).toBe(false);
    expect(mismatch({ ...overlappingSlot, end: 'not-a-date' }).ready).toBe(false);
    expect(mismatch({ ...overlappingSlot, start: '2030-01-12T06:00:00.000Z', end: '2030-01-12T05:00:00.000Z' }).ready).toBe(false);
    expect(evaluateReadiness(ready({ venueBookings: [{ ...rejected, start: 'not-a-date' }, overlappingSlot] }), NOW).ready).toBe(false);
    expect(evaluateReadiness(ready({ venueBookings: [{ ...rejected, end: rejected.start }, overlappingSlot] }), NOW).ready).toBe(false);
  });
});

describe('SPM-135 AC2 and AC3: any outstanding arrangement blocks and is listed', () => {
  // Kills: M1 (only the first venue booking checked): one Pending booking among Approved ones must block.
  it('CONFIRM-EVENT-02-C (rule level): one Approved and one Pending booking is not ready and names only Breakout Room 1', () => {
    // Arrange: EVT-206 "Regional Summit" per fixtures
    const snapshot = ready({
      venueBookings: [
        approvedVenue('vb-206a', 'Main Hall'),
        venue('vb-206b', 'Breakout Room 1', 'pending'),
      ],
    });

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert: exactly one item, only the Pending booking, Main Hall not named
    expect(result.ready).toBe(false);
    expect(result.outstanding).toEqual([
      {
        type: 'venue',
        label: 'Venue booking approval',
        detail: 'Breakout Room 1 (Pending)',
        state: 'Pending',
      },
    ]);
  });

  // CONFIRM-EVENT-02-A subtests A to D: each single outstanding arrangement alone blocks readiness (rule level only).
  it.each([
    [
      'venue Pending (EVT-202, subtest A)',
      ready({ venueBookings: [venue('vb-202', 'Main Hall', 'pending')] }),
      'venue',
    ],
    [
      'equipment Requested (EVT-203, subtest B)',
      ready({ equipment: [equipment('eq-203', 'Projector', 1, 'Requested')] }),
      'equipment',
    ],
    [
      'safety Awaiting Check (EVT-204, subtest C)',
      ready({ safety: { state: 'Awaiting Check' } }),
      'safety',
    ],
    [
      'safety Changes Requested (EVT-210, subtest D)',
      ready({ safety: { state: 'Changes Requested' } }),
      'safety',
    ],
  ])(
    'CONFIRM-EVENT-02-A (rule level): %s is the only outstanding item and blocks readiness',
    (_label, snapshot, type) => {
      // Act
      const result = evaluateReadiness(snapshot, NOW);

      // Assert: not ready, exactly one outstanding item, and it is of the expected kind
      expect(result.ready).toBe(false);
      expect(result.outstanding.map((item) => item.type)).toEqual([type]);
    },
  );

  // Kills: M16 (satisfied items listed) and reordering of the list (03-A). Truncation is M1 (see 02-C above).
  it('CONFIRM-EVENT-03-A (rule level): EVT-205 lists venue, equipment and safety in that order with the specified states', () => {
    // Arrange: EVT-205 per fixtures (VB-205 Pending, equipment Requested, safety Awaiting Check)
    const snapshot: ReadinessSnapshot = {
      venueBookings: [venue('vb-205', 'Breakout Room 1', 'pending')],
      equipment: [equipment('eq-205', 'Projector', 1, 'Requested')],
      safety: { state: 'Awaiting Check' },
    };

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result.ready).toBe(false);
    expect(result.outstanding.map((item) => [item.type, item.state])).toEqual([
      ['venue', 'Pending'],
      ['equipment', 'Requested'],
      ['safety', 'Awaiting Check'],
    ]);
  });

  it('CONFIRM-EVENT-03-C (rule level): texts are "Venue booking approval: Breakout Room 1 (Pending)" and "Safety Officer approval: Changes requested"', () => {
    // Arrange: EVT-206 venue line; EVT-210 safety line (SPEC literals from 03-C)
    const venueItem = evaluateReadiness(
      ready({
        venueBookings: [venue('vb-206b', 'Breakout Room 1', 'pending')],
      }),
      NOW,
    ).outstanding[0];
    const safetyItem = evaluateReadiness(
      ready({ safety: { state: 'Changes Requested' } }),
      NOW,
    ).outstanding[0];

    // Act
    const venueText = formatOutstanding(venueItem);
    const safetyText = formatOutstanding(safetyItem);

    // Assert
    expect(venueText).toBe('Venue booking approval: Breakout Room 1 (Pending)');
    expect(safetyText).toBe('Safety Officer approval: Changes requested');
  });
});

describe('SPM-135 D6 rule unit: fail closed on every source (table-driven, literals)', () => {
  // Each row: a single failure in an otherwise ready event, and the one outstanding item it must produce.
  // Kills: M18 (zero bookings treated as ready), M2 (Requested as Reserved), M3 (Changes Requested as approved),
  // M4 (Awaiting Check as approved), M17 (unavailable flag ignored), hold treated as approval, expired hold treated as approval.
  it.each([
    {
      name: 'zero venue bookings is outstanding ("none requested")',
      patch: { venueBookings: [] },
      expected: {
        type: 'venue',
        detail: 'None requested',
        state: 'None requested',
      },
    },
    {
      name: 'a pending booking with a live hold is outstanding',
      patch: {
        venueBookings: [venue('vb', 'Main Hall', 'pending', FUTURE_HOLD)],
      },
      expected: { type: 'venue', detail: 'Main Hall (Hold)', state: 'Hold' },
    },
    {
      name: 'a pending booking with an expired hold is outstanding',
      patch: {
        venueBookings: [venue('vb', 'Main Hall', 'pending', PAST_HOLD)],
      },
      expected: {
        type: 'venue',
        detail: 'Main Hall (Hold expired)',
        state: 'Hold expired',
      },
    },
    {
      name: 'a rejected booking is outstanding',
      patch: { venueBookings: [venue('vb', 'Main Hall', 'rejected')] },
      expected: {
        type: 'venue',
        detail: 'Main Hall (Rejected)',
        state: 'Rejected',
      },
    },
    {
      name: 'an approved booking flagged venue-unavailable is outstanding',
      patch: { venueBookings: [approvedVenue('vb', 'Main Hall', true)] },
      expected: {
        type: 'venue',
        detail: 'Main Hall (Venue unavailable)',
        state: 'Venue unavailable',
      },
    },
    {
      name: 'a requested equipment line is outstanding',
      patch: { equipment: [equipment('eq', 'Projector', 1, 'Requested')] },
      expected: {
        type: 'equipment',
        detail: 'Projector x1 (Requested)',
        state: 'Requested',
      },
    },
    {
      name: 'an unavailable equipment line is outstanding',
      patch: { equipment: [equipment('eq', 'Microphone', 2, 'Unavailable')] },
      expected: {
        type: 'equipment',
        detail: 'Microphone x2 (Unavailable)',
        state: 'Unavailable',
      },
    },
    {
      name: 'no safety record is outstanding',
      patch: { safety: undefined },
      expected: {
        type: 'safety',
        detail: 'Awaiting check',
        state: 'No record',
      },
    },
    {
      name: 'safety Awaiting Check is outstanding',
      patch: { safety: { state: 'Awaiting Check' } },
      expected: {
        type: 'safety',
        detail: 'Awaiting check',
        state: 'Awaiting Check',
      },
    },
    {
      name: 'safety Changes Requested is outstanding',
      patch: { safety: { state: 'Changes Requested' } },
      expected: {
        type: 'safety',
        detail: 'Changes requested',
        state: 'Changes Requested',
      },
    },
    {
      name: 'safety Rejected is outstanding',
      patch: { safety: { state: 'Rejected' } },
      expected: { type: 'safety', detail: 'Rejected', state: 'Rejected' },
    },
  ])('a single failure: $name', ({ patch, expected }) => {
    // Arrange: a ready snapshot with exactly one field replaced
    const snapshot = ready(patch as Partial<ReadinessSnapshot>);

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert: exactly one outstanding item, with the literal type, detail and state
    expect(result.ready).toBe(false);
    expect(result.outstanding).toHaveLength(1);
    expect(result.outstanding[0]).toMatchObject(expected);
  });

  /** VEN-BKG-09-A: retained cancelled history is inactive and leaves the event with no active venue. */
  it('SPM-54 treats a cancelled-only venue history as no active booking', () => {
    const result = evaluateReadiness(
      ready({
        venueBookings: [
          {
            id: 'cancelled-1',
            venueName: 'Main Hall',
            status: 'cancelled',
            holdExpiresAt: null,
            venueUnavailable: false,
          },
        ],
      }),
      NOW,
    );

    expect(result.ready).toBe(false);
    expect(result.outstanding).toContainEqual({
      type: 'venue',
      label: 'Venue booking approval',
      detail: 'None requested',
      state: 'None requested',
    });
  });

  it('released and cancelled equipment lines are not requested and do not block (ASSUMED)', () => {
    // Arrange: one Reserved line plus lines that were released or cancelled
    const snapshot = ready({
      equipment: [
        reserved('eq-1', 'Projector', 1),
        equipment('eq-2', 'Speaker', 1, 'Released'),
        equipment('eq-3', 'Lectern', 1, 'Cancelled'),
      ],
    });

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result).toEqual({ ready: true, outstanding: [] });
  });

  // EQUIPMENT-GATE-01 (rule level): zero equipment lines is NOT satisfied unless the coordinator confirmed "none".
  // Kills: the old zero-is-satisfied rule (D6, superseded).
  it('zero equipment lines without a "none" confirmation is outstanding (EQUIPMENT-GATE-01)', () => {
    // Arrange
    const snapshot = ready({ equipment: [] });

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result.ready).toBe(false);
    expect(result.outstanding).toEqual([
      {
        type: 'equipment',
        label: 'Equipment reservation',
        detail: 'None requested',
        state: 'Not requested',
      },
    ]);
  });

  it('zero equipment lines is satisfied once the coordinator confirmed no equipment is needed (EQUIPMENT-GATE-02)', () => {
    // Arrange
    const snapshot = ready({ equipment: [], equipmentNoneConfirmed: true });

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result).toEqual({ ready: true, outstanding: [] });
  });

  // ASSUMED boundary (D6, no spec literal): a hold whose expiry equals the check time counts as expired.
  // Kills: the `<=` in readiness.ts changed to `<` (mutant M-HOLD-EQ in spm135.mutants.mjs).
  it('a hold that expires exactly at the check time is expired (ASSUMED boundary)', () => {
    // Arrange: the only booking is a pending hold whose expiry equals NOW
    const snapshot = ready({
      venueBookings: [venue('vb', 'Main Hall', 'pending', NOW)],
    });

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result.outstanding).toEqual([
      {
        type: 'venue',
        label: 'Venue booking approval',
        detail: 'Main Hall (Hold expired)',
        state: 'Hold expired',
      },
    ]);
  });

  // Ordering: the outstanding list follows booking id, whatever order the rows were read in (stable display).
  it('outstanding venue items are listed by booking id, not by the order the rows arrived', () => {
    // Arrange: the later id is read first
    const snapshot = ready({
      venueBookings: [
        venue('vb-2', 'Breakout Room 1', 'pending'),
        venue('vb-1', 'Main Hall', 'pending'),
      ],
    });

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result.outstanding.map((item) => item.detail)).toEqual([
      'Main Hall (Pending)',
      'Breakout Room 1 (Pending)',
    ]);
  });

  // Coverage (ASSUMED tie-break): rows that share an id keep their input order, so the list never reorders by accident.
  it('two bookings that share an id keep their input order in the outstanding list', () => {
    // Arrange: two pending bookings with the same id (the sort tie-break)
    const snapshot = ready({
      venueBookings: [
        venue('vb', 'Main Hall', 'pending'),
        venue('vb', 'Breakout Room 1', 'pending'),
      ],
    });

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result.outstanding.map((item) => item.detail)).toEqual([
      'Main Hall (Pending)',
      'Breakout Room 1 (Pending)',
    ]);
  });

  it('a hold is not approval even when every other source is satisfied', () => {
    // Arrange: the only booking is a live hold
    const snapshot = ready({
      venueBookings: [venue('vb', 'Main Hall', 'pending', FUTURE_HOLD)],
    });

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result.ready).toBe(false);
  });

  it('all failures at once are listed in venue, equipment, safety order', () => {
    // Arrange
    const snapshot: ReadinessSnapshot = {
      venueBookings: [],
      equipment: [equipment('eq', 'Projector', 1, 'Requested')],
      safety: undefined,
    };

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert
    expect(result.outstanding.map((item) => item.type)).toEqual([
      'venue',
      'equipment',
      'safety',
    ]);
  });
});

describe('VEN-HOLD-04-SUP-EVENTS an approved tentative hold is a Hold, never a confirmed booking', () => {
  const approvedHold = (holdExpiresAt: Date | null, requestKind: 'tentative_hold' | 'booking' = 'tentative_hold') => ({
    id: 'vb-hold',
    venueName: 'Main Hall',
    status: 'approved' as const,
    holdExpiresAt,
    requestKind,
    venueUnavailable: false,
  });
  const only = (booking: ReturnType<typeof approvedHold>) => ready({ venueBookings: [booking] });

  /** SPM-159: an approved hold that has not expired does not satisfy the Venue booking approval item, so Confirm stays blocked. */
  it('VEN-HOLD-04-SUP-EVENTS an active approved hold is outstanding as Hold and blocks Confirm', () => {
    const result = evaluateReadiness(only(approvedHold(FUTURE_HOLD)), NOW);

    expect(result.ready).toBe(false);
    expect(result.outstanding).toEqual([
      { type: 'venue', label: 'Venue booking approval', detail: 'Main Hall (Hold)', state: 'Hold' },
    ]);
  });

  /** SPM-159: an expired approved hold is outstanding as Hold expired and is not used as a confirmed booking. */
  it('VEN-HOLD-04-SUP-EVENTS an expired approved hold is outstanding as Hold expired', () => {
    const result = evaluateReadiness(only(approvedHold(PAST_HOLD)), NOW);

    expect(result.ready).toBe(false);
    expect(result.outstanding).toEqual([
      { type: 'venue', label: 'Venue booking approval', detail: 'Main Hall (Hold expired)', state: 'Hold expired' },
    ]);
  });

  /** SPM-159 boundary: an approved hold whose expiry equals the check time is expired (exclusive, as pending holds are). */
  it('VEN-HOLD-04-SUP-EVENTS an approved hold expiring exactly at the check time is expired', () => {
    expect(evaluateReadiness(only(approvedHold(NOW)), NOW).outstanding[0].state).toBe('Hold expired');
    expect(evaluateReadiness(only(approvedHold(new Date(NOW.getTime() + 1))), NOW).outstanding[0].state).toBe('Hold');
  });

  /** SPM-159: fail closed, an approved hold with no recorded expiry is still not a confirmed booking. */
  it('VEN-HOLD-04-SUP-EVENTS an approved hold with no recorded expiry is a Hold, not confirmed', () => {
    expect(evaluateReadiness(only(approvedHold(null)), NOW).outstanding[0].state).toBe('Hold');
  });

  /** SPM-159: ordinary approved bookings keep their behaviour, even when a stray expiry is stored on them. */
  it('VEN-HOLD-04-SUP-EVENTS an ordinary approved booking, with or without a stored expiry, still satisfies the venue item', () => {
    expect(evaluateReadiness(only(approvedHold(PAST_HOLD, 'booking')), NOW)).toEqual({ ready: true, outstanding: [] });
    const unflagged = { ...approvedHold(null), requestKind: undefined };
    expect(evaluateReadiness(ready({ venueBookings: [unflagged] }), NOW)).toEqual({ ready: true, outstanding: [] });
  });

  /** SPM-159: a confirmed booking next to an expired hold is enough; the expired hold is still listed as outstanding. */
  it('VEN-HOLD-04-SUP-EVENTS an active hold beside a confirmed booking still lists the hold', () => {
    const result = evaluateReadiness(
      ready({ venueBookings: [approvedVenue('vb-1', 'Main Hall'), { ...approvedHold(FUTURE_HOLD), id: 'vb-2', venueName: 'Annex' }] }),
      NOW,
    );
    expect(result.outstanding.map((item) => item.detail)).toEqual(['Annex (Hold)']);
  });
});
