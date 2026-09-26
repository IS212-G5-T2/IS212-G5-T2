import {
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
 * SPM-40 — Approve a request. Backend unit tests for the production endpoint
 * `EventsService.approve(id, identity)` (Confluence: EVENT-APPROVE-03 status
 * transition + authorization + id guards, EVENT-APPROVE-04-A/B state guards,
 * and the AC4 organiser notification). RED / TDD: `approve` is not implemented
 * yet, so every case fails at runtime until the feature lands. Intended
 * contract (mirrors reject, minus the reason):
 *
 *   approve(id, identity?)
 *     - requires an authenticated COORDINATOR assigned to the event
 *     - only advances a `Submitted` event, in one transaction:
 *       SELECT ... FOR UPDATE -> UPDATE status = 'Approved' -> INSERT an
 *       'approval' notification for the organiser
 *     - Conflict on any non-Submitted status; Forbidden for the wrong
 *       coordinator; NotFound for a malformed/unknown id
 */

const db = {
  query: vi.fn(),
  transaction: vi.fn(),
  release: vi.fn(),
};

const database = {
  query: db.query,
  transaction: vi.fn(),
};

const VALID_UUID = '00000000-0000-4000-8000-000000000036';

// The approve method does not exist on EventsService yet; reference it through a
// cast so the file type-checks while failing at runtime (red).
type ApprovableEventsService = EventsService & {
  approve: (id: string, identity?: AuthenticatedUser) => Promise<{ status: string }>;
};
const approve = (id: string, identity?: AuthenticatedUser) =>
  (service as ApprovableEventsService).approve(id, identity);

function coordinator(uid = 'coordinator-1'): AuthenticatedUser {
  return { uid, roles: ['COORDINATOR'] };
}
function organiser(uid = 'current-user'): AuthenticatedUser {
  return { uid, roles: ['ORGANISER'] };
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
// query sequence approve() runs: BEGIN, SELECT ... FOR UPDATE, UPDATE, INSERT, COMMIT.
function wireApprove(
  selected: Record<string, unknown> | null,
  updated: Record<string, unknown> | null,
) {
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

describe('EventsService.approve (SPM-40)', () => {
  // EVENT-APPROVE-03-A — happy path (AC3 + AC4)
  it('approves a Submitted request: sets Approved and notifies the organiser', async () => {
    wireApprove(eventRow({ status: 'Submitted' }), eventRow({ status: 'Approved' }));

    const result = await approve(VALID_UUID, coordinator());

    expect(result).toMatchObject({ status: 'approved' });

    const sql = txSql();
    expect(sql).toContain('BEGIN');
    expect(sql.some((s) => /FOR UPDATE/.test(s))).toBe(true);
    expect(sql.some((s) => s.startsWith('UPDATE') && /'Approved'/.test(s))).toBe(true);
    expect(sql.some((s) => s.startsWith('INSERT INTO notifications'))).toBe(true);
    expect(sql).toContain('COMMIT');

    // AC4: the notification is an 'approval' addressed to the organiser and
    // references the event.
    const insert = db.transaction.mock.calls.find((c) =>
      String(c[0]).trim().startsWith('INSERT INTO notifications'),
    )!;
    expect(String(insert[0])).toContain("'approval'");
    expect(insert[1]).toEqual([
      expect.any(String),
      'organiser-9',
      expect.stringContaining('Welcome Evening'),
      VALID_UUID,
    ]);
  });

  // EVENT-APPROVE-03-B — authorization
  it('refuses a non-coordinator, a missing identity, and the wrong coordinator', async () => {
    // Non-coordinator / missing identity are rejected before any transaction.
    await expect(approve(VALID_UUID, organiser())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(approve(VALID_UUID, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.transaction).not.toHaveBeenCalled();

    // A coordinator who is not the assigned one is refused inside the transaction.
    wireApprove(eventRow({ coordinator_id: 'coordinator-1', status: 'Submitted' }), null);
    await expect(approve(VALID_UUID, coordinator('coordinator-2'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const sql = txSql();
    expect(sql.some((s) => s.startsWith('UPDATE'))).toBe(false);
    expect(sql).toContain('ROLLBACK');
  });

  // EVENT-APPROVE-03-C — id / existence guard
  it('guards the event id: malformed id never opens a transaction, unknown id is not found', async () => {
    await expect(approve('not-a-uuid', coordinator())).rejects.toBeInstanceOf(NotFoundException);
    expect(db.transaction).not.toHaveBeenCalled();

    wireApprove(null, null); // SELECT ... FOR UPDATE returns no row
    await expect(approve(VALID_UUID, coordinator())).rejects.toBeInstanceOf(NotFoundException);
    expect(txSql()).toContain('ROLLBACK');
  });
});

describe('EventsService.approve — state guard (EVENT-APPROVE-04-A)', () => {
  it.each(['Approved', 'Planning', 'Confirmed', 'Completed', 'Rejected', 'Cancelled'])(
    'cannot approve a %s request (Conflict, no update)',
    async (status) => {
      wireApprove(eventRow({ status }), null);

      await expect(approve(VALID_UUID, coordinator())).rejects.toBeInstanceOf(ConflictException);

      const sql = txSql();
      expect(sql.some((s) => s.startsWith('UPDATE'))).toBe(false);
      expect(sql.some((s) => s.startsWith('INSERT INTO notifications'))).toBe(false);
      expect(sql).toContain('ROLLBACK');
    },
  );
});

describe('EventsService.approve — immutability (EVENT-APPROVE-04-B)', () => {
  it('does not re-process or revert an already-Approved event', async () => {
    // An already-approved event stays approved: the Submitted-only guard blocks
    // it, so no status-mutating UPDATE and no duplicate approval notification.
    wireApprove(eventRow({ status: 'Approved' }), null);

    await expect(approve(VALID_UUID, coordinator())).rejects.toBeInstanceOf(ConflictException);

    const sql = txSql();
    expect(sql.some((s) => s.startsWith('UPDATE'))).toBe(false);
    expect(sql.some((s) => s.startsWith('INSERT INTO notifications'))).toBe(false);
  });
});

describe('EventsService approval notifications (SPM-40 AC4)', () => {
  it('returns the organiser approval confirmation with its event link', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          id: 'notif-approval-1',
          recipient_id: 'current-user',
          type: 'approval',
          message: 'Your event request "Welcome Evening" was approved and can proceed.',
          related_event_id: VALID_UUID,
          read: false,
          created_at: new Date('2026-09-14T00:00:00.000Z'),
        },
      ],
    });

    const result = await service.notifications(organiser());

    expect(result[0]).toMatchObject({
      type: 'approval',
      audienceUserId: 'current-user',
      relatedEventId: VALID_UUID,
      read: false,
    });
    expect(result[0].message).toContain('approved and can proceed');
  });
});
