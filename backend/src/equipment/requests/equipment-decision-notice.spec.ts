/*
 * SPM-172 (equipment request decision notification, Coordinator), unit level: what the reserve and cannot-provide
 * transactions write to the notification bell. The database is a fixture that records the queries and returns fixed
 * rows, so these cases show what is written, to whom, with what text and time, and when nothing is written; the e2e
 * suite (test/equipment-request-decision-notifications.e2e-spec.ts) runs the same rules against PostgreSQL.
 * Cases: EQUIP-REQ-NOTIF-01-A, 01-B, 01-C, 02-A, 02-B, 02-C, 02-D, 05-A, 06-A, 07-A, 07-B.
 */
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../database/database.service.js';
import { EquipmentRequestsRepository } from './equipment-requests.repository.js';

const requestId = '00000000-0000-4000-8000-000000000172';
const eventId = '00000000-0000-4000-8000-000000000173';
const decidedAt = new Date('2030-01-10T12:00:00.000Z');
const clockNow = { now: () => decidedAt };
const start = new Date('2030-01-12T04:00:00Z');
const end = new Date('2030-01-12T05:00:00Z');

type Found = { status?: string; event_status?: string; coordinator_id?: string | null; event_name?: string };

/** A fixture database: the locked request/event row is `found` (null = no row); stock is ample for one microphone. */
function build(found: Found | null, options: { stock?: number; failNotice?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM equipment_requests r JOIN events e')) {
      return found
        ? {
            rows: [{
              id: requestId, event_id: eventId, status: 'Pending Review', event_status: 'Approved', coordinator_id: 'coo-01',
              event_name: 'Gala', start_date_time: start, end_date_time: end, ...found,
            }],
            rowCount: 1,
          }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes('GROUP BY item.equipment_name')) return { rows: [{ equipment_name: 'Microphone', requested_quantity: 1 }], rowCount: 1 };
    if (sql.includes('FROM equipment\n          WHERE equipment_name'))
      return { rows: [{ equipment_name: 'Microphone', active_quantity: options.stock ?? 5, is_available: true }], rowCount: 1 };
    if (sql.includes('FROM equipment_reservations r JOIN events e')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('INSERT INTO notifications') && options.failNotice) throw new Error('notice insert failed');
    return { rows: [], rowCount: 1 };
  });
  // The pool-level query is a separate mock from the transaction client's: a write that bypasses the transaction lands here.
  const poolQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
  const database = { transaction: vi.fn((work) => work({ query })), query: poolQuery };
  return { query, poolQuery, repository: new EquipmentRequestsRepository(database as unknown as DatabaseService, clockNow) };
}

const notices = (query: ReturnType<typeof vi.fn>) =>
  query.mock.calls.filter(([sql]) => (sql as string).startsWith('INSERT INTO notifications')) as Array<[string, unknown[]]>;
const decide = (repository: EquipmentRequestsRepository, kind: 'reserve' | 'cannot') =>
  kind === 'reserve' ? repository.reserve(requestId) : repository.markCannotProvide(requestId, 'Only 8 available.');

describe('SPM-172 equipment request decision notices', () => {
  // Traceability: Jira 172 AC1 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-01-A (SPM-172 AC1): reserving a request writes exactly one notification, addressed to the event's
   * Coordinator, linked to the event and to the request, of the reserved type.
   * Kills: no notice, a second notice, the wrong recipient, the wrong type, no request link.
   */
  it('EQUIP-REQ-NOTIF-01-A a reservation writes one reserved notice to the event Coordinator', async () => {
    const { query, repository } = build({});

    await expect(repository.reserve(requestId)).resolves.toEqual({ kind: 'reserved', id: requestId });

    const written = notices(query);
    expect(written).toHaveLength(1);
    expect(written[0][1].slice(1)).toEqual([
      'coo-01', 'equipment_request_reserved', 'Your equipment request for "Gala" has been reserved.', eventId, requestId, decidedAt,
    ]);
    expect(written[0][1][0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Traceability: Jira 172 AC1 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-01-B (SPM-172 AC1): marking a request cannot-provide writes exactly one cannot-provide notice to the
   * Coordinator.
   * Kills: no notice on this path, the reserved type reused, the reason copied into the message.
   */
  it('EQUIP-REQ-NOTIF-01-B a cannot-provide decision writes one cannot-provide notice to the event Coordinator', async () => {
    const { query, repository } = build({});

    await expect(repository.markCannotProvide(requestId, 'Only 8 available.')).resolves.toEqual({ kind: 'cannot-provided', id: requestId });

    const written = notices(query);
    expect(written).toHaveLength(1);
    expect(written[0][1].slice(1)).toEqual([
      'coo-01', 'equipment_request_cannot_provide', 'Your equipment request for "Gala" cannot be provided.', eventId, requestId, decidedAt,
    ]);
  });

  // Traceability: Jira 172 AC1 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-01-C (SPM-172 AC1, defensive): an event with no Coordinator has no recipient; the decision still
   * stands and nothing is written.
   * Kills: inserting a notice with a null recipient, or failing the decision.
   */
  it.each([['reserve', 'reserved'], ['cannot', 'cannot-provided']] as const)(
    'EQUIP-REQ-NOTIF-01-C %s on an event with no Coordinator saves the decision and writes no notice',
    async (kind, outcome) => {
      const { query, repository } = build({ coordinator_id: null });

      await expect(decide(repository, kind)).resolves.toEqual({ kind: outcome, id: requestId });

      expect(notices(query)).toEqual([]);
    },
  );

  // Traceability: Jira 172 AC2 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-02-A (SPM-172 AC2): a reservation's message is exactly the specified sentence with the event name
   * quoted; a name that itself contains quotes is carried through unchanged.
   * Kills: a different sentence, a missing full stop, the name not quoted, the name altered.
   */
  it('EQUIP-REQ-NOTIF-02-A the reserved message reads as specified for an event name with quotes', async () => {
    const { query, repository } = build({ event_name: 'Spring "Gala" & Fair' });

    await repository.reserve(requestId);

    expect(notices(query)[0][1][3]).toBe('Your equipment request for "Spring "Gala" & Fair" has been reserved.');
  });

  // Traceability: Jira 172 AC2 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-02-B (SPM-172 AC2): a cannot-provide message is exactly the specified sentence, and the reason is not
   * in it (the request page shows the reason).
   * Kills: a different sentence, the name not quoted, the reason copied into the message.
   */
  it('EQUIP-REQ-NOTIF-02-B the cannot-provide message reads as specified for an event name with quotes and omits the reason', async () => {
    const { query, repository } = build({ event_name: 'Spring "Gala" & Fair' });

    await repository.markCannotProvide(requestId, 'Only 8 available.');

    expect(notices(query)[0][1][3]).toBe('Your equipment request for "Spring "Gala" & Fair" cannot be provided.');
  });

  // Traceability: Jira 172 AC2 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-02-C (SPM-172 AC2): the notice carries the decision time (the clock the decision used), not a time
   * taken at some other moment, and it is the same instant the request row is stamped with.
   * Kills: omitting created_at (database now()), using a different clock reading.
   */
  it.each(['reserve', 'cannot'] as const)('EQUIP-REQ-NOTIF-02-C %s stamps the notice with the decision time', async (kind) => {
    const { query, repository } = build({});

    await decide(repository, kind);

    expect(notices(query)[0][1][6]).toEqual(decidedAt);
    expect(notices(query)[0][0]).toContain('created_at');
  });

  // Traceability: Jira 172 AC2 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-02-D (SPM-172 AC2): the notice is written after the request status update, in the same transaction
   * (one transaction call), so a decision and its notice are saved together or not at all.
   * Kills: writing the notice outside the transaction (through the database instead of the transaction client), before the status update.
   */
  it.each(['reserve', 'cannot'] as const)('EQUIP-REQ-NOTIF-02-D %s writes the notice inside the decision transaction after the status update', async (kind) => {
    const { query, poolQuery, repository } = build({});

    await decide(repository, kind);

    // Only the transaction client writes: nothing reaches the pool-level query (a notice written after commit would).
    expect(poolQuery).not.toHaveBeenCalled();
    expect(notices(query)).toHaveLength(1);
    const sqls = query.mock.calls.map(([sql]) => sql as string);
    const update = sqls.findIndex((sql) => sql.includes('UPDATE equipment_requests'));
    const insert = sqls.findIndex((sql) => sql.startsWith('INSERT INTO notifications'));
    expect(update).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(update);
  });

  // Traceability: Jira 172 AC5 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-05-A (SPM-172 AC5, atomic): if the notice cannot be saved the decision fails with it (the error
   * propagates out of the transaction callback, which the database service rolls back).
   * Kills: swallowing a notice error so the decision commits without its notice.
   */
  it.each(['reserve', 'cannot'] as const)('EQUIP-REQ-NOTIF-05-A %s rejects when the notice cannot be saved', async (kind) => {
    const { repository } = build({}, { failNotice: true });

    await expect(decide(repository, kind)).rejects.toThrow('notice insert failed');
  });

  // Traceability: Jira 172 AC6 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-06-A (SPM-172 AC6): the recipient is the Coordinator on the event row read in the decision's own
   * locked statement (FOR UPDATE OF r, e), so it is whoever is assigned at decision time.
   * Kills: remembering a coordinator from an earlier read, reading it without the lock.
   */
  it.each(['reserve', 'cannot'] as const)('EQUIP-REQ-NOTIF-06-A %s takes the recipient from the locked event row', async (kind) => {
    const { query, repository } = build({ coordinator_id: 'coo-new' });

    await decide(repository, kind);

    const read = query.mock.calls.find(([sql]) => (sql as string).includes('FROM equipment_requests r JOIN events e'))![0] as string;
    expect(read).toContain('e.coordinator_id');
    expect(read).toContain('e.event_name');
    expect(read).toContain('FOR UPDATE OF r, e');
    expect(notices(query)[0][1][1]).toBe('coo-new');
  });

  // Traceability: Jira 172 AC7 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-07-A (SPM-172 AC7): a refused decision writes no notice: request not found, event Completed, event
   * Confirmed, request not Pending Review. Both decision paths.
   * Kills: writing the notice before the refusal checks.
   */
  it.each([
    ['request not found', null, 'request-not-found'],
    ['event Completed', { event_status: 'Completed' }, 'event-completed'],
    ['event Confirmed', { event_status: 'Confirmed' }, 'event-confirmed'],
    ['request already Reserved', { status: 'Reserved' }, 'not-pending'],
    ['request Cannot Provide', { status: 'Cannot Provide' }, 'not-pending'],
  ] as const)('EQUIP-REQ-NOTIF-07-A a refusal (%s) writes no notice on either path', async (_label, found, kind) => {
    for (const path of ['reserve', 'cannot'] as const) {
      const { query, repository } = build(found);

      await expect(decide(repository, path)).resolves.toEqual({ kind });

      expect(notices(query)).toEqual([]);
    }
  });

  // Traceability: Jira 172 AC7 (matrix 40632321)
  /**
   * EQUIP-REQ-NOTIF-07-B (SPM-172 AC7): a reservation refused for insufficient active stock writes no notice and no
   * status change.
   * Kills: writing the notice before the stock check.
   */
  it('EQUIP-REQ-NOTIF-07-B a reservation refused for insufficient stock writes no notice', async () => {
    const { query, repository } = build({}, { stock: 0 });

    await expect(repository.reserve(requestId)).resolves.toEqual({ kind: 'insufficient-active-stock', equipmentName: 'Microphone' });

    expect(notices(query)).toEqual([]);
  });
});
