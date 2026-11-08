/*
 * SPM-134 (tentative hold expiry notifications, Coordinator): which roles read and mark read the hold reminder,
 * expired, released and converted notices, and the shape the feed returns for them. Unit level: the database is a
 * fixture that records the query and returns fixed rows; the e2e suite (test/tentative-hold-lifecycle-notifications
 * .e2e-spec.ts) runs the same rules against PostgreSQL.
 * Cases: HOLD-EXP-NOTIF-01-F, 06-A, 07-C.
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser, UserRole } from '../auth/types/auth.models.js';

const db = { query: vi.fn(), transaction: vi.fn() };
const EVENT = '11111111-1111-4111-8111-111111111301';
const HOLD = '22222222-2222-4222-8222-222222222401';
const NOTICE = '33333333-3333-4333-8333-333333333501';
const TYPES = [
  'tentative_hold_expiry_reminder',
  'tentative_hold_expired',
  'tentative_hold_released',
  'tentative_hold_converted',
];
const as = (uid: string, ...roles: UserRole[]): AuthenticatedUser => ({ uid, roles, email: `${uid}@example.test`, name: uid });
const row = (overrides: Record<string, unknown> = {}) => ({
  id: NOTICE,
  recipient_id: 'coo-01',
  type: 'tentative_hold_expiry_reminder',
  message: 'Your tentative hold of Orchid Hall for "Gala" expires on 12 Jan 2030, 19:00 SGT.',
  related_event_id: EVENT,
  related_booking_id: HOLD,
  read: false,
  created_at: new Date('2030-01-10T12:00:00.000Z'),
  event_organiser_id: 'org-01',
  event_coordinator_id: 'coo-01',
  event_name: 'Gala',
  ...overrides,
});

describe('SPM-134 hold lifecycle notices in the notification feed', () => {
  let service: EventsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [EventsService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(EventsService);
  });

  // Traceability: Jira 134 AC1 (matrix 41582744)
  /**
   * HOLD-EXP-NOTIF-01-F (SPM-134 AC1): the feed asks for the four hold lifecycle types only for a Coordinator, so an
   * Organiser's, the Lead's or an Attendee's bell cannot receive them, and the query is scoped to the signed-in user.
   * Kills: adding the types to another role's list, or leaving one off the Coordinator list.
   */
  it.each([
    ['a Coordinator', as('coo-01', 'COORDINATOR'), true],
    ['an Organiser', as('org-01', 'ORGANISER'), false],
    ['the Lead', as('lead-01', 'COORDINATOR_LEAD'), false],
    ['an Attendee', as('att-01', 'ATTENDEE'), false],
  ])('HOLD-EXP-NOTIF-01-F the feed for %s includes the hold lifecycle types: %s', async (_label, user, included) => {
    db.query.mockResolvedValue({ rows: [] });

    await service.notifications(user);

    const [sql, params] = db.query.mock.calls[0] as [string, [string, string[]]];
    expect(sql).toContain('n.recipient_id = $1');
    expect(params[0]).toBe(user.uid);
    for (const type of TYPES) expect(params[1].includes(type)).toBe(included);
  });

  // Traceability: Jira 134 AC6 (matrix 41582744)
  /**
   * HOLD-EXP-NOTIF-06-A (SPM-134 AC6): each lifecycle notice in the feed carries the id of its hold (the bell link target)
   * and is labelled a Coordinator notice. A non-hold notice (EventApproved) is the control and keeps the Organiser label.
   * Kills: dropping relatedBookingId, labelling a lifecycle notice Organiser, labelling every notice Coordinator.
   */
  it('HOLD-EXP-NOTIF-06-A returns the hold id and a coordinator audience for each hold lifecycle notice', async () => {
    db.query.mockResolvedValue({
      rows: [
        ...TYPES.map((type, i) => row({ id: `n${i}`, type })),
        row({ id: 'nx', type: 'EventApproved', related_booking_id: null }),
      ],
    });

    const items = await service.notifications(as('coo-01', 'COORDINATOR'));

    expect(items.slice(0, 4)).toMatchObject(
      TYPES.map((type, i) => ({ id: `n${i}`, type, audienceRole: 'coordinator', relatedEventId: EVENT, relatedBookingId: HOLD, read: false })),
    );
    expect(items[4]).toMatchObject({ id: 'nx', type: 'EventApproved', audienceRole: 'organiser' });
    expect(items[0].createdAt).toBe('2030-01-10T12:00:00.000Z');
  });

  // Traceability: Jira 134 AC7 (matrix 41582744)
  /**
   * HOLD-EXP-NOTIF-07-C (SPM-134 AC7): a Coordinator can mark a hold lifecycle notice read, scoped to their own notices;
   * an Organiser's call carries none of the types and finds nothing.
   * Kills: the read allow-list missing a type, a read call not scoped to the recipient.
   */
  it('HOLD-EXP-NOTIF-07-C marks a hold lifecycle notice read for the Coordinator only', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: NOTICE }] }).mockResolvedValueOnce({ rows: [] });

    await expect(service.readNotification(NOTICE, as('coo-01', 'COORDINATOR'))).resolves.toEqual({ success: true });
    const [sql, params] = db.query.mock.calls[0] as [string, [string, string, string[]]];
    expect(sql).toContain('recipient_id = $2');
    expect(params[1]).toBe('coo-01');
    expect(params[2]).toEqual(expect.arrayContaining(TYPES));

    await expect(service.readNotification(NOTICE, as('org-01', 'ORGANISER'))).rejects.toBeInstanceOf(NotFoundException);
    const organiserTypes = (db.query.mock.calls[1] as [string, [string, string, string[]]])[1][2];
    for (const type of TYPES) expect(organiserTypes).not.toContain(type);
  });
});
