/*
 * SPM-136 AC6 (TR-136-05, RR-136-05, CQ F1): the EventCancelled notice is labelled by the reader's relation to the
 * event, not by the reader's roles. The event row (joined on related_event_id) says who organised it: a recipient who
 * is that organiser reads the organiser copy, the assigned coordinator reads the coordinator copy, and any other
 * recipient (a Registered or Waitlisted attendee) reads the attendee copy. Unit level, database faked.
 * Mutant IDs in each "Kills:" line are defined in backend/scripts/mutation/spm136.mutants.mjs.
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

  // Kills: N1 (the organiser's copy labelled as the attendee copy)
  it('CANCEL-EVENT-06-A: the organiser who submitted the event reads the organiser copy', async () => {
    // Arrange: the organiser's unread notice for the event the organiser submitted
    db.query.mockResolvedValue({ rows: [notice('org-01', 'org-01')] });
    const organiser: AuthenticatedUser = { uid: 'org-01', roles: ['ORGANISER'], email: 'o@example.test', name: 'Organiser 1' };

    // Act: the organiser reads the notifications
    const [item] = await service.notifications(organiser);

    // Assert
    expect(item).toMatchObject({ type: 'EventCancelled', audienceRole: 'organiser', read: false });
  });

  // Kills: N2 (the coordinator's copy labelled as the attendee copy)
  it('CANCEL-EVENT-06-A: the assigned coordinator reads the coordinator copy', async () => {
    // Arrange: the assigned coordinator's unread notice for the event
    db.query.mockResolvedValue({ rows: [notice('coo-01', 'org-01')] });
    const coordinator: AuthenticatedUser = { uid: 'coo-01', roles: ['COORDINATOR'], email: 'c@example.test', name: 'Coordinator 1' };

    // Act: the coordinator reads the notifications
    const [item] = await service.notifications(coordinator);

    // Assert
    expect(item).toMatchObject({ type: 'EventCancelled', audienceRole: 'coordinator', read: false });
  });

  // Kills: N3 (the attendee's copy labelled as the organiser copy: the default branch)
  it('CANCEL-EVENT-06-A-ATT: TR-136-21(a): a Waitlisted attendee who is neither organiser nor coordinator reads the attendee copy', async () => {
    // Arrange: att-04 holds only the ATTENDEE role and is neither the organiser (org-01) nor the coordinator (coo-01)
    db.query.mockResolvedValue({ rows: [notice('att-04', 'org-01')] });
    const attendee: AuthenticatedUser = { uid: 'att-04', roles: ['ATTENDEE'], email: 'a4@example.test', name: 'Attendee 4' };

    // Act: the attendee reads the notifications
    const [item] = await service.notifications(attendee);

    // Assert
    expect(item).toMatchObject({ type: 'EventCancelled', audienceRole: 'attendee', read: false });
  });

  // Kills: N4 (the label taken from the reader's roles: an ORGANISER role reads the organiser copy)
  it('CANCEL-EVENT-06-A-DUAL: RR-136-05: a user holding BOTH roles who is only the assigned coordinator of the event reads the coordinator copy', async () => {
    // Arrange: coo-01 has the ORGANISER and COORDINATOR roles, but org-01 organised this event
    db.query.mockResolvedValue({ rows: [notice('coo-01', 'org-01')] });
    const dualRole: AuthenticatedUser = {
      uid: 'coo-01',
      roles: ['ORGANISER', 'COORDINATOR'],
      email: 'c@example.test',
      name: 'Dual 1',
    };

    // Act: the dual-role user reads the notifications
    const [item] = await service.notifications(dualRole);

    // Assert: the relation to the event decides, not the role list
    expect(item).toMatchObject({ type: 'EventCancelled', audienceRole: 'coordinator' });
  });
});
