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
 * and SPM-85 (coordinator reviews flagged changes): the business rules of
 * EventPlanningService. The repository is mocked, so these tests pin the rules
 * (access, lifecycle, field policy, impact, resolution), not SQL; the SQL,
 * row locking and concurrency are proved against PostgreSQL in
 * event-planning.e2e-spec.ts. The mock has no runInTransaction, so transactions
 * are only exercised where a test adds one ("atomicity" suite).
 * Confluence IDs: EVENT-VIEW-*, EVENT-UPDATE-*, EVENT-FLAG-*.
 */

const EVENT_ID = '00000000-0000-4000-8000-000000000049';
const NOW = new Date('2026-10-05T08:00:00.000Z');
const START = '2026-11-10T10:00:00.000Z';
const END = '2026-11-10T13:00:00.000Z';

function organiser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    uid: 'organiser-1',
    roles: ['ORGANISER'],
    email: 'org@example.test',
    name: 'Demo Organiser',
    ...overrides,
  };
}
function coordinator(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    uid: 'coord-9',
    roles: ['COORDINATOR'],
    email: 'coord9@example.test',
    name: 'Coord Nine',
    ...overrides,
  };
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
  return {
    id: 'bk-1',
    venueId: 'venue-a',
    venueName: 'Hall A',
    capacity: 200,
    start: START,
    end: END,
    status: 'Booked',
    neighbours: [],
    ...overrides,
  };
}
function equipment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'eq-1',
    name: 'Projector',
    quantity: 2,
    status: 'Reserved',
    ...overrides,
  };
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
    applyFields: vi.fn(
      async (_id: string, patch: Record<string, unknown>, now: Date) => ({
        ...eventRow(),
        ...patch,
        updatedAt: now.toISOString(),
      }),
    ),
    createFlaggedChange: vi.fn(
      async (_id: string, change: Record<string, unknown>) => ({
        ...flaggedChange(),
        ...change,
        id: 'chg-1',
        status: 'Needs Review',
      }),
    ),
    resolveChange: vi.fn(
      async (_e: string, id: string, resolution: Record<string, unknown>) => ({
        ...flaggedChange(),
        id,
        ...resolution,
      }),
    ),
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
    providers: [
      EventPlanningService,
      { provide: EventPlanningRepository, useValue: repo },
    ],
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
      expect(view.event).toMatchObject({
        id: EVENT_ID,
        name: 'Welcome Evening',
      });
    },
  );

  // EVENT-VIEW-01-B: AC1 — before planning there is nothing to show.
  it.each(['Submitted', 'Rejected'])(
    'EVENT-VIEW-01-B organiser gets a conflict, not data, while the event is %s',
    async (status) => {
      repo.findEvent.mockResolvedValue(eventRow({ status }));
      await expect(
        service.getPlanningView(organiser(), EVENT_ID),
      ).rejects.toBeInstanceOf(ConflictException);
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
    await expect(
      service.getPlanningView(undefined, EVENT_ID),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.getPlanningView({ uid: 'att-1', roles: ['ATTENDEE'] }, EVENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getPlanningView(organiser(), 'not-a-uuid'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // EVENT-VIEW-02-A: AC2 — current venues, equipment and booking details, read live.
  it('EVENT-VIEW-02-A shows current venue bookings and equipment and reflects later updates', async () => {
    repo.listVenueBookings.mockResolvedValue([
      venueBooking(),
      venueBooking({ id: 'bk-2', venueName: 'Hall B' }),
    ]);
    repo.listEquipmentArrangements.mockResolvedValue([equipment()]);
    const view = await service.getPlanningView(organiser(), EVENT_ID);
    expect(
      view.venueBookings.map((b: { venueName: string }) => b.venueName),
    ).toEqual(['Hall A', 'Hall B']);
    expect(view.venueBookings[0]).toMatchObject({
      id: 'bk-1',
      start: START,
      end: END,
      status: 'Booked',
    });
    expect(view.equipmentArrangements).toEqual([
      expect.objectContaining({
        name: 'Projector',
        quantity: 2,
        status: 'Reserved',
      }),
    ]);

    // The coordinator changes the booking; the next read shows it.
    repo.listVenueBookings.mockResolvedValue([
      venueBooking({ venueName: 'Auditorium' }),
    ]);
    const refreshed = await service.getPlanningView(organiser(), EVENT_ID);
    expect(
      refreshed.venueBookings.map((b: { venueName: string }) => b.venueName),
    ).toEqual(['Auditorium']);
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

    await expect(
      service.updateEvent(organiser(), EVENT_ID, { name: 'Hacked' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.resolveChange(organiser(), EVENT_ID, 'chg-1', {
        decision: 'confirm',
      }),
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
    await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
      decision: 'confirm',
    });

    repo.findEvent.mockResolvedValue(eventRow({ expectedAttendance: 150 }));
    repo.listPendingChanges.mockResolvedValue([]);
    const after = await service.getPlanningView(organiser(), EVENT_ID);
    expect(after.event.expectedAttendance).toBe(150);
    expect(after.pendingChanges).toEqual([]);
  });
});

describe('SPM-49 coordinator update', () => {
  const DIRECT_WHEN_UNBOOKED: Array<[string, Record<string, unknown>]> = [
    [
      'date & time',
      {
        startDateTime: '2026-11-11T10:00:00.000Z',
        endDateTime: '2026-11-11T13:00:00.000Z',
      },
    ],
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
    expect(view.event).toMatchObject({
      name: 'Welcome Evening',
      expectedAttendance: 80,
    });
    expect(view.lastUpdatedAt).toBe('2026-10-04T09:00:00.000Z');
  });

  // EVENT-UPDATE-01-B: AC1 — a coordinator who is not assigned cannot see or change it.
  it('EVENT-UPDATE-01-B hides the event from an unassigned coordinator', async () => {
    repo.findEvent.mockResolvedValue(eventRow({ coordinatorId: 'coord-1' }));
    await expect(
      service.getPlanningView(coordinator(), EVENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateEvent(coordinator(), EVENT_ID, { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.applyFields).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-01-C: updates are only allowed after approval and before confirmation.
  it.each(['Submitted', 'Rejected', 'Confirmed'])(
    'EVENT-UPDATE-01-C refuses updates while the event is %s',
    async (status) => {
      repo.findEvent.mockResolvedValue(eventRow({ status }));
      await expect(
        service.updateEvent(coordinator(), EVENT_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.applyFields).not.toHaveBeenCalled();
    },
  );

  // EVENT-UPDATE-02-A: AC2 — with nothing booked, every field is edited directly.
  it('EVENT-UPDATE-02-A labels every field as direct when nothing is booked', async () => {
    const view = await service.getPlanningView(coordinator(), EVENT_ID);
    expect(
      new Set(view.editableFields.map((f: { mode: string }) => f.mode)),
    ).toEqual(new Set(['direct']));
  });

  // EVENT-UPDATE-02-A: AC2 — once a booking exists, booking-affecting fields need review.
  it('EVENT-UPDATE-02-A labels booking-affecting fields as needs_review once a booking exists', async () => {
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    const view = await service.getPlanningView(coordinator(), EVENT_ID);
    const modes = Object.fromEntries(
      view.editableFields.map((f: { field: string; mode: string }) => [
        f.field,
        f.mode,
      ]),
    );
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
    await expect(
      service.updateEvent(coordinator(), EVENT_ID, { name: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.createFlaggedChange).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-04-B: an end earlier than the stored start is checked against stored data.
  it('EVENT-UPDATE-04-B rejects an end time before the stored start time', async () => {
    await expect(
      service.updateEvent(coordinator(), EVENT_ID, {
        endDateTime: '2026-11-10T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.applyFields).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-05-A: AC5 — fields not affecting bookings are applied immediately.
  it.each(DIRECT_WHEN_UNBOOKED)(
    'EVENT-UPDATE-05-A applies %s immediately when nothing is booked',
    async (_label, patch) => {
      const result = await service.updateEvent(coordinator(), EVENT_ID, patch);
      expect(repo.applyFields).toHaveBeenCalledWith(EVENT_ID, patch, NOW);
      expect(repo.createFlaggedChange).not.toHaveBeenCalled();
      expect([...result.applied].sort()).toEqual(Object.keys(patch).sort());
      expect(result.flagged).toEqual([]);
    },
  );

  // EVENT-UPDATE-06-A: AC6 — the response carries when the information was last updated.
  it('EVENT-UPDATE-06-A returns the time of the update', async () => {
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      expectedAttendance: 120,
    });
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
  it.each(REVIEW_PATCHES)(
    'EVENT-FLAG-01-A flags a change to %s as Needs Review when a venue booking exists',
    async (field, patch) => {
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
      expect(result.flagged[0]).toMatchObject({
        field,
        status: 'Needs Review',
      });
      expect(result.applied).toEqual([]);
    },
  );

  // EVENT-FLAG-01-A: in a mixed update only the booking-affecting field is flagged.
  it('EVENT-FLAG-01-A applies the direct field and flags the other in a mixed update', async () => {
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      name: 'Renamed Evening',
      expectedAttendance: 150,
    });
    expect(repo.applyFields).toHaveBeenCalledWith(
      EVENT_ID,
      { name: 'Renamed Evening' },
      NOW,
    );
    expect(result.applied).toEqual(['name']);
    expect(result.flagged.map((c: { field: string }) => c.field)).toEqual([
      'expectedAttendance',
    ]);
  });

  // EVENT-FLAG-01-B: AC1 — an equipment arrangement alone is enough to require review.
  it('EVENT-FLAG-01-B flags the change when only an equipment arrangement exists', async () => {
    repo.listEquipmentArrangements.mockResolvedValue([equipment()]);
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      expectedAttendance: 150,
    });
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(result.flagged).toHaveLength(1);
  });

  // EVENT-FLAG-01-C: AC1 — no bookings or arrangements means no flag.
  it('EVENT-FLAG-01-C does not flag a change when no bookings or arrangements exist', async () => {
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      expectedAttendance: 150,
    });
    expect(repo.createFlaggedChange).not.toHaveBeenCalled();
    expect(result.applied).toEqual(['expectedAttendance']);
  });

  // EVENT-FLAG-02-A: AC2 — the coordinator sees current and proposed value plus impacted bookings.
  it('EVENT-FLAG-02-A returns current value, proposed value and impacted bookings', async () => {
    const impacts = [
      {
        bookingId: 'bk-1',
        venueName: 'Hall A',
        impacted: true,
        conflicts: [
          { kind: 'capacity', detail: 'Attendance 150 exceeds capacity 120' },
        ],
      },
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
    const neighbourEnd = new Date(
      Date.parse(proposedStart) - (TURNAROUND_MINUTES - 1) * 60_000,
    ).toISOString();
    const neighbourStart = new Date(
      Date.parse(neighbourEnd) - 60 * 60_000,
    ).toISOString();
    repo.listVenueBookings.mockResolvedValue([
      venueBooking({
        neighbours: [
          {
            id: 'nb-1',
            eventName: 'Chemistry Workshop',
            start: neighbourStart,
            end: neighbourEnd,
          },
        ],
      }),
    ]);
    await service.updateEvent(coordinator(), EVENT_ID, {
      startDateTime: proposedStart,
    });
    const [, created] = repo.createFlaggedChange.mock.calls[0];
    expect((created as { impacts: unknown[] }).impacts).toEqual([
      expect.objectContaining({
        bookingId: 'bk-1',
        impacted: true,
        conflicts: [
          expect.objectContaining({
            kind: 'turnaround',
            withBookingId: 'nb-1',
          }),
        ],
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
        neighbours: [
          {
            id: 'nb-2',
            eventName: 'Chemistry Workshop',
            start: '2026-11-10T14:00:00.000Z',
            end: '2026-11-10T16:00:00.000Z',
          },
        ],
      }),
    ]);
    await service.updateEvent(coordinator(), EVENT_ID, {
      endDateTime: '2026-11-10T15:00:00.000Z',
    });
    const [, created] = repo.createFlaggedChange.mock.calls[0];
    const impacts = (
      created as { impacts: Array<{ bookingId: string; impacted: boolean }> }
    ).impacts;
    expect(impacts.map((i) => [i.bookingId, i.impacted])).toEqual([
      ['bk-1', false],
      ['bk-2', true],
    ]);
  });

  // EVENT-FLAG-03-A: AC3 — rejecting keeps the original value and clears the impact assessment.
  it('EVENT-FLAG-03-A rejecting keeps the original value and clears the impact assessment', async () => {
    repo.findChange.mockResolvedValue(flaggedChange());
    const result = await service.resolveChange(
      coordinator(),
      EVENT_ID,
      'chg-1',
      { decision: 'reject' },
    );
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.resolveChange).toHaveBeenCalledWith(
      EVENT_ID,
      'chg-1',
      expect.objectContaining({
        status: 'Rejected',
        resolvedBy: 'Coord Nine',
        resolvedAt: NOW,
        clearImpacts: true,
      }),
    );
    expect(result.event.expectedAttendance).toBe(80);
  });

  // EVENT-FLAG-04-A: AC4 — confirming applies the proposed value straight away.
  it('EVENT-FLAG-04-A confirming applies the proposed value immediately', async () => {
    repo.findChange.mockResolvedValue(flaggedChange());
    const result = await service.resolveChange(
      coordinator(),
      EVENT_ID,
      'chg-1',
      { decision: 'confirm' },
    );
    expect(repo.applyFields).toHaveBeenCalledWith(
      EVENT_ID,
      { expectedAttendance: 150 },
      NOW,
    );
    expect(repo.resolveChange).toHaveBeenCalledWith(
      EVENT_ID,
      'chg-1',
      expect.objectContaining({
        status: 'Applied',
        resolvedBy: 'Coord Nine',
        resolvedAt: NOW,
      }),
    );
    expect(result.event.expectedAttendance).toBe(150);
  });

  // EVENT-FLAG-05-A: AC5 — history lists resolved changes newest first with who, when and status.
  it('EVENT-FLAG-05-A records each resolved change with values, coordinator, timestamp and status', async () => {
    repo.listHistory.mockResolvedValue([
      flaggedChange({
        id: 'chg-1',
        status: 'Applied',
        resolvedBy: 'Coord Nine',
        resolvedAt: '2026-10-05T09:00:00.000Z',
      }),
      flaggedChange({
        id: 'chg-2',
        field: 'layout',
        originalValue: 'Banquet',
        proposedValue: 'Theatre',
        status: 'Rejected',
        resolvedBy: 'Coord Nine',
        resolvedAt: '2026-10-05T10:00:00.000Z',
      }),
      flaggedChange({ id: 'chg-3', status: 'Needs Review' }),
    ]);
    const history = await service.changeHistory(coordinator(), EVENT_ID);
    expect(history.map((h: { id: string }) => h.id)).toEqual([
      'chg-2',
      'chg-1',
    ]);
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
    expect(history[0]).toMatchObject({
      originalValue: 'Banquet',
      proposedValue: 'Theatre',
      resolvedValue: 'Banquet',
      status: 'Rejected',
    });
  });

  // EVENT-FLAG-07-A: AC7 — resolving one booking passes only that booking to the repository.
  // NOTE: scoped-resolution semantics are an interpretation of the AC (backend/HANDOVER.md, rule 10); confirm with the team.
  it('EVENT-FLAG-07-A confirming for one booking resolves only that booking', async () => {
    repo.findChange.mockResolvedValue(
      flaggedChange({
        impacts: [
          {
            bookingId: 'bk-1',
            venueName: 'Hall A',
            impacted: true,
            conflicts: [{ kind: 'capacity', detail: 'x' }],
          },
          {
            bookingId: 'bk-2',
            venueName: 'Hall B',
            impacted: true,
            conflicts: [{ kind: 'turnaround', detail: 'y' }],
          },
        ],
      }),
    );
    await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
      decision: 'confirm',
      bookingId: 'bk-1',
    });
    expect(repo.resolveChange).toHaveBeenCalledTimes(1);
    expect(repo.resolveChange).toHaveBeenCalledWith(
      EVENT_ID,
      'chg-1',
      expect.objectContaining({ bookingId: 'bk-1', status: 'Applied' }),
    );
  });

  // EVENT-FLAG-07-A: rejecting one booking clears only that booking's impact entry.
  it('EVENT-FLAG-07-A rejecting for one booking clears only that booking impact', async () => {
    repo.findChange.mockResolvedValue(
      flaggedChange({
        impacts: [
          {
            bookingId: 'bk-1',
            venueName: 'Hall A',
            impacted: true,
            conflicts: [],
          },
          {
            bookingId: 'bk-2',
            venueName: 'Hall B',
            impacted: true,
            conflicts: [],
          },
        ],
      }),
    );
    await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
      decision: 'reject',
      bookingId: 'bk-2',
    });
    expect(repo.resolveChange).toHaveBeenCalledWith(
      EVENT_ID,
      'chg-1',
      expect.objectContaining({
        bookingId: 'bk-2',
        status: 'Rejected',
        clearImpacts: true,
      }),
    );
  });

  // EVENT-FLAG-07-A: a booking that is not part of the change is refused.
  it('EVENT-FLAG-07-A rejects a booking id that is not part of the change', async () => {
    repo.findChange.mockResolvedValue(
      flaggedChange({
        impacts: [
          {
            bookingId: 'bk-1',
            venueName: 'Hall A',
            impacted: true,
            conflicts: [],
          },
        ],
      }),
    );
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
        decision: 'confirm',
        bookingId: 'bk-9',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.resolveChange).not.toHaveBeenCalled();
  });

  // EVENT-FLAG-04-SEC-1: an already-resolved change cannot be resolved again.
  it.each(['Applied', 'Rejected'])(
    'EVENT-FLAG-04-SEC-1 refuses to resolve a change that is already %s',
    async (status) => {
      repo.findChange.mockResolvedValue(flaggedChange({ status }));
      await expect(
        service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
          decision: 'confirm',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.applyFields).not.toHaveBeenCalled();
      expect(repo.resolveChange).not.toHaveBeenCalled();
    },
  );

  // EVENT-FLAG-04-SEC-1: only confirm or reject are valid decisions.
  it.each(['approve', '', undefined])(
    'EVENT-FLAG-04-SEC-1 rejects invalid decision %j',
    async (decision) => {
      repo.findChange.mockResolvedValue(flaggedChange());
      await expect(
        service.resolveChange(coordinator(), EVENT_ID, 'chg-1', { decision }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.resolveChange).not.toHaveBeenCalled();
    },
  );

  // EVENT-FLAG-04-SEC-1: only the assigned coordinator can resolve, and the change must exist.
  it('EVENT-FLAG-04-SEC-1 refuses an unassigned coordinator and an unknown change', async () => {
    repo.findChange.mockResolvedValue(flaggedChange());
    await expect(
      service.resolveChange(
        coordinator({ uid: 'coord-1' }),
        EVENT_ID,
        'chg-1',
        { decision: 'confirm' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    repo.findChange.mockResolvedValue(undefined);
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-404', {
        decision: 'confirm',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.resolveChange).not.toHaveBeenCalled();
  });
});
// ---------------------------------------------------------------------------
// Gap coverage: rules the implementation enforces beyond the original AC cases.
// ---------------------------------------------------------------------------

const BOOKING_IMPACT = {
  bookingId: 'bk-1',
  venueId: 'venue-a',
  venueName: 'Hall A',
  impacted: true,
  conflicts: [
    { kind: 'capacity', detail: 'Attendance 150 exceeds capacity 100' },
  ],
};

// A change with two impacted bookings and one that is not impacted.
function threeBookingChange(
  decisions: Record<string, 'Applied' | 'Rejected'> = {},
) {
  return flaggedChange({
    impacts: [
      {
        ...BOOKING_IMPACT,
        bookingId: 'bk-1',
        venueName: 'Hall A',
        decision: decisions['bk-1'],
      },
      {
        ...BOOKING_IMPACT,
        bookingId: 'bk-2',
        venueName: 'Hall B',
        decision: decisions['bk-2'],
      },
      {
        bookingId: 'bk-3',
        venueId: 'venue-c',
        venueName: 'Hall C',
        impacted: false,
        conflicts: [],
      },
    ],
  });
}

describe('SPM-97 view: lifecycle and privacy', () => {
  // EVENT-VIEW-01-C: AC1 — a Confirmed event can still be viewed, but nobody can edit it.
  it('EVENT-VIEW-01-C lets the organiser and coordinator view a Confirmed event read-only', async () => {
    repo.findEvent.mockResolvedValue(eventRow({ status: 'Confirmed' }));

    const organiserView = await service.getPlanningView(organiser(), EVENT_ID);
    expect(organiserView.readOnly).toBe(true);

    // Even the assigned coordinator gets no editable fields once the event is confirmed.
    const coordinatorView = await service.getPlanningView(
      coordinator(),
      EVENT_ID,
    );
    expect(coordinatorView.readOnly).toBe(true);
    expect(coordinatorView.editableFields).toEqual([]);

    await expect(
      service.updateEvent(coordinator(), EVENT_ID, { name: 'Late edit' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
        decision: 'confirm',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.applyFields).not.toHaveBeenCalled();
  });

  // EVENT-VIEW-03-A: AC3 — the organiser sees that a change is pending, never the impact detail.
  it('EVENT-VIEW-03-A hides impact details from the organiser but shows them to the coordinator', async () => {
    const impacts = [
      {
        ...BOOKING_IMPACT,
        conflicts: [
          {
            kind: 'overlap',
            withBookingId: 'nb-1',
            detail: 'Overlaps Chemistry Workshop (14:00–16:00 UTC)',
          },
        ],
      },
    ];
    const equipmentImpacts = [
      {
        arrangementId: 'eq-1',
        name: 'Projector',
        quantity: 2,
        detail: 'Move with the event',
      },
    ];
    repo.listPendingChanges.mockResolvedValue([
      flaggedChange({ impacts, equipmentImpacts }),
    ]);

    const organiserView = await service.getPlanningView(organiser(), EVENT_ID);
    expect(organiserView.pendingChanges[0]).toMatchObject({
      field: 'expectedAttendance',
      status: 'Needs Review',
    });
    expect(organiserView.pendingChanges[0]).not.toHaveProperty('impacts');
    expect(organiserView.pendingChanges[0]).not.toHaveProperty(
      'equipmentImpacts',
    );
    expect(JSON.stringify(organiserView)).not.toContain('Chemistry Workshop');

    const coordinatorView = await service.getPlanningView(
      coordinator(),
      EVENT_ID,
    );
    expect(coordinatorView.pendingChanges[0]).toMatchObject({
      impacts,
      equipmentImpacts,
    });
  });

  // EVENT-VIEW-02-A: AC2 — other events' bookings at the same venue are never sent to the client.
  it('EVENT-VIEW-02-A does not expose neighbouring bookings of other events', async () => {
    repo.listVenueBookings.mockResolvedValue([
      venueBooking({
        neighbours: [
          {
            id: 'nb-1',
            eventName: 'Chemistry Workshop',
            start: START,
            end: END,
          },
        ],
      }),
    ]);
    for (const user of [organiser(), coordinator()]) {
      const view = await service.getPlanningView(user, EVENT_ID);
      expect(view.venueBookings[0]).not.toHaveProperty('neighbours');
      expect(JSON.stringify(view)).not.toContain('Chemistry Workshop');
    }
  });
});

describe('SPM-85 flagging: which bookings count', () => {
  // EVENT-FLAG-01-D: AC1 — a lost or cancelled booking holds nothing, so it does not force a review.
  it.each(['Unavailable', 'Cancelled'])(
    'EVENT-FLAG-01-D ignores a venue booking that is %s',
    async (status) => {
      repo.listVenueBookings.mockResolvedValue([venueBooking({ status })]);
      const result = await service.updateEvent(coordinator(), EVENT_ID, {
        expectedAttendance: 150,
      });
      expect(result.applied).toEqual(['expectedAttendance']);
      expect(repo.createFlaggedChange).not.toHaveBeenCalled();
    },
  );

  it.each(['Unavailable', 'Cancelled', 'Released'])(
    'EVENT-FLAG-01-D ignores an equipment arrangement that is %s',
    async (status) => {
      repo.listEquipmentArrangements.mockResolvedValue([equipment({ status })]);
      const result = await service.updateEvent(coordinator(), EVENT_ID, {
        expectedAttendance: 150,
      });
      expect(result.applied).toEqual(['expectedAttendance']);
      expect(repo.createFlaggedChange).not.toHaveBeenCalled();
    },
  );

  // EVENT-FLAG-01-D: the editable-field labels follow the same rule, so the form never promises a review that will not happen.
  it('EVENT-FLAG-01-D labels every field direct when only inactive bookings remain', async () => {
    repo.listVenueBookings.mockResolvedValue([
      venueBooking({ status: 'Cancelled' }),
    ]);
    repo.listEquipmentArrangements.mockResolvedValue([
      equipment({ status: 'Released' }),
    ]);
    const view = await service.getPlanningView(coordinator(), EVENT_ID);
    expect(
      new Set(view.editableFields.map((f: { mode: string }) => f.mode)),
    ).toEqual(new Set(['direct']));
  });

  // EVENT-FLAG-01-D: AC6 — only active bookings are assessed and listed as impacted.
  it('EVENT-FLAG-01-D assesses only the active bookings of the event', async () => {
    repo.listVenueBookings.mockResolvedValue([
      venueBooking({
        id: 'bk-1',
        venueName: 'Hall A',
        status: 'Unavailable',
        capacity: 10,
      }),
      venueBooking({ id: 'bk-2', venueName: 'Hall B', capacity: 100 }),
    ]);
    await service.updateEvent(coordinator(), EVENT_ID, {
      expectedAttendance: 150,
    });
    const [, created] = repo.createFlaggedChange.mock.calls[0];
    expect(
      (created as { impacts: Array<{ bookingId: string }> }).impacts.map(
        (i) => i.bookingId,
      ),
    ).toEqual(['bk-2']);
  });

  // EVENT-FLAG-01-A: one open review per field; nothing is half-applied when it is refused.
  it('EVENT-FLAG-01-A refuses a second change to a field that is already awaiting review', async () => {
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    repo.listPendingChanges.mockResolvedValue([flaggedChange()]);
    await expect(
      service.updateEvent(coordinator(), EVENT_ID, {
        name: 'Renamed',
        expectedAttendance: 160,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.createFlaggedChange).not.toHaveBeenCalled();
  });

  it('EVENT-FLAG-01-A still flags a different field while another is awaiting review', async () => {
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    repo.listPendingChanges.mockResolvedValue([flaggedChange()]);
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      layout: 'Theatre',
    });
    expect(result.flagged.map((c: { field: string }) => c.field)).toEqual([
      'layout',
    ]);
  });

  // EVENT-FLAG-01-A: a date/time move is flagged field by field but assessed as one move.
  it('EVENT-FLAG-01-A assesses start and end proposed together as one move', async () => {
    const nextDayStart = '2026-11-11T10:00:00.000Z';
    const nextDayEnd = '2026-11-11T13:00:00.000Z';
    repo.listVenueBookings.mockResolvedValue([
      venueBooking({
        neighbours: [
          {
            id: 'nb-1',
            eventName: 'Chemistry Workshop',
            start: '2026-11-11T11:00:00.000Z',
            end: '2026-11-11T12:00:00.000Z',
          },
        ],
      }),
    ]);
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      startDateTime: nextDayStart,
      endDateTime: nextDayEnd,
    });
    expect(result.flagged.map((c: { field: string }) => c.field)).toEqual([
      'startDateTime',
      'endDateTime',
    ]);
    for (const [, created] of repo.createFlaggedChange.mock.calls) {
      expect(
        (created as { impacts: Array<{ conflicts: Array<{ kind: string }> }> })
          .impacts[0].conflicts[0].kind,
      ).toBe('overlap');
    }
  });

  // EVENT-FLAG-02-A: layout and facility changes cannot be checked automatically, so every active booking is listed.
  it('EVENT-FLAG-02-A lists a manual requirements check for every active booking on a layout change', async () => {
    repo.listVenueBookings.mockResolvedValue([
      venueBooking({ id: 'bk-1', venueName: 'Hall A' }),
      venueBooking({ id: 'bk-2', venueName: 'Hall B' }),
    ]);
    await service.updateEvent(coordinator(), EVENT_ID, { layout: 'Theatre' });
    const [, created] = repo.createFlaggedChange.mock.calls[0];
    const impacts = (
      created as {
        impacts: Array<{
          bookingId: string;
          impacted: boolean;
          conflicts: Array<{ kind: string }>;
        }>;
      }
    ).impacts;
    expect(
      impacts.map((i) => [
        i.bookingId,
        i.impacted,
        i.conflicts.map((c) => c.kind),
      ]),
    ).toEqual([
      ['bk-1', true, ['requirements']],
      ['bk-2', true, ['requirements']],
    ]);
  });

  // EVENT-FLAG-02-A: AC2 — equipment arrangements are listed to re-check, but only for time and equipment changes.
  it('EVENT-FLAG-02-A lists active equipment arrangements to re-check for time and equipment changes only', async () => {
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    repo.listEquipmentArrangements.mockResolvedValue([
      equipment({ id: 'eq-1', name: 'Projector' }),
      equipment({ id: 'eq-2', name: 'Camera', status: 'Released' }),
      equipment({ id: 'eq-3', name: 'Mixer', status: 'Cancelled' }),
    ]);
    const equipmentImpactsOf = async (patch: Record<string, unknown>) => {
      repo.createFlaggedChange.mockClear();
      await service.updateEvent(coordinator(), EVENT_ID, patch);
      return (
        repo.createFlaggedChange.mock.calls[0][1] as {
          equipmentImpacts: Array<{ name: string }>;
        }
      ).equipmentImpacts;
    };

    expect(
      (await equipmentImpactsOf({ equipmentNeeds: 'Four microphones' })).map(
        (i) => i.name,
      ),
    ).toEqual(['Projector']);
    expect(
      (
        await equipmentImpactsOf({ endDateTime: '2026-11-10T14:00:00.000Z' })
      ).map((i) => i.name),
    ).toEqual(['Projector']);
    expect(await equipmentImpactsOf({ expectedAttendance: 150 })).toEqual([]);
  });
});

describe('SPM-85 flagging: impacts are specific to the changed field', () => {
  // A neighbouring event that ends 10 minutes before the booking starts, a gap that already exists.
  const tightGapBooking = () =>
    venueBooking({
      capacity: 100,
      neighbours: [
        {
          id: 'nb-1',
          eventName: 'Chemistry Workshop',
          start: '2026-11-10T08:00:00.000Z',
          end: '2026-11-10T09:50:00.000Z',
        },
      ],
    });
  const conflictKindsFor = async (patch: Record<string, unknown>) => {
    repo.listVenueBookings.mockResolvedValue([tightGapBooking()]);
    await service.updateEvent(coordinator(), EVENT_ID, patch);
    const [, created] = repo.createFlaggedChange.mock.calls[0];
    return (
      created as { impacts: Array<{ conflicts: Array<{ kind: string }> }> }
    ).impacts[0].conflicts.map((c) => c.kind);
  };

  // EVENT-FLAG-02-C: the coordinator is not told an attendance or layout change causes a gap that was already there.
  it('EVENT-FLAG-02-C reports only the capacity problem for an attendance change', async () => {
    expect(await conflictKindsFor({ expectedAttendance: 150 })).toEqual([
      'capacity',
    ]);
  });

  it('EVENT-FLAG-02-C reports only the manual check for a layout change', async () => {
    expect(await conflictKindsFor({ layout: 'Theatre' })).toEqual([
      'requirements',
    ]);
  });

  // EVENT-FLAG-02-C: moving the start into the gap is a real conflict and is reported.
  it('EVENT-FLAG-02-C reports the clash when the start is moved into the neighbouring event', async () => {
    expect(
      await conflictKindsFor({ startDateTime: '2026-11-10T09:40:00.000Z' }),
    ).toEqual(['overlap']);
  });
});

describe('SPM-49 update: unchanged values', () => {
  // EVENT-UPDATE-04-C: AC3 — saving values identical to the stored ones is not a change.
  it('EVENT-UPDATE-04-C ignores values identical to the stored ones', async () => {
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      name: 'Welcome Evening',
      expectedAttendance: 80,
      facilities: ['Catering'],
      startDateTime: START,
    });
    expect(result).toMatchObject({
      applied: [],
      flagged: [],
      updatedAt: '2026-10-04T09:00:00.000Z',
    });
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.createFlaggedChange).not.toHaveBeenCalled();
    // Nothing changed, so bookings are not even looked up.
    expect(repo.listVenueBookings).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-04-C: dates compare as instants and lists as sets, not as text.
  it('EVENT-UPDATE-04-C compares dates as instants and lists as sets', async () => {
    repo.findEvent.mockResolvedValue(
      eventRow({ facilities: ['Catering', 'Stage'] }),
    );
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      startDateTime: '2026-11-10T10:00:00Z',
      facilities: ['Stage', 'Catering'],
    });
    expect(result.applied).toEqual([]);
    expect(repo.applyFields).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-04-C: only the fields that really changed are applied or flagged.
  it('EVENT-UPDATE-04-C applies only the fields that differ', async () => {
    const result = await service.updateEvent(coordinator(), EVENT_ID, {
      name: 'Welcome Evening',
      expectedAttendance: 120,
    });
    expect(repo.applyFields).toHaveBeenCalledWith(
      EVENT_ID,
      { expectedAttendance: 120 },
      NOW,
    );
    expect(result.applied).toEqual(['expectedAttendance']);
  });
});

describe('SPM-85 resolution: date halves, per-booking closing rule, access', () => {
  // EVENT-FLAG-04-B: AC4 — confirming one half of a date move may not leave the end before the start.
  it('EVENT-FLAG-04-B refuses to confirm a start that would fall after the stored end', async () => {
    repo.findChange.mockResolvedValue(
      flaggedChange({
        field: 'startDateTime',
        originalValue: START,
        proposedValue: '2026-11-11T10:00:00.000Z',
      }),
    );
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
        decision: 'confirm',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.resolveChange).not.toHaveBeenCalled();
  });

  // EVENT-FLAG-04-B: once the other half has been applied the same confirmation is valid.
  it('EVENT-FLAG-04-B confirms the start once the end has already moved', async () => {
    repo.findEvent.mockResolvedValue(
      eventRow({ endDateTime: '2026-11-11T13:00:00.000Z' }),
    );
    repo.findChange.mockResolvedValue(
      flaggedChange({
        field: 'startDateTime',
        originalValue: START,
        proposedValue: '2026-11-11T10:00:00.000Z',
      }),
    );
    await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
      decision: 'confirm',
    });
    expect(repo.applyFields).toHaveBeenCalledWith(
      EVENT_ID,
      { startDateTime: '2026-11-11T10:00:00.000Z' },
      NOW,
    );
  });

  // EVENT-FLAG-03-A: rejecting is always allowed, whatever the other half is doing.
  it('EVENT-FLAG-03-A lets the coordinator reject a date half without a schedule check', async () => {
    repo.findChange.mockResolvedValue(
      flaggedChange({
        field: 'startDateTime',
        originalValue: START,
        proposedValue: '2026-11-11T10:00:00.000Z',
      }),
    );
    const result = await service.resolveChange(
      coordinator(),
      EVENT_ID,
      'chg-1',
      { decision: 'reject' },
    );
    expect(result.closed).toBe(true);
    expect(repo.applyFields).not.toHaveBeenCalled();
  });

  // EVENT-FLAG-07-A: AC7 — the change closes as Applied when the last impacted booking is confirmed and all others were.
  it('EVENT-FLAG-07-A closes the change as Applied once every impacted booking is confirmed', async () => {
    repo.findChange.mockResolvedValue(
      threeBookingChange({ 'bk-1': 'Applied' }),
    );
    const result = await service.resolveChange(
      coordinator(),
      EVENT_ID,
      'chg-1',
      {
        decision: 'confirm',
        bookingId: 'bk-2',
      },
    );
    expect(result.closed).toBe(true);
    expect(repo.applyFields).toHaveBeenCalledWith(
      EVENT_ID,
      { expectedAttendance: 150 },
      NOW,
    );
    expect(repo.resolveChange).toHaveBeenLastCalledWith(
      EVENT_ID,
      'chg-1',
      expect.objectContaining({ status: 'Applied', resolvedBy: 'Coord Nine' }),
    );
  });

  // EVENT-FLAG-07-A: one rejected booking means the single event value is not changed.
  it('EVENT-FLAG-07-A closes the change as Rejected, applying nothing, if any impacted booking was rejected', async () => {
    repo.findChange.mockResolvedValue(
      threeBookingChange({ 'bk-1': 'Rejected' }),
    );
    const result = await service.resolveChange(
      coordinator(),
      EVENT_ID,
      'chg-1',
      {
        decision: 'confirm',
        bookingId: 'bk-2',
      },
    );
    expect(result.closed).toBe(true);
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.resolveChange).toHaveBeenLastCalledWith(
      EVENT_ID,
      'chg-1',
      expect.objectContaining({ status: 'Rejected', clearImpacts: true }),
    );
  });

  // EVENT-FLAG-07-A: while another impacted booking is undecided the change stays open and unapplied.
  it('EVENT-FLAG-07-A keeps the change open while another impacted booking is undecided', async () => {
    repo.findChange.mockResolvedValue(threeBookingChange());
    const result = await service.resolveChange(
      coordinator(),
      EVENT_ID,
      'chg-1',
      {
        decision: 'confirm',
        bookingId: 'bk-1',
      },
    );
    expect(result.closed).toBe(false);
    expect(repo.applyFields).not.toHaveBeenCalled();
    expect(repo.resolveChange).toHaveBeenCalledTimes(1);
  });

  // EVENT-FLAG-07-A: a booking with no impact never blocks closing the change.
  it('EVENT-FLAG-07-A does not wait for a booking that has no impact', async () => {
    repo.findChange.mockResolvedValue(
      flaggedChange({
        impacts: [
          BOOKING_IMPACT,
          {
            bookingId: 'bk-3',
            venueId: 'venue-c',
            venueName: 'Hall C',
            impacted: false,
            conflicts: [],
          },
        ],
      }),
    );
    const result = await service.resolveChange(
      coordinator(),
      EVENT_ID,
      'chg-1',
      {
        decision: 'confirm',
        bookingId: 'bk-1',
      },
    );
    expect(result.closed).toBe(true);
  });

  // EVENT-FLAG-07-A: each booking is decided once, and only if it has something to decide.
  it('EVENT-FLAG-07-A refuses a second decision for a booking and a decision for an unaffected booking', async () => {
    repo.findChange.mockResolvedValue(
      threeBookingChange({ 'bk-1': 'Applied' }),
    );
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
        decision: 'reject',
        bookingId: 'bk-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
        decision: 'confirm',
        bookingId: 'bk-3',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.resolveChange).not.toHaveBeenCalled();
  });

  // EVENT-FLAG-07-A: a booking id must be text.
  it.each([42, '', null])(
    'EVENT-FLAG-07-A rejects booking id %j',
    async (bookingId) => {
      repo.findChange.mockResolvedValue(threeBookingChange());
      await expect(
        service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
          decision: 'confirm',
          bookingId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  // EVENT-FLAG-05-B: the owning organiser may read the history; nobody else outside the event may.
  it('EVENT-FLAG-05-B lets the owning organiser read the history but not other users', async () => {
    repo.listHistory.mockResolvedValue([
      flaggedChange({
        status: 'Applied',
        resolvedBy: 'Coord Nine',
        resolvedAt: '2026-10-05T09:00:00.000Z',
      }),
    ]);
    const history = await service.changeHistory(organiser(), EVENT_ID);
    expect(history).toHaveLength(1);
    await expect(
      service.changeHistory(organiser({ uid: 'organiser-2' }), EVENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.changeHistory({ uid: 'att-1', roles: ['ATTENDEE'] }, EVENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.changeHistory(undefined, EVENT_ID),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('SPM-49 / SPM-85 atomicity', () => {
  const inTransaction = () => {
    const runInTransaction = vi.fn(<T>(work: () => Promise<T>) => work());
    Object.assign(repo, { runInTransaction });
    return runInTransaction;
  };

  // EVENT-FLAG-04-SEC-1: an update and a decision each run inside one repository transaction.
  it('EVENT-FLAG-04-SEC-1 runs an update and a decision each inside one repository transaction', async () => {
    const runInTransaction = inTransaction();
    await service.updateEvent(coordinator(), EVENT_ID, { name: 'Renamed' });
    repo.findChange.mockResolvedValue(flaggedChange());
    await service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
      decision: 'reject',
    });
    expect(runInTransaction).toHaveBeenCalledTimes(2);
  });

  // EVENT-FLAG-04-SEC-1: invalid input is refused before any transaction is opened.
  it('EVENT-FLAG-04-SEC-1 refuses invalid input before opening a transaction', async () => {
    const runInTransaction = inTransaction();
    await expect(
      service.updateEvent(coordinator(), EVENT_ID, { name: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resolveChange(coordinator(), EVENT_ID, 'chg-1', {
        decision: 'maybe',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateEvent(organiser(), EVENT_ID, { name: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  // EVENT-FLAG-04-SEC-1: a failure part-way propagates, so the repository rolls the whole transaction back.
  it('EVENT-FLAG-04-SEC-1 propagates a failure part-way so nothing is half-saved', async () => {
    inTransaction();
    repo.listVenueBookings.mockResolvedValue([venueBooking()]);
    repo.createFlaggedChange.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.updateEvent(coordinator(), EVENT_ID, {
        name: 'Renamed',
        expectedAttendance: 150,
      }),
    ).rejects.toThrow('db down');
  });
});
