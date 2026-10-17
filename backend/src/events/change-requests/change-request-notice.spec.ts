/*
 * SPM-64 AC3: the change request notice shared by the request and the Lead's
 * assignment and reassignment. Test IDs: REQ-CHANGE-03-A, 03-C, 03-D.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  changeRequestNoticeMessage,
  insertChangeRequestNotice,
  notifyPendingChangeRequest,
} from './change-request-notice.js';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

function client(pending: unknown[]) {
  const query = vi.fn(async (sql: string) => (sql.startsWith('SELECT') ? { rows: pending } : { rows: [] }));
  return { query };
}

describe('change request notice', () => {
  /** REQ-CHANGE-03-A: the message names the organiser, the event and every field requested. */
  it('REQ-CHANGE-03-A names the requester, event and fields', () => {
    expect(
      changeRequestNoticeMessage('Organiser 1', 'Alumni Night', [
        { field: 'expectedAttendance' },
        { field: 'accessibility' },
      ]),
    ).toBe('Organiser 1 requested a change to "Alumni Night": expected attendance, accessibility needs.');
  });

  /** REQ-CHANGE-03-A: the notice is a coordinator_change_request for the event. */
  it('REQ-CHANGE-03-A inserts a coordinator_change_request notice', async () => {
    const db = client([]);
    await insertChangeRequestNotice(db, 'coord-1', EVENT_ID, 'Message');
    const [sql, params] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("'coordinator_change_request'");
    expect(params.slice(1)).toEqual(['coord-1', 'Message', EVENT_ID]);
  });

  /** REQ-CHANGE-03-C, 03-D: a newly assigned coordinator is told about the pending request. */
  it('REQ-CHANGE-03-D notifies the new coordinator of a pending request', async () => {
    const db = client([{ requested_by: 'Organiser 1', changes: [{ field: 'description' }] }]);
    await expect(notifyPendingChangeRequest(db, EVENT_ID, 'Alumni Night', 'coord-2')).resolves.toBe(true);
    const [select, insert] = db.query.mock.calls as unknown as [string, unknown[]][];
    expect(select[0]).toContain("status = 'Pending'");
    expect(select[1]).toEqual([EVENT_ID]);
    expect(insert[1].slice(1)).toEqual([
      'coord-2',
      'Organiser 1 requested a change to "Alumni Night": description.',
      EVENT_ID,
    ]);
  });

  /** REQ-CHANGE-03-C: without a pending request nothing is sent. */
  it('REQ-CHANGE-03-C sends nothing when no request is pending', async () => {
    const db = client([]);
    await expect(notifyPendingChangeRequest(db, EVENT_ID, 'Alumni Night', 'coord-2')).resolves.toBe(false);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
