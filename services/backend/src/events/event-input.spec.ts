import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { validateEvent } from './event-input.js';

function futureIso(daysFromNow: number, hour: number): string {
  const date = new Date();
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
    accessibility: ['Wheelchair ramps'],
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
  it.each([null, [], 'invalid'])(
    'Q1-044 malformed submitted envelope %j is rejected',
    (input) => expect(() => validateEvent(input)).toThrow(BadRequestException),
  );
  it.each([123, 'x'.repeat(201)])(
    'Q1-045 submission rejects invalid name %j',
    (name) => expectFieldError({ ...validEventRequest(), name }, 'name'),
  );
  it('Q1-046 omitted choices default to empty arrays', () => {
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
  it.each(['invalid', Array(6).fill({})])(
    'Q1-047 invalid submitted attachment collection %j',
    (attachments) =>
      expectFieldError({ ...validEventRequest(), attachments }, 'attachments'),
  );
  it.each([null, [], 'file', { id: 1, name: 1, type: 1, dataUrl: 1 }])(
    'Q1-048 invalid submitted attachment shape %j',
    (attachment) =>
      expectFieldError(
        { ...validEventRequest(), attachments: [attachment] },
        'attachments',
      ),
  );
  it.each(['wrong-id', '', '00000000-0000-1000-8000-000000000036'])(
    'Q1-049 rejects invalid submission UUID %s',
    (submissionKey) =>
      expectFieldError(
        { ...validEventRequest(), submissionKey },
        'submissionKey',
      ),
  );
  it.each([1, 2, 2147483646, 2147483647])(
    'Q1-050 valid attendance boundary %s',
    (expectedAttendance) =>
      expect(
        validateEvent({ ...validEventRequest(), expectedAttendance })
          .expectedAttendance,
      ).toBe(expectedAttendance),
  );
  it('Q1-051 start time just before, at and after now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T10:00:00Z'));
    try {
      for (const delta of [-1, 0, 1]) {
        const request = {
          ...validEventRequest(),
          startDateTime: new Date(Date.now() + delta).toISOString(),
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
  it('EVE-CRE-03-A accepts a valid complete Event Request', () => {
    const request = validEventRequest();

    const result = validateEvent(request);

    expect(result).toEqual({
      ...request,
      name: 'Welcome Evening',
    });
  });

  // SPM-36 Test Cases EVE-CRE-04-A, EVE-CRE-04-B, EVE-CRE-04-C, EVE-CRE-04-D
  it.each([
    ['EVE-CRE-04-A missing event name blocks submission', 'name'],
    ['EVE-CRE-04-A missing purpose blocks submission', 'purpose'],
    ['EVE-CRE-04-A missing description blocks submission', 'description'],
    [
      'EVE-CRE-04-B missing proposed start date and time blocks submission',
      'startDateTime',
    ],
    [
      'EVE-CRE-04-B missing proposed end date and time blocks submission',
      'endDateTime',
    ],
    [
      'EVE-CRE-04-C missing expected attendance blocks submission',
      'expectedAttendance',
    ],
    ['EVE-CRE-04-D missing preferred room layout blocks submission', 'layout'],
  ])('%s', (_caseName, field) => {
    const request = validEventRequest() as Record<string, unknown>;
    delete request[field];

    expectFieldError(request, field);
  });

  // SPM-36 Test Case EVE-CRE-05-A
  it('EVE-CRE-05-A rejects a whitespace-only event name', () => {
    expectFieldError({ ...validEventRequest(), name: '   ' }, 'name');
  });

  // SPM-36 Test Case EVE-CRE-05-B
  it.each([0, -1, 1.5, '80', null, 2147483648])(
    'EVE-CRE-05-B rejects invalid expected attendance value: %s',
    (expectedAttendance) => {
      expectFieldError(
        { ...validEventRequest(), expectedAttendance },
        'expectedAttendance',
      );
    },
  );

  // SPM-36 Test Case EVE-CRE-05-C
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
  it('EVE-CRE-05-C rejects a proposed start date/time earlier today', () => {
    expectFieldError(
      {
        ...validEventRequest(),
        startDateTime: new Date(Date.now() - 60_000).toISOString(),
      },
      'startDateTime',
    );
  });

  // SPM-36 Test Case EVE-CRE-05-D
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

  // Second story attachment prep
  it('accepts optional supporting files and defaults to none when omitted', () => {
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

  // Second story attachment prep
  it('rejects unsupported attachment payloads', () => {
    expectFieldError(
      {
        ...validEventRequest(),
        attachments: [{ name: '', type: 'text/plain', size: -1, dataUrl: '' }],
      },
      'attachments',
    );
  });

  // SPM-36 server-control check for organiser identity and status
  it('ignores client-supplied organiser identity and status', () => {
    const result = validateEvent({
      ...validEventRequest(),
      organiserId: 'someone-else',
      status: 'approved',
    });

    expect(result).not.toHaveProperty('organiserId');
    expect(result).not.toHaveProperty('status');
  });
});
