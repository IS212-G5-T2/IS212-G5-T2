/*
 * SPM-157 history access rule and sections per viewer (AC1 to AC4, AC7 to AC9). The repository is a
 * fake; the real queries run in test/event-history.e2e-spec.ts.
 */
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import type { EventHistoryRepository } from './event-history.repository.js';
import { EventHistoryService, viewerOf } from './event-history.service.js';
import type { HistorySources } from './event-history.types.js';

const EVENT_ID = '00000157-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-02T12:00:00.000Z');
const coordinator: AuthenticatedUser = { uid: 'coord-1', roles: ['COORDINATOR'] };
const organiser: AuthenticatedUser = { uid: 'org-1', roles: ['ORGANISER'] };

const sources: HistorySources = {
  auditLog: [
    { id: '1', section: 'event', action: 'submitted', subject_label: null, changes: [], reason: null, actor_name: 'Organiser One', actor_kind: 'user', occurred_at: new Date('2026-11-01T00:00:00Z') },
    { id: '2', section: 'venue_booking', action: 'booking_requested', subject_label: 'Hall', changes: [], reason: null, actor_name: 'Coordinator One', actor_kind: 'user', occurred_at: new Date('2026-11-01T01:00:00Z') },
    { id: '3', section: 'equipment', action: 'equipment_requested', subject_label: '1 x Mic', changes: [], reason: null, actor_name: 'Coordinator One', actor_kind: 'user', occurred_at: new Date('2026-11-01T02:00:00Z') },
    { id: '4', section: 'registration', action: 'registered', subject_label: 'Attendee', changes: [], reason: null, actor_name: 'Attendee', actor_kind: 'user', occurred_at: new Date('2026-11-01T03:00:00Z') },
  ],
  flaggedChanges: [],
  changeRequests: [],
  changeRequestOutcomes: [],
  cancellationRequests: [],
  expiredHolds: [],
};

function setup(event: Record<string, unknown> | null = {
  id: EVENT_ID, event_name: 'Alumni Night', status: 'Completed', organiser_id: 'org-1', coordinator_id: 'coord-1',
}) {
  const repository = {
    findEvent: vi.fn().mockResolvedValue(event ?? undefined),
    readSources: vi.fn().mockResolvedValue(sources),
  };
  const service = new EventHistoryService(repository as unknown as EventHistoryRepository, { now: () => NOW });
  return { repository, service };
}

describe('SPM-157 EventHistoryService', () => {
  /** AUDIT-HISTORY-01-A to 04-A: the assigned coordinator reads all four sections. */
  it('AUDIT-HISTORY-01-A gives the assigned coordinator all four sections, read with the injected clock', async () => {
    const { repository, service } = setup();
    const result = await service.history(coordinator, EVENT_ID);
    expect(repository.readSources).toHaveBeenCalledWith(EVENT_ID, ['event', 'venue_booking', 'equipment', 'registration'], NOW);
    expect(result).toMatchObject({ eventId: EVENT_ID, eventName: 'Alumni Night', eventStatus: 'Completed', viewer: 'coordinator' });
    expect(Object.keys(result.sections)).toEqual(['event', 'venueBookings', 'equipment', 'registrations']);
    expect(result.sections.venueBookings?.map((item) => item.summary)).toEqual(['Venue booking requested']);
  });

  /** AUDIT-HISTORY-08-A: the owning organiser reads event and registration history only. */
  it('AUDIT-HISTORY-08-A gives the owning organiser the event and registration sections only', async () => {
    const { repository, service } = setup();
    const result = await service.history(organiser, EVENT_ID);
    expect(repository.readSources).toHaveBeenCalledWith(EVENT_ID, ['event', 'registration'], NOW);
    expect(result.viewer).toBe('organiser');
    expect(Object.keys(result.sections)).toEqual(['event', 'registrations']);
  });

  /** AUDIT-HISTORY-09-A: anyone else, including a previous coordinator, is refused. */
  it.each([
    ['another coordinator', { uid: 'coord-2', roles: ['COORDINATOR'] }],
    ['another organiser', { uid: 'org-2', roles: ['ORGANISER'] }],
    ['the organiser id without the organiser role', { uid: 'org-1', roles: ['ATTENDEE'] }],
    ['the coordinator id without the coordinator role', { uid: 'coord-1', roles: ['VENUE_STAFF'] }],
    ['the Lead', { uid: 'lead-1', roles: ['COORDINATOR_LEAD'] }],
  ] as [string, AuthenticatedUser][])('AUDIT-HISTORY-09-A refuses %s with 403', async (_label, identity) => {
    const { repository, service } = setup();
    await expect(service.history(identity, EVENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.readSources).not.toHaveBeenCalled();
  });

  /** AUDIT-HISTORY-09-B: unknown or malformed id 404; no session 401. */
  it('AUDIT-HISTORY-09-B answers 404 for an unknown or malformed event and 401 without a session', async () => {
    const { repository, service } = setup(null);
    await expect(service.history(coordinator, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.history(coordinator, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findEvent).toHaveBeenCalledTimes(1);
    await expect(service.history(undefined, EVENT_ID)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /** AUDIT-HISTORY-08-A: a user who is both the assigned coordinator and the owner gets the coordinator view. */
  it('AUDIT-HISTORY-08-A prefers the coordinator view for a user holding both roles on the event', () => {
    expect(viewerOf({ uid: 'u', roles: ['ORGANISER', 'COORDINATOR'] }, { organiser_id: 'u', coordinator_id: 'u' })).toBe('coordinator');
    expect(viewerOf({ uid: 'u', roles: ['ORGANISER', 'COORDINATOR'] }, { organiser_id: 'u', coordinator_id: null })).toBe('organiser');
  });
});
