/*
 * SPM-153 pure rules. No I/O: the services apply them inside their transactions.
 * BR3: an event has ended when the server clock is at or after its end instant (inclusive).
 * D7: completion record limits. Lengths count code points, so an emoji is one character.
 */
export const MAX_ATTENDANCE = 2147483647;
export const MAX_NOTES_LENGTH = 2000;
export const MAX_ISSUES = 50;
export const MAX_ISSUE_LENGTH = 1000;

export function hasEventEnded(endDateTime: Date, now: Date): boolean {
  return now.getTime() >= endDateTime.getTime();
}

export interface CompletionRecordInput {
  /** Omitted fields keep their saved value; `null` (or '' for notes, [] for issues) clears it. */
  attendanceCount?: number | null;
  operationalNotes?: string | null;
  issues?: string[];
}

export type CompletionRecordResult =
  | { ok: true; value: CompletionRecordInput }
  | { ok: false; field: 'attendanceCount' | 'operationalNotes' | 'issues' | 'body' };

const RECORD_KEYS = ['attendanceCount', 'operationalNotes', 'issues'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function codePointLength(value: string): number {
  return [...value].length;
}

/** Validates a completion-record body at its boundaries (D7). Unknown keys and an empty body are refused. */
export function validateCompletionRecord(body: unknown): CompletionRecordResult {
  if (!isPlainObject(body)) return { ok: false, field: 'body' };
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !(RECORD_KEYS as readonly string[]).includes(key)))
    return { ok: false, field: 'body' };

  const value: CompletionRecordInput = {};

  if ('attendanceCount' in body) {
    const attendance = body.attendanceCount;
    if (attendance !== null && (typeof attendance !== 'number' || !Number.isInteger(attendance) || attendance < 0 || attendance > MAX_ATTENDANCE))
      return { ok: false, field: 'attendanceCount' };
    value.attendanceCount = attendance;
  }

  if ('operationalNotes' in body) {
    const notes = body.operationalNotes;
    if (notes !== null && typeof notes !== 'string') return { ok: false, field: 'operationalNotes' };
    const trimmed = notes === null ? '' : notes.trim();
    if (codePointLength(trimmed) > MAX_NOTES_LENGTH) return { ok: false, field: 'operationalNotes' };
    value.operationalNotes = trimmed === '' ? null : trimmed;
  }

  if ('issues' in body) {
    const issues = body.issues;
    if (!Array.isArray(issues) || issues.length > MAX_ISSUES) return { ok: false, field: 'issues' };
    const descriptions: string[] = [];
    for (const issue of issues) {
      if (!isPlainObject(issue) || typeof issue.description !== 'string') return { ok: false, field: 'issues' };
      const description = issue.description.trim();
      const length = codePointLength(description);
      if (length < 1 || length > MAX_ISSUE_LENGTH) return { ok: false, field: 'issues' };
      descriptions.push(description);
    }
    value.issues = descriptions;
  }

  return { ok: true, value };
}
