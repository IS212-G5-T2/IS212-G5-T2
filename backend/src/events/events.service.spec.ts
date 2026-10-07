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

// The default row already carries a coordinator assignment, as events do once
// the Event Coordinator Lead has assigned them (SPM-123).
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
  // requests the Event Coordinator Lead assigned to them (SPM-123).
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
      // The event, then no reassignment history for this coordinator (SPM-46 checks it before "not found").
      db.query.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });

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
      // The event, then no reassignment history for this coordinator (SPM-46 checks it before "not found").
      db.query.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });

      await expect(
        service.get(coordinatorUser(), row.id),
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

  // SPM-123 AC1: a submitted request waits in the Lead's unassigned queue.
  // It is never auto-assigned (this replaces SPM-38's round-robin).
  it('LEAD-ASN-01-A saves a submitted request with no coordinator and sends no assignment notification', async () => {
    // Arrange: the insert returns a fresh, unassigned row.
    const freshRow = { ...savedEventRow(), coordinator_id: null, coordinator_name: null, status: 'Submitted' };
    db.transaction
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [freshRow] }); // INSERT

    // Act: submit the request.
    const result = await service.create(organiserUser(), validEventRequest());

    // Assert: unassigned and Submitted; the only statements are BEGIN, INSERT, COMMIT.
    expect(result.event.coordinatorId).toBeUndefined();
    expect(result.event.coordinatorName).toBeUndefined();
    expect(result.event.status).toBe('submitted');
    const sql = db.transaction.mock.calls.map(([text]) => String(text).replace(/\s+/g, ' ').trim());
    expect(sql).toHaveLength(3);
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toMatch(/^INSERT INTO events/);
    expect(sql[2]).toBe('COMMIT');
  });
});

// ---------------------------------------------------------------------------
// SPM-46 View a Reassigned Event (backend): the event data says who the
// current coordinator received it from and when (AC2), and a previous
// coordinator is told the event moved instead of "not found" (AC4).
// Test cases: REASN-VIEW-02-C, 02-D, 02-I, 04-A, 04-D.
// ---------------------------------------------------------------------------
describe('SPM-46: reassignment context on events', () => {
  // The latest reassignment as the query returns it (Postgres JSON uses an offset, not Z).
  const latestToCoord9 = { coordinatorName: 'Coordinator 1', reassignedAt: '2026-10-07T06:05:00+00:00', toCoordinatorId: 'coord-9' };

  // The current coordinator sees who it came from and when; an event never reassigned has nothing.
  // Kills: B4 (reassignment time returned unconverted).
  it('REASN-VIEW-02-C includes reassignedFrom for a reassigned event and leaves it out otherwise', async () => {
    // Arrange: one reassigned event, then one never reassigned.
    db.query.mockResolvedValueOnce({ rows: [{ ...savedEventRow(), latest_reassignment: latestToCoord9 }] });
    db.query.mockResolvedValueOnce({ rows: [{ ...savedEventRow(), latest_reassignment: null }] });

    // Act: the current coordinator opens each.
    const reassigned = await service.get(coordinatorUser(), savedEventRow().id);
    const original = await service.get(coordinatorUser(), savedEventRow().id);

    // Assert: the name and an ISO time for the reassigned one; nothing for the other; the query reads the history.
    expect(reassigned.reassignedFrom).toEqual({ coordinatorName: 'Coordinator 1', reassignedAt: '2026-10-07T06:05:00.000Z' });
    expect(original.reassignedFrom).toBeUndefined();
    expect(String(db.query.mock.calls[0][0])).toContain('event_reassignments');
  });

  // The list carries it too, from the most recent reassignment, and only if it was to the current coordinator.
  // Kills: B2 (shown when the latest reassignment went elsewhere), B3 (oldest first), B10 (no id tie-break).
  it('REASN-VIEW-02-D takes the most recent reassignment, for the list too, and only when it was to the current coordinator', async () => {
    // Arrange: the coordinator's list has one event reassigned to them and one whose latest reassignment went elsewhere.
    db.query.mockResolvedValueOnce({
      rows: [
        { ...savedEventRow(), latest_reassignment: latestToCoord9 },
        { ...savedEventRow(), id: 'other-event', latest_reassignment: { ...latestToCoord9, toCoordinatorId: 'coord-2' } },
      ],
    });

    // Act: load the list.
    const [first, second] = await service.list(coordinatorUser());

    // Assert: shown for the first only; the query picks the latest reassignment per event.
    expect(first.reassignedFrom).toEqual({ coordinatorName: 'Coordinator 1', reassignedAt: '2026-10-07T06:05:00.000Z' });
    expect(second.reassignedFrom).toBeUndefined();
    const sql = String(db.query.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toMatch(/event_reassignments/);
    // Latest first, with the row id as a fixed tie-break so the choice never depends on storage order.
    expect(sql).toMatch(/ORDER BY (\w+)\.reassigned_at DESC, \1\.id DESC/);
    expect(sql).toMatch(/LIMIT 1/);
  });

  // Staffing history is only for the coordinator who now holds the event, not the organiser or attendees.
  // Kills: B9 (reassignment details sent to the organiser and attendees).
  it('REASN-VIEW-02-I sends reassignedFrom only to the current coordinator, never to the organiser or an attendee', async () => {
    // Arrange: the same reassigned, attendee-visible event, read by its organiser, then an attendee, then the organiser's list.
    const row = { ...savedEventRow(), status: 'Confirmed', latest_reassignment: latestToCoord9 };
    db.query
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [row] });

    // Act: the organiser and an attendee open it; the organiser loads their list.
    const forOrganiser = await service.get(organiserUser(), row.id);
    const forAttendee = await service.get(attendeeUser(), row.id);
    const [inOrganiserList] = await service.list(organiserUser());

    // Assert: none of them receive the previous coordinator's name or the time.
    expect(forOrganiser.reassignedFrom).toBeUndefined();
    expect(forAttendee.reassignedFrom).toBeUndefined();
    expect(inOrganiserList.reassignedFrom).toBeUndefined();
  });

  // A previous coordinator is told the event moved, without naming who has it; anyone else still gets "not found".
  // Kills: B5 (previous coordinator gets "not found"), B6 (message names the new coordinator).
  it('REASN-VIEW-04-A tells a previous coordinator the event was reassigned, and keeps "not found" for everyone else', async () => {
    // Arrange: the event now belongs to coord-9; coord-1 held it before, coord-5 never did.
    const formerHolder = coordinatorUser({ uid: 'coord-1', name: 'Coordinator 1' });
    const stranger = coordinatorUser({ uid: 'coord-5', name: 'Coordinator 5' });
    db.query
      .mockResolvedValueOnce({ rows: [savedEventRow()] })
      .mockResolvedValueOnce({ rows: [{ held: 1 }] })
      .mockResolvedValueOnce({ rows: [savedEventRow()] })
      .mockResolvedValueOnce({ rows: [] });

    // Act + Assert: the former holder gets 403 with the reassigned message, which does not name the new coordinator.
    const refusal = await service.get(formerHolder, savedEventRow().id).catch((error: unknown) => error);
    expect(refusal).toEqual(new ForbiddenException('This event has been reassigned to another Coordinator.'));
    expect(JSON.stringify((refusal as ForbiddenException).getResponse())).not.toContain('Coord Nine');
    const historyCheck = db.query.mock.calls[1];
    expect(String(historyCheck[0])).toMatch(/from_coordinator_id/);
    expect(historyCheck[1]).toEqual(expect.arrayContaining([savedEventRow().id, 'coord-1']));

    // Act + Assert: a coordinator who never held it still gets the generic not found.
    await expect(service.get(stranger, savedEventRow().id)).rejects.toThrow(new NotFoundException('Event not found.'));
  });

  // Someone who lost the event and later got it back sees it normally.
  // Kills: the reassigned-away check being applied to the event's current coordinator.
  it('REASN-VIEW-04-D shows the event normally to a coordinator who lost it and later got it back', async () => {
    // Arrange: coord-9 is the current coordinator again; the latest reassignment was back to them.
    db.query.mockResolvedValueOnce({ rows: [{ ...savedEventRow(), latest_reassignment: { ...latestToCoord9, coordinatorName: 'Coordinator 2' } }] });

    // Act: open the event.
    const event = await service.get(coordinatorUser(), savedEventRow().id);

    // Assert: shown, with the latest previous coordinator, and no "reassigned away" check was needed.
    expect(event.coordinatorId).toBe('coord-9');
    expect(event.reassignedFrom?.coordinatorName).toBe('Coordinator 2');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
