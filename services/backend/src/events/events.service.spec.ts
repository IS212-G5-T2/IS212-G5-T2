import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from './events.service.js';

const db = {
  query: vi.fn(),
  connect: vi.fn(),
  transaction: vi.fn(),
  release: vi.fn(),
  end: vi.fn(),
};

type TestableEventsService = EventsService & {
  pool: {
    query: typeof db.query;
    connect: typeof db.connect;
    end: typeof db.end;
  };
};

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

function savedEventRow() {
  const request = validEventRequest();

  return {
    id: request.submissionKey,
    organiser_id: 'current-user',
    organiser_name: 'Demo Organiser',
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
    status: 'Submitted',
    created_at: new Date('2026-09-13T00:00:00.000Z'),
    updated_at: new Date('2026-09-13T00:00:00.000Z'),
  };
}

let service: EventsService;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv('DEMO_ORGANISER_ENABLED', 'true');
  db.connect.mockResolvedValue({ query: db.transaction, release: db.release });
  db.transaction.mockResolvedValue({ rows: [] });

  const module = await Test.createTestingModule({
    providers: [EventsService],
  }).compile();

  service = module.get(EventsService);
  (service as TestableEventsService).pool = {
    query: db.query,
    connect: db.connect,
    end: db.end,
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('EventsService', () => {
  it('Q1-042 loads the submitted draft event and defaults legacy attachments', async () => {
    const row = { ...savedEventRow(), attachments: null };
    db.query.mockResolvedValue({ rows: [row] });
    expect(await service.get(row.id)).toMatchObject({
      id: row.id,
      attachments: [],
    });
    await service.onModuleDestroy();
    expect(db.end).toHaveBeenCalledOnce();
  });
  it('Q1-043 draft submission shares transaction ownership on success and failure', async () => {
    const row = savedEventRow();
    const client = { query: db.transaction, release: db.release };
    db.transaction.mockResolvedValueOnce({ rows: [row] });
    expect(
      await service.create(validEventRequest(), client as never, row.id),
    ).toMatchObject({ event: { id: row.id } });
    expect(db.connect).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalledWith('BEGIN');
    expect(db.transaction).not.toHaveBeenCalledWith('COMMIT');
    expect(db.release).not.toHaveBeenCalled();
    db.transaction.mockRejectedValueOnce(
      new Error('shared transaction failed'),
    );
    await expect(
      service.create(validEventRequest(), client as never, row.id),
    ).rejects.toThrow('shared transaction failed');
    expect(db.transaction).not.toHaveBeenCalledWith('ROLLBACK');
    expect(db.release).not.toHaveBeenCalled();
  });
  // SPM-36 Test Cases EVE-CRE-04-A, EVE-CRE-04-B, EVE-CRE-04-C, and EVE-CRE-04-D
  it('rejects invalid requests before opening a database transaction', async () => {
    await expect(
      service.create({ ...validEventRequest(), name: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.connect).not.toHaveBeenCalled();
  });

  // SPM-36 Test Case EVE-CRE-06-A (its attachment assertion below also incidentally covers EVE-CRE-08-A persistence)
  it('saves a valid request under the authenticated organiser with Submitted status', async () => {
    const request = validEventRequest();
    const row = savedEventRow();
    db.transaction
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });

    const result = await service.create({
      ...request,
      organiserId: 'someone-else',
      status: 'approved',
    });

    expect(result.event).toMatchObject({
      id: row.id,
      organiserId: 'current-user',
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
        'current-user',
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

    const result = await service.create(request);

    expect(result.event.id).toBe(row.id);
    expect(db.transaction).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('submission_key=$2'),
      ['current-user', request.submissionKey],
    );
  });

  // SPM-36 transaction safety check
  it('rolls back database failures and releases the connection', async () => {
    db.transaction
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.create(validEventRequest())).rejects.toThrow(
      'database unavailable',
    );

    expect(db.transaction).toHaveBeenLastCalledWith('ROLLBACK');
    expect(db.transaction).not.toHaveBeenCalledWith('COMMIT');
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  // SPM-36 Test Case EVE-CRE-07-B
  it('loads submitted events for the authenticated organiser under My Events', async () => {
    const row = savedEventRow();
    db.query.mockResolvedValue({ rows: [row] });

    const events = await service.list();

    expect(events[0]).toMatchObject({
      id: row.id,
      name: 'Welcome Evening',
      organiserId: 'current-user',
      status: 'submitted',
      expectedAttendance: 80,
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('organiser_id = $1'),
      ['current-user'],
    );
  });

  // SPM-36 authenticated-organiser precondition
  it('requires explicit local-demo organiser configuration', async () => {
    vi.stubEnv('DEMO_ORGANISER_ENABLED', 'false');

    await expect(service.list()).rejects.toBeInstanceOf(ForbiddenException);

    expect(db.query).not.toHaveBeenCalled();
  });

  // The list view must not ship the base64 file contents (they balloon the
  // response); metadata is retained so the UI can still show name/size/type.
  it('omits attachment dataUrl from the list while keeping metadata', async () => {
    const row = savedEventRow();
    db.query.mockResolvedValue({ rows: [row] });

    const events = await service.list();

    expect(events[0].attachments).toEqual([
      { id: 'attachment-1', name: 'proposal.txt', type: 'text/plain', size: 12 },
    ]);
    expect(events[0].attachments[0]).not.toHaveProperty('dataUrl');
  });

  // The detail endpoint still returns the full attachment including dataUrl.
  it('keeps attachment dataUrl on the single-event detail', async () => {
    const row = savedEventRow();
    db.query.mockResolvedValue({ rows: [row] });

    const event = await service.get(row.id);

    expect(event.attachments[0]).toMatchObject({
      name: 'proposal.txt',
      dataUrl: 'data:text/plain;base64,SGVsbG8=',
    });
  });

  describe('assignCoordinator', () => {
    it('claims a submitted event: writes the coordinator and advances to Under_Review', async () => {
      const row = {
        ...savedEventRow(),
        coordinator_id: 'coord-9',
        coordinator_name: 'Coord Nine',
        status: 'Under_Review',
      };
      db.query.mockResolvedValue({ rows: [row] });

      const result = await service.assignCoordinator(row.id, {
        coordinatorId: 'coord-9',
        coordinatorName: 'Coord Nine',
      });

      expect(result).toMatchObject({
        coordinatorId: 'coord-9',
        coordinatorName: 'Coord Nine',
        status: 'under_review',
      });
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('UPDATE events');
      expect(sql).toContain("CASE WHEN status = 'Submitted' THEN 'Under_Review'");
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

    await expect(service.get('not-a-valid-event-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.query).not.toHaveBeenCalled();

    db.query.mockResolvedValue({ rows: [] });

    await expect(service.get(row.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
