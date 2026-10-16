/*
 * SPM-64 change request body validation. Test IDs refer to the Confluence
 * pages under SPM-28 > SPM-64 (REQ-CHANGE-NN-X).
 */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  LOCKED_FIELDS_MESSAGE,
  NOT_PERMITTED,
  PERMITTED_CHANGE_FIELDS,
  validateChangeRequest,
} from './change-request-input.js';

const FUTURE = '2030-02-05T10:30:00Z';
const LATER = '2030-02-05T13:30:00Z';

/** Runs the validator and returns the 400 body it throws. */
function rejection(input: unknown) {
  try {
    validateChangeRequest(input);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
      message: string;
      errors: Record<string, string>;
    };
  }
  throw new Error('expected a 400');
}

describe('validateChangeRequest', () => {
  /** REQ-CHANGE-01-A: every permitted change type is accepted on its own. */
  it.each([
    ['description', 'A new description.'],
    ['startDateTime', FUTURE],
    ['endDateTime', LATER],
    ['expectedAttendance', 140],
    ['layout', 'Theatre'],
    ['facilities', ['Projector']],
    ['accessibility', ['Hearing loop']],
    ['equipmentNeeds', 'Two wireless microphones and a lectern.'],
  ])('REQ-CHANGE-01-A accepts a change to %s', (field, value) => {
    expect(validateChangeRequest({ changes: { [field]: value } }).changes).toEqual({
      [field]: value,
    });
  });

  /** REQ-CHANGE-01-A: the permitted list is exactly the AC1 change types. */
  it('REQ-CHANGE-01-A permits exactly description, date/time, attendance, venue requirements, equipment and accessibility', () => {
    expect([...PERMITTED_CHANGE_FIELDS].sort()).toEqual(
      [
        'accessibility',
        'description',
        'endDateTime',
        'equipmentNeeds',
        'expectedAttendance',
        'facilities',
        'layout',
        'startDateTime',
      ].sort(),
    );
  });

  /** REQ-CHANGE-01-B: several permitted fields travel in one request; text is trimmed and lists de-duplicated. */
  it('REQ-CHANGE-01-B accepts several fields and cleans their values', () => {
    expect(
      validateChangeRequest({
        changes: {
          startDateTime: FUTURE,
          endDateTime: LATER,
          expectedAttendance: 140,
          equipmentNeeds: '  Two wireless microphones.  ',
          facilities: ['Projector', 'Projector'],
        },
        reason: '  Guest list grew.  ',
      }),
    ).toEqual({
      changes: {
        startDateTime: FUTURE,
        endDateTime: LATER,
        expectedAttendance: 140,
        equipmentNeeds: 'Two wireless microphones.',
        facilities: ['Projector'],
      },
      reason: 'Guest list grew.',
    });
  });

  /** REQ-CHANGE-01-C: invalid proposed values are reported together, by field. */
  it('REQ-CHANGE-01-C reports every invalid value at once', () => {
    const body = rejection({
      changes: {
        startDateTime: '2020-01-01T00:00:00Z',
        expectedAttendance: 0,
        layout: 'Spaceship',
        facilities: ['Jacuzzi'],
        description: '   ',
      },
    });
    expect(body.message).toBe('Please correct the highlighted fields.');
    expect(Object.keys(body.errors).sort()).toEqual(
      ['description', 'expectedAttendance', 'facilities', 'layout', 'startDateTime'].sort(),
    );
  });

  /** REQ-CHANGE-01-D: values exactly on the limits are accepted. */
  it.each([
    ['expectedAttendance', 1],
    ['expectedAttendance', 2147483647],
    ['description', 'x'.repeat(5000)],
    ['equipmentNeeds', 'x'.repeat(2000)],
    ['equipmentNeeds', ''],
    ['facilities', []],
  ])('REQ-CHANGE-01-D accepts the boundary value for %s', (field, value) => {
    expect(() => validateChangeRequest({ changes: { [field]: value } })).not.toThrow();
  });

  /** REQ-CHANGE-01-D: one past each limit is rejected. */
  it.each([
    ['expectedAttendance', 2147483648],
    ['description', 'x'.repeat(5001)],
    ['equipmentNeeds', 'x'.repeat(2001)],
  ])('REQ-CHANGE-01-D rejects one past the limit for %s', (field, value) => {
    expect(rejection({ changes: { [field]: value } }).errors).toHaveProperty(field);
  });

  /** REQ-CHANGE-01-E: an empty request is not a change request. */
  it.each([[{}], [{ changes: {} }], [{ changes: [] }], [null], ['text']])(
    'REQ-CHANGE-01-E rejects a request with no changes: %j',
    (input) => {
      expect(rejection(input).message).toBe('Choose at least one detail to change.');
    },
  );

  /** REQ-CHANGE-02-B, 06-A: the event name can never be changed, and nothing is partially accepted. */
  it('REQ-CHANGE-02-B rejects a change to the event name, even alongside a valid change', () => {
    const body = rejection({ changes: { name: 'Alumni Gala', description: 'New text' } });
    expect(body.message).toBe(LOCKED_FIELDS_MESSAGE);
    expect(body.errors).toEqual({ name: 'Event name cannot be changed.' });
  });

  /** REQ-CHANGE-02-C: every way of naming the organiser is rejected. */
  it.each(['organiser', 'organiserId', 'organiserName', 'organiserEmail'])(
    'REQ-CHANGE-02-C rejects a change to %s',
    (field) => {
      const body = rejection({ changes: { [field]: 'someone-else' } });
      expect(body.message).toBe(LOCKED_FIELDS_MESSAGE);
      expect(body.errors[field]).toBe('Event organiser cannot be changed.');
    },
  );

  /** REQ-CHANGE-02-D: other details outside the permitted list are rejected by name. */
  it.each(['purpose', 'status', 'coordinatorId', 'registrationEnabled', 'attachments', 'unknownField'])(
    'REQ-CHANGE-02-D rejects a change to %s',
    (field) => {
      const body = rejection({ changes: { [field]: 'x' } });
      expect(body.message).toBe('Please correct the highlighted fields.');
      expect(body.errors[field]).toBe(NOT_PERMITTED);
    },
  );

  /** REQ-CHANGE-06-B: the error names every non-permitted field and any invalid value together. */
  it('REQ-CHANGE-06-B names every non-permitted field and invalid value in one response', () => {
    const body = rejection({
      changes: { name: 'X', organiserId: 'Y', purpose: 'Z', expectedAttendance: -1 },
    });
    expect(body.message).toBe(LOCKED_FIELDS_MESSAGE);
    expect(Object.keys(body.errors).sort()).toEqual(
      ['expectedAttendance', 'name', 'organiserId', 'purpose'].sort(),
    );
  });

  /** REQ-CHANGE-08-B: server-owned values cannot be supplied next to the changes. */
  it('REQ-CHANGE-08-B rejects server-controlled fields in the body', () => {
    const body = rejection({
      changes: { description: 'New' },
      status: 'Approved',
      requestedBy: 'ORG-02',
      eventId: 'other',
    });
    expect(body.errors).toEqual({
      status: 'Unknown field.',
      requestedBy: 'Unknown field.',
      eventId: 'Unknown field.',
    });
  });

  /** The optional reason is trimmed, blank means none, and it is limited to 500 characters. */
  it('validates the optional reason', () => {
    expect(validateChangeRequest({ changes: { description: 'New' }, reason: '   ' })).toEqual({
      changes: { description: 'New' },
    });
    expect(validateChangeRequest({ changes: { description: 'New' }, reason: null })).toEqual({
      changes: { description: 'New' },
    });
    expect(
      validateChangeRequest({ changes: { description: 'New' }, reason: 'x'.repeat(500) }).reason,
    ).toHaveLength(500);
    expect(rejection({ changes: { description: 'New' }, reason: 'x'.repeat(501) }).errors).toEqual({
      reason: 'Use 500 characters or fewer.',
    });
    expect(rejection({ changes: { description: 'New' }, reason: 5 }).errors).toEqual({
      reason: 'Enter valid text.',
    });
  });
});
