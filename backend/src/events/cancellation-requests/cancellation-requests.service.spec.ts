/*
 * SPM-155 Request Cancellation of My Event (Organiser): CancellationRequestsService with only the database
 * boundary and the SPM-136 core faked. These tests pin the order of checks and the writes that a refusal must not
 * make; the HTTP and PostgreSQL behaviour (locks, uniqueness, rollback) is in test/cancellation-requests.e2e-spec.ts.
 *
 * Story: SPM-155. ACs: AC1 to AC5. Test cases: CANCEL-REQUEST-01-A to 05-D (document: docs/specs/SPM-155-test-cases.md).
 * Oracle tiers: SPEC = test-case document; DERIVED = Gate-1 decisions D2 to D13 (check order D7, eligible set D5,
 * closed event D4); ASSUMED = wording of the new codes and messages.
 * Statuses the real `events` table cannot hold (Under Review, Draft) are exercised here, because only a faked row
 * can carry them; the e2e file covers every status the table allows.
 * Messages and codes are literal copies; this file never imports the production message module.
 * Mutant IDs in each "Kills:" line are defined in backend/scripts/mutation/spm155.mutants.mjs.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CancellationRequestsService } from './cancellation-requests.service.js';

const EVENT = '11111111-1111-4111-8111-111111111103';
const REQUEST = '22222222-2222-4222-8222-222222222201';
const NOW = new Date('2026-10-12T04:00:00.000Z');

const org1: AuthenticatedUser = { uid: 'org-01', roles: ['ORGANISER'], email: 'org01@example.test', name: 'Farid Rahman' };
const org2: AuthenticatedUser = { uid: 'org-02', roles: ['ORGANISER'], email: 'org02@example.test', name: 'Grace Lim' };
const coo1: AuthenticatedUser = { uid: 'coo-01', roles: ['COORDINATOR'], email: 'coo01@example.test', name: 'Daniel Koh' };
const coo2: AuthenticatedUser = { uid: 'coo-02', roles: ['COORDINATOR'], email: 'coo02@example.test', name: 'Evelyn Goh' };
const lead: AuthenticatedUser = { uid: 'lead-01', roles: ['COORDINATOR_LEAD'], email: 'lead@example.test', name: 'Priya Nair' };
const att1: AuthenticatedUser = { uid: 'att-01', roles: ['ATTENDEE'], email: 'att01@example.test', name: 'Alice Tan' };

const eventRow = (status: string, over: Record<string, unknown> = {}) => ({
  id: EVENT,
  status,
  event_name: 'Hack Night',
  organiser_id: 'org-01',
  coordinator_id: 'coo-01',
  ...over,
});
const requestRow = (status: string, over: Record<string, unknown> = {}) => ({
  id: REQUEST,
  event_id: EVENT,
  requested_by_id: 'org-01',
  requested_by: 'Farid Rahman',
  reason: 'No longer needed',
  status,
  requested_at: NOW,
  decided_by_id: status === 'pending' ? null : 'coo-01',
  decided_by: status === 'pending' ? null : 'Daniel Koh',
  decided_at: status === 'pending' ? null : NOW,
  ...over,
});

interface Script {
  event?: Record<string, unknown> | null;
  draft?: boolean;
  pendingExists?: boolean;
  insertError?: { code: string };
  request?: Record<string, unknown> | null;
  /** The request row disappears between the unlocked lookup and the locking read (a concurrent delete). */
  requestGoneAtLock?: boolean;
  /** What the compare-and-set UPDATE returns; null means it matched no row (a concurrent decision won). */
  updated?: Record<string, unknown> | null;
}

/** A transaction client that answers by statement shape and records every statement. */
function setup(script: Script) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (/FROM events WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: script.event ? [script.event] : [], rowCount: script.event ? 1 : 0 };
      if (/FROM event_drafts/.test(sql)) return { rows: script.draft ? [{ '?column?': 1 }] : [], rowCount: script.draft ? 1 : 0 };
      if (/SELECT 1 FROM event_cancellation_requests WHERE event_id/.test(sql))
        return { rows: script.pendingExists ? [{ '?column?': 1 }] : [], rowCount: script.pendingExists ? 1 : 0 };
      if (/INSERT INTO event_cancellation_requests/.test(sql)) {
        if (script.insertError) throw Object.assign(new Error('duplicate'), script.insertError);
        return { rows: [requestRow('pending', { id: params[0] as string })], rowCount: 1 };
      }
      if (/SELECT event_id FROM event_cancellation_requests WHERE id/.test(sql))
        return { rows: script.request ? [{ event_id: script.request.event_id }] : [], rowCount: script.request ? 1 : 0 };
      if (/FROM event_cancellation_requests WHERE id = \$1 FOR UPDATE/.test(sql))
        return { rows: script.request && !script.requestGoneAtLock ? [script.request] : [], rowCount: script.request ? 1 : 0 };
      if (/UPDATE event_cancellation_requests/.test(sql))
        return { rows: script.updated ? [script.updated] : [], rowCount: script.updated ? 1 : 0 };
      return { rows: [], rowCount: 0 };
    }),
  };
  const database = {
    query: vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)),
  };
  const core = {
    cancelInTransaction: vi.fn(async () => ({ eventId: EVENT, status: 'Cancelled', message: 'Hack Night has been cancelled.' })),
  };
  const service = new CancellationRequestsService(database as never, core as never, { now: () => NOW });
  const writes = () => statements.filter((s) => /^\s*(INSERT|UPDATE|DELETE)/i.test(s.sql));
  return { service, database, client, core, statements, writes };
}

/** The status and the body a refused call carries, so each failure is a [code, message] assertion. */
async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus?: () => number; getResponse?: () => unknown };
    return { status: e.getStatus?.(), body: e.getResponse?.() };
  }
  throw new Error('expected the call to be refused');
}

const MSG_NOT_CANCELLABLE = 'This event can no longer be cancelled.';
const MSG_PENDING = 'You already have a pending cancellation request for this event.';
const MSG_DECIDED = 'This request has already been decided.';
const MSG_FORBIDDEN = 'You do not have permission to perform this action.';

describe('SPM-155 create: identity, lookup and authorisation come before the body (AC1, D7)', () => {
  // Kills: M22
  /** CANCEL-REQUEST-01-E (DERIVED D7): no identity is 401 and nothing is read. */
  it('CANCEL-REQUEST-01-E: no identity is refused with 401 before any database access', async () => {
    // Arrange
    const { service, database } = setup({ event: eventRow('Approved') });

    // Act
    const result = await refusal(service.create(undefined, EVENT, { reason: 'x' }));

    // Assert: 401, no transaction opened
    expect(result.status).toBe(401);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Kills: M23a
  /** CANCEL-REQUEST-01-SUP-ORDER (DERIVED D7): a malformed event id is 404 EVENT_NOT_FOUND with no database access. */
  it('CANCEL-REQUEST-01-SUP-ORDER: a malformed event id is 404 EVENT_NOT_FOUND and opens no transaction', async () => {
    // Arrange
    const { service, database } = setup({ event: eventRow('Approved') });

    // Act
    const result = await refusal(service.create(org1, 'not-a-uuid', {}));

    // Assert
    expect(result).toEqual({ status: 404, body: { code: 'EVENT_NOT_FOUND', message: 'Event not found.' } });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Kills: M4c
  /** CANCEL-REQUEST-01-SUP-ORDER: an unknown event (and no draft) is 404 and writes nothing. */
  it('CANCEL-REQUEST-01-SUP-ORDER: an unknown event is 404 EVENT_NOT_FOUND and writes nothing', async () => {
    // Arrange
    const { service, writes } = setup({ event: null });

    // Act
    const result = await refusal(service.create(org1, EVENT, {}));

    // Assert
    expect(result).toEqual({ status: 404, body: { code: 'EVENT_NOT_FOUND', message: 'Event not found.' } });
    expect(writes()).toHaveLength(0);
  });

  // Kills: M25a, M25b, M4c
  /** CANCEL-REQUEST-01-D subtest B (DERIVED D5): the caller's own Draft is 409 EVENT_NOT_CANCELLABLE (MSG-CR-02), not 404. */
  it('CANCEL-REQUEST-01-D: the own unsubmitted Draft of the Organiser is refused 409 EVENT_NOT_CANCELLABLE', async () => {
    // Arrange: no events row, but a Draft with this id belongs to the caller
    const { service, writes, statements } = setup({ event: null, draft: true });

    // Act
    const result = await refusal(service.create(org1, EVENT, {}));

    // Assert: the draft lookup is scoped to the caller and to Draft status; nothing is written
    expect(result).toEqual({ status: 409, body: { code: 'EVENT_NOT_CANCELLABLE', message: MSG_NOT_CANCELLABLE } });
    const lookup = statements.find((s) => /FROM event_drafts/.test(s.sql));
    expect(lookup?.params).toEqual([EVENT, 'org-01']);
    expect(writes()).toHaveLength(0);
  });

  // Kills: M3a, M4c, M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-E (DERIVED D7): the 403 comes before the status check, so a non-owner learns nothing about status. */
  it.each([
    ['ORG-02, another organiser', org2],
    ['COO-01, the assigned coordinator', coo1],
    ['LEAD-01, the lead', lead],
    ['ATT-01, an attendee', att1],
  ])('CANCEL-REQUEST-01-E: %s on a Completed event is refused 403 FORBIDDEN, not 409, and writes nothing', async (_label, actor) => {
    // Arrange: a Completed event owned by org-01
    const { service, writes } = setup({ event: eventRow('Completed') });

    // Act
    const result = await refusal(service.create(actor, EVENT, { reason: 'x' }));

    // Assert
    expect(result).toEqual({ status: 403, body: { code: 'FORBIDDEN', message: MSG_FORBIDDEN } });
    expect(writes()).toHaveLength(0);
  });

  // Kills: M3b, M4c, M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-E: a user who owns the event id but lacks the ORGANISER role is refused. */
  it('CANCEL-REQUEST-01-E: a user whose uid matches the organiser but who has no ORGANISER role is refused 403', async () => {
    // Arrange: same uid as the event's organiser_id, role Attendee only
    const { service, writes } = setup({ event: eventRow('Approved') });

    // Act
    const result = await refusal(service.create({ ...att1, uid: 'org-01' }, EVENT, {}));

    // Assert
    expect(result.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  // Kills: M26, M3a, M4c, M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-SUP-ORDER (DERIVED D7): authorisation comes before body validation (403, not 422). */
  it('CANCEL-REQUEST-01-SUP-ORDER: a non-owner sending a 501-character reason is refused 403, not 422', async () => {
    // Arrange
    const { service } = setup({ event: eventRow('Approved') });

    // Act
    const result = await refusal(service.create(org2, EVENT, { reason: 'a'.repeat(501) }));

    // Assert
    expect(result.status).toBe(403);
  });

  // Kills: M4c, M4f, M4g, M4h, M5a, M7c
  /** CANCEL-REQUEST-01-H subtest C: for the owner a 501-character reason is 422 INVALID_REASON and writes nothing. */
  it('CANCEL-REQUEST-01-H: the owner\'s 501-character reason is refused 422 INVALID_REASON and nothing is written', async () => {
    // Arrange
    const { service, writes } = setup({ event: eventRow('Approved') });

    // Act
    const result = await refusal(service.create(org1, EVENT, { reason: 'a'.repeat(501) }));

    // Assert
    expect(result).toEqual({ status: 422, body: { code: 'INVALID_REASON', message: 'Use 500 characters or fewer.' } });
    expect(writes()).toHaveLength(0);
  });
});

describe('SPM-155 create: eligible statuses and the pending rule (AC1, D5)', () => {
  // Kills: M12a, M14c, M19, M2b, M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-B (DERIVED D5): Submitted, Approved, Planning and Confirmed accept a request (the set is SPM-136's). */
  it.each(['Submitted', 'Approved', 'Planning', 'Confirmed'])('CANCEL-REQUEST-01-B: a %s event accepts a request', async (status) => {
    // Arrange
    const { service, writes } = setup({ event: eventRow(status) });

    // Act
    const result = await service.create(org1, EVENT, { reason: 'No longer needed' });

    // Assert: 201 payload literal and exactly one INSERT
    expect(result.message).toBe('Cancellation request sent to your Event Coordinator.');
    expect(result.request).toMatchObject({ status: 'pending', displayStatus: 'pending', eventId: EVENT, reason: 'No longer needed' });
    expect(writes()).toHaveLength(1);
  });

  // Kills: M2a, M2d, M4c, M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-C and 01-D (DERIVED D5): every status outside the set is 409 EVENT_NOT_CANCELLABLE and writes nothing. */
  it.each(['Completed', 'Cancelled', 'Rejected', 'Under Review', 'Draft'])(
    'CANCEL-REQUEST-01-C: a %s event is refused 409 EVENT_NOT_CANCELLABLE and nothing is written',
    async (status) => {
      // Arrange
      const { service, writes } = setup({ event: eventRow(status) });

      // Act
      const result = await refusal(service.create(org1, EVENT, { reason: 'x' }));

      // Assert
      expect(result).toEqual({ status: 409, body: { code: 'EVENT_NOT_CANCELLABLE', message: MSG_NOT_CANCELLABLE } });
      expect(writes()).toHaveLength(0);
    },
  );

  // Kills: M4a, M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-F (SPEC): a second request while one is pending is 409 CANCELLATION_REQUEST_PENDING (MSG-CR-03). */
  it('CANCEL-REQUEST-01-F: a pending request refuses a second with 409 CANCELLATION_REQUEST_PENDING and writes nothing', async () => {
    // Arrange
    const { service, writes } = setup({ event: eventRow('Approved'), pendingExists: true });

    // Act
    const result = await refusal(service.create(org1, EVENT, {}));

    // Assert
    expect(result).toEqual({ status: 409, body: { code: 'CANCELLATION_REQUEST_PENDING', message: MSG_PENDING } });
    expect(writes()).toHaveLength(0);
  });

  // Kills: M4b, M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-F: the database's unique violation (a race that passed the check) is the same 409, not a 500. */
  it('CANCEL-REQUEST-01-F: a unique violation on insert is mapped to 409 CANCELLATION_REQUEST_PENDING', async () => {
    // Arrange: the insert fails with SQLSTATE 23505
    const { service } = setup({ event: eventRow('Approved'), insertError: { code: '23505' } });

    // Act
    const result = await refusal(service.create(org1, EVENT, {}));

    // Assert
    expect(result).toEqual({ status: 409, body: { code: 'CANCELLATION_REQUEST_PENDING', message: MSG_PENDING } });
  });

  // Kills: M4c, M4f, M4g, M4h, M7c
  it('CANCEL-REQUEST-01-F: any other database error is not mapped to a 409', async () => {
    // Arrange
    const { service } = setup({ event: eventRow('Approved'), insertError: { code: '23514' } });

    // Act / Assert: the original error propagates (the framework answers 500)
    await expect(service.create(org1, EVENT, {})).rejects.toMatchObject({ code: '23514' });
  });
});

describe('SPM-155 create: the order of its reads and writes (AC1)', () => {
  // Kills: M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-F (DERIVED D7): create locks the event row, then reads for a pending request, then inserts, all in one transaction. */
  it('CANCEL-REQUEST-01-F: create locks the event row, then checks for a pending request, then inserts, inside one transaction', async () => {
    // Arrange
    const { service, database, statements } = setup({ event: eventRow('Approved') });

    // Act
    await service.create(org1, EVENT, {});

    // Assert: one transaction; the lock precedes the pending read, which precedes the insert
    expect(database.transaction).toHaveBeenCalledTimes(1);
    const lock = statements.findIndex((s) => /FROM events WHERE id = \$1 FOR UPDATE/.test(s.sql));
    const pending = statements.findIndex((s) => /SELECT 1 FROM event_cancellation_requests WHERE event_id/.test(s.sql));
    const insert = statements.findIndex((s) => /INSERT INTO event_cancellation_requests/.test(s.sql));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(pending).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(pending);
  });
});

describe('SPM-155 create: what is written (AC1, AC2)', () => {
  // Kills: M1, M12a, M19, M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-A (SPEC): one INSERT with the session user as requester and the injected instant; the event is not touched. */
  it('CANCEL-REQUEST-01-A: inserts one pending row for the session user at the injected instant and never updates the event', async () => {
    // Arrange: Approved event, owner ORG-01
    const { service, statements, writes, core } = setup({ event: eventRow('Approved') });

    // Act
    await service.create(org1, EVENT, { reason: '  No longer needed  ' });

    // Assert: a single INSERT; params carry the event id, requester uid and name, trimmed reason and T0
    expect(writes()).toHaveLength(1);
    const insert = statements.find((s) => /INSERT INTO event_cancellation_requests/.test(s.sql));
    expect(insert?.params).toEqual([expect.any(String), EVENT, 'org-01', 'Farid Rahman', 'No longer needed', NOW]);
    // The event row is never written and the SPM-136 core is never called by a request
    expect(statements.some((s) => /UPDATE events/.test(s.sql))).toBe(false);
    expect(core.cancelInTransaction).not.toHaveBeenCalled();
  });

  // Kills: M27, M4f, M4g, M4h, M5c, M7c
  /** CANCEL-REQUEST-01-H subtest A: no reason is stored as null. */
  it('CANCEL-REQUEST-01-H: no reason (or spaces only) is stored as null', async () => {
    // Arrange
    const { service, statements } = setup({ event: eventRow('Approved') });

    // Act
    await service.create(org1, EVENT, { reason: '   ' });

    // Assert
    const insert = statements.find((s) => /INSERT INTO event_cancellation_requests/.test(s.sql));
    expect(insert?.params[4]).toBeNull();
  });

  // Kills: M28, M4f, M4g, M4h, M7c
  /** CANCEL-REQUEST-01-A: a session user without a display name is recorded by e-mail, then by the word Organiser. */
  it.each([
    ['no name, has e-mail', { ...org1, name: undefined }, 'org01@example.test'],
    ['no name, no e-mail', { ...org1, name: undefined, email: undefined }, 'Organiser'],
  ])('CANCEL-REQUEST-01-A: requester name with %s is recorded as %s', async (_label, user, expected) => {
    // Arrange
    const { service, statements } = setup({ event: eventRow('Approved') });

    // Act
    await service.create(user as AuthenticatedUser, EVENT, {});

    // Assert
    expect(statements.find((s) => /INSERT INTO event_cancellation_requests/.test(s.sql))?.params[3]).toBe(expected);
  });
});

describe('SPM-155 decide: the order of checks (AC3, D7)', () => {
  // Kills: M22
  /** CANCEL-REQUEST-03-C (DERIVED D7): no identity is 401. */
  it('CANCEL-REQUEST-03-C: no identity is refused with 401 and nothing is read', async () => {
    // Arrange
    const { service, database } = setup({});

    // Act
    const result = await refusal(service.decide(undefined, REQUEST, { decision: 'accept' }));

    // Assert
    expect(result.status).toBe(401);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Kills: M24, M30a
  /** CANCEL-REQUEST-03-SUP-ORDER (user decision 31 Oct 2026, SC-155-009): a malformed or unknown request id is 403 FORBIDDEN, so ids cannot be probed. */
  it.each([
    ['malformed id', 'nope', {}, 0],
    ['unknown id', REQUEST, { request: null }, 1],
  ])('CANCEL-REQUEST-03-SUP-ORDER: a %s is 403 FORBIDDEN and writes nothing', async (_label, id, script, transactions) => {
    // Arrange
    const { service, writes, database } = setup(script as Script);

    // Act
    const result = await refusal(service.decide(coo1, id, { decision: 'accept' }));

    // Assert: a malformed id never opens a transaction; an unknown well-formed id looks once and writes nothing
    expect(result).toEqual({ status: 403, body: { code: 'FORBIDDEN', message: MSG_FORBIDDEN } });
    expect(database.transaction).toHaveBeenCalledTimes(transactions);
    expect(writes()).toHaveLength(0);
  });

  // Kills: M21, M30a, M6a, M6c
  /** CANCEL-REQUEST-03-SUP-ORDER (SC-155-009): an unknown request id gets exactly the refusal another user's real request gets. */
  it('CANCEL-REQUEST-03-SUP-ORDER: an unknown request id and a real request of another coordinator are refused with the identical status and body', async () => {
    // Arrange
    const unknown = setup({ request: null });
    const real = setup({ event: eventRow('Confirmed'), request: requestRow('pending') });

    // Act
    const forUnknown = await refusal(unknown.service.decide(coo2, REQUEST, { decision: 'accept' }));
    const forReal = await refusal(real.service.decide(coo2, REQUEST, { decision: 'accept' }));

    // Assert
    expect(forUnknown).toEqual(forReal);
    expect(forReal).toEqual({ status: 403, body: { code: 'FORBIDDEN', message: MSG_FORBIDDEN } });
  });

  // Kills: M21, M6a, M6c
  /** CANCEL-REQUEST-03-C (SPEC, D3): only the assigned Coordinator decides; everyone else is 403 FORBIDDEN, before any write. */
  it.each([
    ['COO-02, not assigned', coo2],
    ['LEAD-01, not assigned', lead],
    ['ORG-01, the requester', org1],
    ['ATT-01, an attendee', att1],
  ])('CANCEL-REQUEST-03-C: %s is refused 403 FORBIDDEN and nothing is written', async (_label, actor) => {
    // Arrange
    const { service, writes, core } = setup({ event: eventRow('Confirmed'), request: requestRow('pending') });

    // Act
    const result = await refusal(service.decide(actor, REQUEST, { decision: 'accept' }));

    // Assert
    expect(result).toEqual({ status: 403, body: { code: 'FORBIDDEN', message: MSG_FORBIDDEN } });
    expect(writes()).toHaveLength(0);
    expect(core.cancelInTransaction).not.toHaveBeenCalled();
  });

  // Kills: M6b
  /** CANCEL-REQUEST-03-C (DERIVED D3): authority needs the COORDINATOR role as well as the assignment. */
  it('CANCEL-REQUEST-03-C: a user whose uid is the assigned coordinator id but who has no COORDINATOR role is refused 403', async () => {
    // Arrange: an Attendee session carrying the assigned coordinator's uid
    const { service, writes } = setup({ event: eventRow('Confirmed'), request: requestRow('pending') });

    // Act
    const result = await refusal(service.decide({ ...att1, uid: 'coo-01' }, REQUEST, { decision: 'accept' }));

    // Assert
    expect(result).toEqual({ status: 403, body: { code: 'FORBIDDEN', message: MSG_FORBIDDEN } });
    expect(writes()).toHaveLength(0);
  });

  // Kills: M20, M21, M6a, M6c
  /** CANCEL-REQUEST-01-G (DERIVED D3): on an unassigned event nobody can decide, not even the Lead or a Coordinator. */
  it.each([
    ['LEAD-01', lead],
    ['COO-01', coo1],
  ])('CANCEL-REQUEST-01-G: %s deciding a request on an unassigned event is refused 403', async (_label, actor) => {
    // Arrange: coordinator_id is null
    const { service, writes } = setup({ event: eventRow('Submitted', { coordinator_id: null }), request: requestRow('pending') });

    // Act
    const result = await refusal(service.decide(actor, REQUEST, { decision: 'accept' }));

    // Assert
    expect(result.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  // Kills: M21, M6a, M6c, M7c, M7d, M7e, M7f
  /** CANCEL-REQUEST-03-C (DERIVED D3): authority is the coordinator assigned now, read on the locked event row. */
  it('CANCEL-REQUEST-03-C: the coordinator who was replaced is refused 403, the new one is accepted', async () => {
    // Arrange: the event is now assigned to coo-02
    const reassigned = eventRow('Confirmed', { coordinator_id: 'coo-02' });
    const old = setup({ event: reassigned, request: requestRow('pending') });
    const current = setup({ event: reassigned, request: requestRow('pending'), updated: requestRow('declined', { decided_by_id: 'coo-02' }) });

    // Act / Assert: the old coordinator is refused; the new one declines
    expect((await refusal(old.service.decide(coo1, REQUEST, { decision: 'decline' }))).status).toBe(403);
    expect((await current.service.decide(coo2, REQUEST, { decision: 'decline' })).request.status).toBe('declined');
  });

  // Kills: M18b, M21, M29, M6a, M6c, M7c, M7d, M7e, M7f
  /** CANCEL-REQUEST-03-SUP-INPUT (DERIVED D7): authorisation comes before body validation, and a bad body writes nothing. */
  it('CANCEL-REQUEST-03-SUP-INPUT: a non-assigned user with a bad decision gets 403; the assigned one gets 400 INVALID_DECISION', async () => {
    // Arrange
    const { service, writes } = setup({ event: eventRow('Confirmed'), request: requestRow('pending') });

    // Act
    const stranger = await refusal(service.decide(coo2, REQUEST, { decision: 'maybe' }));
    const assigned = await refusal(service.decide(coo1, REQUEST, { decision: 'maybe' }));

    // Assert
    expect(stranger.status).toBe(403);
    expect(assigned).toEqual({ status: 400, body: { code: 'INVALID_DECISION', message: 'Choose accept or decline.' } });
    expect(writes()).toHaveLength(0);
  });

  // Kills: M15, M31, M7c, M7d, M7e, M7f
  /** CANCEL-REQUEST-04-E (DERIVED D7): an already decided request on a cancelled event answers CANCELLATION_REQUEST_DECIDED, not EVENT_NOT_CANCELLABLE. */
  it('CANCEL-REQUEST-04-E: an accepted request on a Cancelled event is refused 409 CANCELLATION_REQUEST_DECIDED (MSG-CR-06)', async () => {
    // Arrange
    const { service, writes } = setup({ event: eventRow('Cancelled'), request: requestRow('accepted') });

    // Act
    const result = await refusal(service.decide(coo1, REQUEST, { decision: 'decline' }));

    // Assert
    expect(result).toEqual({ status: 409, body: { code: 'CANCELLATION_REQUEST_DECIDED', message: MSG_DECIDED } });
    expect(writes()).toHaveLength(0);
  });

  // Kills: M31, M7c, M7d, M7e, M7f
  /** CANCEL-REQUEST-03-D (SPEC): a decided request, whichever way it was decided, is refused 409 CANCELLATION_REQUEST_DECIDED. */
  it.each([
    ['accepted', 'decline'],
    ['declined', 'accept'],
  ])('CANCEL-REQUEST-03-D: a %s request refuses decision %s with 409 CANCELLATION_REQUEST_DECIDED', async (stored, decision) => {
    // Arrange: the guarded UPDATE would match a row here, so only the decided check stands between the request and a second decision
    const { service, writes, core } = setup({ event: eventRow('Confirmed'), request: requestRow(stored), updated: requestRow(stored === 'accepted' ? 'declined' : 'accepted') });

    // Act
    const result = await refusal(service.decide(coo1, REQUEST, { decision }));

    // Assert
    expect(result).toEqual({ status: 409, body: { code: 'CANCELLATION_REQUEST_DECIDED', message: MSG_DECIDED } });
    expect(writes()).toHaveLength(0);
    expect(core.cancelInTransaction).not.toHaveBeenCalled();
  });

  // Kills: M13, M2c, M7c, M7d, M7e, M7f
  /** CANCEL-REQUEST-03-F (DERIVED D4/D5): a pending request on an event outside the eligible set is 409 EVENT_NOT_CANCELLABLE for accept and decline. */
  it.each([
    ['Completed', 'accept'],
    ['Completed', 'decline'],
    ['Cancelled', 'accept'],
    ['Cancelled', 'decline'],
    ['Rejected', 'accept'],
    ['Under Review', 'accept'],
  ])('CANCEL-REQUEST-03-F: a pending request on a %s event refuses %s with 409 EVENT_NOT_CANCELLABLE', async (status, decision) => {
    // Arrange
    const { service, writes, core } = setup({ event: eventRow(status), request: requestRow('pending') });

    // Act
    const result = await refusal(service.decide(coo1, REQUEST, { decision }));

    // Assert: refused, the stored status is not written, the core is not called
    expect(result).toEqual({ status: 409, body: { code: 'EVENT_NOT_CANCELLABLE', message: MSG_NOT_CANCELLABLE } });
    expect(writes()).toHaveLength(0);
    expect(core.cancelInTransaction).not.toHaveBeenCalled();
  });

  // Kills: M7a, M7b, M7c, M7d, M7e, M7f
  /** CANCEL-REQUEST-03-E (SPEC): a decision that loses the compare-and-set is 409 CANCELLATION_REQUEST_DECIDED and does not cancel the event. */
  it('CANCEL-REQUEST-03-E: a lost compare-and-set is refused 409 CANCELLATION_REQUEST_DECIDED and the core is not called', async () => {
    // Arrange: the row looked pending when read, but the guarded UPDATE matches nothing
    const { service, core, statements } = setup({ event: eventRow('Confirmed'), request: requestRow('pending'), updated: null });

    // Act
    const result = await refusal(service.decide(coo1, REQUEST, { decision: 'accept' }));

    // Assert
    expect(result).toEqual({ status: 409, body: { code: 'CANCELLATION_REQUEST_DECIDED', message: MSG_DECIDED } });
    expect(core.cancelInTransaction).not.toHaveBeenCalled();
    // The UPDATE is guarded on the stored status (this is what makes it a compare-and-set)
    expect(statements.find((s) => /UPDATE event_cancellation_requests/.test(s.sql))?.sql).toMatch(/status = 'pending'/);
  });
});

describe('SPM-155 decide: rows that vanish under the locks (AC3)', () => {
  // Kills: M30b, M30c
  /** CANCEL-REQUEST-03-SUP-ORDER (SC-155-009): if the event or the request is gone when the locks are taken, the answer is 403 and nothing is written. */
  it.each([
    ['the event row', { event: null, request: requestRow('pending') }],
    ['the request row', { event: eventRow('Confirmed'), request: requestRow('pending'), requestGoneAtLock: true }],
  ])('CANCEL-REQUEST-03-SUP-ORDER: %s gone at lock time is 403 FORBIDDEN and writes nothing', async (_label, script) => {
    // Arrange
    const { service, writes } = setup(script as Script);

    // Act
    const result = await refusal(service.decide(coo1, REQUEST, { decision: 'accept' }));

    // Assert
    expect(result).toEqual({ status: 403, body: { code: 'FORBIDDEN', message: MSG_FORBIDDEN } });
    expect(writes()).toHaveLength(0);
  });
});

describe('SPM-155 decide: what accept and decline do (AC3, AC4, AC5)', () => {
  // Kills: M10a, M10b, M12c, M17a, M35, M7c, M7d, M7e, M7f, M9
  /** CANCEL-REQUEST-03-A and 04-A (SPEC): accept records the coordinator and instant, then runs the core on the same client with that actor. */
  it('CANCEL-REQUEST-03-A: accept updates the request for COO-01 at the injected instant, then calls the core on the same client', async () => {
    // Arrange
    const { service, client, core, statements } = setup({
      event: eventRow('Confirmed'),
      request: requestRow('pending'),
      updated: requestRow('accepted'),
    });

    // Act
    const result = await service.decide(coo1, REQUEST, { decision: 'accept' });

    // Assert: MSG-CR-04 with the event name, the stored request, and the core call with (client, actor, event, instant)
    expect(result.message).toBe('Cancellation request accepted. Hack Night is cancelled.');
    expect(result.request).toMatchObject({ id: REQUEST, status: 'accepted', displayStatus: 'accepted', decidedBy: 'Daniel Koh' });
    expect(core.cancelInTransaction).toHaveBeenCalledTimes(1);
    expect(core.cancelInTransaction).toHaveBeenCalledWith(client, coo1, EVENT, NOW);
    const update = statements.find((s) => /UPDATE event_cancellation_requests/.test(s.sql));
    expect(update?.params).toEqual([REQUEST, 'accepted', 'coo-01', 'Daniel Koh', NOW]);
  });

  // Kills: M10b, M11, M12b, M18d, M7c, M7d, M7e, M7f
  /** CANCEL-REQUEST-05-A and 05-C (SPEC): decline issues exactly one write (the request) and never calls the core. */
  it('CANCEL-REQUEST-05-A: decline writes only the request row, with COO-01 and the instant, and never calls the core', async () => {
    // Arrange
    const { service, core, writes, statements } = setup({
      event: eventRow('Confirmed'),
      request: requestRow('pending'),
      updated: requestRow('declined'),
    });

    // Act
    const result = await service.decide(coo1, REQUEST, { decision: 'decline' });

    // Assert: MSG-CR-05; one UPDATE of the request; no event, history, booking or notification write
    expect(result.message).toBe('Cancellation request declined.');
    expect(result.request).toMatchObject({ status: 'declined', displayStatus: 'declined' });
    expect(core.cancelInTransaction).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
    expect(statements.find((s) => /UPDATE event_cancellation_requests/.test(s.sql))?.params).toEqual([REQUEST, 'declined', 'coo-01', 'Daniel Koh', NOW]);
  });

  // Kills: M7c, M7d, M7e, M7f, M8, M9
  /** CANCEL-REQUEST-04-C (SPEC): a failure inside the core propagates, so the surrounding transaction rolls the request update back. */
  it('CANCEL-REQUEST-04-C: a failure in the core propagates out of decide (the transaction rolls back)', async () => {
    // Arrange
    const { service, core } = setup({ event: eventRow('Confirmed'), request: requestRow('pending'), updated: requestRow('accepted') });
    core.cancelInTransaction.mockRejectedValueOnce(new Error('releaser failed'));

    // Act / Assert
    await expect(service.decide(coo1, REQUEST, { decision: 'accept' })).rejects.toThrow('releaser failed');
  });

  // Kills: M7c, M7d, M7e, M7f
  /** CANCEL-REQUEST-03-E (DERIVED D7): the event row is locked before the request row, in one transaction. */
  it('CANCEL-REQUEST-03-E: decide locks the event, then the request, inside one transaction', async () => {
    // Arrange
    const { service, database, statements } = setup({ event: eventRow('Confirmed'), request: requestRow('pending'), updated: requestRow('declined') });

    // Act
    await service.decide(coo1, REQUEST, { decision: 'decline' });

    // Assert: one transaction; the event lock precedes the request lock
    expect(database.transaction).toHaveBeenCalledTimes(1);
    const eventLock = statements.findIndex((s) => /FROM events WHERE id = \$1 FOR UPDATE/.test(s.sql));
    const requestLock = statements.findIndex((s) => /FROM event_cancellation_requests WHERE id = \$1 FOR UPDATE/.test(s.sql));
    expect(eventLock).toBeGreaterThanOrEqual(0);
    expect(requestLock).toBeGreaterThan(eventLock);
  });
});

describe('SPM-155 recorded names and row shapes (AC3)', () => {
  // Kills: M28, M7c, M7d, M7e, M7f
  /** CANCEL-REQUEST-03-B: a Coordinator session without a display name is recorded by e-mail, then by the word Coordinator. */
  it.each([
    ['no name, has e-mail', { ...coo1, name: undefined }, 'coo01@example.test'],
    ['no name, no e-mail', { ...coo1, name: undefined, email: undefined }, 'Coordinator'],
  ])('CANCEL-REQUEST-03-B: decider name with %s is recorded as %s', async (_label, user, expected) => {
    // Arrange
    const { service, statements } = setup({ event: eventRow('Confirmed'), request: requestRow('pending'), updated: requestRow('declined') });

    // Act
    await service.decide(user as AuthenticatedUser, REQUEST, { decision: 'decline' });

    // Assert
    expect(statements.find((s) => /UPDATE event_cancellation_requests/.test(s.sql))?.params[3]).toBe(expected);
  });

  // Kills: M33, M34
  /** CANCEL-REQUEST-02-A: instants that arrive as text are returned as ISO strings, and a missing reason reads null. */
  it('CANCEL-REQUEST-02-A: a row with text instants and no reason maps to ISO strings and a null reason', async () => {
    // Arrange: requested_at and decided_at as ISO text with an offset, reason undefined
    const row = requestRow('declined', { requested_at: '2026-10-12T12:00:00+08:00', decided_at: '2026-10-12T16:30:00+08:00', reason: undefined });
    const database = { query: vi.fn(async (sql: string) => (/FROM events WHERE id/.test(sql) ? { rows: [eventRow('Confirmed')] } : { rows: [row] })), transaction: vi.fn() };
    const service = new CancellationRequestsService(database as never, {} as never, { now: () => NOW });

    // Act
    const [record] = await service.listForEvent(org1, EVENT);

    // Assert: 12:00 +08:00 is 04:00Z; 16:30 +08:00 is 08:30Z
    expect(record).toMatchObject({ requestedAt: '2026-10-12T04:00:00.000Z', decidedAt: '2026-10-12T08:30:00.000Z', reason: null });
  });
});

describe('SPM-155 reads (AC2)', () => {
  const readRows = (rows: Array<Record<string, unknown>>, event: Record<string, unknown> | null) => {
    const database = {
      query: vi.fn(async (sql: string, _params: unknown[] = []) => {
        if (/FROM events WHERE id = \$1/.test(sql)) return { rows: event ? [event] : [] };
        return { rows };
      }),
      transaction: vi.fn(),
    };
    const service = new CancellationRequestsService(database as never, {} as never, { now: () => NOW });
    return { service, database };
  };

  // Kills: M16a
  /** CANCEL-REQUEST-02-D (SPEC): ORG-02, ATT-01, the Lead and an unassigned Coordinator are refused 403; an unknown event is 404; no identity is 401. */
  it.each([
    ['ORG-02', org2],
    ['ATT-01', att1],
    ['LEAD-01', lead],
    ['COO-02, not assigned', coo2],
  ])('CANCEL-REQUEST-02-D: %s reading the event requests of another organiser is refused 403 FORBIDDEN', async (_label, actor) => {
    // Arrange
    const { service } = readRows([requestRow('pending')], eventRow('Approved'));

    // Act
    const result = await refusal(service.listForEvent(actor, EVENT));

    // Assert
    expect(result).toEqual({ status: 403, body: { code: 'FORBIDDEN', message: MSG_FORBIDDEN } });
  });

  // Kills: M22, M23b, M32
  it('CANCEL-REQUEST-02-D: no identity is 401 and an unknown event is 404 EVENT_NOT_FOUND', async () => {
    // Arrange
    const unknown = readRows([], null);

    // Act / Assert
    expect((await refusal(unknown.service.listForEvent(undefined, EVENT))).status).toBe(401);
    expect(await refusal(unknown.service.listForEvent(org1, EVENT))).toEqual({
      status: 404,
      body: { code: 'EVENT_NOT_FOUND', message: 'Event not found.' },
    });
    expect((await refusal(unknown.service.listForEvent(org1, 'nope'))).status).toBe(404);
    // The two lookups above read once each; the malformed id read nothing
    expect(unknown.database.query).not.toHaveBeenCalledWith(expect.any(String), ['nope']);
  });

  // Kills: M14b, M33
  /** CANCEL-REQUEST-02-A and 02-SUP-CLOSED: the owner and the assigned coordinator read the list with the status derived from the live event. */
  it.each([
    ['ORG-01, the owner', org1],
    ['COO-01, the assigned coordinator', coo1],
  ])('CANCEL-REQUEST-02-A: %s reads the requests, a pending one on a Cancelled event shows as closed', async (_label, actor) => {
    // Arrange: one pending request, event now Cancelled
    const { service } = readRows([requestRow('pending')], eventRow('Cancelled'));

    // Act
    const result = await service.listForEvent(actor, EVENT);

    // Assert: stored status stays pending, the display status is closed with the D4 line, instants are ISO strings
    expect(result).toEqual([
      {
        id: REQUEST,
        eventId: EVENT,
        eventName: 'Hack Night',
        status: 'pending',
        displayStatus: 'closed',
        closedNote: 'The event is already cancelled.',
        reason: 'No longer needed',
        requestedBy: 'Farid Rahman',
        requestedAt: '2026-10-12T04:00:00.000Z',
      },
    ]);
  });

  // Kills: M17a, M33, M35
  /** CANCEL-REQUEST-02-B: a decided request carries who decided it and when. */
  it('CANCEL-REQUEST-02-B: an accepted request shows the decider and the decision instant', async () => {
    // Arrange
    const { service } = readRows([requestRow('accepted')], eventRow('Cancelled'));

    // Act
    const [record] = await service.listForEvent(org1, EVENT);

    // Assert
    expect(record).toMatchObject({ status: 'accepted', displayStatus: 'accepted', decidedBy: 'Daniel Koh', decidedAt: '2026-10-12T04:00:00.000Z' });
    expect(record).not.toHaveProperty('closedNote');
  });

  // Kills: M16c, M22
  /** CANCEL-REQUEST-02-A: the dashboard list is for Organisers and Coordinators only. */
  it.each([
    ['ATT-01', att1],
    ['LEAD-01', lead],
  ])('CANCEL-REQUEST-02-D: %s asking for the dashboard list is refused 403 FORBIDDEN', async (_label, actor) => {
    // Arrange
    const { service } = readRows([], null);

    // Act / Assert
    expect(await refusal(service.listMine(actor))).toEqual({ status: 403, body: { code: 'FORBIDDEN', message: MSG_FORBIDDEN } });
    expect((await refusal(service.listMine(undefined))).status).toBe(401);
  });

  // Kills: M14c, M16b
  /** CANCEL-REQUEST-02-A: the dashboard list is scoped in SQL to the caller's own events (owner for an Organiser, assigned for a Coordinator). */
  it('CANCEL-REQUEST-02-A: the dashboard query is scoped to the caller uid and role', async () => {
    // Arrange
    const { service, database } = readRows([{ ...requestRow('pending'), event_name: 'Hack Night', event_status: 'Approved' }], null);

    // Act
    const mine = await service.listMine(org1);
    await service.listMine(coo1);

    // Assert: params are [uid, isOrganiser, isCoordinator]; the row maps to a record
    expect(database.query.mock.calls[0][1]).toEqual(['org-01', true, false]);
    expect(database.query.mock.calls[1][1]).toEqual(['coo-01', false, true]);
    expect(mine[0]).toMatchObject({ eventId: EVENT, eventName: 'Hack Night', status: 'pending', displayStatus: 'pending' });
  });
});
