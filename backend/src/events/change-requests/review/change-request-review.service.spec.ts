/*
 * SPM-65 ChangeRequestReviewService rules against a scripted planning repository. The real SQL,
 * triggers, row locks and constraints run against PostgreSQL in test/change-request-review.e2e-spec.ts.
 * The fake transaction commits only when the work resolves, so a fault anywhere in a decision shows
 * that nothing is committed (REVIEW-CHANGE-07-C, 10-C).
 * Test IDs refer to the Confluence pages under SPM-28 > SPM-65 (REVIEW-CHANGE-NN-X).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../../auth/types/auth.models.js';
import type { DatabaseService } from '../../../database/database.service.js';
import { EVENT_CANCELLED_CODE } from '../../cancelled-guard.js';
import type {
  EventPlanningRepository,
  FlaggedChangeRow,
  PlanningEventRow,
  VenueBookingRow,
} from '../../planning/event-planning.repository.js';
import { ChangeRequestsService } from '../change-requests.service.js';
import {
  ChangeRequestReviewService,
  REVIEW_MESSAGES,
  SAFETY_RESET_REASON,
} from './change-request-review.service.js';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2030-01-01T00:00:00.000Z');

const coordinator = {
  uid: 'coord-1',
  name: 'Coordinator 1',
  roles: ['COORDINATOR'],
} as AuthenticatedUser;
const otherCoordinator = {
  uid: 'coord-2',
  name: 'Coordinator 2',
  roles: ['COORDINATOR'],
} as AuthenticatedUser;
const organiser = {
  uid: 'org-1',
  name: 'Organiser 1',
  roles: ['ORGANISER'],
} as AuthenticatedUser;

function eventRow(overrides: Partial<PlanningEventRow> = {}): PlanningEventRow {
  return {
    id: EVENT_ID,
    organiserId: 'org-1',
    coordinatorId: 'coord-1',
    status: 'Planning',
    name: 'Alumni Night',
    purpose: 'p',
    description: 'd',
    startDateTime: '2030-04-14T10:00:00.000Z',
    endDateTime: '2030-04-14T13:00:00.000Z',
    expectedAttendance: 80,
    layout: 'Banquet',
    facilities: ['Catering'],
    accessibility: [],
    equipmentNeeds: 'Two microphones',
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    event_id: EVENT_ID,
    requested_by_id: 'org-1',
    requested_by: 'Organiser 1',
    changes: [
      { field: 'expectedAttendance', originalValue: 80, proposedValue: 120 },
    ],
    status: 'Pending',
    requires_safety_check: false,
    created_at: NOW,
    recheck: [],
    ...overrides,
  };
}

const hall: VenueBookingRow = {
  id: 'b1',
  venueId: 'v1',
  venueName: 'Hall',
  capacity: 100,
  start: '2030-04-14T10:00:00.000Z',
  end: '2030-04-14T13:00:00.000Z',
  status: 'Booked',
  neighbours: [],
};

interface Script {
  event?: PlanningEventRow;
  request?: Record<string, unknown> | null;
  flagged?: Partial<FlaggedChangeRow>[];
  bookings?: VenueBookingRow[];
  /** Whether a safety check exists before and after applyFields. */
  safety?: [boolean, boolean];
  registrations?: { registered: number; waitlisted: number };
  audit?: Record<string, unknown>[];
  /** Fail the statement whose SQL contains this text. */
  failOn?: string;
}

function setup(script: Script = {}) {
  const sql: { text: string; params: unknown[] }[] = [];
  const committed: string[] = [];
  let pending: string[] = [];
  const safety = [...(script.safety ?? [false, false])];
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    sql.push({ text, params });
    pending.push(text);
    if (script.failOn && text.includes(script.failOn))
      throw new Error('injected fault');
    if (text.startsWith('SELECT * FROM event_change_requests'))
      return {
        rows: script.request === null ? [] : [script.request ?? requestRow()],
      };
    if (text.includes('FROM event_registrations'))
      return {
        rows: [script.registrations ?? { registered: 0, waitlisted: 0 }],
      };
    if (text.includes('FROM event_change_request_audit'))
      return { rows: script.audit ?? [] };
    if (text.startsWith('UPDATE event_change_requests')) {
      const base = script.request ?? requestRow();
      if (text.includes("'Approved'"))
        return {
          rows: [
            {
              ...base,
              status: 'Approved',
              decided_by: params[1],
              decided_at: params[3],
              recheck: JSON.parse(params[4] as string),
              safety_check_reset: params[5],
            },
          ],
        };
      if (text.includes("'Denied'"))
        return {
          rows: [
            {
              ...base,
              status: 'Denied',
              decided_by: params[1],
              decided_at: params[3],
              decision_reason: params[4],
            },
          ],
        };
      return { rows: [{ ...base, recheck: JSON.parse(params[1] as string) }] };
    }
    return { rows: [] };
  });
  const repository = {
    runInTransaction: vi.fn(async (work: () => Promise<unknown>) => {
      pending = [];
      const result = await work();
      committed.push(...pending);
      return result;
    }),
    findEvent: vi.fn(async () =>
      script.event === undefined ? eventRow() : script.event,
    ),
    listPendingChanges: vi.fn(async () => script.flagged ?? []),
    listVenueBookings: vi.fn(async () => script.bookings ?? []),
    listEquipmentArrangements: vi.fn(async () => []),
    safetyCheckExists: vi.fn(async () => safety.shift() ?? false),
    applyFields: vi.fn(async () => {
      if (script.failOn === 'applyFields') throw new Error('injected fault');
    }),
    query,
  };
  const changeRequests = new ChangeRequestsService({} as DatabaseService, {
    now: () => NOW,
  });
  const svc = new ChangeRequestReviewService(
    repository as unknown as EventPlanningRepository,
    changeRequests,
    { now: () => NOW },
  );
  const statements = () => sql.map((entry) => entry.text);
  return { svc, repository, sql, statements, committed };
}

describe('ChangeRequestReviewService access (AC1, REVIEW-CHANGE-11-A)', () => {
  it('REVIEW-CHANGE-11-A refuses anonymous users, non-coordinators and other coordinators', async () => {
    const { svc } = setup();
    await expect(
      svc.preview(undefined, EVENT_ID, REQUEST_ID),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      svc.approve(organiser, EVENT_ID, REQUEST_ID, {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: REVIEW_MESSAGES.coordinatorOnly,
      }),
    });
    await expect(
      svc.deny(otherCoordinator, EVENT_ID, REQUEST_ID, {
        reason: 'Long enough reason.',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.markRechecked(otherCoordinator, EVENT_ID, REQUEST_ID, ITEM_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.preview(coordinator, 'not-a-uuid', REQUEST_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('REVIEW-CHANGE-11-B refuses an unknown request id and a missing event', async () => {
    await expect(
      setup().svc.preview(coordinator, EVENT_ID, 'nope'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: REVIEW_MESSAGES.requestNotFound,
      }),
    });
    await expect(
      setup({ request: null }).svc.preview(coordinator, EVENT_ID, REQUEST_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    const missing = setup();
    missing.repository.findEvent.mockResolvedValueOnce(
      undefined as unknown as PlanningEventRow,
    );
    await expect(
      missing.svc.preview(coordinator, EVENT_ID, REQUEST_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ChangeRequestReviewService.preview (AC3)', () => {
  it('REVIEW-CHANGE-03-H assesses the request without writing anything', async () => {
    const { svc, statements, repository } = setup({
      bookings: [hall],
      registrations: { registered: 2, waitlisted: 0 },
    });
    const result = await svc.preview(coordinator, EVENT_ID, REQUEST_ID);
    expect(result).toMatchObject({
      requestId: REQUEST_ID,
      hasConflicts: true,
      venueBookings: [
        { refId: 'b1', details: ['Attendance 120 exceeds capacity 100'] },
      ],
    });
    expect(statements().every((text) => text.startsWith('SELECT'))).toBe(true);
    expect(statements().some((text) => text.includes('FOR UPDATE'))).toBe(
      false,
    );
    expect(repository.applyFields).not.toHaveBeenCalled();
    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it('REVIEW-CHANGE-03-D passes the requested window so the right neighbours are loaded', async () => {
    const { svc, repository } = setup({
      request: requestRow({
        changes: [
          {
            field: 'startDateTime',
            originalValue: 'x',
            proposedValue: '2030-04-14T09:00:00.000Z',
          },
        ],
      }),
    });
    await svc.preview(coordinator, EVENT_ID, REQUEST_ID);
    expect(repository.listVenueBookings).toHaveBeenCalledWith(EVENT_ID, {
      start: '2030-04-14T09:00:00.000Z',
      end: undefined,
    });
  });
});

describe('ChangeRequestReviewService AC11 / AC4: only a pending request can be decided (REVIEW-CHANGE-12-A/B, 04-B)', () => {
  it.each([
    ['Withdrawn', REVIEW_MESSAGES.withdrawn, 'change_request_withdrawn'],
    ['Closed', REVIEW_MESSAGES.closed, 'change_request_closed'],
    ['Approved', REVIEW_MESSAGES.decided, 'change_request_decided'],
    ['Denied', REVIEW_MESSAGES.decided, 'change_request_decided'],
  ])(
    'REVIEW-CHANGE-04-B refuses a %s request with its message',
    async (status, message, code) => {
      const { svc, committed } = setup({ request: requestRow({ status }) });
      for (const decide of [
        () => svc.approve(coordinator, EVENT_ID, REQUEST_ID, {}),
        () =>
          svc.deny(coordinator, EVENT_ID, REQUEST_ID, {
            reason: 'Long enough reason.',
          }),
        () => svc.preview(coordinator, EVENT_ID, REQUEST_ID),
      ])
        await expect(decide()).rejects.toMatchObject({
          status: 409,
          response: { message, code },
        });
      expect(committed).toEqual([]);
    },
  );

  it('locks the request row when deciding', async () => {
    const { svc, statements } = setup();
    await svc.approve(coordinator, EVENT_ID, REQUEST_ID, undefined);
    expect(
      statements().find((text) =>
        text.startsWith('SELECT * FROM event_change_requests'),
      ),
    ).toContain('FOR UPDATE');
  });
});

describe('ChangeRequestReviewService.approve (AC4, AC6-AC10)', () => {
  it('REVIEW-CHANGE-04-A applies the requested values, records and notifies, and returns the decision', async () => {
    const { svc, repository, sql } = setup({
      registrations: { registered: 4, waitlisted: 1 },
    });
    const result = await svc.approve(coordinator, EVENT_ID, REQUEST_ID, null);
    expect(repository.applyFields).toHaveBeenCalledWith(
      EVENT_ID,
      { expectedAttendance: 120 },
      NOW,
    );
    expect(result).toMatchObject({
      request: {
        id: REQUEST_ID,
        status: 'Approved',
        decidedBy: 'Coordinator 1',
        recheck: [],
        safetyCheckReset: false,
      },
      eventStatus: 'planning',
      safetyCheckReset: false,
      registrations: { registered: 4, waitlisted: 1, details: [] },
    });
    const audit = sql.find((entry) =>
      entry.text.includes('INSERT INTO event_change_request_audit'),
    );
    expect(audit?.params).toEqual(
      expect.arrayContaining([
        REQUEST_ID,
        'Approved',
        'coord-1',
        'Coordinator 1',
      ]),
    );
    const notice = sql.find((entry) =>
      entry.text.includes('INSERT INTO notifications'),
    );
    expect(notice?.params.slice(1)).toEqual([
      'org-1',
      'change_request_approved',
      'Your change request for "Alumni Night" was approved.',
      EVENT_ID,
    ]);
    expect(
      sql.some((entry) => entry.text.includes('event_safety_resets')),
    ).toBe(false);
    expect(
      sql.some((entry) => entry.text.includes('event_status_history')),
    ).toBe(false);
  });

  it('REVIEW-CHANGE-11-B refuses a request body', async () => {
    const { svc } = setup();
    for (const body of [{ status: 'Approved' }, [], 'x'])
      await expect(
        svc.approve(coordinator, EVENT_ID, REQUEST_ID, body),
      ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the email or a fallback when the coordinator has no name', async () => {
    const byEmail = await setup().svc.approve(
      {
        ...coordinator,
        name: undefined,
        email: 'c@x.test',
      } as AuthenticatedUser,
      EVENT_ID,
      REQUEST_ID,
      {},
    );
    expect(byEmail.request.decidedBy).toBe('c@x.test');
    const fallback = await setup().svc.approve(
      { ...coordinator, name: undefined } as AuthenticatedUser,
      EVENT_ID,
      REQUEST_ID,
      {},
    );
    expect(fallback.request.decidedBy).toBe('Coordinator');
  });

  it.each(['Cancelled'])(
    'refuses a %s event with the SPM-136 cancelled message',
    async (status) => {
      const { svc } = setup({ event: eventRow({ status }) });
      await expect(
        svc.approve(coordinator, EVENT_ID, REQUEST_ID, {}),
      ).rejects.toMatchObject({ response: { code: EVENT_CANCELLED_CODE } });
      await expect(
        svc.deny(coordinator, EVENT_ID, REQUEST_ID, {
          reason: 'Long enough reason.',
        }),
      ).rejects.toMatchObject({
        response: { code: EVENT_CANCELLED_CODE },
      });
    },
  );

  it.each(['Completed', 'Rejected'])(
    'refuses to apply a change to a %s event',
    async (status) => {
      await expect(
        setup({ event: eventRow({ status }) }).svc.approve(
          coordinator,
          EVENT_ID,
          REQUEST_ID,
          {},
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ message: REVIEW_MESSAGES.notOpen }),
      });
    },
  );

  it('refuses once the event has started, at the start instant', async () => {
    const { svc } = setup({
      event: eventRow({
        startDateTime: NOW.toISOString(),
        endDateTime: '2030-01-01T03:00:00.000Z',
      }),
    });
    await expect(
      svc.approve(coordinator, EVENT_ID, REQUEST_ID, {}),
    ).rejects.toMatchObject({ response: { code: 'event_started' } });
  });

  it('REVIEW-CHANGE-04-F refuses while a change to the same detail awaits review (SPM-85)', async () => {
    const { svc, repository } = setup({
      flagged: [{ field: 'expectedAttendance' }, { field: 'layout' }],
    });
    await expect(
      svc.approve(coordinator, EVENT_ID, REQUEST_ID, {}),
    ).rejects.toMatchObject({
      response: {
        message: REVIEW_MESSAGES.flaggedPending,
        errors: { expectedAttendance: 'A change is already awaiting review.' },
      },
    });
    expect(repository.applyFields).not.toHaveBeenCalled();
    // A pending change to another detail does not block it.
    await expect(
      setup({ flagged: [{ field: 'layout' }] }).svc.approve(
        coordinator,
        EVENT_ID,
        REQUEST_ID,
        {},
      ),
    ).resolves.toBeDefined();
  });

  it('REVIEW-CHANGE-04-D refuses values that are no longer valid', async () => {
    const past = setup({
      request: requestRow({
        changes: [
          { field: 'startDateTime', proposedValue: '2020-01-01T00:00:00.000Z' },
        ],
      }),
    });
    await expect(
      past.svc.approve(coordinator, EVENT_ID, REQUEST_ID, {}),
    ).rejects.toMatchObject({
      response: {
        message: REVIEW_MESSAGES.invalidValues,
        errors: { startDateTime: expect.any(String) },
      },
    });
    expect(past.repository.applyFields).not.toHaveBeenCalled();
    const unknownField = setup({
      request: requestRow({ changes: [{ field: 'bogus', proposedValue: 1 }] }),
    });
    await expect(
      unknownField.svc.approve(coordinator, EVENT_ID, REQUEST_ID, {}),
    ).rejects.toMatchObject({
      response: {
        message: REVIEW_MESSAGES.invalidValues,
        errors: { bogus: expect.any(String) },
      },
    });
  });

  it('REVIEW-CHANGE-04-D refuses an end that is no longer after the start', async () => {
    const end = setup({
      request: requestRow({
        changes: [
          { field: 'endDateTime', proposedValue: '2030-04-14T09:00:00.000Z' },
        ],
      }),
    });
    await expect(
      end.svc.approve(coordinator, EVENT_ID, REQUEST_ID, {}),
    ).rejects.toMatchObject({
      response: { errors: { endDateTime: 'End must be after start.' } },
    });
    const start = setup({
      request: requestRow({
        changes: [
          { field: 'startDateTime', proposedValue: '2030-04-14T14:00:00.000Z' },
        ],
      }),
    });
    await expect(
      start.svc.approve(coordinator, EVENT_ID, REQUEST_ID, {}),
    ).rejects.toMatchObject({
      response: { errors: { startDateTime: 'End must be after start.' } },
    });
  });

  it('REVIEW-CHANGE-08-A resets an existing safety check with the agreed reason', async () => {
    const { svc, sql } = setup({ safety: [true, false] });
    const result = await svc.approve(coordinator, EVENT_ID, REQUEST_ID, {});
    expect(result.safetyCheckReset).toBe(true);
    expect(result.request.safetyCheckReset).toBe(true);
    const reset = sql.find((entry) =>
      entry.text.includes('UPDATE event_safety_resets'),
    );
    expect(reset?.params).toEqual([EVENT_ID, SAFETY_RESET_REASON]);
    const notice = sql.find((entry) =>
      entry.text.includes('INSERT INTO notifications'),
    );
    expect(notice?.params[3]).toBe(
      'Your change request for "Alumni Night" was approved. The event needs a new safety check.',
    );
  });

  it('REVIEW-CHANGE-08-F does not report a reset when there was no safety check, or it survived', async () => {
    expect(
      (
        await setup({ safety: [false, false] }).svc.approve(
          coordinator,
          EVENT_ID,
          REQUEST_ID,
          {},
        )
      ).safetyCheckReset,
    ).toBe(false);
    expect(
      (
        await setup({ safety: [true, true] }).svc.approve(
          coordinator,
          EVENT_ID,
          REQUEST_ID,
          {},
        )
      ).safetyCheckReset,
    ).toBe(false);
  });

  it('REVIEW-CHANGE-08-D returns a Confirmed event to Planning with a status history entry', async () => {
    const { svc, sql } = setup({
      event: eventRow({ status: 'Confirmed' }),
      safety: [true, false],
    });
    const result = await svc.approve(coordinator, EVENT_ID, REQUEST_ID, {});
    expect(result.eventStatus).toBe('planning');
    expect(
      sql.find((entry) => entry.text.includes("SET status = 'Planning'"))
        ?.params,
    ).toEqual([EVENT_ID, NOW]);
    const history = sql.find((entry) =>
      entry.text.includes('event_status_history'),
    );
    expect(history?.text).toContain("'Confirmed', 'Planning'");
    expect(history?.params.slice(1)).toEqual([EVENT_ID, 'coord-1', NOW]);
  });

  it.each(['Submitted', 'Approved'])(
    'keeps a %s event in its status',
    async (status) => {
      const result = await setup({ event: eventRow({ status }) }).svc.approve(
        coordinator,
        EVENT_ID,
        REQUEST_ID,
        {},
      );
      expect(result.eventStatus).toBe(status.toLowerCase());
    },
  );

  it('REVIEW-CHANGE-09-A stores each affected arrangement on the re-check list', async () => {
    const result = await setup({ bookings: [hall] }).svc.approve(
      coordinator,
      EVENT_ID,
      REQUEST_ID,
      {},
    );
    expect(result.request.recheck).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        kind: 'venue',
        refId: 'b1',
        name: 'Hall',
        details: ['Attendance 120 exceeds capacity 100'],
      },
    ]);
  });

  it.each([
    ['applyFields'],
    ['UPDATE event_safety_resets'],
    ["SET status = 'Planning'"],
    ["SET status = 'Approved'"],
    ['INSERT INTO event_change_request_audit'],
    ['INSERT INTO notifications'],
  ])(
    'REVIEW-CHANGE-07-C / 10-C commits nothing when %s fails',
    async (failOn) => {
      const { svc, committed } = setup({
        event: eventRow({ status: 'Confirmed' }),
        safety: [true, false],
        failOn,
      });
      await expect(
        svc.approve(coordinator, EVENT_ID, REQUEST_ID, {}),
      ).rejects.toThrow('injected fault');
      expect(committed).toEqual([]);
    },
  );
});

describe('ChangeRequestReviewService.deny (AC5, AC6, AC10)', () => {
  it('REVIEW-CHANGE-05-A denies with the trimmed reason, records and notifies, without touching the event', async () => {
    const { svc, sql, repository } = setup();
    const result = await svc.deny(coordinator, EVENT_ID, REQUEST_ID, {
      reason: '  The venue cannot fit them.  ',
    });
    expect(result.request).toMatchObject({
      status: 'Denied',
      decisionReason: 'The venue cannot fit them.',
      decidedBy: 'Coordinator 1',
    });
    expect(repository.applyFields).not.toHaveBeenCalled();
    expect(repository.safetyCheckExists).not.toHaveBeenCalled();
    const audit = sql.find((entry) =>
      entry.text.includes('INSERT INTO event_change_request_audit'),
    );
    expect(audit?.params).toEqual(
      expect.arrayContaining(['Denied', 'The venue cannot fit them.']),
    );
    const notice = sql.find((entry) =>
      entry.text.includes('INSERT INTO notifications'),
    );
    expect(notice?.params.slice(2, 4)).toEqual([
      'change_request_denied',
      'Your change request for "Alumni Night" was denied: The venue cannot fit them.',
    ]);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { reason: '' },
    { reason: '   ' },
    { reason: 42 },
  ])('REVIEW-CHANGE-05-B requires a reason (%j)', async (body) => {
    await expect(
      setup().svc.deny(coordinator, EVENT_ID, REQUEST_ID, body),
    ).rejects.toMatchObject({
      response: { errors: { reason: REVIEW_MESSAGES.reasonRequired } },
    });
  });

  it('REVIEW-CHANGE-05-C allows 10 to 500 characters', async () => {
    for (const reason of ['x'.repeat(9), 'x'.repeat(501)])
      await expect(
        setup().svc.deny(coordinator, EVENT_ID, REQUEST_ID, { reason }),
      ).rejects.toMatchObject({
        response: { errors: { reason: REVIEW_MESSAGES.reasonLength } },
      });
    for (const reason of ['x'.repeat(10), 'x'.repeat(500)])
      await expect(
        setup().svc.deny(coordinator, EVENT_ID, REQUEST_ID, { reason }),
      ).resolves.toBeDefined();
  });

  it('refuses unknown fields', async () => {
    await expect(
      setup().svc.deny(coordinator, EVENT_ID, REQUEST_ID, {
        reason: 'Long enough reason.',
        status: 'x',
      }),
    ).rejects.toMatchObject({
      response: { errors: { status: 'Unknown field.' } },
    });
  });

  it('REVIEW-CHANGE-10-C commits nothing when the audit entry fails', async () => {
    const { svc, committed } = setup({
      failOn: 'INSERT INTO event_change_request_audit',
    });
    await expect(
      svc.deny(coordinator, EVENT_ID, REQUEST_ID, {
        reason: 'Long enough reason.',
      }),
    ).rejects.toThrow('injected fault');
    expect(committed).toEqual([]);
  });
});

describe('ChangeRequestReviewService.markRechecked (AC9)', () => {
  const items = [
    { id: ITEM_ID, kind: 'venue', refId: 'b1', name: 'Hall', details: [] },
    {
      id: 'other',
      kind: 'equipment',
      refId: 'q1',
      name: 'Projector × 2',
      details: [],
    },
  ];

  it('REVIEW-CHANGE-09-B marks one arrangement as re-checked', async () => {
    const { svc } = setup({
      request: requestRow({ status: 'Approved', recheck: items }),
    });
    const record = await svc.markRechecked(
      coordinator,
      EVENT_ID,
      REQUEST_ID,
      ITEM_ID,
    );
    expect(record.recheck[0]).toMatchObject({
      checkedAt: NOW.toISOString(),
      checkedBy: 'Coordinator 1',
    });
    expect(record.recheck[1]).not.toHaveProperty('checkedAt');
  });

  it('refuses a request that is not approved, an unknown item, an item already re-checked and a cancelled event', async () => {
    await expect(
      setup().svc.markRechecked(coordinator, EVENT_ID, REQUEST_ID, ITEM_ID),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: REVIEW_MESSAGES.notApproved,
      }),
    });
    await expect(
      setup({
        request: requestRow({ status: 'Approved', recheck: items }),
      }).svc.markRechecked(coordinator, EVENT_ID, REQUEST_ID, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const done = [{ ...items[0], checkedAt: NOW.toISOString() }];
    await expect(
      setup({
        request: requestRow({ status: 'Approved', recheck: done }),
      }).svc.markRechecked(coordinator, EVENT_ID, REQUEST_ID, ITEM_ID),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      setup({
        event: eventRow({ status: 'Cancelled' }),
        request: requestRow({ status: 'Approved', recheck: items }),
      }).svc.markRechecked(coordinator, EVENT_ID, REQUEST_ID, ITEM_ID),
    ).rejects.toMatchObject({ response: { code: EVENT_CANCELLED_CODE } });
  });
});

describe('ChangeRequestReviewService.auditLog (AC10)', () => {
  const entry = {
    id: 'a1',
    change_request_id: REQUEST_ID,
    outcome: 'Denied',
    changes: [],
    requested_by: 'Organiser 1',
    decided_by: 'Coordinator 1',
    reason: 'Not possible here.',
    decided_at: NOW,
  };

  it('REVIEW-CHANGE-10-B returns the log newest first to the owner and the assigned coordinator', async () => {
    for (const user of [organiser, coordinator]) {
      const { svc, statements } = setup({ audit: [entry] });
      expect(await svc.auditLog(user, EVENT_ID)).toEqual([
        expect.objectContaining({
          outcome: 'Denied',
          reason: 'Not possible here.',
        }),
      ]);
      expect(statements().at(-1)).toContain('ORDER BY decided_at DESC');
    }
  });

  it('REVIEW-CHANGE-10-D hides the log from everyone else', async () => {
    await expect(
      setup().svc.auditLog(undefined, EVENT_ID),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      setup().svc.auditLog(
        { uid: 'a', roles: ['ATTENDEE'] } as unknown as AuthenticatedUser,
        EVENT_ID,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      setup().svc.auditLog(coordinator, 'bad'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup().svc.auditLog(otherCoordinator, EVENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup().svc.auditLog(
        { ...organiser, uid: 'org-2' } as AuthenticatedUser,
        EVENT_ID,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const missing = setup();
    missing.repository.findEvent.mockResolvedValueOnce(
      undefined as unknown as PlanningEventRow,
    );
    await expect(
      missing.svc.auditLog(coordinator, EVENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
