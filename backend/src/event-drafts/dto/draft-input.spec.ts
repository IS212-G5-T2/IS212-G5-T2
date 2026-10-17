import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { validateDraft } from './draft-input.js';

describe('SPM-37 draft validation', () => {
  // AC2: missing submission fields must not stop saving.
  it('accepts an empty draft and incomplete schedule', () => {
    const result = validateDraft({
      fields: { startDate: '2030-04-01' },
      version: 0,
      operationId: randomUUID(),
    });
    expect(result.fields.name).toBe('');
    expect(result.fields.startDate).toBe('2030-04-01');
    expect(result.fields.startTime).toBe('');
  });
  // AC3: do not trim or coerce the user's draft values.
  it('preserves exact text, zero attendance and selections', () => {
    const result = validateDraft({
      fields: {
        name: '  Work in progress  ',
        expectedAttendance: '0',
        facilities: ['Catering'],
      },
      version: 2,
      operationId: randomUUID(),
    });
    expect(result.fields.name).toBe('  Work in progress  ');
    expect(result.fields.expectedAttendance).toBe('0');
    expect(result.fields.facilities).toEqual(['Catering']);
  });
  // AC6: invalid payloads get a clear client error instead of a database error.
  it.each([
    { name: 45 },
    { name: 'x'.repeat(201) },
    { facilities: ['Unknown'] },
    { attachments: [{ name: 'bad' }] },
  ])('rejects malformed fields %j', (fields) => {
    expect(() =>
      validateDraft({ fields, version: 0, operationId: randomUUID() }),
    ).toThrow();
  });
  // AC4: updates require a valid version and retry identifier.
  it('rejects invalid version and operation identifiers', () => {
    expect(() =>
      validateDraft({ fields: {}, version: -1, operationId: 'invalid' }),
    ).toThrow();
  });
  // Continuity: the wizard step is optional but must be a valid step index.
  it('accepts and preserves a valid form step', () => {
    const result = validateDraft({
      fields: { formStep: 1 },
      version: 0,
      operationId: randomUUID(),
    });
    expect(result.fields.formStep).toBe(1);
  });
  it('omits the form step when the draft does not include one', () => {
    const result = validateDraft({
      fields: {},
      version: 0,
      operationId: randomUUID(),
    });
    expect(result.fields.formStep).toBeUndefined();
  });
  it.each([{ formStep: -1 }, { formStep: 3 }, { formStep: 1.5 }])(
    'rejects an out-of-range form step %j',
    (fields) => {
      expect(() =>
        validateDraft({ fields, version: 0, operationId: randomUUID() }),
      ).toThrow();
    },
  );
});
