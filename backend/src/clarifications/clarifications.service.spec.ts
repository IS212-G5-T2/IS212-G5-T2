/*
 * SPM-39 test case map (source: "SPM-39 Test Cases" document, REQ-CLAR-*). Unit level only; the PostgreSQL
 * e2e file (backend/test/clarifications.e2e-spec.ts) holds the full-stack version of each case.
 *   REQ-CLAR-01-A  AC1          valid message accepted, event status unchanged  -> "accepts a valid message ..."
 *   REQ-CLAR-01-B  AC2          blank message rejected, no transaction           -> "rejects a blank message ..."
 *   REQ-CLAR-01-C  AC2          whitespace-only rejected, no transaction         -> "rejects a whitespace-only ..."
 *   REQ-CLAR-02-A  AC3, AC4     thread returned for the coordinator              -> "returns the thread for the assigned coordinator"
 *                               (weak: asserts only the length; order, author and timestamp are not checked here)
 *   REQ-CLAR-02-B  AC5          "awaiting reply" flag set on the new comment     -> "accepts a valid message ..."
 *                               (state only; the on-screen badge is tested in the frontend file)
 * AC numbers in this file refer to the five current SPM-39 ACs. A test with no SPM-39 AC behind it says so.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import type { DatabaseService } from '../database/database.service.js';
import type { CommentRow, EventForReview } from './repository/clarifications.repository.js';
import type { ClarificationsRepository } from './repository/clarifications.repository.js';
import { ClarificationsService } from './clarifications.service.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000042';
const CLARIFICATION_ID = '00000000-0000-4000-8000-000000000101';

function coordinator(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { uid: 'coordinator-1', roles: ['COORDINATOR'], name: 'Marcus Lee', ...overrides };
}

function organiser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { uid: 'organiser-1', roles: ['ORGANISER'], name: 'Priya Nair', ...overrides };
}

function eventRow(overrides: Partial<EventForReview> = {}): EventForReview {
  return {
    id: EVENT_ID,
    event_name: 'Community Welcome Evening',
    status: 'Submitted',
    organiser_id: 'organiser-1',
    coordinator_id: 'coordinator-1',
    ...overrides,
  };
}

function commentRow(overrides: Partial<CommentRow> = {}): CommentRow {
  return {
    id: 'comment-1',
    event_id: EVENT_ID,
    parent_id: null,
    type: 'clarification',
    author_id: 'coordinator-1',
    author_name: 'Marcus Lee',
    author_role: 'coordinator',
    message: 'Please confirm the layout.',
    awaiting_reply: true,
    resolved: false,
    created_at: new Date('2026-09-18T13:05:00.000Z'),
    ...overrides,
  };
}

function buildService() {
  const repository = {
    findEvent: vi.fn(),
    findEventForUpdate: vi.fn(),
    findClarificationForUpdate: vi.fn(),
    insertComment: vi.fn(),
    resolveClarification: vi.fn(),
    insertNotification: vi.fn(),
    listComments: vi.fn(),
  } as unknown as ClarificationsRepository;

  const database = {
    transaction: vi.fn((work: (client: unknown) => unknown) => work({})),
  } as unknown as DatabaseService;

  const service = new ClarificationsService(database, repository);
  return { service, repository, database };
}

describe('ClarificationsService.createClarification', () => {
  // SPM-39 REQ-CLAR-01-B (AC2), unit level
  it('rejects a blank message without opening a transaction', async () => {
    const { service, database } = buildService();

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // SPM-39 REQ-CLAR-01-C (AC2), unit level
  it('rejects a whitespace-only message without opening a transaction', async () => {
    const { service, database } = buildService();

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: ' \n\t ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // REQ-CLAR-01-A (AC1): "Under Review" was retired as a distinct status (see SPM-38
  // follow-up), so a clarification request no longer changes the event's status.
  // SPM-39 REQ-CLAR-01-A (AC1) and REQ-CLAR-02-B (AC5, flag only), unit level
  it('REQ-CLAR-SUP-01 accepts a valid message and flags it awaiting reply, without changing event status', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.insertComment).mockResolvedValue(commentRow());

    const result = await service.createClarification(EVENT_ID, coordinator(), {
      message: 'Please confirm the layout.',
    });

    expect(repository.insertComment).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        eventId: EVENT_ID,
        parentId: null,
        type: 'clarification',
        authorId: 'coordinator-1',
        authorName: 'Marcus Lee',
        authorRole: 'coordinator',
        message: 'Please confirm the layout.',
        awaitingReply: true,
      }),
    );
    expect(repository.insertNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ recipientId: 'organiser-1', type: 'clarification' }),
    );
    expect(result).toMatchObject({ awaitingReply: true, authorRole: 'coordinator' });
  });

  it.each(['Submitted', 'Approved'])(
    'REQ-CLAR-SUP-02 allows opening a clarification from %s status',
    async (status) => {
      const { service, repository } = buildService();
      vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow({ status }));
      vi.mocked(repository.insertComment).mockResolvedValue(commentRow());

      await expect(
        service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
      ).resolves.toMatchObject({ type: 'clarification', awaitingReply: true, resolved: false });
    },
  );

  it('REQ-CLAR-SUP-03 rejects a clarification request when the event status disallows it', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(
      eventRow({ status: 'draft' }),
    );

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  // SPM-148 AC7: a Confirmed event closes posting; the refusal is a conflict and nothing is written.
  it('REQ-CLAR-SUP-04 refuses a clarification on a Confirmed event with a conflict and writes no comment', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(
      eventRow({ status: 'Confirmed' }),
    );

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  // SPM-39 AC1: only the coordinator assigned to the event may request a clarification.
  it('REQ-CLAR-SUP-05 rejects a coordinator not assigned to the event, with no DB mutation', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(
      eventRow({ coordinator_id: 'someone-else' }),
    );

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-06 rejects a caller without the COORDINATOR role even if uid matches', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());

    await expect(
      service.createClarification(
        EVENT_ID,
        { uid: 'coordinator-1', roles: ['ATTENDEE'] },
        { message: 'Hi' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('REQ-CLAR-SUP-07 returns not found for an unknown event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(undefined);

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('REQ-CLAR-SUP-08 returns not found for a malformed event id without querying', async () => {
    const { service, repository } = buildService();

    await expect(
      service.createClarification('not-a-uuid', coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findEventForUpdate).not.toHaveBeenCalled();
  });
});

describe('ClarificationsService.reply', () => {
  it('REQ-CLAR-SUP-09 rejects a blank reply without opening a transaction', async () => {
    const { service, database } = buildService();

    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser(), { message: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Reply notification. Not one of the five SPM-39 ACs; kept as existing reply behaviour.
  it('REQ-CLAR-SUP-10 notifies the assigned coordinator when the organiser replies', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue({
      id: CLARIFICATION_ID,
      resolved: false,
    });
    vi.mocked(repository.insertComment).mockResolvedValue(
      commentRow({
        id: 'reply-1',
        parent_id: CLARIFICATION_ID,
        type: 'reply',
        author_id: 'organiser-1',
        author_name: 'Priya Nair',
        author_role: 'organiser',
        message: 'Yes, please add a second angle.',
        awaiting_reply: false,
      }),
    );

    const result = await service.reply(EVENT_ID, CLARIFICATION_ID, organiser(), {
      message: 'Yes, please add a second angle.',
    });

    expect(repository.insertComment).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        parentId: CLARIFICATION_ID,
        type: 'reply',
        authorRole: 'organiser',
        awaitingReply: false,
      }),
    );
    expect(repository.insertNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ recipientId: 'coordinator-1', type: 'clarification_reply' }),
    );
    expect(result.awaitingReply).toBe(false);
  });

  it('REQ-CLAR-SUP-11 allows the assigned coordinator to reply and notifies the organiser', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue({
      id: CLARIFICATION_ID,
      resolved: false,
    });
    vi.mocked(repository.insertComment).mockResolvedValue(
      commentRow({
        id: 'reply-2',
        parent_id: CLARIFICATION_ID,
        type: 'reply',
        author_id: 'coordinator-1',
        author_name: 'Marcus Lee',
        author_role: 'coordinator',
        message: 'Following up on this.',
        awaiting_reply: false,
      }),
    );

    await service.reply(EVENT_ID, CLARIFICATION_ID, coordinator(), {
      message: 'Following up on this.',
    });

    expect(repository.insertComment).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ authorRole: 'coordinator' }),
    );
    expect(repository.insertNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ recipientId: 'organiser-1', type: 'clarification_reply' }),
    );
  });

  it('REQ-CLAR-SUP-12 rejects a reply from someone who is neither the organiser nor the assigned coordinator', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());

    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser({ uid: 'someone-else' }), {
        message: 'Hi',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-13 rejects a reply targeting a clarification that does not exist on this event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue(undefined);

    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-14 rejects a reply to an already-resolved clarification', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue({
      id: CLARIFICATION_ID,
      resolved: true,
    });

    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });
});

describe('ClarificationsService.resolve', () => {
  it('REQ-CLAR-SUP-15 marks the clarification resolved and notifies the organiser when the coordinator resolves it', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue({
      id: CLARIFICATION_ID,
      resolved: false,
    });
    vi.mocked(repository.resolveClarification).mockResolvedValue(
      commentRow({ id: CLARIFICATION_ID, resolved: true, awaiting_reply: false }),
    );

    const result = await service.resolve(EVENT_ID, CLARIFICATION_ID, coordinator());

    expect(repository.resolveClarification).toHaveBeenCalledWith({}, CLARIFICATION_ID);
    expect(repository.insertNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ recipientId: 'organiser-1', type: 'clarification_resolved' }),
    );
    expect(result.resolved).toBe(true);
  });

  it('REQ-CLAR-SUP-16 allows the organiser to resolve and notifies the assigned coordinator', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue({
      id: CLARIFICATION_ID,
      resolved: false,
    });
    vi.mocked(repository.resolveClarification).mockResolvedValue(
      commentRow({ id: CLARIFICATION_ID, resolved: true, awaiting_reply: false }),
    );

    await service.resolve(EVENT_ID, CLARIFICATION_ID, organiser());

    expect(repository.insertNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ recipientId: 'coordinator-1', type: 'clarification_resolved' }),
    );
  });

  it('REQ-CLAR-SUP-17 rejects a resolve from someone who is neither the organiser nor the assigned coordinator', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());

    await expect(
      service.resolve(EVENT_ID, CLARIFICATION_ID, coordinator({ uid: 'someone-else' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.resolveClarification).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-18 rejects resolving a clarification that does not exist on this event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue(undefined);

    await expect(
      service.resolve(EVENT_ID, CLARIFICATION_ID, organiser()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.resolveClarification).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-19 is idempotent when the clarification is already resolved', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue({
      id: CLARIFICATION_ID,
      resolved: true,
    });
    vi.mocked(repository.listComments).mockResolvedValue([
      commentRow({ id: CLARIFICATION_ID, resolved: true, awaiting_reply: false }),
    ]);

    const result = await service.resolve(EVENT_ID, CLARIFICATION_ID, organiser());

    expect(repository.resolveClarification).not.toHaveBeenCalled();
    expect(repository.insertNotification).not.toHaveBeenCalled();
    expect(result.resolved).toBe(true);
  });
});

describe('ClarificationsService.listComments', () => {
  // SPM-39 REQ-CLAR-02-A (AC3, AC4), unit level. The repository returns rows in created_at order (SQL ORDER BY,
  // checked in the e2e test). This test checks that the service keeps that order and maps every field.
  it('REQ-CLAR-02-A: returns the thread in repository order with author, role, timestamp and flags', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(eventRow());
    vi.mocked(repository.listComments).mockResolvedValue([
      commentRow({ id: 'comment-1', created_at: new Date('2026-09-18T09:15:00.000Z') }),
      commentRow({
        id: 'reply-1',
        parent_id: 'comment-1',
        type: 'reply',
        author_id: 'organiser-1',
        author_name: 'Priya Nair',
        author_role: 'organiser',
        message: 'Room layout will be Banquet.',
        awaiting_reply: false,
        created_at: new Date('2026-09-18T10:30:00.000Z'),
      }),
    ]);

    const result = await service.listComments(EVENT_ID, coordinator());

    // Kills: a sort that reverses the order, a dropped author or role, a wrong timestamp format, a lost flag.
    expect(result).toEqual([
      {
        id: 'comment-1',
        eventId: EVENT_ID,
        parentId: null,
        type: 'clarification',
        authorId: 'coordinator-1',
        authorName: 'Marcus Lee',
        authorRole: 'coordinator',
        message: 'Please confirm the layout.',
        awaitingReply: true,
        resolved: false,
        createdAt: '2026-09-18T09:15:00.000Z',
      },
      {
        id: 'reply-1',
        eventId: EVENT_ID,
        parentId: 'comment-1',
        type: 'reply',
        authorId: 'organiser-1',
        authorName: 'Priya Nair',
        authorRole: 'organiser',
        message: 'Room layout will be Banquet.',
        awaitingReply: false,
        resolved: false,
        createdAt: '2026-09-18T10:30:00.000Z',
      },
    ]);
  });

  it('REQ-CLAR-SUP-20 returns the thread for the organiser', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(eventRow());
    vi.mocked(repository.listComments).mockResolvedValue([commentRow()]);

    const result = await service.listComments(EVENT_ID, organiser());

    expect(result).toHaveLength(1);
  });

  // SPM-39 AC1: a coordinator not assigned to the event cannot read its thread (unit level).
  it('REQ-CLAR-SUP-21 rejects a coordinator not assigned to the event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(eventRow());

    await expect(
      service.listComments(EVENT_ID, coordinator({ uid: 'someone-else' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('REQ-CLAR-SUP-22 rejects an unrelated authenticated user', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(eventRow());

    await expect(
      service.listComments(EVENT_ID, { uid: 'attendee-1', roles: ['ATTENDEE'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// The retired DEMO_ORGANISER_ENABLED switch must not widen access any more: with it set, ownership is still strict.
describe('ClarificationsService ownership with the retired demo flag set', () => {
  beforeEach(() => vi.stubEnv('DEMO_ORGANISER_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('REQ-CLAR-SUP-23 still rejects an unassigned coordinator asking for clarification', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());

    await expect(
      service.createClarification(EVENT_ID, coordinator({ uid: 'someone-else' }), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-24 still rejects a non-owning organiser and an unassigned coordinator reading the thread', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(eventRow());

    await expect(
      service.listComments(EVENT_ID, organiser({ uid: 'someone-else' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.listComments(EVENT_ID, coordinator({ uid: 'someone-else' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.listComments).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-25 still rejects a non-owning organiser replying on an assigned event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());

    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser({ uid: 'someone-else' }), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });
});

// Not-found paths and display-name fallbacks (SPM-39 AC1, AC3, AC4). Unit level; each refusal must happen
// before any transaction is opened, except where the event lookup itself is the check.
describe('ClarificationsService not-found paths and author names', () => {
  it('REQ-CLAR-SUP-26 reply: a malformed clarification id -> 404 "Clarification request not found.", no transaction', async () => {
    // Kills: the UUID check removed (a malformed id reaches the database)
    const { service, database } = buildService();
    await expect(
      service.reply(EVENT_ID, 'not-a-uuid', organiser(), { message: 'Yes.' }),
    ).rejects.toMatchObject({ status: 404, message: 'Clarification request not found.' });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-27 reply: an unknown event -> 404 "Event not found.", no comment inserted', async () => {
    // Kills: the event-existence check dropped inside the transaction
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(undefined as unknown as EventForReview);
    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser(), { message: 'Yes.' }),
    ).rejects.toMatchObject({ status: 404, message: 'Event not found.' });
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-28 resolve: a malformed clarification id -> 404, no transaction', async () => {
    // Kills: the UUID check removed from resolve
    const { service, database } = buildService();
    await expect(service.resolve(EVENT_ID, 'not-a-uuid', organiser())).rejects.toMatchObject({
      status: 404,
      message: 'Clarification request not found.',
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-29 resolve: an unknown event -> 404 "Event not found.", nothing resolved', async () => {
    // Kills: the event-existence check dropped from resolve
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(undefined as unknown as EventForReview);
    await expect(service.resolve(EVENT_ID, CLARIFICATION_ID, organiser())).rejects.toMatchObject({
      status: 404,
      message: 'Event not found.',
    });
    expect(repository.resolveClarification).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-30 resolve: an already-resolved clarification missing from the thread -> 404, nothing written', async () => {
    // Kills: the "already resolved" branch returning a comment that is not in the thread (undefined dto)
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue({ id: CLARIFICATION_ID, resolved: true });
    vi.mocked(repository.listComments).mockResolvedValue([]);
    await expect(service.resolve(EVENT_ID, CLARIFICATION_ID, organiser())).rejects.toMatchObject({
      status: 404,
      message: 'Clarification request not found.',
    });
    expect(repository.resolveClarification).not.toHaveBeenCalled();
  });

  it('REQ-CLAR-SUP-31 listComments: an unknown event -> 404 "Event not found."', async () => {
    // Kills: a missing event treated as an empty thread
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(undefined as unknown as EventForReview);
    await expect(service.listComments(EVENT_ID, coordinator())).rejects.toMatchObject({
      status: 404,
      message: 'Event not found.',
    });
  });

  it('REQ-CLAR-SUP-32 the author name falls back to the email, then to the uid, when no name is set', async () => {
    // Kills: the fallback order changed (uid first, or the name always required)
    const withEmail = buildService();
    vi.mocked(withEmail.repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(withEmail.repository.insertComment).mockResolvedValue(commentRow({ author_name: 'marcus@example.test' }));
    await withEmail.service.createClarification(EVENT_ID, coordinator({ name: undefined, email: 'marcus@example.test' }), {
      message: 'Please confirm.',
    });
    expect(withEmail.repository.insertComment).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ authorName: 'marcus@example.test' }),
    );

    const withUid = buildService();
    vi.mocked(withUid.repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(withUid.repository.insertComment).mockResolvedValue(commentRow({ author_name: 'coordinator-1' }));
    await withUid.service.createClarification(EVENT_ID, coordinator({ name: undefined, email: undefined }), {
      message: 'Please confirm.',
    });
    expect(withUid.repository.insertComment).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ authorName: 'coordinator-1' }),
    );
  });
});
