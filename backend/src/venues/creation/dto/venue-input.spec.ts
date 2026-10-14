import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
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

  // SPM-50 business rule: accessibility is optional, while supplied selections remain validated.
  it.each([undefined, []])('accepts accessibility=%j', (accessibility) => {
    const input = { ...valid(), accessibility };
    if (accessibility === undefined) delete input.accessibility;

    expect(validateVenue(input).accessibility).toEqual([]);
  });

  // SPM-50 / VEN-CRE-03-A: each required field independently prevents creation.
  it.each(venueFields)('rejects a missing %s', (field) => {
    // Arrange a complete fixture, then remove one field.
    const input: Record<string, unknown> = valid();
    delete input[field];
    // Act and assert the field-specific error.
    expect(fieldError(input).errors[field]).toBeTruthy();
  });

  /** SPM-50 / AC3: operating information remains a required free-text venue field. */
  it('rejects missing operating information independently of venueFields', () => {
    const input = { ...valid() };
    delete input.operatingInformation;

    expect(fieldError(input).errors.operatingInformation).toBeTruthy();
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

  /** SPM-50 correction: null and partial legacy schedule payloads are ignored; operating information remains required. */
  it.each([
    [
      'complete schedule',
      {
        operatingDays: ['Monday'],
        operatingStartTime: '09:00',
        operatingEndTime: '18:00',
      },
    ],
    [
      'null schedule values',
      { operatingDays: null, operatingStartTime: null, operatingEndTime: null },
    ],
    ['days only', { operatingDays: ['Monday'] }],
    ['start only', { operatingStartTime: '09:00' }],
    ['end only', { operatingEndTime: '18:00' }],
    [
      'days and start only',
      { operatingDays: ['Monday'], operatingStartTime: '09:00' },
    ],
  ])(
    'silently discards legacy schedule properties from older clients (%s)',
    (_label, legacyFields) => {
      const venue = validateVenue({
        ...valid(),
        ...legacyFields,
      });
      expect(venue.operatingInformation).toBe(valid().operatingInformation);
      expect(venue).not.toHaveProperty('operatingDays');
      expect(venue).not.toHaveProperty('operatingStartTime');
      expect(venue).not.toHaveProperty('operatingEndTime');
    },
  );

  /** SPM-50 regression: executing the full fresh-init SQL leaves no retired columns on venues. */
  it.skipIf(!process.env.DATABASE_URL)(
    'keeps retired schedule columns out of the effective fresh venue schema',
    async () => {
      const initDirectory =
        process.env.SPM51_DATABASE_INIT_DIR ??
        resolve('../database/postgresql/init');
      const schemaSql = await readFile(
        resolve(initDirectory, '001_schema.sql'),
        'utf8',
      );
      const schemaName = `spm50_fresh_${randomUUID().replaceAll('-', '')}`;
      const client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
      });

      await client.connect();
      try {
        await client.query('BEGIN');
        await client.query(`CREATE SCHEMA "${schemaName}"`);
        await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
        await client.query(schemaSql);

        const columns = await client.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'venues'`,
          [schemaName],
        );
        const columnNames = columns.rows.map(({ column_name }) => column_name);
        expect(columnNames).toContain('operating_information');
        expect(columnNames).not.toContain('operating_days');
        expect(columnNames).not.toContain('operating_start_time');
        expect(columnNames).not.toContain('operating_end_time');
      } finally {
        await client.query('ROLLBACK');
        await client.end();
      }
    },
  );

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
  ] as const)(
    'rejects invalid turnaround duration %s=%s',
    (field, duration) => {
      expect(
        fieldError({ ...valid(), [field]: duration }).errors[field],
      ).toBeTruthy();
    },
  );

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

  // SPM-50 image follow-up: valid optional image bytes, including both Base64 padding forms, retain their metadata.
  it.each([
    {
      name: 'orchid-hall.png',
      type: 'image/png',
      size: 4,
      dataUrl: 'data:image/png;base64,dGVzdA==',
    },
    {
      name: 'two-bytes.png',
      type: 'image/png',
      size: 2,
      dataUrl: 'data:image/png;base64,YWE=',
    },
    {
      name: 'three-bytes.png',
      type: 'image/png',
      size: 3,
      dataUrl: 'data:image/png;base64,YWJj',
    },
  ])('accepts a valid optional image %#', (image) => {
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
    'not-an-image-object',
    [],
    { name: 12, type: false, size: 4, dataUrl: null },
  ])('rejects an invalid optional image %#', (image) => {
    expect(fieldError({ ...valid(), image }).errors.image).toBeTruthy();
  });
});
