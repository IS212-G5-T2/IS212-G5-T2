/*
 * SPM-165 (tentative hold decision notification, Coordinator): which roles read and mark read the tentative hold
 * decision notices, and the shape the feed returns for them. Unit level: the database is a fixture that records the
 * query and returns fixed rows; the e2e suite (test/tentative-hold-decision-notifications.e2e-spec.ts) runs the same
 * rules against PostgreSQL.
 * Cases: VENUE-HOLD-NOTIF-01-F, 03-G, 04-B.
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';

const db = { query: vi.fn(), transaction: vi.fn() };
const EVENT = '11111111-1111-4111-8111-111111111301';
const HOLD = '22222222-2222-4222-8222-222222222401';
const NOTICE = '33333333-3333-4333-8333-333333333501';
const as = (uid: string, ...roles: string[]): AuthenticatedUser => ({ uid, roles, email: `${uid}@example.test`, name: uid });
const row = (overrides: Record<string, unknown> = {}) => ({
  id: NOTICE,
  recipient_id: 'coo-01',
  type: 'tentative_hold_approved',
  message: 'Your tentative hold of Orchid Hall for "Gala" has been approved.',
  related_event_id: EVENT,
  related_booking_id: HOLD,
  read: false,
  created_at: new Date('2030-01-10T12:00:00.000Z'),
  event_organiser_id: 'org-01',
  event_coordinator_id: 'coo-01',
  event_name: 'Gala',
  ...overrides,
});

describe('SPM-165 tentative hold notices in the notification feed', () => {
  let service: EventsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [EventsService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(EventsService);
  });

  /**
   * VENUE-HOLD-NOTIF-01-F (SPM-165 AC1): the feed asks for the tentative hold decision types only for a Coordinator. An
   * Organiser, the Lead and an Attendee never ask for them, so the Organiser's bell cannot receive them.
   * Kills: adding the types to another role's list, or leaving them off the Coordinator list.
   */
  it.each([
    ['a Coordinator', as('coo-01', 'COORDINATOR'), true],
    ['an Organiser', as('org-01', 'ORGANISER'), false],
    ['the Lead', as('lead-01', 'COORDINATOR_LEAD'), false],
    ['an Attendee', as('att-01', 'ATTENDEE'), false],
  ])('VENUE-HOLD-NOTIF-01-F the feed for %s includes the tentative hold decision types: %s', async (_label, user, included) => {
    db.query.mockResolvedValue({ rows: [] });

    await service.notifications(user);

    const [sql, params] = db.query.mock.calls[0] as [string, [string, string[]]];
    expect(sql).toContain('n.recipient_id = $1');
    expect(params[0]).toBe(user.uid);
    expect(params[1].includes('tentative_hold_approved')).toBe(included);
    expect(params[1].includes('tentative_hold_rejected')).toBe(included);
  });

  /**
   * VENUE-HOLD-NOTIF-03-G (SPM-165 AC3): each hold notice in the feed carries the id of its hold (the bell link target)
   * and is labelled a Coordinator notice; a notice without a link carries null.
   * Kills: dropping relatedBookingId, labelling the notice Organiser.
   */
  it('VENUE-HOLD-NOTIF-03-G returns the hold id and a coordinator audience for each tentative hold notice', async () => {
    db.query.mockResolvedValue({
      rows: [row(), row({ id: 'n2', type: 'tentative_hold_rejected', related_booking_id: null })],
    });

    const items = await service.notifications(as('coo-01', 'COORDINATOR'));

    expect(items).toMatchObject([
      { id: NOTICE, type: 'tentative_hold_approved', audienceRole: 'coordinator', relatedEventId: EVENT, relatedBookingId: HOLD, read: false },
      { id: 'n2', type: 'tentative_hold_rejected', audienceRole: 'coordinator', relatedBookingId: null },
    ]);
    expect(items[0].createdAt).toBe('2030-01-10T12:00:00.000Z');
  });

  /**
   * VENUE-HOLD-NOTIF-04-B (SPM-165 AC4): a Coordinator can mark a hold notice read, scoped to their own notices; an
   * Organiser's call carries no hold types and finds nothing.
   * Kills: the read allow-list missing the hold types, a read call not scoped to the recipient.
   */
  it('VENUE-HOLD-NOTIF-04-B marks a tentative hold notice read for the Coordinator only', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: NOTICE }] }).mockResolvedValueOnce({ rows: [] });

    await expect(service.readNotification(NOTICE, as('coo-01', 'COORDINATOR'))).resolves.toEqual({ success: true });
    const [sql, params] = db.query.mock.calls[0] as [string, [string, string, string[]]];
    expect(sql).toContain('recipient_id = $2');
    expect(params[1]).toBe('coo-01');
    expect(params[2]).toEqual(expect.arrayContaining(['tentative_hold_approved', 'tentative_hold_rejected']));

    await expect(service.readNotification(NOTICE, as('org-01', 'ORGANISER'))).rejects.toBeInstanceOf(NotFoundException);
    const organiserTypes = (db.query.mock.calls[1] as [string, [string, string, string[]]])[1][2];
    expect(organiserTypes).not.toContain('tentative_hold_approved');
  });
});
