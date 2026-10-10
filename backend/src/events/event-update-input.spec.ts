import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  FIELD_POLICY,
  classifyUpdate,
  validateEventUpdate,
  type EventFieldKey,
} from './event-update-input.js';

/**
 * SPM-49 (Update Event Information) and SPM-85 (Review and Resolve Flagged
 * Event Changes) — pure validation and field-policy rules. Confluence IDs:
 * EVENT-UPDATE-02/03/04/05 and EVENT-FLAG-01.
 */

function futureIso(daysFromNow: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

// Runs validation and returns the per-field error map the API would send back.
function errorsOf(input: unknown): Record<string, string> {
  try {
    validateEventUpdate(input);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as {
      errors?: Record<string, string>;
    };
    return body.errors ?? {};
  }
  throw new Error('Expected validateEventUpdate to reject this input.');
}

describe('validateEventUpdate', () => {
  // EVENT-UPDATE-03-A: the coordinator only has to send the fields they changed.
  it('EVENT-UPDATE-03-A accepts a partial update and trims text', () => {
    expect(validateEventUpdate({ name: '  Welcome Evening  ' })).toEqual({
      name: 'Welcome Evening',
    });
  });

  // EVENT-UPDATE-03-A: every editable field is accepted together.
  it('EVENT-UPDATE-03-A accepts every editable field in one update', () => {
    const patch = {
      name: 'Orientation',
      purpose: 'Welcome new students',
      description: 'Updated description',
      startDateTime: futureIso(10, 10),
      endDateTime: futureIso(10, 13),
      expectedAttendance: 120,
      layout: 'Theatre',
      facilities: ['AV System'],
      accessibility: ['Hearing loop'],
      equipmentNeeds: 'Four microphones',
    };
    expect(validateEventUpdate(patch)).toEqual(patch);
  });

  // EVENT-UPDATE-04-A: a required field that is blank or whitespace-only is an error.
  it.each([
    'name',
    'purpose',
    'description',
    'layout',
    'startDateTime',
    'endDateTime',
  ])('EVENT-UPDATE-04-A rejects a blank %s', (field) => {
    expect(errorsOf({ [field]: '   ' })[field]).toBeTruthy();
  });

  // EVENT-UPDATE-04-A: attendance cannot be cleared.
  it.each([null, '', 0])(
    'EVENT-UPDATE-04-A rejects expected attendance %j',
    (value) => {
      expect(
        errorsOf({ expectedAttendance: value }).expectedAttendance,
      ).toBeTruthy();
    },
  );

  // EVENT-UPDATE-04-A: all blank fields are reported in one response.
  it('EVENT-UPDATE-04-A reports every blank field at once', () => {
    expect(Object.keys(errorsOf({ name: '', purpose: ' ' })).sort()).toEqual([
      'name',
      'purpose',
    ]);
  });

  // EVENT-UPDATE-04-A: equipment needs is optional, so blank is allowed.
  it('EVENT-UPDATE-04-A allows blank equipment needs', () => {
    expect(validateEventUpdate({ equipmentNeeds: '' })).toEqual({
      equipmentNeeds: '',
    });
  });

  // EVENT-UPDATE-04-B: nothing to save is an error, not a silent success.
  it.each([{}, null, [], 'text'])(
    'EVENT-UPDATE-04-B rejects an empty or non-object body %j',
    (body) => {
      expect(() => validateEventUpdate(body)).toThrow(BadRequestException);
    },
  );

  // EVENT-UPDATE-04-B: end must be after start when both are supplied.
  it('EVENT-UPDATE-04-B rejects an end equal to or before the start', () => {
    const start = futureIso(10, 10);
    expect(
      errorsOf({ startDateTime: start, endDateTime: start }).endDateTime,
    ).toBeTruthy();
  });

  // EVENT-UPDATE-04-B: malformed and past start times are rejected.
  it('EVENT-UPDATE-04-B rejects a malformed or past start date-time', () => {
    expect(
      errorsOf({ startDateTime: 'not-a-date' }).startDateTime,
    ).toBeTruthy();
    expect(
      errorsOf({ startDateTime: '2020-01-01T10:00:00.000Z' }).startDateTime,
    ).toBeTruthy();
  });

  // EVENT-UPDATE-04-BND-1: text fields accept exactly their max and reject one more.
  it.each([
    ['name', 200],
    ['purpose', 500],
    ['description', 5000],
    ['equipmentNeeds', 2000],
  ] as const)(
    'EVENT-UPDATE-04-BND-1 %s accepts %i characters and rejects one more',
    (field, max) => {
      expect(() =>
        validateEventUpdate({ [field]: 'a'.repeat(max) }),
      ).not.toThrow();
      expect(errorsOf({ [field]: 'a'.repeat(max + 1) })[field]).toBe(
        `Use ${max} characters or fewer.`,
      );
    },
  );

  // EVENT-UPDATE-04-BND-1: attendance edges (1 and the 32-bit max are valid).
  it.each([1, 2147483647])(
    'EVENT-UPDATE-04-BND-1 accepts attendance %i',
    (value) => {
      expect(validateEventUpdate({ expectedAttendance: value })).toEqual({
        expectedAttendance: value,
      });
    },
  );

  it.each([0, -1, 2147483648, 10.5, '10'])(
    'EVENT-UPDATE-04-BND-1 rejects attendance %j',
    (value) => {
      expect(
        errorsOf({ expectedAttendance: value }).expectedAttendance,
      ).toBeTruthy();
    },
  );

  // EVENT-UPDATE-04-SEC-1: the client may never set server-controlled fields.
  it.each([
    'id',
    'status',
    'organiserId',
    'coordinatorId',
    'coordinatorName',
    'venueId',
    'createdAt',
    'updatedAt',
  ])('EVENT-UPDATE-04-SEC-1 rejects server-controlled field %s', (field) => {
    expect(
      errorsOf({ name: 'Valid name', [field]: 'injected' })[field],
    ).toBeTruthy();
  });

  // EVENT-UPDATE-04-SEC-1: unknown keys fail fast rather than being ignored.
  it('EVENT-UPDATE-04-SEC-1 rejects an unknown field', () => {
    expect(errorsOf({ name: 'Valid name', colour: 'red' }).colour).toBeTruthy();
  });
});

describe('classifyUpdate / FIELD_POLICY', () => {
  const REVIEW_FIELDS: EventFieldKey[] = [
    'startDateTime',
    'endDateTime',
    'expectedAttendance',
    'layout',
    'facilities',
    'equipmentNeeds',
  ];
  const DIRECT_FIELDS: EventFieldKey[] = [
    'name',
    'purpose',
    'description',
    'accessibility',
  ];

  const ALWAYS = () => true;
  const NEVER = () => false;

  // EVENT-UPDATE-02-A: every field is labelled as direct or review-if-impacting.
  it('EVENT-UPDATE-02-A labels each editable field with its edit policy', () => {
    for (const field of DIRECT_FIELDS)
      expect(FIELD_POLICY[field]).toBe('direct');
    for (const field of REVIEW_FIELDS)
      expect(FIELD_POLICY[field]).toBe('review_if_impacting');
  });

  // EVENT-FLAG-01-A: these fields need review when the change affects a booking.
  it.each(REVIEW_FIELDS)(
    'EVENT-FLAG-01-A %s needs review when the change affects an arrangement',
    (field) => {
      expect(classifyUpdate([field], ALWAYS)).toEqual({
        immediate: [],
        needsReview: [field],
      });
    },
  );

  // EVENT-UPDATE-05-B: the same fields apply immediately when the change is
  // compatible with every arrangement (or nothing is booked).
  it.each(REVIEW_FIELDS)(
    'EVENT-UPDATE-05-B %s applies immediately when the change affects no arrangement',
    (field) => {
      expect(classifyUpdate([field], NEVER)).toEqual({
        immediate: [field],
        needsReview: [],
      });
    },
  );

  // EVENT-UPDATE-03-A: fields that cannot affect a booking never need review,
  // and the impact check is not even consulted for them.
  it.each(DIRECT_FIELDS)(
    'EVENT-UPDATE-03-A %s is always immediate, even when everything is impacted',
    (field) => {
      const isImpacting = vi.fn(ALWAYS);
      expect(classifyUpdate([field], isImpacting)).toEqual({
        immediate: [field],
        needsReview: [],
      });
      expect(isImpacting).not.toHaveBeenCalled();
    },
  );

  // EVENT-FLAG-01-A: the decision is per field, keeping input order; only
  // the field whose change is impacting is held back.
  it('EVENT-FLAG-01-A holds back only the impacting fields of a mixed update', () => {
    const impacting = new Set<EventFieldKey>(['layout']);
    expect(
      classifyUpdate(
        ['name', 'expectedAttendance', 'layout', 'accessibility'],
        (field) => impacting.has(field),
      ),
    ).toEqual({
      immediate: ['name', 'expectedAttendance', 'accessibility'],
      needsReview: ['layout'],
    });
  });
});
