import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import type { DatabaseService } from '../database/database.service.js';
import type { CommentRow, EventForReview } from './clarifications.repository.js';
import type { ClarificationsRepository } from './clarifications.repository.js';
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
    updateEventStatus: vi.fn(),
    clearAwaitingReply: vi.fn(),
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
  // AC2/AC3
  it('rejects a blank message without opening a transaction', async () => {
    const { service, database } = buildService();

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only message without opening a transaction', async () => {
    const { service, database } = buildService();

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: ' \n\t ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // AC4/AC5
  it('accepts a valid message, moves the event to Under_Review, and flags it awaiting reply', async () => {
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
    expect(repository.updateEventStatus).toHaveBeenCalledWith({}, EVENT_ID, 'Under_Review');
    expect(repository.insertNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ recipientId: 'organiser-1', type: 'clarification' }),
    );
    expect(result).toMatchObject({ awaitingReply: true, authorRole: 'coordinator' });
  });

  it.each(['Submitted', 'Under_Review', 'Approved'])(
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

  // AC9
  it('rejects a coordinator not assigned to the event, with no DB mutation', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(
      eventRow({ coordinator_id: 'someone-else' }),
    );

    await expect(
      service.createClarification(EVENT_ID, coordinator(), { message: 'Hi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.insertComment).not.toHaveBeenCalled();
    expect(repository.updateEventStatus).not.toHaveBeenCalled();
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

  // AC7/AC8 (inferred addition)
  it('clears awaiting_reply and notifies the assigned coordinator', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEventForUpdate).mockResolvedValue(eventRow());
    vi.mocked(repository.findClarificationForUpdate).mockResolvedValue({
      id: CLARIFICATION_ID,
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

    expect(repository.clearAwaitingReply).toHaveBeenCalledWith({}, CLARIFICATION_ID);
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

  it('rejects a reply from someone other than the event organiser', async () => {
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
});

describe('ClarificationsService.listComments', () => {
  // AC7
  it('returns the thread for the assigned coordinator', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(eventRow());
    vi.mocked(repository.listComments).mockResolvedValue([commentRow()]);

    const result = await service.listComments(EVENT_ID, coordinator());

    expect(result).toHaveLength(1);
  });

  it('returns the thread for the organiser', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.findEvent).mockResolvedValue(eventRow());
    vi.mocked(repository.listComments).mockResolvedValue([commentRow()]);

    const result = await service.listComments(EVENT_ID, organiser());

    expect(result).toHaveLength(1);
  });

  // AC9
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
