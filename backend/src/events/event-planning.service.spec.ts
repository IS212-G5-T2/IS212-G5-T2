import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { TURNAROUND_MINUTES } from './event-impact.js';
import { EventPlanningRepository } from './event-planning.repository.js';
import { EventPlanningService } from './event-planning.service.js';

/**
 * SPM-97 (organiser views event information), SPM-49 (coordinator updates it)
 * and SPM-85 (coordinator reviews flagged changes). RED / TDD: the planning
 * service and repository do not exist yet. The repository is mocked so these
 * tests pin business rules, not SQL. Confluence IDs: EVENT-VIEW-*, EVENT-UPDATE-*,
 * EVENT-FLAG-*.
 */

const EVENT_ID = '00000000-0000-4000-8000-000000000049';
const NOW = new Date('2026-10-05T08:00:00.000Z');
const START = '2026-11-10T10:00:00.000Z';
const END = '2026-11-10T13:00:00.000Z';

function organiser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { uid: 'organiser-1', roles: ['ORGANISER'], email: 'org@example.test', name: 'Demo Organiser', ...overrides };
}
function coordinator(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { uid: 'coord-9', roles: ['COORDINATOR'], email: 'coord9@example.test', name: 'Coord Nine', ...overrides };
}

// Event in the planning phase, owned by organiser-1 and assigned to coord-9.
function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    organiserId: 'organiser-1',
    coordinatorId: 'coord-9',
    status: 'Planning',
    name: 'Welcome Evening',
    purpose: 'Community building',
    description: 'A welcome event for new members.',
    startDateTime: START,
    endDateTime: END,
    expectedAttendance: 80,
    layout: 'Banquet',
    facilities: ['Catering'],
    accessibility: ['Wheelchair ramps'],
    equipmentNeeds: 'Two microphones',
    updatedAt: '2026-10-04T09:00:00.000Z',
    ...overrides,
  };
}
function venueBooking(overrides: Record<string, unknown> = {}) {
  return { id: 'bk-1', venueId: 'venue-a', venueName: 'Hall A', capacity: 200, start: START, end: END, status: 'Booked', neighbours: [], ...overrides };
}
function equipment(overrides: Record<string, unknown> = {}) {
  return { id: 'eq-1', name: 'Projector', quantity: 2, status: 'Reserved', ...overrides };
}
function flaggedChange(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chg-1',
    eventId: EVENT_ID,
    kind: 'booking_conflict',
    field: 'expectedAttendance',
    originalValue: 80,
    proposedValue: 150,
    status: 'Needs Review',
    impacts: [],
    proposedBy: 'Coord Nine',
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

function makeRepo() {
  return {
    findEvent: vi.fn().mockResolvedValue(eventRow()),
    listVenueBookings: vi.fn().mockResolvedValue([]),
    listEquipmentArrangements: vi.fn().mockResolvedValue([]),
    listPendingChanges: vi.fn().mockResolvedValue([]),
    listHistory: vi.fn().mockResolvedValue([]),
    findChange: vi.fn().mockResolvedValue(undefined),
    applyFields: vi.fn(async (_id: string, patch: Record<string, unknown>, now: Date) => ({
      ...eventRow(),
      ...patch,
      updatedAt: now.toISOString(),
    })),
    createFlaggedChange: vi.fn(async (_id: string, change: Record<string, unknown>) => ({
      ...flaggedChange(),
      ...change,
      id: 'chg-1',
      status: 'Needs Review',
    })),
    resolveChange: vi.fn(async (_e: string, id: string, resolution: Record<string, unknown>) => ({
      ...flaggedChange(),
      id,
      ...resolution,
    })),
  };
}

let repo: ReturnType<typeof makeRepo>;
let service: EventPlanningService;

beforeEach(async () => {
  // Freeze only Date so timestamps are deterministic without stalling Nest's async setup.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  repo = makeRepo();
  const module = await Test.createTestingModule({
    providers: [EventPlanningService, { provide: EventPlanningRepository, useValue: repo }],
  }).compile();
  service = module.get(EventPlanningService);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SPM-97 organiser view', () => {
  // EVENT-VIEW-01-A: AC1 — the owning organiser sees info once planning has started.
  it.each(['Approved', 'Planning'])(
    'EVENT-VIEW-01-A organiser can view planning information when the event is %s',
    async (status) => {
      repo.findEvent.mockResolvedValue(eventRow({ status }));
      const view = await service.getPlanningView(organiser(), EVENT_ID);
      expect(view.event).toMatchObject({ id: EVENT_ID, name: 'Welcome Evening' });
    },
  );

  // EVENT-VIEW-01-B: AC1 — before planning there is nothing to show.
  it.each(['Submitted', 'Rejected'])(
    'EVENT-VIEW-01-B organiser gets a conflict, not data, while the event is %s',
    async (status) => {
      repo.findEvent.mockResolvedValue(eventRow({ status }));
      await expect(service.getPlanningView(organiser(), EVENT_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.listVenueBookings).not.toHaveBeenCalled();
    },
  );

  // EVENT-VIEW-01-SEC-1: only the owning organiser may look; others cannot probe for events.
  it('EVENT-VIEW-01-SEC-1 hides the event from a different organiser', async () => {
    await expect(
      service.getPlanningView(organiser({ uid: 'organiser-2' }), EVENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('EVENT-VIEW-01-SEC-1 rejects unauthenticated, attendee and malformed-id requests', async () => {
    await expect(service.getPlanningView(undefined, EVENT_ID)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.getPlanningView({ uid: 'att-1', roles: ['ATTENDEE'] }, EVENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getPlanningView(organiser(), 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
  });

  // EVENT-VIEW-02-A: AC2 — current venues, equipment and booking details, read live.
  it('EVENT-VIEW-02-A shows current venue bookings and equipment and reflects later updates', async () => {
    repo.listVenueBookings.mockResolvedValue([venueBooking(), venueBooking({ id: 'bk-2', venueName: 'Hall B' })]);
    repo.listEquipmentArrangements.mockResolvedValue([equipment()]);
    const view = await service.getPlanningView(organiser(), EVENT_ID);
    expect(view.venueBookings.map((b: { venueName: string }) => b.venueName)).toEqual(['Hall A', 'Hall B']);
    expect(view.venueBookings[0]).toMatchObject({ id: 'bk-1', start: START, end: END, status: 'Booked' });
    expect(view.equipmentArrangements).toEqual([
      expect.objectContaining({ name: 'Projector', quantity: 2, status: 'Reserved' }),
    ]);

    // The coordinator changes the booking; the next read shows it.
    repo.listVenueBookings.mockResolvedValue([venueBooking({ venueName: 'Auditorium' })]);
    const refreshed = await service.getPlanningView(organiser(), EVENT_ID);
    expect(refreshed.venueBookings.map((b: { venueName: string }) => b.venueName)).toEqual(['Auditorium']);
  });

  // EVENT-VIEW-03-A: AC3 — a change pending because of a booking conflict is surfaced.
  it('EVENT-VIEW-03-A marks a field with a conflict-driven change as pending', async () => {
    repo.listPendingChanges.mockResolvedValue([flaggedChange()]);
    const view = await service.getPlanningView(organiser(), EVENT_ID);
    expect(view.pendingChanges).toEqual([
      expect.objectContaining({
        id: 'chg-1',
        kind: 'booking_conflict',
        field: 'expectedAttendance',
        currentValue: 80,
        proposedValue: 150,
        status: 'Needs Review',
      }),
    ]);
  });

  // EVENT-VIEW-03-B: AC3 — an unavailable booked venue shows as needing a replacement.
  it('EVENT-VIEW-03-B flags a booked venue that became unavailable as needing a replacement', async () => {
    repo.listVenueBookings.mockResolvedValue([
      venueBooking({ status: 'Unavailable' }),
      venueBooking({ id: 'bk-2', venueName: 'Hall B' }),
    ]);
    const view = await service.getPlanningView(organiser(), EVENT_ID);
    expect(view.pendingChanges).toEqual([
      expect.objectContaining({
        kind: 'replacement_venue_required',
        bookingId: 'bk-1',
        venueName: 'Hall A',
        status: 'Needs Review',
      }),
    ]);
  });

  // EVENT-VIEW-04-A: AC4 — the organiser's view is read-only and the API refuses writes.
  it('EVENT-VIEW-04-A marks the organiser view read-only and rejects update and resolve calls', async () => {
    const view = await service.getPlanningView(organiser(), EVENT_ID);
    expect(view.readOnly).toBe(true);
    expect(view.editableFields).toEqual([]);

    await expect(service.updateEvent(organiser(), EVENT_ID, { name: 'Hacked' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.resolveChange(organiser(), EVENT_ID, 'chg-1', { decision: 'confirm' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.createFlaggedChange).not.toHaveBeenCalled();
    expect(repo.resolveChange).not.toHaveBeenCalled();
  });

  // EVENT-VIEW-05-A: AC5 — once the coordinator resolves a change, the next read shows it.
  it('EVENT-VIEW-05-A shows the resolved value and clears the pending flag on the next view', async () => {
    repo.listPendingChanges.mockResolvedValue([flaggedChange()]);
    const before = await service.getPlanningView(organiser(), EVENT_ID);
    expect(before.pendingChanges).toHaveLength(1);

    repo.findChange.mockResolvedValue(flaggedChange());
    await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', { decision: 'confirm' });

    repo.findEvent.mockResolvedValue(eventRow({ expectedAttendance: 150 }));
    repo.listPendingChanges.mockResolvedValue([]);
    const after = await service.getPlanningView(organiser(), EVENT_ID);
    expect(after.event.expectedAttendance).toBe(150);
    expect(after.pendingChanges).toEqual([]);
  });
});

describe('SPM-49 coordinator update', () => {
  const DIRECT_WHEN_UNBOOKED: Array<[string, Record<string, unknown>]> = [
    ['date & time', { startDateTime: '2026-11-11T10:00:00.000Z', endDateTime: '2026-11-11T13:00:00.000Z' }],
    ['attendance', { expectedAttendance: 120 }],
    ['venue requirements (layout)', { layout: 'Theatre' }],
    ['venue requirements (facilities)', { facilities: ['AV System'] }],
    ['accessibility needs', { accessibility: ['Hearing loop'] }],
    ['equipment requirements', { equipmentNeeds: 'Four microphones' }],
  ];

  // EVENT-UPDATE-01-A: AC1 — the assigned coordinator sees the current information.
  it('EVENT-UPDATE-01-A lets the assigned coordinator view current event information', async () => {
    const view = await service.getPlanningView(coordinator(), EVENT_ID);
    expect(view.readOnly).toBe(false);
    expect(view.event).toMatchObject({ name: 'Welcome Evening', expectedAttendance: 80 });
    expect(view.lastUpdatedAt).toBe('2026-10-04T09:00:00.000Z');
  });

  // EVENT-UPDATE-01-B: AC1 — a coordinator who is not assigned cannot see or change it.
  it('EVENT-UPDATE-01-B hides the event from an unassigned coordinator', async () => {
    repo.findEvent.mockResolvedValue(eventRow({ coordinatorId: 'coord-1' }));
    await expect(service.getPlanningView(coordinator(), EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateEvent(coordinator(), EVENT_ID, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.applyFields).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-01-C: updates are only allowed after approval and before confirmation.
  it.each(['Submitted', 'Rejected', 'Confirmed'])(
    'EVENT-UPDATE-01-C refuses updates while the event is %s',
    async (status) => {
      repo.findEvent.mockResolvedValue(eventRow({ status }));
      await expect(service.updateEvent(coordinator(), EVENT_ID, { name: 'X' })).rejects.toBeInstanceOf(ConflictException);
      expect(repo.applyFields).not.toHaveBeenCalled();
    },
  );

  // EVENT-UPDATE-02-A: AC2 — with nothing booked, every field is edited directly.
  it('EVENT-UPDATE-02-A labels every field as direct when nothing is booked', async () => {
    const view = await service.getPlanningView(coordinator(), EVENT_ID);
    expect(new Set(view.editableFields.map((f: { mode: string }) => f.mode))).toEqual(new Set(['direct']));
  });

  // EVENT-UPDATE-02-A: AC2 — once a booking exists, booking-affecting fields need review.
  it('EVENT-UPDATE-02-A labels booking-affecting fields as needs_review once a booking exists', async () => {
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    const view = await service.getPlanningView(coordinator(), EVENT_ID);
    const modes = Object.fromEntries(view.editableFields.map((f: { field: string; mode: string }) => [f.field, f.mode]));
    expect(modes).toMatchObject({
      name: 'direct',
      purpose: 'direct',
      description: 'direct',
      accessibility: 'direct',
      startDateTime: 'needs_review',
      endDateTime: 'needs_review',
      expectedAttendance: 'needs_review',
      layout: 'needs_review',
      facilities: 'needs_review',
      equipmentNeeds: 'needs_review',
    });
  });

  // EVENT-UPDATE-03-A: AC3 — fields that cannot affect a booking apply even when bookings exist.
  it.each([
    ['name', { name: 'Orientation Night' }],
    ['purpose', { purpose: 'Welcome new students' }],
    ['description', { description: 'New description' }],
    ['accessibility', { accessibility: ['Hearing loop'] }],
  ] as Array<[string, Record<string, unknown>]>)(
    'EVENT-UPDATE-03-A updates %s without touching existing bookings',
    async (_label, patch) => {
      repo.listVenueBookings.mockResolvedValue([venueBooking()]);
      repo.listEquipmentArrangements.mockResolvedValue([equipment()]);
      const result = await service.updateEvent(coordinator(), EVENT_ID, patch);
      expect(repo.applyFields).toHaveBeenCalledWith(EVENT_ID, patch, NOW);
      expect(repo.createFlaggedChange).not.toHaveBeenCalled();
      expect(result.flagged).toEqual([]);
    },
  );

  // EVENT-UPDATE-04-A: AC4 — blank required field gives an error and saves nothing.
  it('EVENT-UPDATE-04-A rejects a blank required field and saves nothing', async () => {
    await expect(service.updateEvent(coordinator(), EVENT_ID, { name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.createFlaggedChange).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-04-B: an end earlier than the stored start is checked against stored data.
  it('EVENT-UPDATE-04-B rejects an end time before the stored start time', async () => {
    await expect(
      service.updateEvent(coordinator(), EVENT_ID, { endDateTime: '2026-11-10T09:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.applyFields).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-05-A: AC5 — fields not affecting bookings are applied immediately.
  it.each(DIRECT_WHEN_UNBOOKED)('EVENT-UPDATE-05-A applies %s immediately when nothing is booked', async (_label, patch) => {
    const result = await service.updateEvent(coordinator(), EVENT_ID, patch);
    expect(repo.applyFields).toHaveBeenCalledWith(EVENT_ID, patch, NOW);
    expect(repo.createFlaggedChange).not.toHaveBeenCalled();
    expect([...result.applied].sort()).toEqual(Object.keys(patch).sort());
    expect(result.flagged).toEqual([]);
  });

  // EVENT-UPDATE-06-A: AC6 — the response carries when the information was last updated.
  it('EVENT-UPDATE-06-A returns the time of the update', async () => {
    const result = await service.updateEvent(coordinator(), EVENT_ID, { expectedAttendance: 120 });
    expect(result.updatedAt).toBe(NOW.toISOString());
    expect(result.event.expectedAttendance).toBe(120);
  });
});

describe('SPM-85 flagged changes', () => {
  const REVIEW_PATCHES: Array<[string, Record<string, unknown>]> = [
    ['startDateTime', { startDateTime: '2026-11-10T09:00:00.000Z' }],
    ['endDateTime', { endDateTime: '2026-11-10T14:00:00.000Z' }],
    ['expectedAttendance', { expectedAttendance: 150 }],
    ['layout', { layout: 'Theatre' }],
    ['facilities', { facilities: ['AV System'] }],
    ['equipmentNeeds', { equipmentNeeds: 'Four microphones' }],
  ];

  // EVENT-FLAG-01-A: AC1 — with a venue booking, these changes become Needs Review.
  it.each(REVIEW_PATCHES)('EVENT-FLAG-01-A flags a change to %s as Needs Review when a venue booking exists', async (field, patch) => {
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    const result = await service.updateEvent(coordinator(), EVENT_ID, patch);
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.createFlaggedChange).toHaveBeenCalledTimes(1);
    expect(repo.createFlaggedChange).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({
        field,
        originalValue: (eventRow() as Record<string, unknown>)[field],
        proposedValue: patch[field],
      }),
    );
    expect(result.flagged[0]).toMatchObject({ field, status: 'Needs Review' });
    expect(result.applied).toEqual([]);
  });

  // EVENT-FLAG-01-A: in a mixed update only the booking-affecting field is flagged.
  it('EVENT-FLAG-01-A applies the direct field and flags the other in a mixed update', async () => {
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      name: 'Renamed Evening',
      expectedAttendance: 150,
    });
    expect(repo.applyFields).toHaveBeenCalledWith(EVENT_ID, { name: 'Renamed Evening' }, NOW);
    expect(result.applied).toEqual(['name']);
    expect(result.flagged.map((c: { field: string }) => c.field)).toEqual(['expectedAttendance']);
  });

  // EVENT-FLAG-01-B: AC1 — an equipment arrangement alone is enough to require review.
  it('EVENT-FLAG-01-B flags the change when only an equipment arrangement exists', async () => {
    repo.listEquipmentArrangements.mockResolvedValue([equipment()]);
    const result = await service.updateEvent(coordinator(), EVENT_ID, { expectedAttendance: 150 });
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(result.flagged).toHaveLength(1);
  });

  // EVENT-FLAG-01-C: AC1 — no bookings or arrangements means no flag.
  it('EVENT-FLAG-01-C does not flag a change when no bookings or arrangements exist', async () => {
    const result = await service.updateEvent(coordinator(), EVENT_ID, { expectedAttendance: 150 });
    expect(repo.createFlaggedChange).not.toHaveBeenCalled();
    expect(result.applied).toEqual(['expectedAttendance']);
  });

  // EVENT-FLAG-02-A: AC2 — the coordinator sees current and proposed value plus impacted bookings.
  it('EVENT-FLAG-02-A returns current value, proposed value and impacted bookings', async () => {
    const impacts = [
      { bookingId: 'bk-1', venueName: 'Hall A', impacted: true, conflicts: [{ kind: 'capacity', detail: 'Attendance 150 exceeds capacity 120' }] },
    ];
    repo.listPendingChanges.mockResolvedValue([flaggedChange({ impacts })]);
    const view = await service.getPlanningView(coordinator(), EVENT_ID);
    expect(view.pendingChanges[0]).toMatchObject({
      currentValue: 80,
      proposedValue: 150,
      impacts,
    });
  });

  // EVENT-FLAG-02-B: AC2 — a setup/turnaround clash is recorded against the affected booking.
  it('EVENT-FLAG-02-B records a turnaround conflict against the affected booking', async () => {
    const proposedStart = '2026-11-10T09:00:00.000Z';
    const neighbourEnd = new Date(Date.parse(proposedStart) - (TURNAROUND_MINUTES - 1) * 60_000).toISOString();
    const neighbourStart = new Date(Date.parse(neighbourEnd) - 60 * 60_000).toISOString();
    repo.listVenueBookings.mockResolvedValue([
      venueBooking({ neighbours: [{ id: 'nb-1', eventName: 'Chemistry Workshop', start: neighbourStart, end: neighbourEnd }] }),
    ]);
    await service.updateEvent(coordinator(), EVENT_ID, { startDateTime: proposedStart });
    const [, created] = repo.createFlaggedChange.mock.calls[0];
    expect((created as { impacts: unknown[] }).impacts).toEqual([
      expect.objectContaining({
        bookingId: 'bk-1',
        impacted: true,
        conflicts: [expect.objectContaining({ kind: 'turnaround', withBookingId: 'nb-1' })],
      }),
    ]);
  });

  // EVENT-FLAG-06-A: AC6 — with two venue bookings, impacts are listed per booking.
  it('EVENT-FLAG-06-A stores one impact entry per venue booking', async () => {
    repo.listVenueBookings.mockResolvedValue([
      venueBooking(),
      venueBooking({
        id: 'bk-2',
        venueName: 'Hall B',
        neighbours: [{ id: 'nb-2', eventName: 'Chemistry Workshop', start: '2026-11-10T14:00:00.000Z', end: '2026-11-10T16:00:00.000Z' }],
      }),
    ]);
    await service.updateEvent(coordinator(), EVENT_ID, { endDateTime: '2026-11-10T15:00:00.000Z' });
    const [, created] = repo.createFlaggedChange.mock.calls[0];
    const impacts = (created as { impacts: Array<{ bookingId: string; impacted: boolean }> }).impacts;
    expect(impacts.map((i) => [i.bookingId, i.impacted])).toEqual([
      ['bk-1', false],
      ['bk-2', true],
    ]);
  });

  // EVENT-FLAG-03-A: AC3 — rejecting keeps the original value and clears the impact assessment.
  it('EVENT-FLAG-03-A rejecting keeps the original value and clears the impact assessment', async () => {
    repo.findChange.mockResolvedValue(flaggedChange());
    const result = await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', { decision: 'reject' });
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.resolveChange).toHaveBeenCalledWith(
      EVENT_ID,
      'chg-1',
      expect.objectContaining({ status: 'Rejected', resolvedBy: 'Coord Nine', resolvedAt: NOW, clearImpacts: true }),
    );
    expect(result.event.expectedAttendance).toBe(80);
  });

  // EVENT-FLAG-04-A: AC4 — confirming applies the proposed value straight away.
  it('EVENT-FLAG-04-A confirming applies the proposed value immediately', async () => {
    repo.findChange.mockResolvedValue(flaggedChange());
    const result = await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', { decision: 'confirm' });
    expect(repo.applyFields).toHaveBeenCalledWith(EVENT_ID, { expectedAttendance: 150 }, NOW);
    expect(repo.resolveChange).toHaveBeenCalledWith(
      EVENT_ID,
      'chg-1',
      expect.objectContaining({ status: 'Applied', resolvedBy: 'Coord Nine', resolvedAt: NOW }),
    );
    expect(result.event.expectedAttendance).toBe(150);
  });

  // EVENT-FLAG-05-A: AC5 — history lists resolved changes newest first with who, when and status.
  it('EVENT-FLAG-05-A records each resolved change with values, coordinator, timestamp and status', async () => {
    repo.listHistory.mockResolvedValue([
      flaggedChange({ id: 'chg-1', status: 'Applied', resolvedBy: 'Coord Nine', resolvedAt: '2026-10-05T09:00:00.000Z' }),
      flaggedChange({ id: 'chg-2', field: 'layout', originalValue: 'Banquet', proposedValue: 'Theatre', status: 'Rejected', resolvedBy: 'Coord Nine', resolvedAt: '2026-10-05T10:00:00.000Z' }),
      flaggedChange({ id: 'chg-3', status: 'Needs Review' }),
    ]);
    const history = await service.changeHistory(coordinator(), EVENT_ID);
    expect(history.map((h: { id: string }) => h.id)).toEqual(['chg-2', 'chg-1']);
    expect(history[1]).toEqual({
      id: 'chg-1',
      field: 'expectedAttendance',
      originalValue: 80,
      proposedValue: 150,
      resolvedValue: 150,
      resolvedBy: 'Coord Nine',
      resolvedAt: '2026-10-05T09:00:00.000Z',
      status: 'Applied',
    });
    expect(history[0]).toMatchObject({ originalValue: 'Banquet', proposedValue: 'Theatre', resolvedValue: 'Banquet', status: 'Rejected' });
  });

  // EVENT-FLAG-07-A: AC7 — resolving one booking passes only that booking to the repository.
  // NOTE: scoped-resolution semantics are an interpretation of the AC; confirm with the team.
  it('EVENT-FLAG-07-A confirming for one booking resolves only that booking', async () => {
    repo.findChange.mockResolvedValue(
      flaggedChange({
        impacts: [
          { bookingId: 'bk-1', venueName: 'Hall A', impacted: true, conflicts: [{ kind: 'capacity', detail: 'x' }] },
          { bookingId: 'bk-2', venueName: 'Hall B', impacted: true, conflicts: [{ kind: 'turnaround', detail: 'y' }] },
        ],
      }),
    );
    await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', { decision: 'confirm', bookingId: 'bk-1' });
    expect(repo.resolveChange).toHaveBeenCalledTimes(1);
    expect(repo.resolveChange).toHaveBeenCalledWith(EVENT_ID, 'chg-1', expect.objectContaining({ bookingId: 'bk-1', status: 'Applied' }));
  });

  // EVENT-FLAG-07-A: rejecting one booking clears only that booking's impact entry.
  it('EVENT-FLAG-07-A rejecting for one booking clears only that booking impact', async () => {
    repo.findChange.mockResolvedValue(
      flaggedChange({
        impacts: [
          { bookingId: 'bk-1', venueName: 'Hall A', impacted: true, conflicts: [] },
          { bookingId: 'bk-2', venueName: 'Hall B', impacted: true, conflicts: [] },
        ],
      }),
    );
    await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', { decision: 'reject', bookingId: 'bk-2' });
    expect(repo.resolveChange).toHaveBeenCalledWith(
      EVENT_ID,
      'chg-1',
      expect.objectContaining({ bookingId: 'bk-2', status: 'Rejected', clearImpacts: true }),
    );
  });

  // EVENT-FLAG-07-A: a booking that is not part of the change is refused.
  it('EVENT-FLAG-07-A rejects a booking id that is not part of the change', async () => {
    repo.findChange.mockResolvedValue(
      flaggedChange({ impacts: [{ bookingId: 'bk-1', venueName: 'Hall A', impacted: true, conflicts: [] }] }),
    );
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-1', { decision: 'confirm', bookingId: 'bk-9' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.resolveChange).not.toHaveBeenCalled();
  });

  // EVENT-FLAG-04-SEC-1: an already-resolved change cannot be resolved again.
  it.each(['Applied', 'Rejected'])('EVENT-FLAG-04-SEC-1 refuses to resolve a change that is already %s', async (status) => {
    repo.findChange.mockResolvedValue(flaggedChange({ status }));
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-1', { decision: 'confirm' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.resolveChange).not.toHaveBeenCalled();
  });

  // EVENT-FLAG-04-SEC-1: only confirm or reject are valid decisions.
  it.each(['approve', '', undefined])('EVENT-FLAG-04-SEC-1 rejects invalid decision %j', async (decision) => {
    repo.findChange.mockResolvedValue(flaggedChange());
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-1', { decision }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.resolveChange).not.toHaveBeenCalled();
  });

  // EVENT-FLAG-04-SEC-1: only the assigned coordinator can resolve, and the change must exist.
  it('EVENT-FLAG-04-SEC-1 refuses an unassigned coordinator and an unknown change', async () => {
    repo.findChange.mockResolvedValue(flaggedChange());
    await expect(
      service.resolveChange(coordinator({ uid: 'coord-1' }), EVENT_ID, 'chg-1', { decision: 'confirm' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    repo.findChange.mockResolvedValue(undefined);
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-404', { decision: 'confirm' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.resolveChange).not.toHaveBeenCalled();
  });
});