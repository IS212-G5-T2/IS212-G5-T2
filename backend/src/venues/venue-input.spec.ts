import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateVenue, venueFields } from './venue-input.js';

const valid = () => ({
  name: 'Orchid Hall Test',
  location: 'Test Building Level 3',
  capacity: 120,
  facilities: ['AV System', 'Wi-Fi'],
  accessibility: ['Wheelchair access'],
  layouts: ['Classroom', 'Theatre'],
  operatingInformation: 'Closed on public holidays',
  operatingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  operatingStartTime: '08:00',
  operatingEndTime: '22:00',
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
});

function fieldError(body: unknown) {
  try {
    validateVenue(body);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
      errors: Record<string, string>;
    };
  }
  throw new Error('Expected validation to fail');
}

describe('SPM-50 venue input', () => {
  // SPM-50 / VEN-CRE-02-A: preserve each submitted field, while trimming user-entered text.
  it('accepts and normalizes a complete venue', () => {
    // Arrange a valid venue with surrounding whitespace.
    const input = {
      ...valid(),
      name: ' Orchid Hall Test ',
      facilities: [' AV System '],
    };
    // Act by validating the venue.
    const venue = validateVenue(input);
    // Assert the exact persisted representation.
    expect(venue).toEqual({
      ...valid(),
      facilities: ['AV System'],
      name: 'Orchid Hall Test',
    });
  });

  // SPM-50 UUID contract: clients cannot provide or override the generated venue identifier.
  it('discards a client-supplied identifier from the validated creation input', () => {
    const venue = validateVenue({
      ...valid(),
      id: '00000000-0000-4000-8000-000000000001',
    });

    expect(venue).not.toHaveProperty('id');
  });

  // SPM-50 / VEN-CRE-03-A: each required field independently prevents creation.
  it.each(venueFields)('rejects a missing %s', (field) => {
    // Arrange a complete fixture, then remove one field.
    const input: Record<string, unknown> = valid();
    delete input[field];
    // Act and assert the field-specific error.
    expect(fieldError(input).errors[field]).toBeTruthy();
  });

  // SPM-50 / VEN-CRE-03-B: combined omissions report every affected field.
  it('reports multiple missing fields and a non-object payload', () => {
    // Arrange two missing values.
    const input = { ...valid(), name: '', location: '  ' };
    // Act and assert both errors and a fully absent body.
    expect(Object.keys(fieldError(input).errors)).toEqual(['name', 'location']);
    expect(Object.keys(fieldError(null).errors).sort()).toEqual(
      [...venueFields].sort(),
    );
  });

  // SPM-50 venue model: each venue stores one scalar location rather than a collection of locations.
  it('rejects multiple locations supplied as an array', () => {
    expect(
      fieldError({ ...valid(), location: ['Building A', 'Building B'] }).errors
        .location,
    ).toBeTruthy();
  });

  // SPM-50 / AC3 regression: just below, at, and above capacity limits.
  it.each([0, -1, 1_000_001, 1.5, Number.NaN, '120'])(
    'rejects capacity %s',
    (capacity) => {
      // Arrange the boundary value and assert validation blocks it.
      expect(fieldError({ ...valid(), capacity }).errors.capacity).toBeTruthy();
    },
  );

  // SPM-50 / AC3 regression: the two exact capacity boundaries are valid.
  it.each([1, 1_000_000])('accepts capacity %s', (capacity) => {
    // Arrange and act on a valid boundary.
    expect(validateVenue({ ...valid(), capacity }).capacity).toBe(capacity);
  });

  // SPM-50 / VEN-CRE-02-A: selected days and a same-day time range form one operating schedule.
  it('accepts a valid structured operating schedule', () => {
    const venue = validateVenue(valid());

    expect(venue).toMatchObject({
      operatingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      operatingStartTime: '08:00',
      operatingEndTime: '22:00',
    });
  });

  // SPM-50 / AC2 boundary: the first and last minute values are valid when ordered.
  it.each([
    ['00:00', '00:01'],
    ['23:58', '23:59'],
  ])('accepts operating hours from %s to %s', (operatingStartTime, operatingEndTime) => {
    expect(
      validateVenue({ ...valid(), operatingStartTime, operatingEndTime }),
    ).toMatchObject({ operatingStartTime, operatingEndTime });
  });

  // SPM-50 / VEN-CRE-03-A: schedules reject malformed values, duplicate days, and non-increasing ranges.
  it.each([
    [{ operatingDays: [] }, 'operatingDays'],
    [{ operatingDays: ['Funday'] }, 'operatingDays'],
    [{ operatingDays: ['Monday', 'Monday'] }, 'operatingDays'],
    [{ operatingStartTime: '8:00' }, 'operatingStartTime'],
    [{ operatingStartTime: '24:00' }, 'operatingStartTime'],
    [{ operatingEndTime: '08:60' }, 'operatingEndTime'],
    [{ operatingEndTime: '08:00' }, 'operatingEndTime'],
    [{ operatingStartTime: '23:59', operatingEndTime: '00:00' }, 'operatingEndTime'],
  ] as const)('rejects invalid operating schedule %#', (schedule, field) => {
    expect(fieldError({ ...valid(), ...schedule }).errors[field]).toBeTruthy();
  });

  // SPM-50 / VEN-CRE-06-B, VEN-CRE-06-D: negative or malformed setup durations are rejected.
  it.each([
    ['setupTimeMinutes', -1],
    ['setupTimeMinutes', 1.5],
    ['setupTimeMinutes', '30'],
    ['setupTimeMinutes', 2_147_483_648],
  ] as const)('rejects invalid setup duration %s=%s', (field, duration) => {
    expect(
      fieldError({ ...valid(), [field]: duration }).errors[field],
    ).toBeTruthy();
  });

  // SPM-50 / VEN-CRE-06-C, VEN-CRE-06-E: negative or malformed turnaround durations are rejected.
  it.each([
    ['turnaroundTimeMinutes', -1],
    ['turnaroundTimeMinutes', Number.NaN],
    ['turnaroundTimeMinutes', '45'],
    ['turnaroundTimeMinutes', 2_147_483_648],
  ] as const)('rejects invalid turnaround duration %s=%s', (field, duration) => {
    expect(
      fieldError({ ...valid(), [field]: duration }).errors[field],
    ).toBeTruthy();
  });

  // SPM-50 / VEN-CRE-06-A: zero and positive whole-minute durations are configurable values.
  it.each([0, 1, 180])('accepts duration %s minutes', (duration) => {
    expect(
      validateVenue({
        ...valid(),
        setupTimeMinutes: duration,
        turnaroundTimeMinutes: duration,
      }),
    ).toMatchObject({
      setupTimeMinutes: duration,
      turnaroundTimeMinutes: duration,
    });
  });

  // SPM-50 / AC3 regression: oversized text and malformed lists must not reach SQL.
  it('rejects long text and malformed arrays', () => {
    // Arrange independently invalid values and assert each field error.
    expect(
      fieldError({ ...valid(), name: 'x'.repeat(201) }).errors.name,
    ).toBeTruthy();
    expect(
      fieldError({ ...valid(), facilities: [''] }).errors.facilities,
    ).toBeTruthy();
    expect(
      fieldError({ ...valid(), facilities: ['x'.repeat(101)] }).errors
        .facilities,
    ).toBeTruthy();
    expect(
      fieldError({ ...valid(), facilities: Array(21).fill('x') }).errors
        .facilities,
    ).toBeTruthy();
    expect(
      fieldError({ ...valid(), accessibility: ['Unknown feature'] }).errors
        .accessibility,
    ).toBeTruthy();
  });

  // SPM-50 normalized options: unknown facilities and layouts cannot bypass lookup-table relationships.
  it('rejects unsupported facility and room-layout names', () => {
    expect(
      fieldError({ ...valid(), facilities: ['Swimming pool'] }).errors
        .facilities,
    ).toBeTruthy();
    expect(
      fieldError({ ...valid(), layouts: ['Mystery layout'] }).errors.layouts,
    ).toBeTruthy();
  });

  // SPM-50 image follow-up: one valid optional venue image preserves its upload metadata and data URL.
  it('accepts a valid optional image', () => {
    const image = {
      name: 'orchid-hall.png',
      type: 'image/png',
      size: 4,
      dataUrl: 'data:image/png;base64,dGVzdA==',
    };

    expect(validateVenue({ ...valid(), image })).toMatchObject({ image });
  });

  // SPM-50 image follow-up: invalid MIME, size, and content metadata are rejected before persistence.
  it.each([
    {
      name: 'notes.txt',
      type: 'text/plain',
      size: 4,
      dataUrl: 'data:text/plain;base64,dGVzdA==',
    },
    {
      name: 'large.png',
      type: 'image/png',
      size: 5 * 1024 * 1024 + 1,
      dataUrl: 'data:image/png;base64,dGVzdA==',
    },
    {
      name: 'empty.png',
      type: 'image/png',
      size: 0,
      dataUrl: 'data:image/png;base64,',
    },
    {
      name: 'mismatch.png',
      type: 'image/png',
      size: 3,
      dataUrl: 'data:image/png;base64,dGVzdA==',
    },
    {
      name: 'wrong-type.png',
      type: 'image/jpeg',
      size: 4,
      dataUrl: 'data:image/png;base64,dGVzdA==',
    },
  ])('rejects an invalid optional image %#', (image) => {
    expect(fieldError({ ...valid(), image }).errors.image).toBeTruthy();
  });
});
