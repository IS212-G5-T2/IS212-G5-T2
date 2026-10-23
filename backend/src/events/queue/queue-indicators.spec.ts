// Story: SPM-48 Monitor Workspace Queue & Status (Coordinator)
// ACs: AC2 (status terms), AC5 (what needs action), AC6 and AC7 (safety), AC8 (holds), AC9 (venue unavailable)
// Test cases: MONITOR-QUEUE-02-B, 05-B, 06-A, 06-B, 07-A, 07-C, 08-A, 08-B, 09-A, 09-B (rule level); MONITOR-QUEUE-01-SUP-FILTER
import { describe, expect, it } from 'vitest';
import {
  venueLabel,
  buildQueueIndicators,
  deriveActions,
  deriveHolds,
  deriveQueueSafety,
  deriveUnavailableVenues,
  holdIsActive,
  parseStatusFilter,
  queueStatusOf,
  QUEUE_STATUSES,
  type QueueBookingFact,
} from './queue-indicators.js';

/** 2026-11-10 12:00:00 SGT: hold H1's expiry in MONITOR-QUEUE-08-B. */
const H1_EXPIRY = new Date('2026-11-10T04:00:00.000Z');
const NOW = new Date('2026-11-10T03:00:00.000Z');

/** A booking fact; unless given, the venue id follows the venue name (one venue per name). */
const booking = (overrides: Partial<QueueBookingFact> = {}): QueueBookingFact => ({
  venueId: `venue-${overrides.venueName ?? 'Hall A'}`,
  venueName: 'Hall A',
  venueLocation: 'Level 1',
  status: 'approved',
  holdExpiresAt: null,
  venueUnavailable: false,
  ...overrides,
});

describe('SPM-48 AC2: the seven queue statuses', () => {
  /** MONITOR-QUEUE-02-B: the queue knows exactly the seven standard terms; Under Review and Draft are not among them. */
  it('MONITOR-QUEUE-02-B lists exactly the seven standard statuses', () => {
    expect([...QUEUE_STATUSES]).toEqual(['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed', 'Cancelled', 'Rejected']);
  });
  /** MONITOR-QUEUE-02-B: a stored or API value maps to its standard term whatever its case; anything else is kept. */
  it('MONITOR-QUEUE-02-B maps a status value to its standard term', () => {
    expect(queueStatusOf('planning')).toBe('Planning');
    expect(queueStatusOf('CANCELLED')).toBe('Cancelled');
    expect(queueStatusOf('Under Review')).toBe('Under Review');
  });
});

describe('SPM-48 AC6, AC7: one safety state per event', () => {
  /**
   * MONITOR-QUEUE-06-A, 06-B, 07-A, 07-C: pending awaits the Safety Officer (Planning only, as SPM-94), changes
   * requested and rejected are flagged, a reset with no new request asks for a re-request, and an approved check
   * on a Planning event is cleared. Terminal events show nothing.
   */
  it.each([
    // status,      state,            reset, expected
    ['Planning', 'pending', false, 'AWAITING_CHECK'], // EVT-404
    ['Approved', 'pending', false, null], // awaiting is a Planning state only (SPM-94 owner decision, 18 Oct 2026)
    ['Planning', 'changes_needed', false, 'CHANGES_REQUESTED'], // EVT-405
    ['Planning', 'rejected', false, 'REJECTED'], // 07-C
    ['Planning', 'approved', false, 'CLEARED'],
    ['Confirmed', 'approved', false, null], // EVT-406: confirmation already implies a cleared check
    ['Planning', null, true, 'RESET'], // 06-B: approved change reset the check
    ['Planning', null, false, null], // never requested
    ['Planning', 'pending', true, 'AWAITING_CHECK'], // a live request wins over a stale reset row
    ['Cancelled', 'rejected', false, null], // terminal: nothing to act on
    ['Completed', null, true, null],
    ['Rejected', 'changes_needed', false, null],
  ])('MONITOR-QUEUE-06-A: %s with state %s and reset %s gives %s', (status, state, reset, expected) => {
    expect(deriveQueueSafety(status, state, reset)).toBe(expected);
  });
});

describe('SPM-48 AC8: tentative holds', () => {
  /** MONITOR-QUEUE-08-B subtests A and B: active one second before expiry, expired exactly at it. */
  it('MONITOR-QUEUE-08-B flips a hold to expired exactly at its expiry instant', () => {
    expect(holdIsActive(H1_EXPIRY, new Date('2026-11-10T03:59:59.000Z'))).toBe(true);
    expect(holdIsActive(H1_EXPIRY, H1_EXPIRY)).toBe(false);
    expect(holdIsActive(H1_EXPIRY, new Date('2026-11-10T04:00:01.000Z'))).toBe(false);
  });

  /** MONITOR-QUEUE-08-A, 08-B: only pending bookings with an expiry are holds; each keeps its venue and expiry instant. */
  it('MONITOR-QUEUE-08-A reports each hold with its venue, expiry and state', () => {
    const holds = deriveHolds(
      [
        booking({ venueName: 'Hall A', status: 'pending', holdExpiresAt: new Date('2026-11-12T04:00:00.000Z') }),
        booking({ venueName: 'Hall B', status: 'pending', holdExpiresAt: new Date('2026-11-09T04:00:00.000Z') }),
        booking({ venueName: 'Hall C', status: 'pending', holdExpiresAt: null }), // a plain request, not a hold
        booking({ venueName: 'Hall D', status: 'approved', holdExpiresAt: new Date('2026-11-12T04:00:00.000Z') }), // converted
      ],
      NOW,
    );
    expect(holds).toEqual([
      { venueName: 'Hall A', expiresAt: '2026-11-12T04:00:00.000Z', state: 'ACTIVE' },
      { venueName: 'Hall B', expiresAt: '2026-11-09T04:00:00.000Z', state: 'EXPIRED' },
    ]);
  });
});

describe('SPM-48 AC9: venue became unavailable', () => {
  /**
   * MONITOR-QUEUE-09-A, 09-B: an active booking (approved, a plain pending request, or a live hold) at an unavailable
   * venue is flagged; an expired hold is not active and is not flagged. Each venue is named once.
   */
  it('MONITOR-QUEUE-09-A names the venues of active bookings that are now unavailable', () => {
    const venues = deriveUnavailableVenues(
      [
        booking({ venueName: 'Hall A', venueUnavailable: true }), // approved
        booking({ venueName: 'Hall B', venueUnavailable: false }), // available
        booking({ venueName: 'Hall C', status: 'pending', venueUnavailable: true }), // plain request
        booking({ venueName: 'Hall D', status: 'pending', holdExpiresAt: new Date('2026-11-12T04:00:00.000Z'), venueUnavailable: true }),
        booking({ venueName: 'Hall E', status: 'pending', holdExpiresAt: H1_EXPIRY, venueUnavailable: true }), // active until 04:00
        booking({ venueName: 'Hall F', status: 'pending', holdExpiresAt: new Date('2026-11-09T04:00:00.000Z'), venueUnavailable: true }), // expired
        booking({ venueName: 'Hall A', venueUnavailable: true }), // the same venue twice
      ],
      NOW,
    );
    expect(venues).toEqual(['Hall A', 'Hall C', 'Hall D', 'Hall E']);
  });

  /**
   * MONITOR-QUEUE-09-A (review finding, PR #80): venues are told apart by id. Two venues sharing a name are both listed,
   * each with its location; two bookings of one venue are listed once; a unique name keeps its plain label.
   */
  it('MONITOR-QUEUE-09-A tells apart unavailable venues that share a name', () => {
    const east = booking({ venueId: 'v-east', venueName: 'Main Hall', venueLocation: 'East Wing', venueUnavailable: true });
    const west = booking({ venueId: 'v-west', venueName: 'Main Hall', venueLocation: 'West Wing', venueUnavailable: true });
    const eastAgain = booking({ venueId: 'v-east', venueName: 'Main Hall', venueLocation: 'East Wing', venueUnavailable: true });
    const studio = booking({ venueId: 'v-studio', venueName: 'Studio', venueUnavailable: true });
    expect(deriveUnavailableVenues([east, west, eastAgain, studio], NOW)).toEqual([
      'Main Hall (East Wing)',
      'Main Hall (West Wing)',
      'Studio',
    ]);
    // A namesake that is still available still counts: the one unavailable twin is named with its location (TR-07).
    const westAvailable = booking({ venueId: 'v-west', venueName: 'Main Hall', venueLocation: 'West Wing' });
    expect(deriveUnavailableVenues([east, westAvailable], NOW)).toEqual(['Main Hall (East Wing)']);
    // The location is added only because another of the event's venues has the same name.
    expect(venueLabel(east, [east, studio])).toBe('Main Hall');
    expect(venueLabel(east, [east, eastAgain])).toBe('Main Hall');
  });

  /** MONITOR-QUEUE-08-A (review finding, PR #80): a hold names its venue the same way, with the location on a name clash. */
  it('MONITOR-QUEUE-08-A labels a hold with the venue location when two venues share a name', () => {
    const hold = booking({ venueId: 'v-east', venueName: 'Main Hall', venueLocation: 'East Wing', status: 'pending', holdExpiresAt: H1_EXPIRY });
    const other = booking({ venueId: 'v-west', venueName: 'Main Hall', venueLocation: 'West Wing' });
    expect(deriveHolds([hold, other], NOW)).toEqual([
      { venueName: 'Main Hall (East Wing)', expiresAt: H1_EXPIRY.toISOString(), state: 'ACTIVE' },
    ]);
  });

  /** MONITOR-QUEUE-09-B: an approved replacement does not clear the flag while the affected booking is active. */
  it('MONITOR-QUEUE-09-B keeps the flag while the affected booking is still active', () => {
    const affected = booking({ venueName: 'Hall F', venueUnavailable: true });
    const replacement = booking({ venueName: 'Hall G' });
    expect(deriveUnavailableVenues([affected, replacement], NOW)).toEqual(['Hall F']);
    // Once the affected booking is cancelled the query no longer returns it.
    expect(deriveUnavailableVenues([replacement], NOW)).toEqual([]);
  });
});

describe('SPM-48 AC5: what needs the coordinator’s action', () => {
  /** MONITOR-QUEUE-05-B: each PO-confirmed reason, in a fixed order; awaiting the Safety Officer and an active hold are not actions. */
  it('MONITOR-QUEUE-05-B lists the reasons an event needs action', () => {
    expect(deriveActions('Submitted', null, [], [])).toEqual(['AWAITING_REVIEW']);
    expect(deriveActions('Planning', 'CHANGES_REQUESTED', [], [])).toEqual(['SAFETY_CHANGES_REQUESTED']);
    expect(deriveActions('Planning', 'REJECTED', [], [])).toEqual(['SAFETY_REJECTED']);
    expect(deriveActions('Planning', 'RESET', [], [])).toEqual(['SAFETY_RESET']);
    expect(deriveActions('Planning', null, [], ['Hall B'])).toEqual(['VENUE_UNAVAILABLE']);
    expect(deriveActions('Planning', null, [{ venueName: 'Hall A', expiresAt: '', state: 'EXPIRED' }], [])).toEqual(['HOLD_EXPIRED']);
    expect(deriveActions('Planning', 'AWAITING_CHECK', [{ venueName: 'Hall A', expiresAt: '', state: 'ACTIVE' }], [])).toEqual([]);
    expect(deriveActions('Confirmed', 'CLEARED', [], [])).toEqual([]);
    expect(
      deriveActions('Planning', 'REJECTED', [{ venueName: 'Hall A', expiresAt: '', state: 'EXPIRED' }], ['Hall B']),
    ).toEqual(['SAFETY_REJECTED', 'VENUE_UNAVAILABLE', 'HOLD_EXPIRED']);
  });

  /** MONITOR-QUEUE-05-B: terminal events (EVT-410 Completed, EVT-411 Cancelled) carry no indicators even with stale bookings. */
  it('MONITOR-QUEUE-05-B gives terminal events no follow-up indicators', () => {
    const stale = [
      booking({ status: 'pending', holdExpiresAt: new Date('2026-11-09T04:00:00.000Z') }),
      booking({ venueName: 'Hall B', venueUnavailable: true }),
    ];
    for (const status of ['Completed', 'Cancelled', 'Rejected'])
      expect(buildQueueIndicators({ status, safetyState: 'changes_needed', safetyReset: false, bookings: stale }, NOW)).toEqual({
        safety: null,
        holds: [],
        unavailableVenues: [],
        actions: [],
        needsAction: false,
      });
  });

  /** MONITOR-QUEUE-05-B: a Planning event combines its indicators, and needsAction follows the reasons. */
  it('MONITOR-QUEUE-05-B builds the full indicator set for an open event', () => {
    expect(
      buildQueueIndicators(
        {
          status: 'Planning',
          safetyState: null,
          safetyReset: false,
          bookings: [booking({ venueName: 'Hall B', venueUnavailable: true })],
        },
        NOW,
      ),
    ).toEqual({ safety: null, holds: [], unavailableVenues: ['Hall B'], actions: ['VENUE_UNAVAILABLE'], needsAction: true });
    expect(buildQueueIndicators({ status: 'Approved', safetyState: null, safetyReset: false, bookings: [] }, NOW)).toEqual({
      safety: null,
      holds: [],
      unavailableVenues: [],
      actions: [],
      needsAction: false,
    });
  });
});

describe('SPM-48 status filter (MONITOR-QUEUE-01-SUP-FILTER)', () => {
  /** MONITOR-QUEUE-01-SUP-FILTER: no value or only blanks means no filter. */
  it.each([[undefined], [''], [' , '], [['', ' ']]])('MONITOR-QUEUE-01-SUP-FILTER treats %j as no filter', (raw) => {
    expect(parseStatusFilter(raw)).toEqual({ ok: true, statuses: null });
  });

  /** MONITOR-QUEUE-01-SUP-FILTER: one status or a list, any case, repeated values once, from a string or repeated query keys. */
  it('MONITOR-QUEUE-01-SUP-FILTER reads one or more statuses in any case', () => {
    expect(parseStatusFilter('planning')).toEqual({ ok: true, statuses: ['Planning'] });
    expect(parseStatusFilter(' Submitted , APPROVED,submitted ')).toEqual({ ok: true, statuses: ['Submitted', 'Approved'] });
    expect(parseStatusFilter(['confirmed', 'cancelled,'])).toEqual({ ok: true, statuses: ['Confirmed', 'Cancelled'] });
  });

  /** MONITOR-QUEUE-01-SUP-FILTER: an unknown status (including Under Review and Draft) or a non-text value is refused, naming the value. */
  it.each([
    ['Under Review', 'Under Review'],
    ['draft', 'draft'],
    ['planning,pending', 'pending'],
    [[42], '42'],
    [{ status: 'x' }, '[object Object]'],
  ])('MONITOR-QUEUE-01-SUP-FILTER refuses %j', (raw, named) => {
    expect(parseStatusFilter(raw)).toEqual({ ok: false, unknown: named });
  });
});
