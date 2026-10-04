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
// events do after auto-assignment has run), so tests that aren't specifically
// about assignment don't also need to stub the assignment queries. The
// dedicated SPM-123 assignment tests below use an unassigned row.
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
  // SPM-61: Approved counts as published, and each row carries the caller's
  // own registration status.
  it('lists attendee-viewable events with current registration availability', async () => {
    const row = { ...savedEventRow(), status: 'Confirmed', my_registration_status: 'Registered' };
    db.query.mockResolvedValue({ rows: [row] });

    const events = await service.list(attendeeUser());

    expect(events).toMatchObject([
      { id: row.id, status: 'confirmed', availableRegistrationSpots: 17, myRegistrationStatus: 'registered' },
    ]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('AS available_registration_spots'),
      [attendeeUser().uid],
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('Confirmed', 'Completed', 'Cancelled')"),
      [attendeeUser().uid],
    );
  });

  // SPM-38 AC1/AC2: a coordinator's My Events list is scoped to only the
  // requests auto-assignment has given them.
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

    // SPM-99 EVENT-VIEW-01-A and supplementary security coverage: attendees can read a
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

      // Approved events are internal workflow state and hidden from attendees.
      db.query.mockResolvedValueOnce({ rows: [{ ...savedEventRow(), status: 'Approved' }] });
      await expect(service.get(attendeeUser(), savedEventRow().id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('EVE-REV-04-H hides an unassigned event from every coordinator, not just non-matching ones', async () => {
      const row = { ...savedEventRow(), coordinator_id: null, coordinator_name: null };
      db.query.mockResolvedValue({ rows: [row] });

      await expect(
        service.get(coordinatorUser(), row.id),
      ).rejects.toBeInstanceOf(NotFoundException);
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

  // Supplementary SPM-99 negative path: an authenticated attendee receives the same safe
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

  // SPM-123: a newly-submitted request is automatically assigned to the
  // active coordinator with the fewest active requests. The assignment and
  // the coordinator's notification are saved in the same transaction as the
  // event itself.
  describe('SPM-123 automatic coordinator assignment', () => {
    type DbCandidate = {
      id: string;
      name: string;
      activeLoad: number;
      lastAssignedAt: Date | null;
    };
    const COORD_A: DbCandidate = { id: 'coord-a', name: 'Coordinator A', activeLoad: 0, lastAssignedAt: null };
    const COORD_B: DbCandidate = { id: 'coord-b', name: 'Coordinator B', activeLoad: 0, lastAssignedAt: null };

    function unassignedRow() {
      return { ...savedEventRow(), coordinator_id: null, coordinator_name: null };
    }

    // Answers the queries create() runs, by what they are rather than by call
    // order: INSERT event, lock, candidate lookup, UPDATE, notification.
    function wireAssignment(
      candidates: DbCandidate[],
      inserted: Record<string, unknown> = unassignedRow(),
    ) {
      db.transaction.mockImplementation((sql: string) => {
        const text = String(sql).trim();
        if (text.startsWith('INSERT INTO events')) return Promise.resolve({ rows: [inserted] });
        if (text.includes('FROM users')) return Promise.resolve({ rows: candidates });
        if (text.startsWith('UPDATE events')) {
          const winner = candidates.reduce((best, c) =>
            c.activeLoad < best.activeLoad ? c : best,
          );
          return Promise.resolve({
            rows: [{ ...inserted, coordinator_id: winner.id, coordinator_name: winner.name }],
          });
        }
        return Promise.resolve({ rows: [] });
      });
    }

    const sqlCalls = () => db.transaction.mock.calls.map((c) => String(c[0]).trim());
    const callFor = (prefix: string) =>
      db.transaction.mock.calls.find((c) => String(c[0]).trim().startsWith(prefix));
    const indexOfSql = (fragment: string) => sqlCalls().findIndex((s) => s.includes(fragment));

    it('EVE-ASN-01-A assigns exactly one coordinator as part of submitting, without changing status', async () => {
      wireAssignment([COORD_A, COORD_B]);

      const result = await service.create(organiserUser(), validEventRequest());

      expect(result.event.coordinatorId).toBe('coord-a');
      expect(result.event.coordinatorName).toBe('Coordinator A');
      expect(result.event.status).toBe('submitted');
      expect(sqlCalls().filter((s) => s.startsWith('UPDATE events'))).toHaveLength(1);
    });

    // SPM-38 EVE-REV-05-F and SPM-123 EVE-ASN-01-B: with no active coordinator
    // the request is still saved, just unassigned.
    it('EVE-ASN-01-B leaves the event unassigned when no active coordinator exists', async () => {
      wireAssignment([]);

      const result = await service.create(organiserUser(), validEventRequest());

      expect(result.event.coordinatorId).toBeUndefined();
      expect(sqlCalls().some((s) => s.startsWith('UPDATE events'))).toBe(false);
      expect(sqlCalls().some((s) => s.startsWith('INSERT INTO notifications'))).toBe(false);
    });

    // SPM-38 EVE-REV-05-C and SPM-123 EVE-ASN-01-C: an event that already has
    // a coordinator keeps them.
    it('EVE-ASN-01-C never reassigns an event that already has a coordinator', async () => {
      wireAssignment([COORD_A, COORD_B], savedEventRow());

      const result = await service.create(organiserUser(), validEventRequest());

      expect(result.event.coordinatorId).toBe('coord-9');
      const sql = sqlCalls();
      expect(sql.some((s) => s.includes('FROM users'))).toBe(false);
      expect(sql.some((s) => s.startsWith('UPDATE events'))).toBe(false);
      expect(sql.some((s) => s.startsWith('INSERT INTO notifications'))).toBe(false);
    });

    it('EVE-ASN-01-D takes the assignment lock before it reads anyone\'s workload', async () => {
      wireAssignment([COORD_A]);

      await service.create(organiserUser(), validEventRequest());

      const lock = indexOfSql('pg_advisory_xact_lock');
      expect(lock).toBeGreaterThan(-1);
      expect(lock).toBeLessThan(indexOfSql('FROM users'));
      // Every submission locks the same named key, so they queue behind each other.
      expect(callFor('SELECT pg_advisory_xact_lock')![1]).toEqual(['event-coordinator-assignment']);
    });

    it('EVE-ASN-02-A notifies the assigned coordinator that a new request awaits their review', async () => {
      wireAssignment([COORD_A]);

      await service.create(organiserUser(), validEventRequest());

      const notification = callFor('INSERT INTO notifications')!;
      expect(String(notification[0])).toContain("'coordinator_assignment'");
      expect(notification[1]).toEqual([
        expect.any(String),
        'coord-a',
        'New event request "Welcome Evening" is awaiting your review.',
        savedEventRow().id,
      ]);
    });

    it('EVE-ASN-02-B saves the assignment and notification atomically with the event', async () => {
      wireAssignment([COORD_A]);
      const original = db.transaction.getMockImplementation()!;
      db.transaction.mockImplementation((sql: string, params?: unknown[]) => {
        if (String(sql).trim().startsWith('INSERT INTO notifications'))
          return Promise.reject(new Error('notification store down'));
        return original(sql, params);
      });

      await expect(service.create(organiserUser(), validEventRequest())).rejects.toThrow(
        'notification store down',
      );

      const sql = sqlCalls();
      expect(sql).toContain('ROLLBACK');
      expect(sql).not.toContain('COMMIT');
    });

    it('EVE-ASN-03-H gives the request to the coordinator with the fewest active requests', async () => {
      wireAssignment([
        { ...COORD_A, activeLoad: 3 },
        { ...COORD_B, activeLoad: 1 },
      ]);

      const result = await service.create(organiserUser(), validEventRequest());

      expect(result.event.coordinatorId).toBe('coord-b');
    });

    it('EVE-ASN-03-I rotates between equally loaded coordinators by who was assigned least recently', async () => {
      wireAssignment([
        { ...COORD_A, lastAssignedAt: new Date('2026-09-22T10:00:00.000Z') },
        { ...COORD_B, lastAssignedAt: new Date('2026-09-21T10:00:00.000Z') },
      ]);

      await service.create(organiserUser(), validEventRequest());

      const update = callFor('UPDATE events')!;
      expect(update[1]).toEqual([savedEventRow().id, 'coord-b', 'Coordinator B']);
    });

    it('EVE-ASN-05-D only ever considers active coordinators', async () => {
      wireAssignment([COORD_A]);

      await service.create(organiserUser(), validEventRequest());

      const lookup = sqlCalls().find((s) => s.includes('FROM users'))!;
      expect(lookup).toContain('users.is_active = true');
    });
  });

  // SPM-123 AC4 and AC5: the coordinator's dashboard is their assigned
  // requests, and an assignment stays after a decision is made.
  describe('SPM-123 assignment after a decision', () => {
    it('EVE-ASN-04-A lists only the requests assigned to the coordinator, whatever their status', async () => {
      const submitted = { ...savedEventRow(), id: '00000000-0000-4000-8000-000000000001', status: 'Submitted' };
      const approved = { ...savedEventRow(), id: '00000000-0000-4000-8000-000000000002', status: 'Approved' };
      const rejected = {
        ...savedEventRow(),
        id: '00000000-0000-4000-8000-000000000003',
        status: 'Rejected',
        rejection_reason: 'Venue unavailable for the requested date.',
      };
      db.query.mockResolvedValue({ rows: [submitted, approved, rejected] });

      const events = await service.list(coordinatorUser());

      expect(events.map((e) => e.status)).toEqual(['submitted', 'approved', 'rejected']);
      expect(events.every((e) => e.coordinatorId === 'coord-9')).toBe(true);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('coordinator_id = $1');
      expect(sql).not.toContain('status');
      expect(params).toEqual(['coord-9']);
    });

    it('EVE-ASN-06-A keeps the coordinator on an approved request through Planning', async () => {
      db.query.mockResolvedValue({ rows: [{ ...savedEventRow(), status: 'Approved' }] });

      const event = await service.get(coordinatorUser(), savedEventRow().id);

      expect(event).toMatchObject({ status: 'approved', coordinatorId: 'coord-9', coordinatorName: 'Coord Nine' });
    });

    it('EVE-ASN-06-B keeps the coordinator able to open a request after rejecting it', async () => {
      db.query.mockResolvedValue({
        rows: [
          {
            ...savedEventRow(),
            status: 'Rejected',
            rejection_reason: 'Venue unavailable for the requested date.',
          },
        ],
      });

      const event = await service.get(coordinatorUser(), savedEventRow().id);

      expect(event).toMatchObject({ status: 'rejected', coordinatorId: 'coord-9' });
    });
  });
});
