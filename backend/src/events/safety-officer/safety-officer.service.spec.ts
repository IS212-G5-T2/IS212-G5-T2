import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import { SafetyOfficerController } from './safety-officer.controller.js';
import { SafetyOfficerService } from './safety-officer.service.js';

const OFFICER: AuthenticatedUser = { uid: 'officer-1', name: 'Safety Officer', roles: ['SAFETY_OFFICER'] };
const LIST_ROW = {
  id: 'event-1', event_name: 'Welcome Evening', start_date_time: new Date('2026-12-12T10:00:00Z'),
  end_date_time: new Date('2026-12-12T13:00:00Z'), expected_attendance: 80,
  preferred_room_layout: 'Theatre', required_facilities: ['AV System'], accessibility_needs: ['Wheelchair access'],
  equipment_needs: 'Wireless microphone', equipment_confirmed_at: null,
  requested_at: new Date('2026-11-01T00:00:00Z'),
};

const CONFIRMED_SNAPSHOT = {
  venueBookings: [{ id: 'booking-1', venueId: 'venue-1', venueName: 'Main Hall', status: 'approved', holdExpiresAt: null, requestKind: 'booking', venueUnavailable: false, start: '2026-12-12T10:00:00.000Z', end: '2026-12-12T13:00:00.000Z' }],
  equipment: [{ id: 'equipment-1', name: 'Microphone', quantity: 1, status: 'Reserved' }],
  equipmentNoneConfirmed: false,
};

function setup(queryRows: unknown[] = [], transactionRows: unknown[] = [], snapshot = CONFIRMED_SNAPSHOT, eventFound = true, detailRows = queryRows) {
  const candidateRows = queryRows;
  const query = vi.fn().mockImplementation((sql: string) => Promise.resolve({ rows: sql.includes('AS venues') ? detailRows : candidateRows }));
  const clientQuery = vi.fn().mockImplementation((sql: string) => Promise.resolve({ rows:
    sql.includes('FROM events') ? (eventFound ? [{ id: 'event-1', event_name: 'Welcome Evening', equipment_needs: 'Wireless microphone', equipment_confirmed_at: null }] : [])
      : sql.includes('FROM event_safety_checks') ? transactionRows : [] }));
  const transaction = vi.fn(async (work: (client: { query: typeof clientQuery }) => Promise<unknown>) => work({ query: clientQuery }));
  const arrangements = { read: vi.fn().mockResolvedValue(snapshot) };
  return { service: new SafetyOfficerService({ query, transaction } as unknown as DatabaseService, arrangements as never), query, transaction, clientQuery, arrangements };
}

describe('SPM-129 SafetyOfficerService', () => {
  /** SAFETY-QUEUE-01 and SAFETY-QUEUE-06: only an authenticated Safety Officer may read the eligible, complete-arrangements queue. */
  it('SAFETY-QUEUE-01 requires the Safety Officer role before reading the queue', async () => {
    const { service, query } = setup();
    await expect(service.queue(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.queue({ uid: 'u', roles: ['COORDINATOR'] } as AuthenticatedUser)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  /** SAFETY-QUEUE-01: the pending-check query returns the requested event and its queue summary. */
  it('lists events awaiting a safety decision with their summary requirements', async () => {
    const { service, query } = setup([LIST_ROW]);
    await expect(service.queue(OFFICER)).resolves.toEqual([{
      id: 'event-1', name: 'Welcome Evening', startDateTime: '2026-12-12T10:00:00.000Z', endDateTime: '2026-12-12T13:00:00.000Z',
      expectedAttendance: 80, venueRequirements: { layout: 'Theatre', facilities: ['AV System'], accessibility: ['Wheelchair access'] }, requestedAt: '2026-11-01T00:00:00.000Z',
    }]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  /** SAFETY-QUEUE-01: a queue with no eligible pending events is returned as an empty list. */
  it('returns an empty queue when no event is eligible', async () => {
    const { service } = setup([]);
    await expect(service.queue(OFFICER)).resolves.toEqual([]);
  });

  /** SAFETY-QUEUE-06: a pending record is omitted when the shared checklist finds an incomplete venue arrangement. */
  it('SAFETY-QUEUE-06 filters a pending event with incomplete arrangements from the queue', async () => {
    const incomplete = { ...CONFIRMED_SNAPSHOT, venueBookings: [{ ...CONFIRMED_SNAPSHOT.venueBookings[0], status: 'pending' }] };
    const { service } = setup([LIST_ROW], [], incomplete);
    await expect(service.queue(OFFICER)).resolves.toEqual([]);
  });

  /** SAFETY-QUEUE-01: candidate arrangement reads run concurrently and retain queue ordering for larger queues. */
  it('SAFETY-QUEUE-01 checks many eligible events concurrently without reordering them', async () => {
    let releaseReads!: (snapshot: typeof CONFIRMED_SNAPSHOT) => void;
    const readsBlocked = new Promise<typeof CONFIRMED_SNAPSHOT>((resolve) => { releaseReads = resolve; });
    const rows = [
      { ...LIST_ROW, id: 'event-1' },
      { ...LIST_ROW, id: 'event-2' },
      { ...LIST_ROW, id: 'event-3' },
    ];
    const { service, arrangements } = setup(rows);
    arrangements.read.mockImplementation(() => readsBlocked);

    const queue = service.queue(OFFICER);
    await Promise.resolve();
    expect(arrangements.read).toHaveBeenCalledTimes(3);
    releaseReads(CONFIRMED_SNAPSHOT);

    await expect(queue).resolves.toMatchObject([{ id: 'event-1' }, { id: 'event-2' }, { id: 'event-3' }]);
  });

  /** SAFETY-QUEUE-02: detail shows expected attendance, venue capacity, layout, and accessibility requirements. */
  it('SAFETY-QUEUE-02 shows attendance and venue requirements', async () => {
    const details = { ...LIST_ROW, equipment_needs: 'Wireless microphone', venues: [{ name: 'Main Hall', capacity: 120, restrictions: 'No open flames' }], equipment: [{ name: 'Microphone', quantity: 1 }] };
    const { service } = setup([details]);
    await expect(service.details(OFFICER, 'event-1')).resolves.toMatchObject({
      expectedAttendance: 80, venueRequirements: { layout: 'Theatre', accessibility: ['Wheelchair access'] }, venues: [{ capacity: 120 }],
    });
  });

  /** SAFETY-QUEUE-03: detail exposes requested and reserved equipment and technical arrangements. */
  it('SAFETY-QUEUE-03 shows equipment and technical arrangements', async () => {
    const { service } = setup([{ ...LIST_ROW, equipment_needs: 'Wireless microphone', venues: [], equipment: [{ name: 'Microphone', quantity: 1 }] }]);
    await expect(service.details(OFFICER, 'event-1')).resolves.toMatchObject({ equipmentNeeds: 'Wireless microphone', equipment: [{ name: 'Microphone', quantity: 1 }] });
  });

  /** SAFETY-QUEUE-04: venue details include configured restrictions and accessibility information. */
  it('SAFETY-QUEUE-04 shows venue restrictions', async () => {
    const { service } = setup([{ ...LIST_ROW, equipment_needs: '', venues: [{ name: 'Main Hall', capacity: 120, restrictions: 'No open flames', accessibility: ['Wheelchair access'] }], equipment: [] }]);
    await expect(service.details(OFFICER, 'event-1')).resolves.toMatchObject({ venues: [{ restrictions: 'No open flames', accessibility: ['Wheelchair access'] }] });
  });

  /** SAFETY-QUEUE-05: details cannot be reopened after a response removes the pending queue record. */
  it('hides an event whose check is no longer pending', async () => {
    const { service } = setup([]);
    await expect(service.details(OFFICER, 'event-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  /** SAFETY-QUEUE-05: details are refused when the event has no pending safety-check row. */
  it('SAFETY-QUEUE-05 hides details when no pending event candidate exists', async () => {
    const { service } = setup([]);
    await expect(service.details(OFFICER, 'event-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  /** SAFETY-QUEUE-05: details fail closed if the pending row disappears between candidate validation and projection. */
  it('SAFETY-QUEUE-05 hides details when the detail projection is no longer present', async () => {
    const { service } = setup([LIST_ROW], [], CONFIRMED_SNAPSHOT, true, []);
    await expect(service.details(OFFICER, 'event-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  /** SAFETY-QUEUE-05: a valid approval is recorded against the still-pending event. */
  it('records an approval and leaves the response in a non-pending state', async () => {
    const { service, clientQuery } = setup([], [{ event_id: 'event-1' }]);
    await expect(service.respond(OFFICER, 'event-1', { decision: 'approved' })).resolves.toEqual({ eventId: 'event-1', status: 'approved' });
    expect(clientQuery).toHaveBeenCalledTimes(3);
  });

  /** SAFETY-QUEUE-05: response transactions lock the event before arrangement rows and the safety-check row, matching status mutations. */
  it('uses the shared event, arrangements, safety-check lock order', async () => {
    const { service, clientQuery, arrangements } = setup([], [{ event_id: 'event-1' }]);
    await service.respond(OFFICER, 'event-1', { decision: 'approved' });
    expect(clientQuery.mock.calls[0][0]).toContain('FROM events');
    expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(arrangements.read).toHaveBeenCalledWith(expect.anything(), 'event-1', { lock: true });
    expect(clientQuery.mock.calls[1][0]).toContain('FROM event_safety_checks');
    expect(clientQuery.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.invocationCallOrder[0]).toBeLessThan(arrangements.read.mock.invocationCallOrder[0]);
    expect(arrangements.read.mock.invocationCallOrder[0]).toBeLessThan(clientQuery.mock.invocationCallOrder[1]);
  });

  /** SAFETY-QUEUE-05: a response is still attributable when the session has no display name. */
  it('uses the verified email when the session name is blank', async () => {
    const { service, clientQuery } = setup([], [{ event_id: 'event-1' }]);
    await service.respond({ uid: 'officer-1', name: '  ', email: 'safety@example.test', roles: ['SAFETY_OFFICER'] }, 'event-1', { decision: 'approved' });
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE event_safety_checks'), ['event-1', 'approved', 'safety@example.test', null]);
  });

  /** SAFETY-QUEUE-05: an unavailable display name and email use the role label as the response attribution. */
  it('uses the Safety Officer label when the session has no name or email', async () => {
    const { service, clientQuery } = setup([], [{ event_id: 'event-1' }]);
    await service.respond({ uid: 'officer-1', roles: ['SAFETY_OFFICER'] }, 'event-1', { decision: 'approved' });
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE event_safety_checks'), ['event-1', 'approved', 'Safety Officer', null]);
  });

  /** SAFETY-QUEUE-05: a non-approval response records its reason as feedback for the coordinator. */
  it.each(['rejected', 'changes_needed'] as const)('records %s and its feedback reason', async (decision) => {
    const { service, clientQuery } = setup([], [{ event_id: 'event-1' }]);
    await service.respond(OFFICER, 'event-1', { decision, reason: 'Please add an accessible route.' });
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO safety_check_feedback_items'), ['event-1', 'Please add an accessible route.']);
  });

  /** SAFETY-QUEUE-05: invalid decisions and missing or blank required reasons are refused before a response write. */
  it('refuses unsupported decisions and decisions without a reason', async () => {
    const { service, transaction } = setup();
    await expect(service.respond(OFFICER, 'event-1', { decision: 'later' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.respond(OFFICER, 'event-1', { decision: 'rejected', reason: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  /** SAFETY-QUEUE-05: only a check still pending can receive a response; a repeated response changes no row. */
  it('refuses a response after the event has left the pending queue', async () => {
    const { service, clientQuery } = setup([], []);
    await expect(service.respond(OFFICER, 'event-1', { decision: 'approved' })).rejects.toBeInstanceOf(ConflictException);
    expect(clientQuery).toHaveBeenCalledTimes(2);
  });

  /** SAFETY-QUEUE-05: a deleted or non-Planning event is refused before arrangements or safety-row locks. */
  it('SAFETY-QUEUE-05 refuses a response when the Planning event row is gone', async () => {
    const { service, clientQuery, arrangements } = setup([], [], CONFIRMED_SNAPSHOT, false);
    await expect(service.respond(OFFICER, 'event-1', { decision: 'approved' })).rejects.toBeInstanceOf(ConflictException);
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(arrangements.read).not.toHaveBeenCalled();
  });

  /** SAFETY-QUEUE-05: response is refused without a state change if shared checklist prerequisites are no longer met. */
  it('SAFETY-QUEUE-05 refuses a response after the venue becomes pending', async () => {
    const incomplete = { ...CONFIRMED_SNAPSHOT, venueBookings: [{ ...CONFIRMED_SNAPSHOT.venueBookings[0], status: 'pending' }] };
    const { service, clientQuery } = setup([], [{ event_id: 'event-1' }], incomplete);
    await expect(service.respond(OFFICER, 'event-1', { decision: 'approved' })).rejects.toBeInstanceOf(ConflictException);
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
  });
});

describe('SPM-129 SafetyOfficerController', () => {
  /** SAFETY-QUEUE-01: protected endpoints receive the verified session user and the queue is never cached. */
  it('passes the session identity to queue, detail, and decision operations', async () => {
    const queue = vi.fn().mockResolvedValue([]);
    const details = vi.fn().mockResolvedValue({ id: 'event-1' });
    const respond = vi.fn().mockResolvedValue({ eventId: 'event-1', status: 'approved' });
    const controller = new SafetyOfficerController({ queue, details, respond } as unknown as SafetyOfficerService);
    const request = { currentUser: OFFICER } as unknown as AuthenticatedRequest;
    await controller.queue(request);
    await controller.details('event-1', request);
    await controller.respond('event-1', { decision: 'approved' }, request);
    expect(queue).toHaveBeenCalledWith(OFFICER);
    expect(details).toHaveBeenCalledWith(OFFICER, 'event-1');
    expect(respond).toHaveBeenCalledWith(OFFICER, 'event-1', { decision: 'approved' });
    expect(Reflect.getMetadata('__headers__', SafetyOfficerController.prototype.queue)).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
    expect(Reflect.getMetadata('__headers__', SafetyOfficerController.prototype.details)).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
  });
});
