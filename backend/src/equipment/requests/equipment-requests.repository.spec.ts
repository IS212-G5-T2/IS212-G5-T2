import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../database/database.service.js';
import { EquipmentRequestsRepository } from './equipment-requests.repository.js';

const eventId = '00000000-0000-4000-8000-000000000125';
const coordinatorId = '00000000-0000-4000-8000-000000000126';
const requestId = '00000000-0000-4000-8000-000000000099';
const event = { id: eventId, event_name: 'Workshop', start_date_time: new Date('2030-01-12T04:00:00Z'), end_date_time: new Date('2030-01-12T05:00:00Z'), expected_attendance: 20, status: 'Approved' };
const input = { eventId, items: [{ equipmentName: 'Conference microphone', equipmentType: 'Audio' as const, quantity: 2 }] };
let query: ReturnType<typeof vi.fn>;
let repository: EquipmentRequestsRepository;

function setup(status = 'Approved', updateRows = 1) {
  query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM events WHERE')) return { rows: [{ ...event, status }], rowCount: 1 };
    if (sql.includes('FROM equipment_requests r JOIN events')) return { rows: [{ id: requestId, event_id: eventId, event_status: status }], rowCount: 1 };
    if (sql.includes('FROM equipment_requests WHERE event_id')) return { rows: [], rowCount: 0 };
    if (sql.includes('INSERT INTO equipment_requests')) return { rows: [{ id: requestId }], rowCount: 1 };
    if (sql.includes('INSERT INTO equipment_request_items')) return { rows: [{ id: 'item-1' }], rowCount: 1 };
    if (sql.includes('UPDATE events SET status')) return { rows: [], rowCount: updateRows };
    return { rows: [], rowCount: 1 };
  });
  const database = { transaction: vi.fn((work) => work({ query })), query };
  repository = new EquipmentRequestsRepository(database as unknown as DatabaseService, { now: () => new Date('2030-01-10T12:00:00Z') });
}

beforeEach(() => setup());

describe('SPM-57 equipment request persistence', () => {
  /** EQUIP-REQUEST-01-A: the request picker is coordinator-scoped and labels each option from event_name, never venue data. */
  it('lists eligible assigned events by event name', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...event, venue_name: 'Venue that must not be displayed' }], rowCount: 1 });

    await expect(repository.listEligibleEvents(coordinatorId)).resolves.toEqual([{
      id: eventId, name: 'Workshop', status: 'approved',
      startDateTime: '2030-01-12T04:00:00.000Z', endDateTime: '2030-01-12T05:00:00.000Z', expectedAttendance: 20,
    }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('event_name'), [coordinatorId]);
    expect(query.mock.calls[0][0]).toContain("status IN ('Approved', 'Planning', 'Confirmed')");
  });

  /** EQUIP-REQUEST-09-A: the first request for an Approved event, request items, status transition, and history commit together. */
  it('creates all requested items and transitions Approved to Planning atomically', async () => {
    const result = await repository.submit(coordinatorId, { eventId, items: [input.items[0], { equipmentName: 'Display screen', equipmentType: 'Visual', quantity: 1 }] });
    expect(result).toMatchObject({ kind: 'created', event: { status: 'planning', name: 'Workshop' } });
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(expect.arrayContaining([
      expect.stringContaining('INSERT INTO equipment_requests'),
      expect.stringContaining('INSERT INTO equipment_request_items'),
      expect.stringContaining('INSERT INTO equipment_reservations'),
      expect.stringContaining('UPDATE events SET status'),
      expect.stringContaining('INSERT INTO event_status_history'),
    ]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('event_status_history'), [expect.any(String), eventId, coordinatorId, new Date('2030-01-10T12:00:00Z')]);
  });

  /** EQUIP-REQUEST-10-A: updating an owned pre-Confirmed request replaces its items and linked reservations without changing request identity. */
  it('updates an existing request in place and replaces only its linked reservation items', async () => {
    const result = await repository.update(coordinatorId, requestId, {
      eventId, items: [input.items[0], { equipmentName: 'Display screen', equipmentType: 'Visual', quantity: 1 }],
    });
    expect(result).toEqual({ kind: 'updated', id: requestId });
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(expect.arrayContaining([
      expect.stringContaining('FOR UPDATE OF r, e'),
      expect.stringContaining('DELETE FROM equipment_request_items WHERE request_id'),
      expect.stringContaining('INSERT INTO equipment_reservations'),
      expect.stringContaining('UPDATE equipment_requests SET updated_at'),
    ]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE r.id = $1::uuid AND r.requested_by = $2::uuid'), [requestId, coordinatorId]);
    expect(query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO equipment_reservations')).every(([sql]) => sql.includes('equipment_request_item_id'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO equipment_requests'))).toBe(false);
  });

  /** EQUIP-REQUEST-10-N: a request owned by someone else is indistinguishable from a missing request and causes no writes. */
  it('does not write when the request is not owned by the caller', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(repository.update(coordinatorId, requestId, input)).resolves.toEqual({ kind: 'request-not-found' });
    expect(query).toHaveBeenCalledOnce();
  });

  /** EQUIP-REQUEST-10-BND-1: a Confirmed event rejects an update before changing request or reservation rows. */
  it('does not write after the linked event is Confirmed', async () => {
    setup('Confirmed');
    await expect(repository.update(coordinatorId, requestId, input)).resolves.toEqual({ kind: 'event-confirmed' });
    expect(query).toHaveBeenCalledOnce();
  });

  /** EQUIP-REQUEST-10-A: an update cannot move an existing request to another event. */
  it('does not allow an existing request to be reassigned to another event', async () => {
    await expect(repository.update(coordinatorId, requestId, { ...input, eventId: '00000000-0000-4000-8000-000000000777' }))
      .resolves.toEqual({ kind: 'event-not-open' });
    expect(query).toHaveBeenCalledOnce();
  });

  /** EQUIP-REQUEST-10-BND-1: a Cancelled or Rejected event cannot accept an equipment request update. */
  it.each(['Cancelled', 'Rejected'])('does not write when an event has status %s', async (status) => {
    setup(status);
    await expect(repository.update(coordinatorId, requestId, input)).resolves.toEqual({ kind: 'event-not-open' });
    expect(query).toHaveBeenCalledOnce();
  });

  /** EQUIP-REQUEST-09-B: a first equipment request on an already-Planning event leaves its lifecycle unchanged. */
  it('does not repeat the transition when an event was already moved to Planning by another arrangement', async () => {
    setup('Planning');
    const result = await repository.submit(coordinatorId, input);
    expect(result).toMatchObject({ kind: 'created', event: { status: 'planning' } });
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE events SET status'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('event_status_history'))).toBe(false);
  });

  /** EQUIP-REQUEST-11-N: a second POST for an event with a request is refused; updates use the existing request. */
  it('refuses a duplicate event request before inserting request or reservation rows', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM events WHERE')) return { rows: [{ ...event, status: 'Planning' }], rowCount: 1 };
      if (sql.includes('FROM equipment_requests WHERE event_id')) return { rows: [{ id: requestId }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await expect(repository.submit(coordinatorId, input)).resolves.toEqual({ kind: 'already-submitted' });
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO equipment_requests'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO equipment_request_items'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO equipment_reservations'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE events SET status'))).toBe(false);
  });

  /** EQUIP-REQUEST-01-N and EQUIP-REQUEST-08-N: unassigned, cancelled, and rejected events do not persist requests. */
  it('EQUIP-REQUEST-01-N refuses an unavailable event before request or item writes', async () => {
    query.mockImplementation(async (sql: string) => sql.includes('FROM events WHERE') ? { rows: [], rowCount: 0 } : { rows: [], rowCount: 0 });
    await expect(repository.submit(coordinatorId, input)).resolves.toEqual({ kind: 'event-not-assigned' });
    expect(query).toHaveBeenCalledTimes(1);
    for (const status of ['Cancelled', 'Rejected']) {
      setup(status);
      await expect(repository.submit(coordinatorId, input)).resolves.toEqual({ kind: 'event-not-open', status });
      expect(query).toHaveBeenCalledTimes(1);
    }
  });

  /** EQUIP-REQUEST-09-A: a request cannot commit when its required Approved-to-Planning transition fails. */
  it('fails the transaction when the status compare-and-set touches no row', async () => {
    setup('Approved', 0);
    await expect(repository.submit(coordinatorId, input)).rejects.toThrow('Could not transition the approved event to Planning.');
  });

  /** EQUIP-REQUEST-06-A: coordinator and Technical Support lists expose grouped event and item information. */
  it('groups request items for the coordinator list and review queue', async () => {
    query = vi.fn().mockResolvedValue({ rows: [
      { id: requestId, event_id: eventId, event_name: 'Workshop', start_date_time: event.start_date_time, end_date_time: event.end_date_time, expected_attendance: 20, status: 'Pending Review', requested_by: coordinatorId, coordinator_name: 'Coordinator', created_at: event.start_date_time, item_id: 'item-1', equipment_name: 'Conference microphone', equipment_type: 'Audio', quantity: 2 },
      { id: requestId, event_id: eventId, event_name: 'Workshop', start_date_time: event.start_date_time, end_date_time: event.end_date_time, expected_attendance: 20, status: 'Pending Review', requested_by: coordinatorId, coordinator_name: 'Coordinator', created_at: event.start_date_time, item_id: 'item-2', equipment_name: 'Display screen', equipment_type: 'Visual', quantity: 1 },
    ], rowCount: 2 });
    const database = { query };
    repository = new EquipmentRequestsRepository(database as unknown as DatabaseService);
    await expect(repository.listMine(coordinatorId)).resolves.toMatchObject([{ status: 'Pending Review', items: [{ equipmentName: 'Conference microphone', equipmentType: 'Audio' }, { equipmentName: 'Display screen', equipmentType: 'Visual' }] }]);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE r.requested_by = $1::uuid'), [coordinatorId]);
    await expect(repository.listQueue()).resolves.toMatchObject([{ reference: 'ER-00000000', requestedBy: coordinatorId }]);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("WHERE r.status = 'Pending Review'"), []);
  });

  /** EQUIP-REQUEST-07-A: an empty review queue is returned as an empty list. */
  it('returns an empty list when no requests match', async () => {
    query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    repository = new EquipmentRequestsRepository({ query } as unknown as DatabaseService);
    await expect(repository.listQueue()).resolves.toEqual([]);
  });
});
