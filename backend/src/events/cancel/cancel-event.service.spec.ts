/*
 * SPM-136 AC1, AC2, AC3 (CANCEL-EVENT-01-C, 02-C, 03-B) at unit level: the order of checks before any
 * write is 401, 404, 403, 400 (confirmation), 409 (not cancellable). Only the database boundary is faked.
 */
import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CancelEventService } from './cancel-event.service.js';

const EVENT = '11111111-1111-4111-8111-111111111301';
const NOW = new Date('2026-10-12T04:00:00.000Z');
const coordinator: AuthenticatedUser = { uid: 'coo-01', roles: ['COORDINATOR'], email: 'coo01@example.test', name: 'Coordinator 1' };
const otherCoordinator: AuthenticatedUser = { uid: 'coo-02', roles: ['COORDINATOR'], email: 'coo02@example.test', name: 'Coordinator 2' };
const organiser: AuthenticatedUser = { uid: 'org-01', roles: ['ORGANISER'], email: 'org01@example.test', name: 'Organiser 1' };
const lead: AuthenticatedUser = { uid: 'lead-01', roles: ['COORDINATOR_LEAD'], email: 'lead01@example.test', name: 'Lead 1' };
const confirmed = { targetStatus: 'Cancelled', confirmed: true };

function setup(eventRow: Record<string, unknown> | undefined) {
  const query = vi.fn(async () => ({ rows: eventRow ? [eventRow] : [] }));
  const transactionQuery = vi.fn(async () => ({ rows: eventRow ? [eventRow] : [], rowCount: 0 }));
  const database = {
    query,
    transaction: vi.fn(async (work: (client: unknown) => unknown) => work({ query: transactionQuery })),
  };
  const service = new CancelEventService(database as never, { now: () => NOW }, []);
  return { service, database, transactionQuery };
}

const planningRow = { id: EVENT, status: 'Planning', event_name: 'Annual Gala Dinner', organiser_id: 'org-01', coordinator_id: 'coo-01' };

describe('SPM-136 CancelEventService authorisation and order of checks', () => {
  // Kills: none identified
  it('CANCEL-EVENT-01-C: no identity is refused with 401 before anything is read', async () => {
    // Arrange
    const { service, database } = setup(planningRow);

    // Act and assert: 401, and nothing is read or written before the refusal
    await expect(service.cancel(undefined, EVENT, confirmed)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Kills: none identified
  it('CANCEL-EVENT-01-C: a malformed event id is 404 "Event not found." (same as a missing event)', async () => {
    // Arrange
    const { service, database } = setup(planningRow);

    // Act and assert: 404 with the same message as a missing event, and no transaction
    await expect(service.cancel(coordinator, 'not-a-uuid', confirmed)).rejects.toMatchObject({
      message: 'Event not found.',
    });
    await expect(service.cancel(coordinator, 'not-a-uuid', confirmed)).rejects.toBeInstanceOf(NotFoundException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Kills: M1 (COO-02 row); M1 and M7 (LEAD-01 row); M1 and M8 (ORG-02 row)
  it.each([
    ['COO-02, not assigned', otherCoordinator],
    ['LEAD-01, Coordinator Lead', lead],
    ['ORG-02 style user who is not the submitter', { uid: 'org-02', roles: ['ORGANISER'], email: 'o2@example.test', name: 'O2' } as AuthenticatedUser],
  ])('CANCEL-EVENT-01-C: %s is refused with 403 before the confirmation is read', async (_label, actor) => {
    // Arrange: a confirmed-but-unauthorised request (confirmed false) proves 403 comes before 400
    const { service, database } = setup(planningRow);

    // Act and assert
    await expect(service.cancel(actor, EVENT, { targetStatus: 'Cancelled', confirmed: false })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.cancel(actor, EVENT, confirmed)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN', message: 'You do not have permission to cancel this event.' },
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Kills: M4, M15
  it('CANCEL-EVENT-01-C: the submitting organiser passes the authorisation check', async () => {
    // Arrange: the locked row is a Planning event that the organiser submitted; the compare-and-set succeeds
    const { service, database, transactionQuery } = setup(planningRow);
    transactionQuery.mockResolvedValueOnce({ rows: [planningRow], rowCount: 1 });

    // Act and assert: the request is accepted (no refusal) and returns the cancelled result
    await expect(service.cancel(organiser, EVENT, confirmed)).resolves.toEqual({
      eventId: EVENT,
      status: 'Cancelled',
      message: 'Annual Gala Dinner has been cancelled.',
    });
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  // Kills: M3 (every row); M10 (the string "true" row)
  it.each([undefined, { targetStatus: 'Cancelled' }, { targetStatus: 'Cancelled', confirmed: false }, { targetStatus: 'Cancelled', confirmed: 'true' }])(
    'CANCEL-EVENT-02-C: confirmation %j is refused with 400 CANCEL_NOT_CONFIRMED before any write',
    async (body) => {
      // Arrange
      const { service, database } = setup(planningRow);

      // Act and assert: the refusal is 400, and no transaction is opened
      await expect(service.cancel(coordinator, EVENT, body)).rejects.toMatchObject({
        response: { code: 'CANCEL_NOT_CONFIRMED', message: 'Cancellation must be confirmed.' },
      });
      expect(database.transaction).not.toHaveBeenCalled();
    },
  );

  // Kills: M4
  it('CANCEL-EVENT-03-B: an already Cancelled event is refused with 409 EVENT_NOT_CANCELLABLE and no UPDATE is issued', async () => {
    // Arrange: the locked row is Cancelled
    const cancelledRow = { ...planningRow, status: 'Cancelled' };
    const { service, transactionQuery } = setup(cancelledRow);

    // Act and assert
    await expect(service.cancel(coordinator, EVENT, confirmed)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.cancel(coordinator, EVENT, confirmed)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_CANCELLABLE', message: 'This event can no longer be cancelled.' },
    });
    const sql = transactionQuery.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(sql.some((statement) => /UPDATE events/.test(statement))).toBe(false);
  });
});

/** A transaction whose statements are recorded: the locked row, the CAS result, and any releaser or notice writes. */
function transactionalSetup(options: { locked?: Record<string, unknown> | null; updated?: boolean; recipients?: string[] }) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (/FOR UPDATE/.test(sql)) return { rows: options.locked === null ? [] : [options.locked ?? planningRow], rowCount: 1 };
      if (/UPDATE events/.test(sql)) return { rows: options.updated === false ? [] : [{ event_name: 'Annual Gala Dinner' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
  };
  const releaserRecorder = {
    name: 'fake',
    collectRecipients: vi.fn(async () => options.recipients ?? []),
    release: vi.fn(async () => undefined),
  };
  const database = {
    query: vi.fn(async () => ({ rows: [planningRow] })),
    transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)),
  };
  return { database, client, statements, releaserRecorder };
}

describe('SPM-136 cancellation transaction (AC3 to AC6, CANCEL-EVENT-03-A, 03-C, 06-A)', () => {
  // Kills: M2, M4, M12, M15, M16, S17, S18, S21, S22, S24
  it('CANCEL-EVENT-03-A: compare-and-set stamps cancelled_by and the injected instant, then history and one notice per recipient', async () => {
    // Arrange: organiser and coordinator plus two Registered attendees, one listed twice (must notify once)
    const { database, client, statements, releaserRecorder } = transactionalSetup({ recipients: ['att-1', 'att-2', 'att-1'] });
    const service = new CancelEventService(database as never, { now: () => NOW }, [releaserRecorder]);

    // Act
    const result = await service.cancel(coordinator, EVENT, confirmed);

    // Assert: literal response; the CAS carries the actor and the instant; the history row is from Planning
    expect(result).toEqual({ eventId: EVENT, status: 'Cancelled', message: 'Annual Gala Dinner has been cancelled.' });
    const update = statements.find((s) => /UPDATE events/.test(s.sql));
    expect(update?.params).toEqual([EVENT, 'coo-01', NOW, ['Submitted', 'Approved', 'Planning', 'Confirmed']]);
    const history = statements.find((s) => /INSERT INTO event_status_history/.test(s.sql));
    expect(history?.params).toEqual([expect.any(String), EVENT, 'Planning', 'coo-01', NOW]);
    // Recipients are the organiser, the coordinator and the unique attendees: four notices, each once
    const notices = statements.filter((s) => /INSERT INTO notifications/.test(s.sql));
    expect(notices).toHaveLength(1);
    expect(notices[0].params[0]).toEqual(['org-01', 'coo-01', 'att-1', 'att-2']);
    // ASSUMPTION A1: the attendee copy reads the same notice text as the organiser and coordinator copies
    expect(notices[0].params[1]).toBe('Annual Gala Dinner has been cancelled.');
    // The releaser receives the same transaction client and the injected instant
    expect(releaserRecorder.release).toHaveBeenCalledWith(EVENT, client, NOW);
  });

  // Kills: M4, M15, M16, S17, S22
  it('CANCEL-EVENT-06-A: an event with no assigned coordinator notifies the organiser only', async () => {
    // Arrange: a Submitted event with no assigned coordinator, submitted by ORG-01
    const submitted = { ...planningRow, status: 'Submitted', coordinator_id: null };
    const { database, statements, releaserRecorder } = transactionalSetup({ locked: submitted, recipients: [] });
    const service = new CancelEventService(database as never, { now: () => NOW }, [releaserRecorder]);

    // Act
    await service.cancel(organiser, EVENT, confirmed);

    // Assert: the only notice is for the organiser
    const notices = statements.filter((s) => /INSERT INTO notifications/.test(s.sql));
    expect(notices[0].params[0]).toEqual(['org-01']);
  });

  // Kills: M4, M15
  it('CANCEL-EVENT-03-C: a locked row that disappeared is refused 404 with no write', async () => {
    // Arrange: the locked read finds no row
    const { database, statements } = transactionalSetup({ locked: null });
    const service = new CancelEventService(database as never, { now: () => NOW }, []);

    // Act and assert: 404, and no UPDATE or INSERT is issued
    await expect(service.cancel(coordinator, EVENT, confirmed)).rejects.toBeInstanceOf(NotFoundException);
    expect(statements.some((s) => /UPDATE events|INSERT INTO/.test(s.sql))).toBe(false);
  });

  // Kills: M1, M4, M15
  it('CANCEL-EVENT-01-C: a locked row reassigned to another coordinator is refused 403 with no write', async () => {
    // Arrange: the locked row now names another coordinator
    const reassigned = { ...planningRow, coordinator_id: 'coo-99' };
    const { database, statements } = transactionalSetup({ locked: reassigned });
    const service = new CancelEventService(database as never, { now: () => NOW }, []);

    // Act and assert: 403, and no UPDATE or INSERT is issued
    await expect(service.cancel(coordinator, EVENT, confirmed)).rejects.toBeInstanceOf(ForbiddenException);
    expect(statements.some((s) => /UPDATE events|INSERT INTO/.test(s.sql))).toBe(false);
  });

  // Kills: M4, M15
  it('CANCEL-EVENT-03-C: a request that loses the compare-and-set is refused 409 and writes no history or notice', async () => {
    // Arrange: the compare-and-set UPDATE matches no row
    const { database, statements } = transactionalSetup({ updated: false });
    const service = new CancelEventService(database as never, { now: () => NOW }, []);

    // Act and assert: 409, and no history or notice INSERT is issued
    await expect(service.cancel(coordinator, EVENT, confirmed)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_CANCELLABLE' },
    });
    expect(statements.some((s) => /INSERT/.test(s.sql))).toBe(false);
  });

  // Kills: none identified
  it('CANCEL-EVENT-07-A: a service built with only the database still refuses an anonymous caller (default clock and releasers)', async () => {
    // Arrange: a service built without the optional clock and releasers
    const service = new CancelEventService({ query: vi.fn(async () => ({ rows: [] })) } as never);

    // Act and assert: 401 for an anonymous caller
    await expect(service.cancel(undefined, EVENT, confirmed)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('SPM-136 cancellation lookup and releaser contract', () => {
  // Kills: none identified
  it('CANCEL-EVENT-01-C: an unknown event id (well-formed) is 404 "Event not found." before any write', async () => {
    // Arrange: no event row exists
    const { database } = setup(undefined);
    const service = new CancelEventService(database as never, { now: () => NOW }, []);

    // Act and assert: 404 with the same message, and no transaction
    await expect(service.cancel(coordinator, EVENT, confirmed)).rejects.toMatchObject({ message: 'Event not found.' });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Kills: M4, M15, M16, S17, S24
  it('CANCEL-EVENT-06-A: a releaser that collects no recipients is still released, and only the organiser and coordinator are notified', async () => {
    // Arrange: a releaser that contributes no recipients
    const { database, statements } = transactionalSetup({});
    const plainReleaser = { name: 'plain', release: vi.fn(async () => undefined) };
    const service = new CancelEventService(database as never, { now: () => NOW }, [plainReleaser]);

    // Act
    await service.cancel(coordinator, EVENT, confirmed);

    // Assert: the releaser ran once, and the notice goes to the organiser and coordinator only
    expect(plainReleaser.release).toHaveBeenCalledTimes(1);
    const notices = statements.filter((s) => /INSERT INTO notifications/.test(s.sql));
    expect(notices[0].params[0]).toEqual(['org-01', 'coo-01']);
  });
});

/*
 * ASSUMPTION INDEX (SPM-136). Master list: docs/specs/SPM-136-test-results.md, "Assumptions (SPM-136)".
 *   A1 attendee copy of the EventCancelled notice uses the organiser text -> CANCEL-EVENT-03-A
 */
