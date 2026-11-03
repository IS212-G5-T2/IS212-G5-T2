/*
 * SPM-162 Event Cancellation Request Outcome (Organiser): the notice writer in isolation. The database client is a
 * fixture that records the statement, so these cases show who the notice is for, its type, wording and timestamp;
 * test/cancellation-request-outcome.e2e-spec.ts runs the same rules over HTTP against PostgreSQL.
 * Cases: CANCEL-OUTCOME-01-C, 02-A, 02-B, 02-C, 02-BND-1.
 * Messages are literal copies of the Jira AC2 wording; this file never imports the message module.
 */
import { describe, expect, it, vi } from 'vitest';
import { notifyCancellationOutcome, notifyCancellationRequested, notifyPendingCancellationRequest } from './cancellation-request-notice.js';

const EVENT = '11111111-1111-4111-8111-111111111301';
const DECIDED_AT = new Date('2026-11-02T08:30:00.000Z');
const event = { id: EVENT, event_name: 'Annual Gala Dinner', organiser_id: 'org-01' };

/** A client that records the one statement the writer sends. */
function recorder() {
  const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
  return { client: { query }, query };
}

/** The columns the writer sends, in the order of its INSERT: [id, recipient, type, message, event, created_at]. */
function written(query: ReturnType<typeof recorder>['query']) {
  const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
  return { sql, params };
}

describe('SPM-162 request-outcome notice writer', () => {
  /**
   * CANCEL-OUTCOME-01-C (SPM-162 AC1): one notice row is written, addressed to the event's Organiser, typed for the
   * outcome and linked to the event.
   * Kills: no row, two rows, the notice addressed to someone else, the wrong type for an outcome, a missing event link.
   */
  it.each([
    ['accepted', 'cancellation_request_accepted'],
    ['declined', 'cancellation_request_declined'],
  ] as const)('CANCEL-OUTCOME-01-C a %s outcome writes one notice for the Organiser typed %s', async (outcome, type) => {
    // Arrange
    const { client, query } = recorder();

    // Act
    await notifyCancellationOutcome(client, event, outcome, DECIDED_AT);

    // Assert: exactly one INSERT into notifications, for org-01, with the type and the event link
    expect(query).toHaveBeenCalledTimes(1);
    const { sql, params } = written(query);
    expect(sql).toContain('INSERT INTO notifications');
    expect([params[1], params[2], params[4]]).toEqual(['org-01', type, EVENT]);
    expect(params[0]).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
  });

  /**
   * CANCEL-OUTCOME-02-A (SPM-162 AC2): the accepted notice reads exactly as the Jira wording.
   * Kills: changed wording, the event name left out or unquoted.
   */
  it('CANCEL-OUTCOME-02-A the accepted notice reads: Your cancellation request for "<event name>" was accepted. The event is cancelled.', async () => {
    const { client, query } = recorder();

    await notifyCancellationOutcome(client, event, 'accepted', DECIDED_AT);

    expect(written(query).params[3]).toBe('Your cancellation request for "Annual Gala Dinner" was accepted. The event is cancelled.');
  });

  /**
   * CANCEL-OUTCOME-02-B (SPM-162 AC2): the declined notice reads exactly as the Jira wording and gives no reason.
   * Kills: changed wording, a decline reason appended, the accepted text used for a decline.
   */
  it('CANCEL-OUTCOME-02-B the declined notice reads: Your cancellation request for "<event name>" was declined. The event keeps its current status.', async () => {
    const { client, query } = recorder();

    await notifyCancellationOutcome(client, event, 'declined', DECIDED_AT);

    expect(written(query).params[3]).toBe('Your cancellation request for "Annual Gala Dinner" was declined. The event keeps its current status.');
  });

  /**
   * CANCEL-OUTCOME-02-C (SPM-162 AC2): the notice is stamped with the decision instant the caller passes, not the
   * database clock.
   * Kills: a SQL now() or a new Date() in place of the passed decision time.
   */
  it('CANCEL-OUTCOME-02-C the notice timestamp is the decision time passed in', async () => {
    const { client, query } = recorder();

    await notifyCancellationOutcome(client, event, 'declined', DECIDED_AT);

    const { sql, params } = written(query);
    expect(params[5]).toBe(DECIDED_AT);
    expect(sql).not.toMatch(/now\(\)/i);
  });

  /**
   * CANCEL-OUTCOME-02-BND-1 (SPM-162 AC2, boundary): an event name with quotes, an apostrophe and non-ASCII text is
   * carried verbatim and sent as a parameter, never spliced into the SQL.
   * Kills: escaping, truncating or interpolating the event name.
   */
  it('CANCEL-OUTCOME-02-BND-1 an event name with quotes and non-ASCII text is carried verbatim as a parameter', async () => {
    const { client, query } = recorder();
    const name = `Founders' "Night" 2026 – Café'); DROP TABLE notifications;--`;

    await notifyCancellationOutcome(client, { ...event, event_name: name }, 'accepted', DECIDED_AT);

    const { sql, params } = written(query);
    expect(params[3]).toBe(`Your cancellation request for "${name}" was accepted. The event is cancelled.`);
    expect(sql).not.toContain('DROP TABLE');
  });
});

/*
 * SPM-171 Event Cancellation Request Notification (Coordinator): the notice writer for the Coordinator, and the
 * helper that hands a still-pending request to a Coordinator assigned later. Literal copies of the Jira AC2 wording.
 * Cases: CANCEL-REQ-NOTIF-01-B, 02-B, 02-C, 02-BND-1, 06-B, 06-C.
 */
describe('SPM-171 request notice writer for the Coordinator', () => {
  const SUBMITTED_AT = new Date('2026-11-03T03:15:00.000Z');

  /**
   * CANCEL-REQ-NOTIF-01-B (SPM-171 AC1): one row, addressed to the Coordinator passed in, typed for a submitted request
   * and linked to the event.
   * Kills: no row, two rows, the notice addressed to the Organiser, the wrong type, a missing event link.
   */
  it('CANCEL-REQ-NOTIF-01-B writes one cancellation_request_submitted notice for the given Coordinator', async () => {
    const { client, query } = recorder();

    await notifyCancellationRequested(client, 'coo-01', EVENT, 'Annual Gala Dinner', 'Farid Rahman', SUBMITTED_AT);

    expect(query).toHaveBeenCalledTimes(1);
    const { sql, params } = written(query);
    expect(sql).toContain('INSERT INTO notifications');
    expect([params[1], params[2], params[4]]).toEqual(['coo-01', 'cancellation_request_submitted', EVENT]);
    expect(params[0]).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
  });

  /**
   * CANCEL-REQ-NOTIF-02-B (SPM-171 AC2): the notice reads exactly <organiser name> requested to cancel "<event name>".
   * Kills: changed wording, the event name unquoted, the final full stop dropped, the names swapped.
   */
  it('CANCEL-REQ-NOTIF-02-B the notice reads: <organiser name> requested to cancel "<event name>".', async () => {
    const { client, query } = recorder();

    await notifyCancellationRequested(client, 'coo-01', EVENT, 'Annual Gala Dinner', 'Farid Rahman', SUBMITTED_AT);

    expect(written(query).params[3]).toBe('Farid Rahman requested to cancel "Annual Gala Dinner".');
  });

  /**
   * CANCEL-REQ-NOTIF-02-C (SPM-171 AC2): the notice is stamped with the submission instant passed in, not the database clock.
   * Kills: a SQL now() or a new Date() in place of the passed time.
   */
  it('CANCEL-REQ-NOTIF-02-C the notice timestamp is the submission time passed in', async () => {
    const { client, query } = recorder();

    await notifyCancellationRequested(client, 'coo-01', EVENT, 'Annual Gala Dinner', 'Farid Rahman', SUBMITTED_AT);

    const { sql, params } = written(query);
    expect(params[5]).toBe(SUBMITTED_AT);
    expect(sql).not.toMatch(/now\(\)/i);
  });

  /**
   * CANCEL-REQ-NOTIF-02-BND-1 (SPM-171 AC2, boundary): names with quotes, an apostrophe and non-ASCII text are carried
   * verbatim and sent as parameters, never spliced into the SQL.
   * Kills: escaping, truncating or interpolating either name.
   */
  it('CANCEL-REQ-NOTIF-02-BND-1 names with quotes and non-ASCII text are carried verbatim as parameters', async () => {
    const { client, query } = recorder();
    const name = `Founders' "Night" 2026 – Café'); DROP TABLE notifications;--`;

    await notifyCancellationRequested(client, 'coo-01', EVENT, name, `Zoë "Z" O'Neil`, SUBMITTED_AT);

    const { sql, params } = written(query);
    expect(params[3]).toBe(`Zoë "Z" O'Neil requested to cancel "${name}".`);
    expect(sql).not.toContain('DROP TABLE');
  });

  /**
   * CANCEL-REQ-NOTIF-06-B (SPM-171 AC6): with a pending request the helper looks it up by event, then writes one notice
   * for the Coordinator using the requester's name and the original submission time, and reports true.
   * Kills: no notice on assignment, the assignment time used, a lookup that ignores the pending status, the wrong recipient.
   */
  it('CANCEL-REQ-NOTIF-06-B a pending request is handed to the newly assigned Coordinator with its submission time', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ requested_by: 'Farid Rahman', requested_at: SUBMITTED_AT }] })
      .mockResolvedValueOnce({ rows: [] });

    const sent = await notifyPendingCancellationRequest({ query }, EVENT, 'Annual Gala Dinner', 'coo-02');

    expect(sent).toBe(true);
    const [lookupSql, lookupParams] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(lookupSql).toMatch(/FROM event_cancellation_requests/);
    expect(lookupSql).toMatch(/status = 'pending'/);
    expect(lookupParams).toEqual([EVENT]);
    const [, params] = query.mock.calls[1] as unknown as [string, unknown[]];
    expect(params.slice(1)).toEqual(['coo-02', 'cancellation_request_submitted', 'Farid Rahman requested to cancel "Annual Gala Dinner".', EVENT, SUBMITTED_AT]);
  });

  /**
   * CANCEL-REQ-NOTIF-06-C (SPM-171 AC6): with no pending request the helper writes nothing and reports false.
   * Kills: a notice for a decided or absent request.
   */
  it('CANCEL-REQ-NOTIF-06-C no pending request writes nothing', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });

    const sent = await notifyPendingCancellationRequest({ query }, EVENT, 'Annual Gala Dinner', 'coo-02');

    expect(sent).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
