import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEvent } from './event-input.js';
import { facilityNames } from '../../venues/helpers/venue-options.js';
import { accessibilityLabels } from '../../venues/helpers/accessibility-options.js';

// Fixed clock for every test in this file (validateEvent compares the start with the current time).
const FIXED_NOW = new Date('2030-01-01T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function futureIso(daysFromNow: number, hour: number): string {
  const date = new Date(FIXED_NOW);
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function validEventRequest() {
  return {
    name: ' Welcome Evening ',
    purpose: 'Community building',
    description: 'A welcome event for new members.',
    startDateTime: futureIso(10, 10),
    endDateTime: futureIso(10, 13),
    expectedAttendance: 80,
    layout: 'Banquet',
    facilities: ['Catering'],
    accessibility: ['Wheelchair access'],
    attachments: [
      {
        id: 'attachment-1',
        name: 'proposal.txt',
        type: 'text/plain',
        size: 12,
        dataUrl: 'data:text/plain;base64,SGVsbG8=',
      },
    ],
    equipmentNeeds: 'Two microphones',
    submissionKey: '00000000-0000-4000-8000-000000000036',
    registrationEnabled: false,
  };
}

function expectFieldError(input: unknown, field: string) {
  expect(() => validateEvent(input)).toThrow(BadRequestException);

  try {
    validateEvent(input);
  } catch (error) {
    expect((error as BadRequestException).getResponse()).toMatchObject({
      errors: { [field]: expect.any(String) },
    });
  }
}

describe('validateEvent', () => {
  // Parent AC (SUPPORTING): SPM-36 AC4
  // Kills: validateEvent accepting a null, array or string body instead of throwing BadRequestException.
  it.each([null, [], 'invalid'])(
    'EVE-CRE-SUP-13 malformed submitted envelope %j is rejected',
    (input) => expect(() => validateEvent(input)).toThrow(BadRequestException),
  );
  // Parent AC (SUPPORTING): SPM-36 AC4
  // Kills: name validation that accepts a non-string or a 201-character name (200-character limit not enforced).
  it.each([123, 'x'.repeat(201)])(
    'EVE-CRE-SUP-14 submission rejects invalid name %j',
    (name) => expectFieldError({ ...validEventRequest(), name }, 'name'),
  );
  // Parent AC (SUPPORTING): SPM-36 AC2
  // Kills: facilities or accessibility left undefined instead of defaulting to an empty array.
  it('EVE-CRE-SUP-01 omitted choices default to empty arrays', () => {
    const request = {
      ...validEventRequest(),
      facilities: undefined,
      accessibility: undefined,
    };
    expect(validateEvent(request)).toMatchObject({
      facilities: [],
      accessibility: [],
    });
  });
  // Parent AC (SUPPORTING): SPM-36 AC9
  // Kills: an attachments container check that accepts a non-array value or a list of six entries (five-item maximum missing).
  it.each(['invalid', Array(6).fill({})])(
    'EVE-CRE-SUP-02 invalid submitted attachment collection %j',
    (attachments) =>
      expectFieldError({ ...validEventRequest(), attachments }, 'attachments'),
  );
  // Parent AC (SUPPORTING): SPM-36 AC9
  // Kills: attachment shape validation that accepts null, an array, a string or an entry with non-string id, name, type or dataUrl.
  it.each([null, [], 'file', { id: 1, name: 1, type: 1, dataUrl: 1 }])(
    'EVE-CRE-SUP-03 invalid submitted attachment shape %j',
    (attachment) =>
      expectFieldError(
        { ...validEventRequest(), attachments: [attachment] },
        'attachments',
      ),
  );
  // Parent AC (SUPPORTING): SPM-36 AC4
  // Kills: submissionKey validation that accepts an empty, malformed or non-v4 UUID (version nibble not checked).
  it.each(['wrong-id', '', '00000000-0000-1000-8000-000000000036'])(
    'EVE-CRE-SUP-04 rejects invalid submission UUID %s',
    (submissionKey) =>
      expectFieldError(
        { ...validEventRequest(), submissionKey },
        'submissionKey',
      ),
  );
  // Parent AC (SUPPORTING): SPM-36 AC4
  // Kills: attendance bounds that reject 1, 2147483646 or 2147483647 (off-by-one at either end of the accepted range).
  it.each([1, 2, 2147483646, 2147483647])(
    'EVE-CRE-SUP-05 valid attendance boundary %s',
    (expectedAttendance) =>
      expect(
        validateEvent({ ...validEventRequest(), expectedAttendance })
          .expectedAttendance,
      ).toBe(expectedAttendance),
  );
  // Parent AC (SUPPORTING): SPM-36 AC4
  // Kills: a start check using < in place of <= so a start equal to now is accepted (the validator rejects start <= now).
  it('EVE-CRE-SUP-06 start time just before, at and after now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T10:00:00Z'));
    try {
      for (const delta of [-1, 0, 1]) {
        const request = {
          ...validEventRequest(),
          startDateTime: new Date(FIXED_NOW.getTime() + delta).toISOString(),
        };
        if (delta <= 0) expectFieldError(request, 'startDateTime');
        else
          expect(validateEvent(request).startDateTime).toBe(
            request.startDateTime,
          );
      }
    } finally {
      vi.useRealTimers();
    }
  });
  // SPM-36 Test Case EVE-CRE-03-A
  // Kills: a valid request whose output drops or alters a field (name not trimmed, attachments, facilities or equipmentNeeds lost).
  it('EVE-CRE-03-A accepts a valid complete Event Request', () => {
    const request = validEventRequest();

    const result = validateEvent(request);

    expect(result).toEqual({
      ...request,
      name: 'Welcome Evening',
    });
  });

  // SPM-36 Test Cases EVE-CRE-04-A, EVE-CRE-04-B, EVE-CRE-04-C, EVE-CRE-04-D
  // One test per mandatory field, so each title carries its own case ID.
  const omitField = (field: string) => {
    const request = validEventRequest() as Record<string, unknown>;
    delete request[field];

    expectFieldError(request, field);
  };
  // Kills: a missing name not reported on the name field (required check removed for name).
  it('EVE-CRE-04-A missing event name blocks submission', () => omitField('name'));
  // Kills: a missing purpose accepted without a purpose field error (required check removed for purpose).
  it('EVE-CRE-04-A missing purpose blocks submission', () => omitField('purpose'));
  // Kills: a missing description accepted without a description field error (required check removed for description).
  it('EVE-CRE-04-A missing description blocks submission', () => omitField('description'));
  // Kills: a missing start date/time not reported on startDateTime (required check removed).
  it('EVE-CRE-04-B missing proposed start date and time blocks submission', () => omitField('startDateTime'));
  // Kills: a missing end date/time not reported on endDateTime (required check removed).
  it('EVE-CRE-04-B missing proposed end date and time blocks submission', () => omitField('endDateTime'));
  // Kills: a missing expected attendance accepted or reported on another field (required check removed).
  it('EVE-CRE-04-C missing expected attendance blocks submission', () => omitField('expectedAttendance'));
  // Kills: a missing layout accepted or reported on another field (required check removed for layout).
  it('EVE-CRE-04-D missing preferred room layout blocks submission', () => omitField('layout'));

  // SPM-36 Test Case EVE-CRE-05-A
  // Kills: a name check that runs before trimming, so '   ' is accepted as a non-empty name.
  it('EVE-CRE-05-A rejects a whitespace-only event name', () => {
    expectFieldError({ ...validEventRequest(), name: '   ' }, 'name');
  });

  // SPM-36 Test Case EVE-CRE-05-B
  // Kills: attendance validation that accepts 0, a negative, a fraction, the text '80', null or 2147483648.
  it.each([0, -1, 1.5, '80', null, 2147483648])(
    'EVE-CRE-05-B rejects invalid expected attendance value: %s',
    (expectedAttendance) => {
      expectFieldError(
        { ...validEventRequest(), expectedAttendance },
        'expectedAttendance',
      );
    },
  );

  // Kills: a facility allow-list that drops or renames one of the venue-schema facilities.
  /** EVE-FAC-01-A: event validation accepts every current venue-schema facility. */
  it('EVE-FAC-01-A accepts all facility values from the venue schema', () => {
    const event = validateEvent({
      ...validEventRequest(),
      facilities: [...facilityNames],
    });
    expect(event.facilities).toEqual([...facilityNames]);
  });

  // Kills: an accessibility allow-list that omits one of the venue-owned labels.
  /** EVE-ACC-02-ALIGN-01: event validation accepts the venue-owned accessibility labels. */
  it('EVE-ACC-02-ALIGN-01 accepts all accessibility values from the venue schema', () => {
    const event = validateEvent({
      ...validEventRequest(),
      accessibility: [...accessibilityLabels],
    });
    expect(event.accessibility).toEqual([...accessibilityLabels]);
  });

  // SPM-36 Test Case EVE-CRE-05-C
  // Kills: date parsing that accepts an impossible date (2026-02-30) or a date-only string as a start date/time.
  it.each(['invalid', '2026-02-30T10:00:00.000Z', '2026-12-12'])(
    'EVE-CRE-05-C rejects invalid proposed start date/time: %s',
    (startDateTime) => {
      expectFieldError(
        { ...validEventRequest(), startDateTime },
        'startDateTime',
      );
    },
  );

  // SPM-36 Test Case EVE-CRE-05-C
  // Kills: a start check that accepts a start on a previous day (no past-date comparison).
  it('EVE-CRE-05-C rejects a proposed start date/time before today', () => {
    expectFieldError(
      {
        ...validEventRequest(),
        startDateTime: futureIso(-1, 10),
        endDateTime: futureIso(10, 13),
      },
      'startDateTime',
    );
  });

  // SPM-36 Test Case EVE-CRE-05-C
  // Kills: a start check comparing dates only, so a start one minute before now is accepted.
  it('EVE-CRE-05-C rejects a proposed start date/time earlier today', () => {
    // The rule compares the start with the current time, so the clock is fixed for this check.
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    try {
      expectFieldError(
        {
          ...validEventRequest(),
          startDateTime: new Date(FIXED_NOW.getTime() - 60_000).toISOString(),
        },
        'startDateTime',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // SPM-36 Test Case EVE-CRE-05-D
  // Kills: an end check using < in place of <=, accepting an end equal to the start, or accepting an end before the start.
  it('EVE-CRE-05-D rejects an end date/time equal to or earlier than the start date/time', () => {
    const request = validEventRequest();

    expectFieldError(
      { ...request, endDateTime: request.startDateTime },
      'endDateTime',
    );
    expectFieldError(
      { ...request, endDateTime: futureIso(9, 13) },
      'endDateTime',
    );
  });

  // SPM-36 Test Case EVE-CRE-05-E
  // Kills: a layout, accessibility or facility allow-list that accepts an unsupported option (Auditorium, Quiet room or Fireworks).
  it.each([
    ['room layout', { layout: 'Auditorium' }, 'layout'],
    ['accessibility need', { accessibility: ['Quiet room'] }, 'accessibility'],
    ['required facility', { facilities: ['Fireworks'] }, 'facilities'],
  ])(
    'EVE-CRE-05-E rejects an unsupported %s option',
    (_label, override, field) => {
      expectFieldError({ ...validEventRequest(), ...override }, field);
    },
  );

  // Kills: the facilities check accepting a value absent from the venue schema (Fireworks).
  /** EVE-FAC-04-A: event validation rejects a facility absent from the venue schema. */
  it('EVE-FAC-04-A rejects an unsupported facility value', () => {
    expectFieldError(
      { ...validEventRequest(), facilities: ['Fireworks'] },
      'facilities',
    );
  });

  // Kills: the accessibility check accepting a value outside the venue schema (Wheelchair ramps).
  /** EVE-FAC-04-A: event validation rejects accessibility values outside the venue-owned schema. */
  it('EVE-FAC-04-A rejects unsupported accessibility values', () => {
    expectFieldError(
      { ...validEventRequest(), accessibility: ['Wheelchair ramps'] },
      'accessibility',
    );
  });

  // SPM-36 Test Cases EVE-CRE-08-A and EVE-CRE-08-B
  // Kills: optional attachments not defaulting to an empty list, or a supplied attachment not returned unchanged.
  it('EVE-CRE-08-B accepts optional supporting files and defaults to none when omitted', () => {
    const withoutFiles = validEventRequest() as Record<string, unknown>;
    delete withoutFiles.attachments;

    expect(validateEvent(withoutFiles).attachments).toEqual([]);
    expect(validateEvent(validEventRequest()).attachments).toEqual([
      {
        id: 'attachment-1',
        name: 'proposal.txt',
        type: 'text/plain',
        size: 12,
        dataUrl: 'data:text/plain;base64,SGVsbG8=',
      },
    ]);
  });

  // SPM-36 Test Case EVE-CRE-08-C, AC9: one defect per case, so each check is shown to work on its own.
  const validAttachment = {
    id: 'attachment-1',
    name: 'proposal.txt',
    type: 'text/plain',
    size: 12,
    dataUrl: 'data:text/plain;base64,SGVsbG8=',
  };
  // Kills: one of the attachment checks removed, so the matching invalid attachment (missing id, size, data URL or sixth file) is accepted.
  it.each([
    ['a missing id', [{ ...validAttachment, id: undefined }]],
    ['a blank name', [{ ...validAttachment, name: '   ' }]],
    ['a name over 255 characters', [{ ...validAttachment, name: 'a'.repeat(256) }]],
    ['a blank type', [{ ...validAttachment, type: '' }]],
    ['a type over 100 characters', [{ ...validAttachment, type: 't'.repeat(101) }]],
    ['a negative size', [{ ...validAttachment, size: -1 }]],
    ['a fractional size', [{ ...validAttachment, size: 1.5 }]],
    ['a size sent as text', [{ ...validAttachment, size: '12' }]],
    ['a missing size', [{ ...validAttachment, size: undefined }]],
    ['a blank data URL', [{ ...validAttachment, dataUrl: '' }]],
    ['a link instead of a data URL', [{ ...validAttachment, dataUrl: 'https://example.test/file' }]],
    ['a sixth file', Array.from({ length: 6 }, (_, index) => ({ ...validAttachment, id: `attachment-${index + 1}` }))],
  ])('EVE-CRE-08-C rejects %s', (_label, attachments) => {
    expectFieldError({ ...validEventRequest(), attachments }, 'attachments');
  });

  // Parent AC (SUPPORTING): SPM-36 AC6
  // SPM-36 server-control check for organiser identity and status
  // Kills: a body organiserId or status copied into the validated result instead of being dropped.
  it('EVE-CRE-SUP-07 ignores client-supplied organiser identity and status', () => {
    const result = validateEvent({
      ...validEventRequest(),
      organiserId: 'someone-else',
      status: 'approved',
    });

    expect(result).not.toHaveProperty('organiserId');
    expect(result).not.toHaveProperty('status');
  });

  // Parent AC (SUPPORTING): SPM-36 AC6
  // Kills: registrationEnabled not defaulting to false when omitted, or a true/false value not carried through.
  it('EVE-CRE-SUP-08 accepts valid registrationEnabled boolean flag', () => {
    expect(
      validateEvent({ ...validEventRequest(), registrationEnabled: true }),
    ).toMatchObject({ registrationEnabled: true });
    expect(
      validateEvent({ ...validEventRequest(), registrationEnabled: false }),
    ).toMatchObject({ registrationEnabled: false });
    expect(
      validateEvent({ ...validEventRequest(), registrationEnabled: undefined }),
    ).toMatchObject({ registrationEnabled: false });
  });

  // Parent AC (SUPPORTING): SPM-36 AC4
  // Kills: a registrationEnabled check that coerces the string 'true' to a boolean instead of rejecting it.
  it('EVE-CRE-SUP-09 rejects non-boolean registrationEnabled values', () => {
    expectFieldError(
      { ...validEventRequest(), registrationEnabled: 'true' },
      'registrationEnabled',
    );
  });
});
