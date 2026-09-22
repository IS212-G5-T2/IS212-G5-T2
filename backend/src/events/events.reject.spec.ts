import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';

/**
 * SPM-83 — Reject a request. Backend unit tests for the real production endpoint
 * `EventsService.reject(id, body, currentUser)` (the method wired to
 * `EventRejectionsController`) and the rejection-notification endpoints that let
 * the organiser see the reason (AC6). Confluence: EVENT-REJECT-03 (per-condition
 * validation), EVENT-REJECT-04 (authorization + state guards), EVENT-REJECT-02-B
 * (organiser notification).
 */

// The single message the server returns for ANY invalid reason (mirrors the
// client's requirements block — see EVENT-REJECT-01).
const REASON_REQUIREMENTS_MESSAGE =
  'Please provide a reason that: is between 10 and 500 characters; ' +
  'contains at least 3 words; and includes real words, not just numbers or symbols.';

const db = {
  query: vi.fn(),
  connect: vi.fn(),
  transaction: vi.fn(),
  release: vi.fn(),
  end: vi.fn(),
};

const database = {
  query: db.query,
  transaction: vi.fn(),
};

const VALID_UUID = '00000000-0000-4000-8000-000000000036';
const VALID_REASON = 'Venue unavailable for the requested date.';

function coordinator(uid = 'coordinator-1'): AuthenticatedUser {
  return { uid, roles: ['COORDINATOR'] };
}
function organiser(uid = 'current-user'): AuthenticatedUser {
  return { uid, roles: ['ORGANISER'] };
}

// Build a letters-only, >=3-word reason of an exact trimmed length.
function reasonOfLength(n: number): string {
  const words: string[] = [];
  let len = 0;
  while (len < n) {
    if (words.length) len += 1; // joining space
    words.push('ab');
    len += 2;
  }
  return words.join(' ').slice(0, n);
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    organiser_id: 'organiser-9',
    organiser_name: 'Organiser Nine',
    event_name: 'Welcome Evening',
    purpose: 'Community building',
    description: 'A welcome event for new members.',
    coordinator_id: 'coordinator-1',
    coordinator_name: 'Coordinator One',
    start_date_time: new Date('2026-10-01T09:00:00.000Z'),
    end_date_time: new Date('2026-10-01T10:00:00.000Z'),
    expected_attendance: 80,
    preferred_room_layout: 'Banquet',
    required_facilities: [],
    accessibility_needs: [],
    attachments: [],
    equipment_needs: '',
    status: 'Submitted',
    rejection_reason: null,
    created_at: new Date('2026-09-13T00:00:00.000Z'),
    updated_at: new Date('2026-09-14T00:00:00.000Z'),
    ...overrides,
  };
}

// Wire the transaction client (client.query === db.transaction) to answer the
// query sequence reject() runs: BEGIN, SELECT … FOR UPDATE, UPDATE, INSERT, COMMIT.
function wireReject(selected: Record<string, unknown> | null, updated: Record<string, unknown> | null) {
  db.transaction.mockImplementation((sql: string) => {
    const text = sql.trim();
    if (text.startsWith('SELECT')) return Promise.resolve({ rows: selected ? [selected] : [] });
    if (text.startsWith('UPDATE')) return Promise.resolve({ rows: updated ? [updated] : [] });
    return Promise.resolve({ rows: [] }); // BEGIN / INSERT / COMMIT / ROLLBACK
  });
}

function txSql() {
  return db.transaction.mock.calls.map((c) => String(c[0]).trim());
}

let service: EventsService;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv('DEMO_ORGANISER_ENABLED', 'true');
  db.transaction.mockResolvedValue({ rows: [] });
  database.transaction.mockImplementation(async (work) => {
    await db.transaction('BEGIN');
    try {
      const result = await work({ query: db.transaction });
      await db.transaction('COMMIT');
      return result;
    } catch (error) {
      await db.transaction('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  });

  const module = await Test.createTestingModule({
    providers: [EventsService, { provide: DatabaseService, useValue: database }],
  }).compile();

  service = module.get(EventsService);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('EventsService.reject (SPM-83)', () => {
  // EVENT-REJECT-03-A — happy path (AC5 + AC6)
  it('rejects a Submitted request: sets Rejected, records the reason, notifies the organiser', async () => {
    wireReject(
      eventRow({ status: 'Submitted' }),
      eventRow({ status: 'Rejected', rejection_reason: VALID_REASON }),
    );

    const result = await service.reject(VALID_UUID, { reason: VALID_REASON }, coordinator());

    expect(result).toMatchObject({ status: 'rejected', rejectionReason: VALID_REASON });

    const sql = txSql();
    expect(sql).toContain('BEGIN');
    expect(sql.some((s) => /FOR UPDATE/.test(s))).toBe(true);
    expect(sql.some((s) => s.startsWith('UPDATE') && /'Rejected'/.test(s))).toBe(true);
    expect(sql.some((s) => s.startsWith('INSERT INTO notifications'))).toBe(true);
    expect(sql).toContain('COMMIT');

    // AC5: the status + reason update carries the trimmed reason.
    const update = db.transaction.mock.calls.find((c) => String(c[0]).trim().startsWith('UPDATE'))!;
    expect(update[1]).toEqual([VALID_UUID, VALID_REASON]);
    // AC6: the notification targets the organiser and embeds the reason.
    const insert = db.transaction.mock.calls.find((c) =>
      String(c[0]).trim().startsWith('INSERT INTO notifications'),
    )!;
    expect(insert[1]).toEqual([
      expect.any(String),
      'organiser-9',
      expect.stringContaining(VALID_REASON),
      VALID_UUID,
    ]);
  });

  // EVENT-REJECT-03-B — empty / whitespace-only
  it('rejects an empty or whitespace-only reason before opening a transaction', async () => {
    await expect(service.reject(VALID_UUID, {}, coordinator())).rejects.toThrow(
      REASON_REQUIREMENTS_MESSAGE,
    );
    await expect(service.reject(VALID_UUID, { reason: '   ' }, coordinator())).rejects.toThrow(
      REASON_REQUIREMENTS_MESSAGE,
    );
    await expect(service.reject(VALID_UUID, {}, coordinator())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.connect).not.toHaveBeenCalled();
  });

  // EVENT-REJECT-03-C — below minimum length (<10)
  it('rejects a too-short reason and accepts exactly 10', async () => {
    await expect(service.reject(VALID_UUID, { reason: 'no fit ok' }, coordinator())).rejects.toThrow(
      REASON_REQUIREMENTS_MESSAGE,
    );
    expect(db.connect).not.toHaveBeenCalled();

    wireReject(eventRow(), eventRow({ status: 'Rejected', rejection_reason: 'No fit yet' }));
    await expect(
      service.reject(VALID_UUID, { reason: 'No fit yet' }, coordinator()),
    ).resolves.toMatchObject({ status: 'rejected' });
  });

  // EVENT-REJECT-03-D — above maximum length (>500)
  it('rejects a too-long reason and accepts exactly 500', async () => {
    await expect(
      service.reject(VALID_UUID, { reason: reasonOfLength(501) }, coordinator()),
    ).rejects.toThrow(REASON_REQUIREMENTS_MESSAGE);
    expect(db.connect).not.toHaveBeenCalled();

    const reason500 = reasonOfLength(500);
    wireReject(eventRow(), eventRow({ status: 'Rejected', rejection_reason: reason500 }));
    await expect(
      service.reject(VALID_UUID, { reason: reason500 }, coordinator()),
    ).resolves.toMatchObject({ status: 'rejected' });
  });

  // EVENT-REJECT-03-E — fewer than 3 words
  it('rejects a reason with fewer than 3 words and accepts >=3 words', async () => {
    await expect(service.reject(VALID_UUID, { reason: 'Reason today' }, coordinator())).rejects.toThrow(
      REASON_REQUIREMENTS_MESSAGE,
    );
    await expect(service.reject(VALID_UUID, { reason: 'aaaaaaaaaa' }, coordinator())).rejects.toThrow(
      REASON_REQUIREMENTS_MESSAGE,
    );
    expect(db.connect).not.toHaveBeenCalled();

    wireReject(eventRow(), eventRow({ status: 'Rejected', rejection_reason: 'Venue is not available' }));
    await expect(
      service.reject(VALID_UUID, { reason: 'Venue is not available' }, coordinator()),
    ).resolves.toMatchObject({ status: 'rejected' });
  });

  // EVENT-REJECT-03-F — no letters (numbers / symbols only)
  it('rejects a reason with no letters and accepts one containing letters', async () => {
    await expect(service.reject(VALID_UUID, { reason: '123 456 7890' }, coordinator())).rejects.toThrow(
      REASON_REQUIREMENTS_MESSAGE,
    );
    await expect(service.reject(VALID_UUID, { reason: '!!! ??? ...' }, coordinator())).rejects.toThrow(
      REASON_REQUIREMENTS_MESSAGE,
    );
    expect(db.connect).not.toHaveBeenCalled();

    wireReject(eventRow(), eventRow({ status: 'Rejected', rejection_reason: 'Venue is not available' }));
    await expect(
      service.reject(VALID_UUID, { reason: 'Venue is not available' }, coordinator()),
    ).resolves.toMatchObject({ status: 'rejected' });
  });

  // EVENT-REJECT-03-G — id / existence guard
  it('guards the event id: malformed id never opens a transaction, unknown id is not found', async () => {
    await expect(
      service.reject('not-a-uuid', { reason: VALID_REASON }, coordinator()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.connect).not.toHaveBeenCalled();

    wireReject(null, null); // SELECT … FOR UPDATE returns no row
    await expect(
      service.reject(VALID_UUID, { reason: VALID_REASON }, coordinator()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(txSql()).toContain('ROLLBACK');
  });

  // EVENT-REJECT-03-H — variation: the current lifecycle has Submitted only.
  it('rejects a Submitted request and refuses the retired Under_Review status', async () => {
    wireReject(
      eventRow({ status: 'Submitted' }),
      eventRow({ status: 'Rejected', rejection_reason: VALID_REASON }),
    );
    await expect(
      service.reject(VALID_UUID, { reason: VALID_REASON }, coordinator()),
    ).resolves.toMatchObject({ status: 'rejected' });

    wireReject(eventRow({ status: 'Under_Review' }), null);
    await expect(
      service.reject(VALID_UUID, { reason: VALID_REASON }, coordinator()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('EventsService.reject — authorization (EVENT-REJECT-04-B)', () => {
  it('refuses a caller who is not a coordinator, before opening a transaction', async () => {
    await expect(
      service.reject(VALID_UUID, { reason: VALID_REASON }, organiser()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.reject(VALID_UUID, { reason: VALID_REASON }, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('refuses a coordinator who is not the one assigned to the request', async () => {
    wireReject(eventRow({ coordinator_id: 'coordinator-1', status: 'Submitted' }), null);

    await expect(
      service.reject(VALID_UUID, { reason: VALID_REASON }, coordinator('coordinator-2')),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const sql = txSql();
    expect(sql.some((s) => s.startsWith('UPDATE'))).toBe(false);
    expect(sql).toContain('ROLLBACK');
  });
});

describe('EventsService.reject — state guard (EVENT-REJECT-04-C)', () => {
  it.each(['Approved', 'Rejected', 'Cancelled', 'Completed'])(
    'cannot reject a %s request (Conflict, no update)',
    async (status) => {
      wireReject(eventRow({ status }), null);

      await expect(
        service.reject(VALID_UUID, { reason: VALID_REASON }, coordinator()),
      ).rejects.toBeInstanceOf(ConflictException);

      const sql = txSql();
      expect(sql.some((s) => s.startsWith('UPDATE'))).toBe(false);
      expect(sql).toContain('ROLLBACK');
    },
  );
});

describe('EventsService rejection notifications (AC6 / EVENT-REJECT-02-B)', () => {
  const notificationRow = {
    id: 'notif-1',
    recipient_id: 'current-user',
    type: 'rejection',
    message: `Your event request "Welcome Evening" was rejected: ${VALID_REASON}`,
    related_event_id: VALID_UUID,
    read: false,
    created_at: new Date('2026-09-14T00:00:00.000Z'),
  };

  it("returns the organiser's rejection notifications including the reason", async () => {
    db.query.mockResolvedValue({ rows: [notificationRow] });

    const result = await service.notifications(organiser());

    expect(result[0]).toMatchObject({
      type: 'rejection',
      audienceUserId: 'current-user',
      relatedEventId: VALID_UUID,
      read: false,
    });
    expect(result[0].message).toContain(VALID_REASON);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("type = 'rejection'");
  });

  it('refuses a non-organiser caller and does not query', async () => {
    await expect(service.notifications(coordinator())).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('marks a rejection notification as read', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'notif-1' }] });
    await expect(service.readNotification(VALID_UUID, organiser())).resolves.toEqual({
      success: true,
    });
  });

  it('returns not found when marking an unknown notification', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(service.readNotification(VALID_UUID, organiser())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
