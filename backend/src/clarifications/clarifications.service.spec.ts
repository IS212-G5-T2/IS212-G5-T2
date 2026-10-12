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
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  it('accepts a valid message and flags it awaiting reply, without changing event status', async () => {
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
    'allows opening a clarification from %s status',
    async (status) => {
      const { service, repository } = buildService();
      vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow({ status }));
      vi.mocked(repository.insertComment).mockResolvedValue(commentRow());

      await expect(
        service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
      ).resolves.toBeDefined();
    },
  );

  it('rejects a clarification request when the event status disallows it', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(
      eventRow({ status: 'draft' }),
    );

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  // SPM-39 AC1: only the coordinator assigned to the event may request a clarification.
  it('rejects a coordinator not assigned to the event, with no DB mutation', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(
      eventRow({ coordinator_id: 'someone-else' }),
    );

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  it('rejects a caller without the COORDINATOR role even if uid matches', async () => {
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

  it('returns not found for an unknown event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(undefined);

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns not found for a malformed event id without querying', async () => {
    const { service, repository } = buildService();

    await expect(
      service.createClarification('not-a-uuid', coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findEventForUpdate).not.toHaveBeenCalled();
  });
});

describe('ClarificationsService.reply', () => {
  it('rejects a blank reply without opening a transaction', async () => {
    const { service, database } = buildService();

    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser(), { message: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // Reply notification. Not one of the five SPM-39 ACs; kept as existing reply behaviour.
  it('notifies the assigned coordinator when the organiser replies', async () => {
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

  it('allows the assigned coordinator to reply and notifies the organiser', async () => {
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

  it('rejects a reply from someone who is neither the organiser nor the assigned coordinator', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());

    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser({ uid: 'someone-else' }), {
        message: 'Hi',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  it('rejects a reply targeting a clarification that does not exist on this event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue(undefined);

    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  it('rejects a reply to an already-resolved clarification', async () => {
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
  it('marks the clarification resolved and notifies the organiser when the coordinator resolves it', async () => {
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

  it('allows the organiser to resolve and notifies the assigned coordinator', async () => {
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

  it('rejects a resolve from someone who is neither the organiser nor the assigned coordinator', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());

    await expect(
      service.resolve(EVENT_ID, CLARIFICATION_ID, coordinator({ uid: 'someone-else' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.resolveClarification).not.toHaveBeenCalled();
  });

  it('rejects resolving a clarification that does not exist on this event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue(undefined);

    await expect(
      service.resolve(EVENT_ID, CLARIFICATION_ID, organiser()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.resolveClarification).not.toHaveBeenCalled();
  });

  it('is idempotent when the clarification is already resolved', async () => {
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

  it('returns the thread for the organiser', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(eventRow());
    vi.mocked(repository.listComments).mockResolvedValue([commentRow()]);

    const result = await service.listComments(EVENT_ID, organiser());

    expect(result).toHaveLength(1);
  });

  // SPM-39 AC1: a coordinator not assigned to the event cannot read its thread (unit level).
  it('rejects a coordinator not assigned to the event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(eventRow());

    await expect(
      service.listComments(EVENT_ID, coordinator({ uid: 'someone-else' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unrelated authenticated user', async () => {
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

  it('still rejects an unassigned coordinator asking for clarification', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());

    await expect(
      service.createClarification(EVENT_ID, coordinator({ uid: 'someone-else' }), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });

  it('still rejects a non-owning organiser and an unassigned coordinator reading the thread', async () => {
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

  it('still rejects a non-owning organiser replying on an assigned event', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());

    await expect(
      service.reply(EVENT_ID, CLARIFICATION_ID, organiser({ uid: 'someone-else' }), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.insertComment).not.toHaveBeenCalled();
  });
});
