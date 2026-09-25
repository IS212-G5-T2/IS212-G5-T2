import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { EventsService } from './events.service.js';

const db = {
  query: vi.fn(),
  connect: vi.fn(),
  transaction: vi.fn(),
  release: vi.fn(),
  end: vi.fn(),
};

const database = {
  query: db.query,
  transaction: vi.fn(),
};

function organiserUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    uid: 'organiser-1',
    roles: ['ORGANISER'],
    email: 'organiser@example.test',
    name: 'Demo Organiser',
    ...overrides,
  };
}

function coordinatorUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    uid: 'coord-9',
    roles: ['COORDINATOR'],
    email: 'coord9@example.test',
    name: 'Coord Nine',
    ...overrides,
  };
}

function attendeeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    uid: 'attendee-1',
    roles: ['ATTENDEE'],
    email: 'attendee@example.test',
    name: 'Attendee One',
    ...overrides,
  };
}

function futureIso(daysFromNow: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function validEventRequest() {
  return {
    name: 'Welcome Evening',
    purpose: 'Community building',
    description: 'A welcome event for new members.',
    startDateTime: futureIso(10, 10),
    endDateTime: futureIso(10, 13),
    expectedAttendance: 80,
    layout: 'Banquet',
    facilities: ['Catering'],
    accessibility: ['Wheelchair ramps'],
    attachments: [
      {
        id: 'attachment-1',
        name: 'proposal.txt',
        type: 'text/plain',
        size: 12,
        dataUrl: 'data:text/plain;base64,SGVsbG8=',
      },
    ],
    equipmentNeeds: 'Two microphones',
    submissionKey: '00000000-0000-4000-8000-000000000036',
  };
}

// The default row already carries a coordinator assignment (as steady-state
// events do after round-robin has run), so tests that aren't specifically
// about assignment don't also need to stub the COUNT/UPDATE auto-assign
// queries. The dedicated round-robin tests below use an unassigned row.
function savedEventRow() {
  const request = validEventRequest();

  return {
    id: request.submissionKey,
    organiser_id: 'organiser-1',
    organiser_name: 'Demo Organiser',
    coordinator_id: 'coord-9',
    coordinator_name: 'Coord Nine',
    event_name: request.name,
    purpose: request.purpose,
    description: request.description,
    start_date_time: new Date(request.startDateTime),
    end_date_time: new Date(request.endDateTime),
    expected_attendance: request.expectedAttendance,
    preferred_room_layout: request.layout,
    required_facilities: request.facilities,
    accessibility_needs: request.accessibility,
    attachments: request.attachments,
    equipment_needs: request.equipmentNeeds,
    registration_enabled: true,
    registration_opens_at: new Date('2026-10-01T09:00:00.000Z'),
    registration_closes_at: new Date('2026-10-14T23:59:00.000Z'),
    registration_limit: 80,
    available_registration_spots: 17,
    status: 'Submitted',
    created_at: new Date('2026-09-13T00:00:00.000Z'),
    updated_at: new Date('2026-09-13T00:00:00.000Z'),
  };
}

let service: EventsService;

beforeEach(async () => {
  vi.resetAllMocks();
  db.transaction.mockResolvedValue({ rows: [] });
  database.transaction.mockImplementation(async (work) => {
    await db.transaction('BEGIN');
    try {
      const result = await work({ query: db.transaction });
      await db.transaction('COMMIT');
      return result;
    } catch (error) {
      await db.transaction('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  });

  const module = await Test.createTestingModule({
    providers: [EventsService, { provide: DatabaseService, useValue: database }],
  }).compile();

  service = module.get(EventsService);
});

describe('EventsService', () => {
  // SPM-38 AC1: the assigned coordinator can view the full submitted details
  // of a request assigned to them (name, purpose, date/time, attendance,
  // venue and equipment requirements, accessibility needs).
  it('EVE-REV-01-A returns the full submitted details of an event assigned to the coordinator', async () => {
    const row = savedEventRow();
    db.query.mockResolvedValue({ rows: [row] });

    const event = await service.get(coordinatorUser(), row.id);

    expect(event).toMatchObject({
      id: row.id,
      name: 'Welcome Evening',
      purpose: 'Community building',
      startDateTime: row.start_date_time.toISOString(),
      endDateTime: row.end_date_time.toISOString(),
      expectedAttendance: 80,
      venueRequirements: {
        layout: 'Banquet',
        facilities: ['Catering'],
        accessibility: ['Wheelchair ramps'],
      },
      equipmentNeeds: 'Two microphones',
    });
  });

  // SPM-38 AC2: the coordinator can see the current status of the request.
  it('EVE-REV-02-A shows the current status of the event request', async () => {
    const row = { ...savedEventRow(), status: 'Approved' };
    db.query.mockResolvedValue({ rows: [row] });

    const event = await service.get(coordinatorUser(), row.id);

    expect(event.status).toBe('approved');
  });

  it('Q1-042 loads the submitted draft event and defaults legacy attachments', async () => {
    const row = { ...savedEventRow(), attachments: null };
    db.query.mockResolvedValue({ rows: [row] });
    expect(await service.get(organiserUser(), row.id)).toMatchObject({
      id: row.id,
      attachments: [],
    });
  });
  it('Q1-043 draft submission shares transaction ownership on success and failure', async () => {
    const row = savedEventRow();
    const client = { query: db.transaction, release: db.release };
    db.transaction.mockResolvedValueOnce({ rows: [row] });
    expect(
      await service.create(organiserUser(), validEventRequest(), client as never, row.id),
    ).toMatchObject({ event: { id: row.id } });
    expect(db.connect).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalledWith('BEGIN');
    expect(db.transaction).not.toHaveBeenCalledWith('COMMIT');
    expect(db.release).not.toHaveBeenCalled();
    db.transaction.mockRejectedValueOnce(
      new Error('shared transaction failed'),
    );
    await expect(
      service.create(organiserUser(), validEventRequest(), client as never, row.id),
    ).rejects.toThrow('shared transaction failed');
    expect(db.transaction).not.toHaveBeenCalledWith('ROLLBACK');
    expect(db.release).not.toHaveBeenCalled();
  });
  // SPM-36 Test Cases EVE-CRE-04-A, EVE-CRE-04-B, EVE-CRE-04-C, and EVE-CRE-04-D
  it('rejects invalid requests before opening a database transaction', async () => {
    await expect(
      service.create(organiserUser(), { ...validEventRequest(), name: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.connect).not.toHaveBeenCalled();
  });

  it('rejects event creation from a caller without the organiser role', async () => {
    await expect(
      service.create(coordinatorUser(), validEventRequest()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(db.connect).not.toHaveBeenCalled();
  });

  // SPM-36 Test Case EVE-CRE-06-A (its attachment assertion below also incidentally covers EVE-CRE-08-A persistence)
  it('saves a valid request under the authenticated organiser with Submitted status', async () => {
    const request = validEventRequest();
    const row = savedEventRow();
    db.transaction
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });

    const result = await service.create(organiserUser(), {
      ...request,
      organiserId: 'someone-else',
      status: 'approved',
    });

    expect(result.event).toMatchObject({
      id: row.id,
      organiserId: 'organiser-1',
      organiserName: 'Demo Organiser',
      status: 'submitted',
      name: 'Welcome Evening',
      expectedAttendance: 80,
      venueRequirements: {
        layout: 'Banquet',
        facilities: ['Catering'],
        accessibility: ['Wheelchair ramps'],
      },
      attachments: [
        {
          id: 'attachment-1',
          name: 'proposal.txt',
          type: 'text/plain',
          size: 12,
          dataUrl: 'data:text/plain;base64,SGVsbG8=',
        },
      ],
    });
    expect(result.message).toContain('submitted successfully');
    expect(db.transaction).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO events'),
      expect.arrayContaining([
        'organiser-1',
        'Demo Organiser',
        'organiser@example.test',
        'Welcome Evening',
        'Community building',
        'A welcome event for new members.',
        80,
        'Banquet',
        JSON.stringify(request.attachments),
      ]),
    );
    expect(db.transaction).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['someone-else', 'approved']),
    );
    expect(db.transaction).toHaveBeenLastCalledWith('COMMIT');
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  // SPM-36 retry safety check
  it('returns the existing event when the same submission is retried', async () => {
    const request = validEventRequest();
    const row = savedEventRow();
    db.transaction
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });

    const result = await service.create(organiserUser(), request);

    expect(result.event.id).toBe(row.id);
    expect(db.transaction).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('submission_key=$2'),
      ['organiser-1', request.submissionKey],
    );
  });

  // SPM-36 transaction safety check
  it('rolls back database failures and releases the connection', async () => {
    db.transaction
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.create(organiserUser(), validEventRequest()),
    ).rejects.toThrow('database unavailable');

    expect(db.transaction).toHaveBeenLastCalledWith('ROLLBACK');
    expect(db.transaction).not.toHaveBeenCalledWith('COMMIT');
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  // SPM-36 Test Case EVE-CRE-07-B
  it('loads submitted events for the authenticated organiser under My Events', async () => {
    const row = savedEventRow();
    db.query.mockResolvedValue({ rows: [row] });

    const events = await service.list(organiserUser());

    expect(events[0]).toMatchObject({
      id: row.id,
      name: 'Welcome Evening',
      organiserId: 'organiser-1',
      status: 'submitted',
      expectedAttendance: 80,
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('organiser_id = $1'),
      ['organiser-1'],
    );
  });

  it('requires authentication to list events', async () => {
    await expect(service.list(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  // SPM-99 EVENT-VIEW-01-A: the attendee browse feed exposes only safe
  // attendee-facing lifecycle states, with registration availability included.
  it('lists attendee-viewable events with current registration availability', async () => {
    const row = { ...savedEventRow(), status: 'Confirmed' };
    db.query.mockResolvedValue({ rows: [row] });

    const events = await service.list(attendeeUser());

    expect(events).toMatchObject([{ id: row.id, status: 'confirmed', availableRegistrationSpots: 17 }]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('AS available_registration_spots'),
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('Confirmed', 'Completed', 'Cancelled')"),
    );
  });

  // SPM-38 AC1/AC2: a coordinator's My Events list is scoped to only the
  // requests round-robin has assigned to them.
  it('scopes list to the coordinator own assigned events', async () => {
    const row = savedEventRow();
    db.query.mockResolvedValue({ rows: [row] });

    const events = await service.list(coordinatorUser());

    expect(events[0]).toMatchObject({ id: row.id, coordinatorId: 'coord-9' });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('coordinator_id = $1'),
      ['coord-9'],
    );
  });

  // The list view must not ship the base64 file contents (they balloon the
  // response); metadata is retained so the UI can still show name/size/type.
  it('omits attachment dataUrl from the list while keeping metadata', async () => {
    const row = savedEventRow();
    db.query.mockResolvedValue({ rows: [row] });

    const events = await service.list(organiserUser());

    expect(events[0].attachments).toEqual([
      { id: 'attachment-1', name: 'proposal.txt', type: 'text/plain', size: 12 },
    ]);
    expect(events[0].attachments[0]).not.toHaveProperty('dataUrl');
  });

  // The detail endpoint still returns the full attachment including dataUrl.
  it('keeps attachment dataUrl on the single-event detail', async () => {
    const row = savedEventRow();
    db.query.mockResolvedValue({ rows: [row] });

    const event = await service.get(organiserUser(), row.id);

    expect(event.attachments[0]).toMatchObject({
      name: 'proposal.txt',
      dataUrl: 'data:text/plain;base64,SGVsbG8=',
    });
  });

  // SPM-38 AC4: a coordinator may view a request only when it is assigned to
  // them; anyone else (a different coordinator, a non-owning organiser, or an
  // unauthenticated caller) gets the same NotFoundException as a bad ID, so
  // existence is never leaked.
  describe('SPM-38 AC4: per-coordinator access restriction', () => {
    it('EVE-REV-04-A lets the assigned coordinator view the event', async () => {
      const row = savedEventRow();
      db.query.mockResolvedValue({ rows: [row] });

      const event = await service.get(coordinatorUser(), row.id);

      expect(event).toMatchObject({ id: row.id, coordinatorId: 'coord-9' });
    });

    it('EVE-REV-04-B hides the event from a coordinator it is not assigned to', async () => {
      const row = savedEventRow();
      db.query.mockResolvedValue({ rows: [row] });

      await expect(
        service.get(coordinatorUser({ uid: 'coord-other', name: 'Coord Other' }), row.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('EVE-REV-04-C hides the event from an organiser who does not own it', async () => {
      const row = savedEventRow();
      db.query.mockResolvedValue({ rows: [row] });

      await expect(
        service.get(organiserUser({ uid: 'someone-else' }), row.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('EVE-REV-04-D requires authentication to view event details', async () => {
      await expect(
        service.get(undefined, savedEventRow().id),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('EVE-REV-04-G hides the event from a role that is neither organiser nor coordinator', async () => {
      const row = savedEventRow();
      db.query.mockResolvedValue({ rows: [row] });

      await expect(
        service.get(organiserUser({ uid: 'coord-9', roles: ['ATTENDEE'] }), row.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // SPM-99 EVENT-VIEW-01-A and EVENT-VIEW-05-B: attendees can read a
    // confirmed event, but submitted planning data remains unavailable.
    it('lets attendees view only attendee-facing lifecycle states', async () => {
      const attendeeVisible = { ...savedEventRow(), status: 'Confirmed' };
      db.query.mockResolvedValueOnce({ rows: [attendeeVisible] });
      await expect(service.get(attendeeUser(), attendeeVisible.id)).resolves.toMatchObject({
        registrationEnabled: true,
        registrationOpensAt: '2026-10-01T09:00:00.000Z',
        registrationClosesAt: '2026-10-14T23:59:00.000Z',
        availableRegistrationSpots: 17,
      });

      db.query.mockResolvedValueOnce({ rows: [savedEventRow()] });
      await expect(service.get(attendeeUser(), savedEventRow().id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('EVE-REV-04-H hides an unassigned event from every coordinator, not just non-matching ones', async () => {
      const row = { ...savedEventRow(), coordinator_id: null, coordinator_name: null };
      db.query.mockResolvedValue({ rows: [row] });

      await expect(
        service.get(coordinatorUser(), row.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // A dual-role account (e.g. coor_tech@connectsphere.sg, which holds both
    // ORGANISER and COORDINATOR in this system) must see an event through
    // either match — owning it as organiser, or being its assigned coordinator.
    it('EVE-REV-04-I lets a dual-role (organiser + coordinator) user view an event via either match', async () => {
      const ownedByOrganiserRole = { ...savedEventRow(), organiser_id: 'dual-1', coordinator_id: 'someone-else' };
      const assignedByCoordinatorRole = { ...savedEventRow(), organiser_id: 'someone-else', coordinator_id: 'dual-1' };
      const dualRoleUser = organiserUser({ uid: 'dual-1', roles: ['ORGANISER', 'COORDINATOR'] });

      db.query.mockResolvedValueOnce({ rows: [ownedByOrganiserRole] });
      await expect(service.get(dualRoleUser, ownedByOrganiserRole.id)).resolves.toMatchObject({
        organiserId: 'dual-1',
      });

      db.query.mockResolvedValueOnce({ rows: [assignedByCoordinatorRole] });
      await expect(service.get(dualRoleUser, assignedByCoordinatorRole.id)).resolves.toMatchObject({
        coordinatorId: 'dual-1',
      });
    });
  });

  describe('assignCoordinator', () => {
    // Assignment (auto or manual) no longer advances status on its own —
    // only a clarification request does that (see ClarificationsService).
    it('claims a submitted event: writes the coordinator without changing status', async () => {
      const row = {
        ...savedEventRow(),
        coordinator_id: 'coord-9',
        coordinator_name: 'Coord Nine',
        status: 'Submitted',
      };
      db.query.mockResolvedValue({ rows: [row] });

      const result = await service.assignCoordinator(row.id, {
        coordinatorId: 'coord-9',
        coordinatorName: 'Coord Nine',
      });

      expect(result).toMatchObject({
        coordinatorId: 'coord-9',
        coordinatorName: 'Coord Nine',
        status: 'submitted',
      });
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('UPDATE events');
      expect(sql).not.toContain('Under_Review');
      expect(params).toEqual([row.id, 'coord-9', 'Coord Nine']);
    });

    it('rejects a missing coordinator id or name before touching the database', async () => {
      await expect(
        service.assignCoordinator(savedEventRow().id, { coordinatorName: 'Coord Nine' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.assignCoordinator(savedEventRow().id, { coordinatorId: '  ', coordinatorName: '  ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('rejects a malformed event id without querying', async () => {
      await expect(
        service.assignCoordinator('not-a-uuid', {
          coordinatorId: 'coord-9',
          coordinatorName: 'Coord Nine',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns not found when the event does not exist', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await expect(
        service.assignCoordinator(savedEventRow().id, {
          coordinatorId: 'coord-9',
          coordinatorName: 'Coord Nine',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // SPM-36 event lookup guard
  it('returns not found for malformed and unknown event IDs', async () => {
    const row = savedEventRow();

    await expect(
      service.get(organiserUser(), 'not-a-valid-event-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).not.toHaveBeenCalled();

    db.query.mockResolvedValue({ rows: [] });

    await expect(service.get(organiserUser(), row.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // SPM-99 EVENT-VIEW-05-A: an authenticated attendee receives the same safe
  // not-found result for a syntactically valid identifier with no event row.
  it('does not disclose a nonexistent event to an attendee', async () => {
    const missingId = '00000000-0000-4000-8000-000000000099';
    db.query.mockResolvedValue({ rows: [] });

    await expect(service.get(attendeeUser(), missingId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [missingId]);
  });

  // Supplementary negative path: malformed identifiers are rejected before an
  // attendee request reaches persistence, just like a real missing event.
  it('rejects a malformed event identifier from an attendee without querying', async () => {
    await expect(
      service.get(attendeeUser(), 'not-a-valid-event-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).not.toHaveBeenCalled();
  });

  // SPM-38 AC5: a newly-submitted request is round-robin assigned a
  // coordinator automatically, cycling through the live database roster
  // (see coordinator-roster.ts), and an event that already has a coordinator
  // is never reassigned.
  describe('SPM-38 AC5: round-robin coordinator assignment', () => {
    const TEST_ROSTER = [
      { id: 'roster-coord-1', name: 'Coordinator One' },
      { id: 'roster-coord-2', name: 'Coordinator Two' },
    ];

    it('EVE-REV-05-A assigns the first roster coordinator when no events have been assigned yet', async () => {
      const request = validEventRequest();
      const freshRow = {
        ...savedEventRow(),
        coordinator_id: null,
        coordinator_name: null,
        status: 'Submitted',
      };
      const assignedRow = {
        ...freshRow,
        coordinator_id: TEST_ROSTER[0].id,
        coordinator_name: TEST_ROSTER[0].name,
      };
      db.transaction
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [freshRow] }) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT assigned coordinators
        .mockResolvedValueOnce({ rows: TEST_ROSTER }) // SELECT live coordinator roster
        .mockResolvedValueOnce({ rows: [assignedRow] }); // UPDATE assigns coordinator

      const result = await service.create(organiserUser(), request);

      expect(result.event.coordinatorId).toBe(TEST_ROSTER[0].id);
      // Assignment alone does not advance status; the event stays Submitted.
      expect(result.event.status).toBe('submitted');
      expect(db.transaction).toHaveBeenNthCalledWith(
        5,
        expect.stringContaining('UPDATE events'),
        [freshRow.id, TEST_ROSTER[0].id, TEST_ROSTER[0].name],
      );
    });

    it('EVE-REV-05-B cycles to the next roster coordinator after a prior assignment', async () => {
      const request = validEventRequest();
      const freshRow = {
        ...savedEventRow(),
        coordinator_id: null,
        coordinator_name: null,
        status: 'Submitted',
      };
      const assignedRow = {
        ...freshRow,
        coordinator_id: TEST_ROSTER[1].id,
        coordinator_name: TEST_ROSTER[1].name,
      };
      db.transaction
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [freshRow] }) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // COUNT assigned coordinators
        .mockResolvedValueOnce({ rows: TEST_ROSTER }) // SELECT live coordinator roster
        .mockResolvedValueOnce({ rows: [assignedRow] }); // UPDATE assigns coordinator

      const result = await service.create(organiserUser(), request);

      expect(result.event.coordinatorId).toBe(TEST_ROSTER[1].id);
    });

    it('EVE-REV-05-C does not reassign an event that already has a coordinator', async () => {
      const request = validEventRequest();
      const row = savedEventRow();
      db.transaction
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [row] }); // INSERT (already assigned)

      const result = await service.create(organiserUser(), request);

      expect(result.event.coordinatorId).toBe('coord-9');
      expect(db.transaction).not.toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
      );
    });

    // If every coordinator account has been deactivated, a submission must
    // still succeed rather than failing outright — it's just left unassigned
    // for a human to fix manually.
    it('EVE-REV-05-F leaves the event unassigned when no active coordinator account exists', async () => {
      const request = validEventRequest();
      const freshRow = {
        ...savedEventRow(),
        coordinator_id: null,
        coordinator_name: null,
        status: 'Submitted',
      };
      db.transaction
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [freshRow] }) // INSERT
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT assigned coordinators
        .mockResolvedValueOnce({ rows: [] }); // SELECT live coordinator roster — empty

      const result = await service.create(organiserUser(), request);

      expect(result.event.coordinatorId).toBeUndefined();
      expect(db.transaction).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE events'),
        expect.anything(),
      );
    });
  });
});
