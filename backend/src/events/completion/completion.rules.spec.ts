/*
 * SPM-153 pure rules: the end-instant predicate (BR3, COMPLETE-EVENT-01-C) and the completion record boundaries
 * (D7, COMPLETE-EVENT-05-D and 05-E). Literal values come from the test-case document, not from the code.
 */
import { describe, expect, it } from 'vitest';
import { hasEventEnded, validateCompletionRecord } from './completion.rules.js';

const END = new Date('2026-12-10T13:00:00.000Z'); // 21:00 SGT

describe('COMPLETE-EVENT-01-C: hasEventEnded is true from the end instant, inclusive', () => {
  // Traceability: Jira 153 AC1 (matrix 35979372)
  // Kills: M2 (`>` instead of `>=`), M1 (start used instead of end)
  it.each([
    ['2026-12-10T12:59:59.000Z', false],
    ['2026-12-10T13:00:00.000Z', true],
    ['2026-12-10T13:00:01.000Z', true],
  ])('COMPLETE-EVENT-01-C: at %s the result is %s', (now, expected) => {
    expect(hasEventEnded(END, new Date(now))).toBe(expected);
  });
});

describe('COMPLETE-EVENT-05-D/05-E: completion record validation at its boundaries', () => {
  // Traceability: Jira 153 AC5 (matrix 35979372)
  it.each([
    [{ attendanceCount: 0 }, true],
    [{ attendanceCount: 2147483647 }, true],
    [{ attendanceCount: 2147483648 }, false],
    [{ attendanceCount: -1 }, false],
    [{ attendanceCount: 12.5 }, false],
    [{ attendanceCount: 'abc' }, false],
  ])('COMPLETE-EVENT-05-E: attendance %j is accepted: %s', (body, accepted) => {
    expect(validateCompletionRecord(body).ok).toBe(accepted);
  });

  // Traceability: Jira 153 AC5 (matrix 35979372)
  it.each([
    ['a'.repeat(2000), true],
    ['a'.repeat(2001), false],
    ['😀'.repeat(2000), true], // counted in code points, not in code units
  ])('COMPLETE-EVENT-05-E: notes of %s characters are accepted: %s', (notes, accepted) => {
    expect(validateCompletionRecord({ operationalNotes: notes }).ok).toBe(accepted);
  });

  // Traceability: Jira 153 AC5 (matrix 35979372)
  it.each([
    [[{ description: 'a'.repeat(1000) }], true],
    [[{ description: 'a'.repeat(1001) }], false],
    [[{ description: '' }], false],
    [[{ description: '   ' }], false],
    [Array.from({ length: 50 }, () => ({ description: 'x' })), true],
    [Array.from({ length: 51 }, () => ({ description: 'x' })), false],
  ])('COMPLETE-EVENT-05-E: an issue list is accepted: %s', (issues, accepted) => {
    expect(validateCompletionRecord({ issues }).ok).toBe(accepted);
  });

  // Traceability: Jira 153 AC5 (matrix 35979372)
  // Kills: M14 (a subset save must not clear the other items)
  it('COMPLETE-EVENT-05-B: a subset is accepted, and empty notes and an empty list clear their item', () => {
    expect(validateCompletionRecord({ attendanceCount: 118 })).toEqual({ ok: true, value: { attendanceCount: 118 } });
    expect(validateCompletionRecord({ operationalNotes: '   ' })).toEqual({ ok: true, value: { operationalNotes: null } });
    expect(validateCompletionRecord({ issues: [] })).toEqual({ ok: true, value: { issues: [] } });
  });

  // Traceability: Jira 153 AC5 (matrix 35979372)
  it.each([
    [{ operationalNotes: 5 }, 'operationalNotes'],
    [{ issues: ['not an object'] }, 'issues'],
    [{ issues: [{ description: 3 }] }, 'issues'],
  ])('COMPLETE-EVENT-05-D: a value of the wrong type is refused and names its field: %j', (body, field) => {
    expect(validateCompletionRecord(body)).toEqual({ ok: false, field });
  });

  // Traceability: Jira 153 AC5 (matrix 35979372)
  it('COMPLETE-EVENT-05-D: an empty body and an unknown key are refused as the body', () => {
    expect(validateCompletionRecord({})).toEqual({ ok: false, field: 'body' });
    expect(validateCompletionRecord({ attendanceCount: 1, changedBy: 'x' })).toEqual({ ok: false, field: 'body' });
    expect(validateCompletionRecord(null)).toEqual({ ok: false, field: 'body' });
  });

  // Traceability: Jira 153 AC5 (matrix 35979372)
  // COMPLETE-EVENT-05-B (clear): null clears attendance and notes, and the record keeps the other items.
  it('COMPLETE-EVENT-05-B: null clears attendance and notes', () => {
    expect(validateCompletionRecord({ attendanceCount: null, operationalNotes: null })).toEqual({
      ok: true,
      value: { attendanceCount: null, operationalNotes: null },
    });
  });
});
