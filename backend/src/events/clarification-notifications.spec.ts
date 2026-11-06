/*
 * SPM-177 (Clarification notifications are saved but never shown): which roles read and mark read the three
 * clarification notices, and the audience each carries in the feed. Unit level: the database is a fixture that records
 * the query and returns fixed rows; test/clarification-notifications.e2e-spec.ts runs the same rules on PostgreSQL.
 * Cases: CLARIFY-NOTIF-01-A, 02-A, 03-A, 04-A.
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser, UserRole } from '../auth/types/auth.models.js';

const db = { query: vi.fn(), transaction: vi.fn() };
const EVENT = '11111111-1111-4111-8111-111111111701';
const NOTICE = '33333333-3333-4333-8333-333333333701';
const TYPES = ['clarification', 'clarification_reply', 'clarification_resolved'];
const as = (uid: string, ...roles: UserRole[]): AuthenticatedUser => ({ uid, roles, email: `${uid}@example.test`, name: uid });
const row = (overrides: Record<string, unknown> = {}) => ({
  id: NOTICE,
  recipient_id: 'org-01',
  type: 'clarification',
  message: 'Clarification requested on "Gala".',
  related_event_id: EVENT,
  related_booking_id: null,
  read: false,
  created_at: new Date('2026-11-04T08:30:00.000Z'),
  event_organiser_id: 'org-01',
  event_coordinator_id: 'coo-01',
  event_name: 'Gala',
  ...overrides,
});

describe('SPM-177 clarification notices in the notification feed', () => {
  let service: EventsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [EventsService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(EventsService);
  });

  /**
   * CLARIFY-NOTIF-01-A (SPM-177 DoD1): the feed asks for all three clarification types for an Organiser.
   * Kills: a type missing from the Organiser list.
   */
  it('CLARIFY-NOTIF-01-A the Organiser feed includes all three clarification types', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await service.notifications(as('org-01', 'ORGANISER'));
    const types = (db.query.mock.calls[0] as [string, [string, string[]]])[1][1];
    for (const type of TYPES) expect(types).toContain(type);
  });

  /**
   * CLARIFY-NOTIF-02-A (SPM-177 DoD1): the feed asks for all three types for a Coordinator, and never for the Lead
   * alone or an Attendee.
   * Kills: a type missing from the Coordinator list, or added to the Lead or Attendee list.
   */
  it.each([
    ['a Coordinator', as('coo-01', 'COORDINATOR'), true],
    ['the Lead', as('lead-01', 'COORDINATOR_LEAD'), false],
    ['an Attendee', as('att-01', 'ATTENDEE'), false],
  ])('CLARIFY-NOTIF-02-A the feed for %s includes the clarification types: %s', async (_label, user, included) => {
    db.query.mockResolvedValue({ rows: [] });
    await service.notifications(user);
    const types = (db.query.mock.calls[0] as [string, [string, string[]]])[1][1];
    for (const type of TYPES) expect(types.includes(type)).toBe(included);
  });

  /**
   * CLARIFY-NOTIF-03-A (SPM-177 DoD1): the audience follows the recipient: the Organiser for a notice they own, the
   * Coordinator for a notice addressed to the assigned Coordinator.
   * Kills: every clarification notice labelled Organiser (the default), or every one labelled Coordinator.
   */
  it.each(TYPES)('CLARIFY-NOTIF-03-A labels a %s notice by its recipient', async (type) => {
    db.query.mockResolvedValueOnce({ rows: [row({ type })] }).mockResolvedValueOnce({
      rows: [row({ type, recipient_id: 'coo-01' })],
    });
    const forOrganiser = await service.notifications(as('org-01', 'ORGANISER'));
    const forCoordinator = await service.notifications(as('coo-01', 'COORDINATOR'));
    expect(forOrganiser[0]).toMatchObject({ type, audienceRole: 'organiser', relatedEventId: EVENT, read: false });
    expect(forCoordinator[0]).toMatchObject({ type, audienceRole: 'coordinator', relatedEventId: EVENT });
  });

  /**
   * CLARIFY-NOTIF-03-A (SPM-177 DoD1): the recipient rule applies to the clarification types only; any other notice
   * type still falls through to the existing labelling (an Organiser notice here) even when it is addressed to the
   * assigned Coordinator.
   * Kills: the clarification-type guard removed, so every notice for the assigned Coordinator is labelled coordinator.
   */
  it('CLARIFY-NOTIF-03-A leaves the label of a non-clarification notice to the existing rules', async () => {
    db.query.mockResolvedValueOnce({ rows: [row({ type: 'rejection', recipient_id: 'coo-01' })] });
    const items = await service.notifications(as('coo-01', 'COORDINATOR'));
    expect(items[0]).toMatchObject({ type: 'rejection', audienceRole: 'organiser' });
  });

  /**
   * CLARIFY-NOTIF-04-A (SPM-177 DoD3): Organiser and Coordinator can mark their notice read (the query carries the
   * clarification types and the recipient); a call that updates no row is not found.
   * Kills: the read allow-list missing the types, a read call not scoped to the recipient.
   */
  it('CLARIFY-NOTIF-04-A marks a clarification notice read for the Organiser and Coordinator, scoped to the recipient', async () => {
    db.query.mockResolvedValue({ rows: [{ id: NOTICE }] });
    for (const user of [as('org-01', 'ORGANISER'), as('coo-01', 'COORDINATOR')]) {
      db.query.mockClear();
      await expect(service.readNotification(NOTICE, user)).resolves.toEqual({ success: true });
      const [sql, params] = db.query.mock.calls[0] as [string, [string, string, string[]]];
      expect(sql).toContain('recipient_id = $2');
      expect(params[1]).toBe(user.uid);
      for (const type of TYPES) expect(params[2]).toContain(type);
    }
  });

  /** CLARIFY-NOTIF-04-A: a notice the caller cannot read (no row updated) is not found. */
  it('CLARIFY-NOTIF-04-A reports not found when no row was updated', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(service.readNotification(NOTICE, as('org-01', 'ORGANISER'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
