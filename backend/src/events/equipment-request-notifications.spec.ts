/*
 * SPM-172 (equipment request decision notification, Coordinator): which roles read and mark read the equipment decision
 * notices, and the shape the feed returns for them. Unit level: the database is a fixture that records the query and
 * returns fixed rows; the e2e suite (test/equipment-request-decision-notifications.e2e-spec.ts) runs the rules against
 * PostgreSQL.
 * Cases: EQUIP-REQ-NOTIF-01-D, 03-A, 04-A.
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser, UserRole } from '../auth/types/auth.models.js';

const db = { query: vi.fn(), transaction: vi.fn() };
const EVENT = '11111111-1111-4111-8111-111111111301';
const REQUEST = '22222222-2222-4222-8222-222222222401';
const NOTICE = '33333333-3333-4333-8333-333333333501';
const as = (uid: string, ...roles: UserRole[]): AuthenticatedUser => ({ uid, roles, email: `${uid}@example.test`, name: uid });
const row = (overrides: Record<string, unknown> = {}) => ({
  id: NOTICE,
  recipient_id: 'coo-01',
  type: 'equipment_request_reserved',
  message: 'Your equipment request for "Gala" has been reserved.',
  related_event_id: EVENT,
  related_equipment_request_id: REQUEST,
  read: false,
  created_at: new Date('2030-01-10T12:00:00.000Z'),
  event_organiser_id: 'org-01',
  event_coordinator_id: 'coo-01',
  event_name: 'Gala',
  ...overrides,
});

describe('SPM-172 equipment request notices in the notification feed', () => {
  let service: EventsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [EventsService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(EventsService);
  });

  // Traceability: Jira 172 AC1 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-01-D (SPM-172 AC1): the feed asks for the equipment decision types only for a Coordinator. An
   * Organiser, the Lead, an Attendee and Technical Support never ask for them.
   * Kills: adding the types to another role's list, or leaving them off the Coordinator list.
   */
  it.each([
    ['a Coordinator', as('coo-01', 'COORDINATOR'), true],
    ['an Organiser', as('org-01', 'ORGANISER'), false],
    ['the Lead', as('lead-01', 'COORDINATOR_LEAD'), false],
    ['an Attendee', as('att-01', 'ATTENDEE'), false],
  ])('EQUIP-REQ-NOTIF-01-D the feed for %s includes the equipment decision types: %s', async (_label, user, included) => {
    db.query.mockResolvedValue({ rows: [] });

    await service.notifications(user);

    const [sql, params] = db.query.mock.calls[0] as [string, [string, string[]]];
    expect(sql).toContain('n.recipient_id = $1');
    expect(params[1].includes('equipment_request_reserved')).toBe(included);
    expect(params[1].includes('equipment_request_cannot_provide')).toBe(included);
  });

  // Traceability: Jira 172 AC3 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-03-A (SPM-172 AC3): each equipment notice in the feed carries the id of its request (the bell link
   * target) and is labelled a Coordinator notice; a notice without a request link carries null.
   * A non-equipment Organiser notice in the same feed is not labelled a Coordinator notice by the equipment rule.
   * Kills: dropping relatedEquipmentRequestId, the query not selecting it, labelling the notice Organiser, labelling every
   * notice a Coordinator one.
   */
  it('EQUIP-REQ-NOTIF-03-A returns the request id and a coordinator audience for each equipment notice', async () => {
    db.query.mockResolvedValue({
      rows: [
        row(),
        row({ id: 'n2', type: 'equipment_request_cannot_provide', related_equipment_request_id: null }),
        row({ id: 'n3', type: 'EventStatusChanged', related_equipment_request_id: null }),
      ],
    });

    const items = await service.notifications(as('coo-01', 'COORDINATOR'));

    expect(items).toMatchObject([
      { id: NOTICE, type: 'equipment_request_reserved', audienceRole: 'coordinator', relatedEventId: EVENT, relatedEquipmentRequestId: REQUEST, read: false },
      { id: 'n2', type: 'equipment_request_cannot_provide', audienceRole: 'coordinator', relatedEquipmentRequestId: null },
      { id: 'n3', type: 'EventStatusChanged', audienceRole: 'organiser', relatedEquipmentRequestId: null },
    ]);
    expect(items[0].createdAt).toBe('2030-01-10T12:00:00.000Z');
    expect(db.query.mock.calls[0][0]).toContain('n.*');
  });

  // Traceability: Jira 172 AC4 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-04-A (SPM-172 AC4): a Coordinator can mark an equipment notice read, and the read call is limited
   * to the caller's own notices of the types they may read; an Organiser finds nothing.
   * Kills: the read allow-list missing the equipment types, a read call not scoped to the recipient.
   */
  it('EQUIP-REQ-NOTIF-04-A marks an equipment notice read for the Coordinator only', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: NOTICE }] }).mockResolvedValueOnce({ rows: [] });

    await expect(service.readNotification(NOTICE, as('coo-01', 'COORDINATOR'))).resolves.toEqual({ success: true });
    const [sql, params] = db.query.mock.calls[0] as [string, [string, string, string[]]];
    expect(sql).toContain('recipient_id = $2');
    expect(params[1]).toBe('coo-01');
    expect(params[2]).toEqual(expect.arrayContaining(['equipment_request_reserved', 'equipment_request_cannot_provide']));

    await expect(service.readNotification(NOTICE, as('org-01', 'ORGANISER'))).rejects.toBeInstanceOf(NotFoundException);
    expect((db.query.mock.calls[1] as [string, [string, string, string[]]])[1][2]).not.toContain('equipment_request_reserved');
  });
});
