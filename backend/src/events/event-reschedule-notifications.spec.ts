/*
 * SPM-181 (Event Change Notification, Attendee): who reads and marks read the "event rescheduled" notice, and the
 * shape the feed returns for it. Unit level: the database is a fixture that records the query and returns fixed
 * rows; test/event-reschedule-notification.e2e-spec.ts runs the same rules against PostgreSQL.
 * Cases: EVENT-CHANGE-NOTIF-06-A, 06-B, 06-C.
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser, UserRole } from '../auth/types/auth.models.js';

const db = { query: vi.fn(), transaction: vi.fn() };
const EVENT = '11111111-1111-4111-8111-111111111811';
const NOTICE = '33333333-3333-4333-8333-333333333811';
const MESSAGE = '"Gala" has been rescheduled. It now runs 5 Dec 2026, 10:00 am to 5 Dec 2026, 12:00 pm (SGT).';
const as = (uid: string, ...roles: UserRole[]): AuthenticatedUser => ({ uid, roles, email: `${uid}@example.test`, name: uid });
const row = (overrides: Record<string, unknown> = {}) => ({
  id: NOTICE,
  recipient_id: 'att-01',
  type: 'EventRescheduled',
  message: MESSAGE,
  related_event_id: EVENT,
  related_booking_id: null,
  read: false,
  created_at: new Date('2026-11-04T03:00:00.000Z'),
  event_organiser_id: 'org-01',
  event_coordinator_id: 'coo-01',
  event_name: 'Gala',
  ...overrides,
});

describe('SPM-181 event rescheduled notices in the notification feed', () => {
  let service: EventsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [EventsService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(EventsService);
  });

  /**
   * EVENT-CHANGE-NOTIF-06-A (AC6): the feed asks for the rescheduled type only for an Attendee, filtered by recipient.
   * An Organiser, a Coordinator and the Lead never ask for it.
   * Kills: the type missing from the Attendee list, or added to another role's list.
   */
  it.each([
    ['an Attendee', true, as('att-01', 'ATTENDEE')],
    ['an Organiser', false, as('org-01', 'ORGANISER')],
    ['a Coordinator', false, as('coo-01', 'COORDINATOR')],
    ['the Lead', false, as('lead-01', 'COORDINATOR_LEAD')],
  ])('EVENT-CHANGE-NOTIF-06-A the feed for %s includes the rescheduled type: %s', async (_label, included, user) => {
    db.query.mockResolvedValue({ rows: [] });

    await service.notifications(user);

    const [sql, params] = db.query.mock.calls[0] as [string, [string, string[]]];
    expect(sql).toContain('n.recipient_id = $1');
    expect(params[0]).toBe(user.uid);
    expect(params[1].includes('EventRescheduled')).toBe(included);
  });

  /**
   * EVENT-CHANGE-NOTIF-06-B (AC2, AC6): the notice in the feed carries the event id (the link target), is labelled an
   * Attendee notice and keeps the stored message and time, unread.
   * Kills: dropping relatedEventId, labelling the notice Organiser, reshaping the message or the time.
   */
  it('EVENT-CHANGE-NOTIF-06-B returns the event id, an attendee audience, the message and the stored time', async () => {
    db.query.mockResolvedValue({ rows: [row()] });

    const items = await service.notifications(as('att-01', 'ATTENDEE'));

    expect(items).toMatchObject([
      { id: NOTICE, type: 'EventRescheduled', audienceRole: 'attendee', relatedEventId: EVENT, read: false, message: MESSAGE },
    ]);
    expect(items[0].createdAt).toBe('2026-11-04T03:00:00.000Z');
  });

  /**
   * EVENT-CHANGE-NOTIF-06-B (AC6): only the rescheduled type is labelled an attendee notice by this rule; another notice
   * type in the same feed keeps its own audience (an Organiser's cancellation notice stays an Organiser notice).
   * Kills: labelling every notice an attendee notice.
   */
  it('EVENT-CHANGE-NOTIF-06-B leaves the audience of other notice types unchanged', async () => {
    db.query.mockResolvedValue({
      rows: [row({ id: 'n-c', recipient_id: 'org-01', type: 'EventCancelled', message: 'Gala has been cancelled.' })],
    });

    const items = await service.notifications(as('org-01', 'ORGANISER'));

    expect(items).toMatchObject([{ id: 'n-c', type: 'EventCancelled', audienceRole: 'organiser' }]);
  });

  /**
   * EVENT-CHANGE-NOTIF-06-C (AC6): an Attendee can mark the notice read, limited to their own notices of the types they
   * may read; an Organiser's call does not carry the type and finds nothing.
   * Kills: the read allow-list missing the type, a read call not scoped to the recipient.
   */
  it('EVENT-CHANGE-NOTIF-06-C marks a rescheduled notice read for the Attendee only', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: NOTICE }] }).mockResolvedValueOnce({ rows: [] });

    await expect(service.readNotification(NOTICE, as('att-01', 'ATTENDEE'))).resolves.toEqual({ success: true });
    const [sql, params] = db.query.mock.calls[0] as [string, [string, string, string[]]];
    expect(sql).toContain('recipient_id = $2');
    expect(params[1]).toBe('att-01');
    expect(params[2]).toContain('EventRescheduled');

    await expect(service.readNotification(NOTICE, as('org-01', 'ORGANISER'))).rejects.toBeInstanceOf(NotFoundException);
    const organiserTypes = (db.query.mock.calls[1] as [string, [string, string, string[]]])[1][2];
    expect(organiserTypes).not.toContain('EventRescheduled');
  });
});
