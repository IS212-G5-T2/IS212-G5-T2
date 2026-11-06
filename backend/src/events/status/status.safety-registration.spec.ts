import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { StatusService } from './status.service.js';

const EVENT_ID = '11111111-1111-4111-8111-111111111392';
const COORDINATOR: AuthenticatedUser = { uid: 'coordinator-1', roles: ['COORDINATOR'] };
const NOW = new Date('2026-10-10T00:00:00.000Z');
const booking = {
  id: 'booking-1', venueId: 'venue-1', venueName: 'Main Hall', status: 'approved' as const,
  holdExpiresAt: null, requestKind: 'booking' as const, venueUnavailable: false,
  start: '2026-11-05T02:00:00.000Z', end: '2026-11-05T04:00:00.000Z', requestedAt: '2026-10-01T00:00:00.000Z',
};
const equipment = { id: 'reservation-1', name: 'Projector', quantity: 1, status: 'Reserved' };

function makeService(registration: { enabled: boolean; opensAt: Date | null; closesAt: Date | null }, equipmentNeeds = 'Projector', missingMeta = false) {
  const row = {
    id: EVENT_ID, status: 'Planning', event_name: 'Safety Test Event', organiser_id: 'organiser-1',
    coordinator_id: COORDINATOR.uid, equipment_needs: equipmentNeeds, equipment_confirmed_at: null,
    registration_enabled: registration.enabled, registration_opens_at: registration.opensAt,
    registration_closes_at: registration.closesAt,
  };
  const clientQuery = vi.fn(async (sql: string) => {
    if (sql.includes('FROM events WHERE id = $1 FOR UPDATE')) return { rows: [row], rowCount: 1 };
    if (sql.includes('SELECT status FROM event_safety_checks')) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT count(*)')) return { rows: [{ count: '0' }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const database = {
    query: vi.fn(async (sql: string) => ({ rows: missingMeta && sql.includes('SELECT equipment_needs') ? [] : [row], rowCount: 1 })),
    transaction: vi.fn(async (work: (client: unknown) => unknown) => work({ query: clientQuery })),
  };
  const snapshot = { venueBookings: [booking], equipment: equipmentNeeds === 'None' ? [] : [equipment], equipmentNoneConfirmed: false };
  const reader = { read: vi.fn(async () => snapshot) };
  const safetyChecks = { view: vi.fn(async () => ({ status: 'not_requested' as const })), read: vi.fn(async () => ({ status: 'not_requested' as const })) };
  const safety = { read: vi.fn(async () => ({ status: 'not_requested' as const })) };
  const cancellation = { cancel: vi.fn() };
  const service = new StatusService(
    database as never, reader as never, safetyChecks as never, safety as never,
    { now: () => NOW } as never, cancellation as never,
  );
  return { service, database, clientQuery, reader, safetyChecks, safety };
}

describe('StatusService safety request registration prerequisite', () => {
  /** SAFETY-OUTCOME-06: the locked persisted enabled setting blocks a request until both registration dates are configured. */
  it('SAFETY-OUTCOME-06 blocks an initial request when enabled registration has unsaved dates', async () => {
    const { service, clientQuery } = makeService({ enabled: true, opensAt: null, closesAt: null });

    await expect(service.requestSafetyCheck(COORDINATOR, EVENT_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SAFETY_PREREQUISITES_NOT_MET' }),
    });

    expect(clientQuery.mock.calls.map(([sql]) => sql)).not.toContain(expect.stringContaining('INSERT INTO event_safety_checks'));
    expect(clientQuery.mock.calls.some(([sql]) => sql.startsWith('DELETE '))).toBe(false);
  });

  /** SAFETY-OUTCOME-06: the persisted complete registration period appears in the coordinator's planning checklist. */
  it('SAFETY-OUTCOME-06 reads saved enabled registration settings into planning status', async () => {
    const opensAt = new Date('2026-10-20T00:00:00.000Z');
    const closesAt = new Date('2026-10-28T00:00:00.000Z');
    const { service, reader, safety, safetyChecks } = makeService({ enabled: true, opensAt, closesAt });

    const status = await service.arrangementsStatus(COORDINATOR, EVENT_ID);

    expect(reader.read).toHaveBeenCalledWith(expect.anything(), EVENT_ID, { lock: false });
    expect(safety.read).toHaveBeenCalledWith(EVENT_ID);
    expect(safetyChecks.view).toHaveBeenCalledWith(EVENT_ID);
    expect(status.checklist.registration).toEqual({ enabled: true, status: 'confirmed' });
    expect(status.checklist.canRequestSafetyCheck).toBe(true);
  });

  /** SAFETY-OUTCOME-06: a deliberate disabled-registration setting remains a valid no-registration choice for initial safety requests. */
  it('SAFETY-OUTCOME-06 permits an initial request when registration is saved as disabled', async () => {
    const { service, clientQuery } = makeService({ enabled: false, opensAt: null, closesAt: null });

    await expect(service.requestSafetyCheck(COORDINATOR, EVENT_ID)).resolves.toMatchObject({ status: 'pending' });

    expect(clientQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO event_safety_checks'))).toBe(true);
  });

  /** SAFETY-OUTCOME-06: legacy missing settings metadata is interpreted as disabled with no dates. */
  it('SAFETY-OUTCOME-06 defaults missing registration metadata to disabled', async () => {
    const { service } = makeService({ enabled: false, opensAt: null, closesAt: null }, 'Projector', true);
    const status = await service.arrangementsStatus(COORDINATOR, EVENT_ID);
    expect(status.checklist.registration).toEqual({ enabled: false, status: 'confirmed' });
  });

  /** SAFETY-OUTCOME-06: confirm-no-equipment reads the same saved registration fields while keeping its existing equipment acknowledgement rule. */
  it('SAFETY-OUTCOME-06 confirms no equipment when disabled registration is saved', async () => {
    const { service, clientQuery } = makeService({ enabled: false, opensAt: null, closesAt: null }, 'None');

    await expect(service.confirmNoEquipment(COORDINATOR, EVENT_ID)).resolves.toEqual({
      eventId: EVENT_ID, equipmentConfirmedAt: NOW.toISOString(),
    });

    expect(clientQuery.mock.calls.some(([sql]) => sql.includes('UPDATE events SET equipment_confirmed_at'))).toBe(true);
  });
});
