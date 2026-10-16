/*
 * SPM-136 AC6 (TR-136-05, RR-136-05, CQ F1): the EventCancelled notice is labelled by the reader's relation to the
 * event, not by the reader's roles. The event row (joined on related_event_id) says who organised it: a recipient who
 * is that organiser reads the organiser copy, the assigned coordinator reads the coordinator copy, and any other
 * recipient (a Registered or Waitlisted attendee) reads the attendee copy. Unit level, database faked.
 */
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';

const db = { query: vi.fn(), transaction: vi.fn() };
const EVENT = '11111111-1111-4111-8111-111111111301';
const notice = (recipient: string, eventOrganiser: string) => ({
  id: `notice-${recipient}`,
  recipient_id: recipient,
  type: 'EventCancelled',
  message: 'Annual Gala Dinner has been cancelled.',
  related_event_id: EVENT,
  read: false,
  created_at: new Date('2026-10-12T04:00:00.000Z'),
  event_organiser_id: eventOrganiser,
  event_coordinator_id: 'coo-01',
});

describe('CANCEL-EVENT-06-A (TR-136-05, RR-136-05): audience of the EventCancelled notice', () => {
  let service: EventsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [EventsService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = module.get(EventsService);
  });

  it('CANCEL-EVENT-06-A: the organiser who submitted the event reads the organiser copy', async () => {
    db.query.mockResolvedValue({ rows: [notice('org-01', 'org-01')] });
    const organiser: AuthenticatedUser = { uid: 'org-01', roles: ['ORGANISER'], email: 'o@example.test', name: 'Organiser 1' };
    const [item] = await service.notifications(organiser);
    expect(item).toMatchObject({ type: 'EventCancelled', audienceRole: 'organiser', read: false });
  });

  it('CANCEL-EVENT-06-A: the assigned coordinator reads the coordinator copy', async () => {
    db.query.mockResolvedValue({ rows: [notice('coo-01', 'org-01')] });
    const coordinator: AuthenticatedUser = { uid: 'coo-01', roles: ['COORDINATOR'], email: 'c@example.test', name: 'Coordinator 1' };
    const [item] = await service.notifications(coordinator);
    expect(item).toMatchObject({ type: 'EventCancelled', audienceRole: 'coordinator', read: false });
  });

  it('TR-136-21(a): a Waitlisted attendee who is neither organiser nor coordinator reads the attendee copy', async () => {
    // Arrange: att-04 holds only the ATTENDEE role and is neither the organiser (org-01) nor the coordinator (coo-01)
    db.query.mockResolvedValue({ rows: [notice('att-04', 'org-01')] });
    const attendee: AuthenticatedUser = { uid: 'att-04', roles: ['ATTENDEE'], email: 'a4@example.test', name: 'Attendee 4' };

    // Act
    const [item] = await service.notifications(attendee);

    // Assert
    expect(item).toMatchObject({ type: 'EventCancelled', audienceRole: 'attendee', read: false });
  });

  it('RR-136-05: a user holding BOTH roles who is only the assigned coordinator of the event reads the coordinator copy', async () => {
    // Arrange: coo-01 has the ORGANISER and COORDINATOR roles, but org-01 organised this event
    db.query.mockResolvedValue({ rows: [notice('coo-01', 'org-01')] });
    const dualRole: AuthenticatedUser = {
      uid: 'coo-01',
      roles: ['ORGANISER', 'COORDINATOR'],
      email: 'c@example.test',
      name: 'Dual 1',
    };

    // Act
    const [item] = await service.notifications(dualRole);

    // Assert: the relation to the event decides, not the role list
    expect(item).toMatchObject({ type: 'EventCancelled', audienceRole: 'coordinator' });
  });
});
