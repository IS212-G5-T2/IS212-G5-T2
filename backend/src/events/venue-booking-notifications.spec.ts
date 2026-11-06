/*
 * SPM-137 (venue booking decision notification, Coordinator): which roles read and mark read the booking decision
 * notices, and the shape the feed returns for them. Unit level: the database is a fixture that records the query
 * and returns fixed rows, so these cases show what the service asks for and how it maps the answer; the e2e suite
 * (test/venue-booking-decision-notifications.e2e-spec.ts) runs the same rules against PostgreSQL.
 * Cases: VENUE-BOOK-NOTIF-01-F, 03-N, 04-F.
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser, UserRole } from '../auth/types/auth.models.js';

const db = { query: vi.fn(), transaction: vi.fn() };
const EVENT = '11111111-1111-4111-8111-111111111301';
const BOOKING = '22222222-2222-4222-8222-222222222401';
const NOTICE = '33333333-3333-4333-8333-333333333501';
const as = (uid: string, ...roles: UserRole[]): AuthenticatedUser => ({ uid, roles, email: `${uid}@example.test`, name: uid });
const row = (overrides: Record<string, unknown> = {}) => ({
  id: NOTICE,
  recipient_id: 'coo-01',
  type: 'venue_booking_approved',
  message: 'Your booking of Orchid Hall for "Gala" has been approved.',
  related_event_id: EVENT,
  related_booking_id: BOOKING,
  read: false,
  created_at: new Date('2030-01-10T12:00:00.000Z'),
  event_organiser_id: 'org-01',
  event_coordinator_id: 'coo-01',
  event_name: 'Gala',
  ...overrides,
});

describe('SPM-137 venue booking notices in the notification feed', () => {
  let service: EventsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [EventsService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(EventsService);
  });

  /**
   * VENUE-BOOK-NOTIF-01-F (SPM-137 AC1): the feed asks for the booking decision types only for a Coordinator. An
   * Organiser, the Lead and an Attendee never ask for them, so the Organiser's bell cannot receive them.
   * Kills: adding the types to the Organiser, Lead or Attendee list, or leaving them off the Coordinator list.
   */
  it.each([
    ['a Coordinator', as('coo-01', 'COORDINATOR'), true],
    ['an Organiser', as('org-01', 'ORGANISER'), false],
    ['the Lead', as('lead-01', 'COORDINATOR_LEAD'), false],
    ['an Attendee', as('att-01', 'ATTENDEE'), false],
  ])('VENUE-BOOK-NOTIF-01-F the feed for %s includes the booking decision types: %s', async (_label, user, included) => {
    // Arrange: an empty feed, so only the query matters.
    db.query.mockResolvedValue({ rows: [] });

    // Act.
    await service.notifications(user);

    // Assert: the allow-list passed to the query, and the recipient filter.
    const [sql, params] = db.query.mock.calls[0] as [string, [string, string[]]];
    expect(sql).toContain('n.recipient_id = $1');
    expect(params[0]).toBe(user.uid);
    expect(params[1].includes('venue_booking_approved')).toBe(included);
    expect(params[1].includes('venue_booking_rejected')).toBe(included);
  });

  /**
   * VENUE-BOOK-NOTIF-03-N (SPM-137 AC3): each booking notice in the feed carries the id of its booking (the bell link
   * target) and is labelled a Coordinator notice; a notice without a booking link carries null.
   * Any other notice type (here an Organiser change-request decision) still falls through to its own label.
   * Kills: dropping relatedBookingId from the response, the query not selecting it, labelling the notice Organiser,
   * labelling every other notice type Coordinator.
   */
  it('VENUE-BOOK-NOTIF-03-N returns the booking id and a coordinator audience for each booking notice', async () => {
    db.query.mockResolvedValue({
      rows: [row(), row({ id: 'n2', type: 'venue_booking_rejected', related_booking_id: null })],
    });

    const items = await service.notifications(as('coo-01', 'COORDINATOR'));

    expect(items).toMatchObject([
      { id: NOTICE, type: 'venue_booking_approved', audienceRole: 'coordinator', relatedEventId: EVENT, relatedBookingId: BOOKING, read: false },
      { id: 'n2', type: 'venue_booking_rejected', audienceRole: 'coordinator', relatedBookingId: null },
    ]);
    expect(items[0].createdAt).toBe('2030-01-10T12:00:00.000Z');

    // A non-booking type does not take the booking branch: it keeps the Organiser label.
    db.query.mockResolvedValue({
      rows: [row({ id: 'n3', recipient_id: 'org-01', type: 'change_request_approved', related_booking_id: null })],
    });
    const [other] = await service.notifications(as('org-01', 'ORGANISER'));
    expect(other).toMatchObject({ id: 'n3', type: 'change_request_approved', audienceRole: 'organiser' });
  });

  /**
   * VENUE-BOOK-NOTIF-04-F (SPM-137 AC4): a Coordinator can mark a booking notice read, and the read call is limited to
   * the caller's own notices of the types they may read; an Organiser's call carries no booking types and finds nothing.
   * Kills: the read allow-list missing the booking types, a read call not scoped to the recipient.
   */
  it('VENUE-BOOK-NOTIF-04-F marks a booking notice read for the Coordinator only', async () => {
    // Arrange: the Coordinator's update finds the row; the Organiser's finds nothing.
    db.query.mockResolvedValueOnce({ rows: [{ id: NOTICE }] }).mockResolvedValueOnce({ rows: [] });

    // Act + Assert: Coordinator succeeds with their own id and the allow-list.
    await expect(service.readNotification(NOTICE, as('coo-01', 'COORDINATOR'))).resolves.toEqual({ success: true });
    const [sql, params] = db.query.mock.calls[0] as [string, [string, string, string[]]];
    expect(sql).toContain('recipient_id = $2');
    expect(params[1]).toBe('coo-01');
    expect(params[2]).toEqual(expect.arrayContaining(['venue_booking_approved', 'venue_booking_rejected']));

    // The Organiser's allow-list excludes them, so their call is told the notification does not exist.
    await expect(service.readNotification(NOTICE, as('org-01', 'ORGANISER'))).rejects.toBeInstanceOf(NotFoundException);
    const organiserTypes = (db.query.mock.calls[1] as [string, [string, string, string[]]])[1][2];
    expect(organiserTypes).not.toContain('venue_booking_approved');
  });
});
