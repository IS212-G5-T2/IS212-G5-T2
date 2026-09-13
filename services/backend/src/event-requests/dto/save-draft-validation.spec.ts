import { randomUUID } from 'node:crypto';
import { parseSaveDraft } from './save-draft.dto.js';
describe('SPM-37 draft validation', () => {
  const payload = (fields: unknown) => ({ fields, version: 0, operationId: randomUUID() });
  // A completely empty request is accepted as a draft and missing optional value types remain empty.
  it('AC1/2 accepts an empty draft without filling unknown numbers or dates', () => {
    // Parse an empty draft exactly as the backend would receive it.
    const result = parseSaveDraft(payload({}));
    // Check that missing text stays empty and missing number/choice values stay unknown.
    expect(result.fields.name).toBe('');
    expect(result.fields.startDateTime).toBe('');
    expect(result.fields.expectedAttendance).toBeNull();
    expect(result.fields.registrationEnabled).toBeNull();
  });
  // A caller cannot use draft fields to change protected ownership or status information.
  it.each([{ status: 'submitted' }, { organisationId: 'other' }, { organiserId: 'other' }])('rejects protected field injection %j', fields => {
    // Try each protected field and check that the backend refuses the request.
    expect(() => parseSaveDraft(payload(fields))).toThrow();
  });
  // Invalid field types, impossible attendance values and oversized descriptions are rejected before saving.
  it.each([{ expectedAttendance: -1 }, { expectedAttendance: 1.5 }, { name: {} }, { registrationEnabled: 'yes' }, { description: 'a'.repeat(10001) }])('rejects malformed values %j', fields => {
    // Try each invalid value and check that none can pass backend validation.
    expect(() => parseSaveDraft(payload(fields))).toThrow();
  });
  // Valid answers such as zero attendance, No registration and unfinished text are preserved exactly in a draft.
  it('preserves zero, false, whitespace and incomplete information', () => {
    // Parse valid values that could otherwise be mistaken for missing information.
    expect(parseSaveDraft(payload({ name: '  Workshop  ', expectedAttendance: 0, registrationEnabled: false })).fields)
      .toMatchObject({ name: '  Workshop  ', expectedAttendance: 0, registrationEnabled: false });
  });
  // Saves with an invalid request identifier or revision number are rejected instead of changing stored work.
  it('rejects invalid operations and versions', () => {
    // Check that a negative revision, bad operation ID and protected top-level status are all refused.
    expect(() => parseSaveDraft({ fields: {}, version: -1, operationId: randomUUID() })).toThrow();
    expect(() => parseSaveDraft({ fields: {}, version: 0, operationId: 'bad' })).toThrow();
    expect(() => parseSaveDraft({ ...payload({}), status: 'submitted' })).toThrow();
  });
});
    // Check that the backend preserves those exact draft values.
