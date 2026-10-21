import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateDraft } from './draft-input.js';
import { ACCESSIBILITY, FACILITIES, LAYOUTS } from '../../events/dto/event-input.js';

const payload = (fields: unknown = {}) => ({
  fields,
  version: 0,
  operationId: '00000000-0000-4000-8000-0000000000b1',
});
function rejects(body: unknown, field?: string) {
  try {
    validateDraft(body);
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    if (field)
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errors: { [field]: expect.any(String) },
      });
  }
}
const attachment = {
  id: 'file',
  name: 'note.txt',
  type: 'text/plain',
  size: 2,
  dataUrl: 'data:text/plain;base64,aGk=',
};

describe('SPM-37 Q1 boundary and partition cases', () => {
  it.each([null, undefined, [], 'draft', 0, true])(
    'EVE-DRF-SUP-16 rejects malformed envelope %j',
    (body) => rejects(body),
  );
  it.each([null, undefined, [], 'fields', 1])(
    'EVE-DRF-SUP-17 rejects malformed fields %j',
    (fields) => rejects({ ...payload(), fields }),
  );
  it.each([-1, 0.5, '0', null, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])(
    'EVE-DRF-SUP-18 rejects invalid version %j',
    (version) => rejects({ ...payload(), version }),
  );
  it.each([0, 1, Number.MAX_SAFE_INTEGER])(
    'EVE-DRF-SUP-19 accepts nonnegative safe version %s',
    (version) =>
      expect(validateDraft({ ...payload(), version }).version).toBe(version),
  );
  it.each([
    undefined,
    2,
    '',
    'not-uuid',
    '00000000-0000-1000-8000-000000000037',
  ])('EVE-DRF-SUP-20 rejects invalid operation ID %j', (operationId) =>
    rejects({ ...payload(), operationId }),
  );
  /** EVE-DRF-01-B: draft values (empty, whitespace, zero, incomplete) persist unchanged (Q1-006). */
  it('Q1-006 preserves empty, whitespace, zero and incomplete draft values', () => {
    const fields = {
      name: '  ',
      expectedAttendance: '0',
      startDate: 'incomplete',
      startTime: '',
      purpose: null,
    };
    expect(validateDraft(payload(fields)).fields).toMatchObject({
      ...fields,
      purpose: '',
    });
  });
  const textLimits = {
    name: 200,
    purpose: 500,
    description: 5000,
    startDate: 10,
    startTime: 8,
    endDate: 10,
    endTime: 8,
    expectedAttendance: 20,
    equipmentNeeds: 2000,
  };
  for (const [field, limit] of Object.entries(textLimits)) {
    /** EVE-DRF-11-A: text fields accept values up to their limit (Q1-007). */
    it.each([0, 1, limit - 1, limit])(
      `Q1-007 ${field} accepts length %s`,
      (length) => {
        expect(
          validateDraft(payload({ [field]: 'x'.repeat(length) })).fields,
        ).toHaveProperty(field, 'x'.repeat(length));
      },
    );
    /** EVE-DRF-11-A: text fields reject one character over the limit (Q1-008). */
    it(`Q1-008 ${field} rejects length ${limit + 1}`, () =>
      rejects(payload({ [field]: 'x'.repeat(limit + 1) }), field));
    /** EVE-DRF-11-A: text fields reject non-string values (Q1-009). */
    it.each([1, [], {}, true])(`Q1-009 ${field} rejects non-text %j`, (value) =>
      rejects(payload({ [field]: value }), field),
    );
  }
  /** EVE-DRF-11-C: wizard formStep accepts integers 0 to 2 or omission (Q1-010). */
  it.each([undefined, 0, 1, 2])('Q1-010 accepts wizard step %j', (formStep) => {
    const result = validateDraft(payload({ formStep })).fields;
    if (formStep === undefined) expect(result).not.toHaveProperty('formStep');
    else expect(result.formStep).toBe(formStep);
  });
  /** EVE-DRF-11-C: wizard formStep rejects other values (Q1-011). */
  it.each([-1, 3, 1.5, '1', null])(
    'Q1-011 rejects wizard step %j',
    (formStep) => rejects(payload({ formStep }), 'formStep'),
  );
  /** EVE-DRF-11-B: layout accepts supported values (Q1-012). */
  it.each(['', ...LAYOUTS])('Q1-012 accepts supported layout %j', (layout) =>
    expect(validateDraft(payload({ layout })).fields.layout).toBe(layout),
  );
  /** EVE-DRF-11-B: layout rejects unknown or over-length values (Q1-013). */
  it.each(['Unknown', 'x'.repeat(39), 'x'.repeat(40), 'x'.repeat(41), 1])(
    'Q1-013 rejects unsupported layout %j',
    (layout) => rejects(payload({ layout }), 'layout'),
  );
  for (const [field, allowed] of Object.entries({
    facilities: FACILITIES,
    accessibility: ACCESSIBILITY,
  })) {
    /** EVE-DRF-11-B: facilities and accessibility accept allowed values and de-duplicate (Q1-014). */
    it(`Q1-014 ${field} accepts none, all and deduplicates`, () => {
      for (const values of [[], allowed.slice(0, -1), allowed])
        expect(
          validateDraft(payload({ [field]: values })).fields,
        ).toHaveProperty(field, values);
      expect(
        validateDraft(payload({ [field]: [allowed[0], allowed[0]] })).fields,
      ).toHaveProperty(field, [allowed[0]]);
    });
    /** EVE-DRF-11-B: unknown facilities or accessibility choices are rejected (Q1-015). */
    it.each(['not-array', ['Unknown'], [...allowed, allowed[0]]])(
      `Q1-015 ${field} rejects unsupported choices %j`,
      (value) => rejects(payload({ [field]: value }), field),
    );
  }
  /** EVE-DRF-11-D: attachment count up to five is accepted (Q1-016). */
  it.each([0, 1, 4, 5])('Q1-016 accepts attachment count %s', (count) => {
    const attachments = Array.from({ length: count }, (_, i) => ({
      ...attachment,
      id: String(i),
    }));
    expect(validateDraft(payload({ attachments })).fields.attachments).toEqual(
      attachments,
    );
  });
  /** EVE-DRF-11-D: more than five attachments or a malformed list are rejected (Q1-017). */
  it.each(['invalid', Array(6).fill(attachment)])(
    'Q1-017 rejects attachment container %j',
    (attachments) => rejects(payload({ attachments }), 'attachments'),
  );
  /** EVE-DRF-11-D: attachment size boundaries are enforced (Q1-018/Q1-019). */
  it.each([0, 1, 1048576, 52428800])(
    'Q1-018 accepts attachment byte size %s',
    (size) =>
      expect(
        validateDraft(payload({ attachments: [{ ...attachment, size }] }))
          .fields.attachments[0].size,
      ).toBe(size),
  );
  /** EVE-DRF-11-D: non-integer or string attachment sizes are rejected (Q1-019). */
  it.each([-1, 0.5, '2'])(
    'Q1-019 rejects attachment byte size %j',
    (size) =>
      rejects(
        payload({ attachments: [{ ...attachment, size }] }),
        'attachments',
      ),
  );
  /** EVE-DRF-10-B: an attachment data URL beyond the old 1.4 MB cap is accepted (Q1-020b). */
  it('Q1-020b accepts a large data URL beyond the old 1.4MB cap', () => {
    const dataUrl = 'data:text/plain;base64,' + 'a'.repeat(2_000_000);
    expect(
      validateDraft(payload({ attachments: [{ ...attachment, dataUrl }] }))
        .fields.attachments[0],
    ).toHaveProperty('dataUrl', dataUrl);
  });
  for (const [field, limit] of Object.entries({
    id: 100,
    name: 255,
    type: 100,
  })) {
    /** EVE-DRF-11-D: attachment field lengths accept the limit (Q1-021). */
    it.each([limit - 1, limit])(
      `Q1-020 attachment ${field} accepts length %s`,
      (length) => {
        const value =
          field === 'dataUrl'
            ? 'data:' + 'x'.repeat(length - 5)
            : 'x'.repeat(length);
        expect(
          validateDraft(
            payload({ attachments: [{ ...attachment, [field]: value }] }),
          ).fields.attachments[0],
        ).toHaveProperty(field, value);
      },
    );
    /** EVE-DRF-11-D: attachment field lengths and types reject over-limit values (Q1-021). */
    it(`Q1-021 attachment ${field} rejects over-limit and wrong type`, () => {
      for (const value of [
        4,
        field === 'dataUrl'
          ? 'data:' + 'x'.repeat(limit - 4)
          : 'x'.repeat(limit + 1),
      ])
        rejects(
          payload({ attachments: [{ ...attachment, [field]: value }] }),
          'attachments',
        );
    });
  }
  /** EVE-DRF-11-D: attachment shape rejects non-objects and non-data URLs (Q1-022). */
  it.each([null, 'file', { ...attachment, dataUrl: 'https://example.test' }])(
    'Q1-022 rejects malformed attachment %j',
    (value) => rejects(payload({ attachments: [value] }), 'attachments'),
  );
});
