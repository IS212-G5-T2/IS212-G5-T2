/*
 * SPM-39 clarification repository, unit level. The SQL is checked for the clauses that carry the ACs
 * (event row lock, clarification-only filter, chronological order, resolve clearing awaiting_reply) and
 * for parameter order. Rows are returned from a scripted fake; the PostgreSQL behaviour is covered by
 * backend/test/clarifications.e2e-spec.ts.
 *   AC1 (send a clarification)      -> insertComment, findEventForUpdate
 *   AC3 (added with name, timestamp) -> insertComment parameters
 *   AC4 (chronological history)      -> listComments ORDER BY created_at ASC
 *   AC5 (awaiting reply)             -> resolveClarification clears awaiting_reply
 */
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../../database/database.service.js';
import { ClarificationsRepository } from './clarifications.repository.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000042';
const CLARIFICATION_ID = '00000000-0000-4000-8000-000000000101';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Call {
  sql: string;
  params: unknown[];
}

/** A query function that records each statement and answers with the scripted rows. */
function fakeQuery(rows: unknown[] = []) {
  const calls: Call[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return { rows };
  });
  return { query, calls };
}

function repositoryWith(rows: unknown[] = []) {
  const fake = fakeQuery(rows);
  const database = { query: fake.query } as unknown as DatabaseService;
  return { repository: new ClarificationsRepository(database), database, ...fake };
}

describe('ClarificationsRepository.findEvent', () => {
  it('reads the event by id and returns its first row', async () => {
    const row = { id: EVENT_ID, event_name: 'Community Welcome Evening', status: 'Submitted', organiser_id: 'o', coordinator_id: 'c' };
    const { repository, calls } = repositoryWith([row]);
    await expect(repository.findEvent(EVENT_ID)).resolves.toEqual(row);
    expect(calls[0].params).toEqual([EVENT_ID]);
    expect(calls[0].sql).not.toMatch(/FOR UPDATE/);
  });

  it('returns undefined for an unknown event', async () => {
    const { repository } = repositoryWith([]);
    await expect(repository.findEvent(EVENT_ID)).resolves.toBeUndefined();
  });
});

describe('ClarificationsRepository.findEventForUpdate', () => {
  it('locks the event row inside the caller transaction', async () => {
    // Kills: FOR UPDATE dropped (two replies could race on the same event)
    const fake = fakeQuery([{ id: EVENT_ID }]);
    const repository = new ClarificationsRepository({} as DatabaseService);
    await repository.findEventForUpdate({ query: fake.query }, EVENT_ID);
    expect(fake.calls[0].sql).toMatch(/FOR UPDATE/);
    expect(fake.calls[0].params).toEqual([EVENT_ID]);
  });
});

describe('ClarificationsRepository.findClarificationForUpdate', () => {
  it('scopes the lookup to this event and to clarification rows only, and locks it', async () => {
    // Kills: the event filter dropped (a clarification on another event could be answered),
    // the type filter dropped (a reply could be resolved as if it were a clarification), parameters swapped.
    const fake = fakeQuery([{ id: CLARIFICATION_ID, resolved: false }]);
    const repository = new ClarificationsRepository({} as DatabaseService);
    const row = await repository.findClarificationForUpdate({ query: fake.query }, EVENT_ID, CLARIFICATION_ID);
    expect(row).toEqual({ id: CLARIFICATION_ID, resolved: false });
    expect(fake.calls[0].sql).toMatch(/event_id = \$2/);
    expect(fake.calls[0].sql).toMatch(/type = 'clarification'/);
    expect(fake.calls[0].sql).toMatch(/FOR UPDATE/);
    expect(fake.calls[0].params).toEqual([CLARIFICATION_ID, EVENT_ID]);
  });
});

describe('ClarificationsRepository.insertComment', () => {
  it('stores the author name, role, message and awaiting flag, with a generated id, and returns the new row', async () => {
    // AC3: the name is stored with the comment. Kills: name and role swapped, awaiting flag not stored.
    const inserted = { id: 'x', message: 'Please confirm the layout.', awaiting_reply: true };
    const fake = fakeQuery([inserted]);
    const repository = new ClarificationsRepository({} as DatabaseService);
    const row = await repository.insertComment({ query: fake.query }, {
      eventId: EVENT_ID,
      parentId: null,
      type: 'clarification',
      authorId: 'coordinator-1',
      authorName: 'Marcus Lee',
      authorRole: 'coordinator',
      message: 'Please confirm the layout.',
      awaitingReply: true,
    });
    expect(row).toEqual(inserted);
    const [id, eventId, parentId, type, authorId, authorName, authorRole, message, awaiting] = fake.calls[0].params;
    expect(String(id)).toMatch(UUID);
    expect([eventId, parentId, type, authorId, authorName, authorRole, message, awaiting]).toEqual([
      EVENT_ID,
      null,
      'clarification',
      'coordinator-1',
      'Marcus Lee',
      'coordinator',
      'Please confirm the layout.',
      true,
    ]);
  });

  it('generates a different id for each comment', async () => {
    const fake = fakeQuery([{}]);
    const repository = new ClarificationsRepository({} as DatabaseService);
    const input = {
      eventId: EVENT_ID, parentId: null, type: 'clarification' as const, authorId: 'c', authorName: 'n',
      authorRole: 'coordinator' as const, message: 'm', awaitingReply: true,
    };
    await repository.insertComment({ query: fake.query }, input);
    await repository.insertComment({ query: fake.query }, input);
    expect(fake.calls[0].params[0]).not.toBe(fake.calls[1].params[0]);
  });
});

describe('ClarificationsRepository.resolveClarification', () => {
  it('marks the clarification resolved and clears awaiting_reply (AC5: only a resolve clears the flag)', async () => {
    // Kills: awaiting_reply left true on resolve, or resolve applied to a different row.
    const fake = fakeQuery([{ id: CLARIFICATION_ID, resolved: true, awaiting_reply: false }]);
    const repository = new ClarificationsRepository({} as DatabaseService);
    const row = await repository.resolveClarification({ query: fake.query }, CLARIFICATION_ID);
    expect(row).toMatchObject({ resolved: true, awaiting_reply: false });
    expect(fake.calls[0].sql).toMatch(/SET resolved = true, awaiting_reply = false/);
    expect(fake.calls[0].sql).toMatch(/WHERE id = \$1/);
    expect(fake.calls[0].params).toEqual([CLARIFICATION_ID]);
  });
});

describe('ClarificationsRepository.insertNotification', () => {
  it('stores the recipient, type, message and related event in order, with a generated id', async () => {
    // AC5/notification side effect. Kills: recipient and related event swapped.
    const fake = fakeQuery([]);
    const repository = new ClarificationsRepository({} as DatabaseService);
    await repository.insertNotification({ query: fake.query }, {
      recipientId: 'organiser-1',
      type: 'clarification',
      message: 'New clarification on Community Welcome Evening.',
      relatedEventId: EVENT_ID,
    });
    const [id, recipient, type, message, related] = fake.calls[0].params;
    expect(String(id)).toMatch(UUID);
    expect([recipient, type, message, related]).toEqual([
      'organiser-1',
      'clarification',
      'New clarification on Community Welcome Evening.',
      EVENT_ID,
    ]);
  });
});

describe('ClarificationsRepository.listComments', () => {
  it('reads the event thread in chronological order (AC4): ORDER BY created_at ASC', async () => {
    // Kills: DESC ordering, or the event filter dropped.
    const rows = [{ id: 'a' }, { id: 'b' }];
    const { repository, calls } = repositoryWith(rows);
    await expect(repository.listComments(EVENT_ID)).resolves.toEqual(rows);
    expect(calls[0].sql).toMatch(/WHERE event_id = \$1 ORDER BY created_at ASC/);
    expect(calls[0].params).toEqual([EVENT_ID]);
  });
});
