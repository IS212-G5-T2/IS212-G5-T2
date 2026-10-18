/*
 * SPM-65 AC3/AC9: the read-only conflict assessment of a change request. Pure function.
 * Test IDs refer to the Confluence pages under SPM-28 > SPM-65 (REVIEW-CHANGE-NN-X).
 */
import { describe, expect, it } from 'vitest';
import type {
  EquipmentArrangementRow,
  PlanningEventRow,
  VenueBookingRow,
} from '../../planning/event-planning.repository.js';
import { assessChangeRequest } from './assess-change-request.js';

const event: PlanningEventRow = {
  id: 'e1',
  organiserId: 'o1',
  coordinatorId: 'c1',
  status: 'Planning',
  name: 'Alumni Night',
  purpose: 'p',
  description: 'd',
  startDateTime: '2030-04-14T10:00:00.000Z',
  endDateTime: '2030-04-14T13:00:00.000Z',
  expectedAttendance: 80,
  layout: 'Banquet',
  facilities: ['Catering'],
  accessibility: [],
  equipmentNeeds: 'Two microphones',
  updatedAt: '2030-01-01T00:00:00.000Z',
};

const booking = (
  overrides: Partial<VenueBookingRow> = {},
): VenueBookingRow => ({
  id: 'b1',
  venueId: 'v1',
  venueName: 'Hall',
  capacity: 100,
  start: event.startDateTime,
  end: event.endDateTime,
  status: 'Booked',
  neighbours: [],
  ...overrides,
});
const projector: EquipmentArrangementRow = {
  id: 'q1',
  name: 'Projector',
  quantity: 2,
  status: 'Reserved',
};
const none = { registered: 0, waitlisted: 0 };

describe('assessChangeRequest', () => {
  /** REVIEW-CHANGE-03-B: unchanged or non-impacting fields have nothing to check. */
  it('REVIEW-CHANGE-03-B reports no conflicts for a description or an unchanged value', () => {
    expect(
      assessChangeRequest(
        { description: 'New', expectedAttendance: 80 },
        event,
        [booking()],
        [projector],
        {
          registered: 5,
          waitlisted: 1,
        },
      ),
    ).toEqual({
      venueBookings: [],
      equipment: [],
      registrations: { registered: 5, waitlisted: 1, details: [] },
      hasConflicts: false,
    });
  });

  /** REVIEW-CHANGE-03-A, 03-E: a move outside the held window lists the venue once with every reason and moves equipment. */
  it('REVIEW-CHANGE-03-A merges every reason per venue and lists equipment once', () => {
    const result = assessChangeRequest(
      {
        startDateTime: '2030-04-14T09:00:00.000Z',
        endDateTime: '2030-04-14T14:00:00.000Z',
        layout: 'Theatre',
      },
      event,
      [booking(), booking({ id: 'b2', status: 'Cancelled' })],
      [
        projector,
        { id: 'q2', name: 'Screen', quantity: 1, status: 'Released' },
      ],
      none,
    );
    expect(result.venueBookings).toHaveLength(1);
    expect(result.venueBookings[0]).toMatchObject({
      kind: 'venue',
      refId: 'b1',
      name: 'Hall',
    });
    // Both time fields give the same window detail; it is listed once.
    expect(
      result.venueBookings[0].details.filter((d) =>
        d.includes('the booking must change'),
      ),
    ).toHaveLength(1);
    expect(result.venueBookings[0].details).toContain(
      'Check that Hall supports the Theatre layout',
    );
    expect(result.equipment).toEqual([
      {
        kind: 'equipment',
        refId: 'q1',
        name: 'Projector × 2',
        details: ['Reservation period must move with the new event time'],
      },
    ]);
    expect(result.hasConflicts).toBe(true);
  });

  /** REVIEW-CHANGE-03-F: attendance above capacity is a venue conflict; equipment needs list every reservation. */
  it('REVIEW-CHANGE-03-F reports capacity and equipment requirement checks', () => {
    const result = assessChangeRequest(
      { expectedAttendance: 120, equipmentNeeds: 'A lectern' },
      event,
      [booking()],
      [projector],
      none,
    );
    expect(result.venueBookings[0].details).toEqual([
      'Attendance 120 exceeds capacity 100',
    ]);
    expect(result.equipment[0].details).toEqual([
      'Check this reservation still matches the new equipment requirements',
    ]);
  });

  /** REVIEW-CHANGE-03-G: registrations above the requested attendance, and attendees a move affects. */
  it('REVIEW-CHANGE-03-G reports registration conflicts', () => {
    const fewer = assessChangeRequest(
      { expectedAttendance: 2 },
      event,
      [],
      [],
      { registered: 3, waitlisted: 0 },
    );
    expect(fewer.registrations.details).toEqual([
      '3 attendees are already registered; the requested attendance is 2',
    ]);
    expect(fewer.hasConflicts).toBe(true);
    const enough = assessChangeRequest(
      { expectedAttendance: 3 },
      event,
      [],
      [],
      { registered: 3, waitlisted: 0 },
    );
    expect(enough.hasConflicts).toBe(false);
    const one = assessChangeRequest(
      { endDateTime: '2030-04-14T12:00:00.000Z' },
      event,
      [],
      [],
      { registered: 0, waitlisted: 1 },
    );
    expect(one.registrations.details).toEqual([
      '1 registered attendee (0 registered, 1 waitlisted) will be affected by the new date/time',
    ]);
    const many = assessChangeRequest(
      { startDateTime: '2030-04-14T11:00:00.000Z' },
      event,
      [],
      [],
      { registered: 2, waitlisted: 1 },
    );
    expect(many.registrations.details[0]).toBe(
      '3 registered attendees (2 registered, 1 waitlisted) will be affected by the new date/time',
    );
    const nobody = assessChangeRequest(
      { startDateTime: '2030-04-14T11:00:00.000Z' },
      event,
      [],
      [],
      none,
    );
    expect(nobody.hasConflicts).toBe(false);
  });
});
