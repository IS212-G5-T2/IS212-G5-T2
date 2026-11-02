/*
 * SPM-162 (Event Cancellation Request Outcome, Organiser): which roles read and mark read the request-outcome
 * notices, and the shape the feed returns for them. Unit level: the database is a fixture that records the query and
 * returns fixed rows; test/cancellation-request-outcome.e2e-spec.ts runs the same rules against PostgreSQL.
 * Cases: CANCEL-OUTCOME-01-F, 04-A, 05-C.
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';

const db = { query: vi.fn(), transaction: vi.fn() };
const EVENT = '11111111-1111-4111-8111-111111111301';
const NOTICE = '33333333-3333-4333-8333-333333333501';
const as = (uid: string, ...roles: string[]): AuthenticatedUser => ({ uid, roles, email: `${uid}@example.test`, name: uid });
const row = (overrides: Record<string, unknown> = {}) => ({
  id: NOTICE,
  recipient_id: 'org-01',
  type: 'cancellation_request_accepted',
  message: 'Your cancellation request for "Gala" was accepted. The event is cancelled.',
  related_event_id: EVENT,
  related_booking_id: null,
  read: false,
  created_at: new Date('2026-11-02T08:30:00.000Z'),
  event_organiser_id: 'org-01',
  event_coordinator_id: 'coo-01',
  event_name: 'Gala',
  ...overrides,
});

describe('SPM-162 cancellation request outcome notices in the notification feed', () => {
  let service: EventsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [EventsService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(EventsService);
  });

  /**
   * CANCEL-OUTCOME-01-F (SPM-162 AC1): the feed asks for the two outcome types only for an Organiser. A Coordinator,
   * the Lead and an Attendee never ask for them.
   * Kills: the types missing from the Organiser list, or added to the Coordinator, Lead or Attendee list.
   */
  it.each([
    ['an Organiser', as('org-01', 'ORGANISER'), true],
    ['a Coordinator', as('coo-01', 'COORDINATOR'), false],
    ['the Lead', as('lead-01', 'COORDINATOR_LEAD'), false],
    ['an Attendee', as('att-01', 'ATTENDEE'), false],
  ])('CANCEL-OUTCOME-01-F the feed for %s includes the request outcome types: %s', async (_label, user, included) => {
    db.query.mockResolvedValue({ rows: [] });

    await service.notifications(user);

    const [sql, params] = db.query.mock.calls[0] as [string, [string, string[]]];
    expect(sql).toContain('n.recipient_id = $1');
    expect(params[0]).toBe(user.uid);
    expect(params[1].includes('cancellation_request_accepted')).toBe(included);
    expect(params[1].includes('cancellation_request_declined')).toBe(included);
  });

  /**
   * CANCEL-OUTCOME-04-A (SPM-162 AC4): each outcome notice in the feed carries the id of its event (the bell link
   * target) and is labelled an Organiser notice, with the notice's own timestamp.
   * Kills: dropping relatedEventId from the response, labelling the notice Coordinator or Attendee.
   */
  it('CANCEL-OUTCOME-04-A returns the event id, an organiser audience and the stored time for each outcome notice', async () => {
    db.query.mockResolvedValue({
      rows: [row(), row({ id: 'n2', type: 'cancellation_request_declined' })],
    });

    const items = await service.notifications(as('org-01', 'ORGANISER'));

    expect(items).toMatchObject([
      { id: NOTICE, type: 'cancellation_request_accepted', audienceRole: 'organiser', relatedEventId: EVENT, read: false },
      { id: 'n2', type: 'cancellation_request_declined', audienceRole: 'organiser', relatedEventId: EVENT },
    ]);
    expect(items[0].createdAt).toBe('2026-11-02T08:30:00.000Z');
  });

  /**
   * CANCEL-OUTCOME-05-C (SPM-162 AC5): an Organiser can mark an outcome notice read, limited to their own notices of
   * the types they may read; a Coordinator's call carries no outcome types and finds nothing.
   * Kills: the read allow-list missing the outcome types, a read call not scoped to the recipient.
   */
  it('CANCEL-OUTCOME-05-C marks an outcome notice read for the Organiser only', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: NOTICE }] }).mockResolvedValueOnce({ rows: [] });

    await expect(service.readNotification(NOTICE, as('org-01', 'ORGANISER'))).resolves.toEqual({ success: true });
    const [sql, params] = db.query.mock.calls[0] as [string, [string, string, string[]]];
    expect(sql).toContain('recipient_id = $2');
    expect(params[1]).toBe('org-01');
    expect(params[2]).toEqual(expect.arrayContaining(['cancellation_request_accepted', 'cancellation_request_declined']));

    await expect(service.readNotification(NOTICE, as('coo-01', 'COORDINATOR'))).rejects.toBeInstanceOf(NotFoundException);
    const coordinatorTypes = (db.query.mock.calls[1] as [string, [string, string, string[]]])[1][2];
    expect(coordinatorTypes).not.toContain('cancellation_request_accepted');
  });
});
