import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
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
    expectFieldError({ ...request, endDateTime: futureIso(9, 13) }, 'endDateTime');
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
