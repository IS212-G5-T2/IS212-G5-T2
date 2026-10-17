/*
 * SPM-136 RR-136-02: a booking released by a cancellation holds nothing, so the coordinator's readiness view and
 * checklist must not list it as outstanding or pending. Same treatment as the released equipment lines
 * (INACTIVE_EQUIPMENT). Literals: the cancelled event shows no venue item and a "not requested" venue status.
 */
import { describe, expect, it } from 'vitest';
import { buildChecklist } from './checklist.js';
import { evaluateReadiness, type VenueBookingFact } from './readiness.js';

const NOW = new Date('2026-10-12T04:00:00Z');
const released = (over: Partial<VenueBookingFact> = {}) =>
  ({
    id: 'vb-301a',
    venueName: 'Main Hall',
    status: 'released',
    holdExpiresAt: null,
    venueUnavailable: false,
    ...over,
  }) as unknown as VenueBookingFact;

describe('SPM-136 RR-136-02: released venue bookings are inactive', () => {
  // Kills: M23
  it('CANCEL-EVENT-04-A-ARR: RR-136-02: a released approved booking and a released live hold are not outstanding venue items', () => {
    // Arrange: VB-301a (released approved) and VB-301b (released hold with a live expiry)
    const snapshot = {
      venueBookings: [
        released({ id: 'vb-301a' }),
        released({ id: 'vb-301b', venueName: 'Breakout Room 1', holdExpiresAt: new Date('2026-10-13T04:00:00Z') }),
      ],
      equipment: [],
      safety: { state: 'Approved' as const },
    };

    // Act
    const result = evaluateReadiness(snapshot, NOW);

    // Assert: no venue item at all
    expect(result.outstanding.filter((item) => item.type === 'venue')).toEqual([]);
  });

  // Kills: M24
  it('CANCEL-EVENT-04-A-ARR: RR-136-02: the checklist reports a released venue as not requested, with no venue items', () => {
    // Arrange
    const checklist = buildChecklist({
      snapshot: { venueBookings: [released()], equipment: [] },
      equipmentNeeds: '',
      equipmentConfirmedAt: null,
      safety: { status: 'not_requested' },
      now: NOW,
    });

    // Act and assert
    // ASSUMPTION A5: a released venue is labelled "not_requested" with no items (the label is ASSUMED; no spec gives it)
    expect(checklist.venue).toMatchObject({ status: 'not_requested', items: [] });
  });
});

/*
 * ASSUMPTION INDEX (SPM-136). Master list: docs/specs/SPM-136-test-results.md, "Assumptions (SPM-136)".
 *   A5 a released venue is labelled "not_requested" and gives no venue item (ASSUMED label) -> CANCEL-EVENT-04-A-ARR (both tests)
 */
