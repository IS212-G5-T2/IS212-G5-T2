/*
 * SPM-153 AC5: the completion record flows, unit level, against a small in-memory stand-in for the three tables.
 * COMPLETE-EVENT-05-A (save and read), 05-B (subset saves keep what they do not carry), 05-C (not Completed),
 * 05-D (invalid body names its field), 05-F (only the assigned coordinator; unknown or malformed ids).
 */
import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CompletionRecordService } from './completion-record.service.js';

const EVENT = '11111111-1111-4111-8111-111111111153';
const NOW = new Date('2026-10-12T04:00:00.000Z');
const COORDINATOR: AuthenticatedUser = { uid: 'coord-a', roles: ['COORDINATOR'] };
const OTHER: AuthenticatedUser = { uid: 'coord-b', roles: ['COORDINATOR'] };

/** A stand-in for the event row, the completion_records row and its issues. */
function world(status = 'Completed', coordinatorId = 'coord-a') {
  const state = {
    event: { id: EVENT, status, coordinator_id: coordinatorId },
    record: null as null | { attendance_count: number | null; operational_notes: string | null; updated_by: string; updated_at: Date },
    issues: [] as { position: number; description: string }[],
  };
  const answer = (sql: string, params: unknown[] = []) => {
    if (sql.includes('FOR UPDATE')) return { rows: [{ ...state.event }], rowCount: 1 };
    if (sql.includes('SELECT coordinator_id FROM events')) return { rows: [{ coordinator_id: state.event.coordinator_id }], rowCount: 1 };
    if (sql.includes('FROM completion_records WHERE event_id')) return { rows: state.record ? [state.record] : [], rowCount: state.record ? 1 : 0 };
    if (sql.includes('FROM completion_record_issues')) return { rows: [...state.issues].sort((a, b) => a.position - b.position), rowCount: state.issues.length };
    if (sql.includes('INSERT INTO completion_records')) {
      const [, attendance, notes, actor, at] = params as [string, number | null, string | null, string, Date];
      state.record = { attendance_count: attendance, operational_notes: notes, updated_by: actor, updated_at: at };
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('DELETE FROM completion_record_issues')) {
      state.issues = [];
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO completion_record_issues')) {
      const [, position, description] = params as [string, number, string];
      state.issues.push({ position, description });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  };
  const client = { query: vi.fn(async (sql: string, params?: unknown[]) => answer(sql, params)) };
  const database = {
    query: vi.fn(async (sql: string, params?: unknown[]) => answer(sql, params)),
    transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)),
  };
  return { state, service: new CompletionRecordService(database as never, { now: () => NOW }) };
}

const FULL = { attendanceCount: 42, operationalNotes: 'Setup began 08:00.', issues: [{ description: 'Projector bulb failed.' }] };

describe('COMPLETE-EVENT-05-A: a read and a save of the completion record', () => {
  it('COMPLETE-EVENT-05-A: a read with nothing saved returns nulls and an empty list', async () => {
    const { service } = world();

    await expect(service.read(COORDINATOR, EVENT)).resolves.toEqual({
      attendanceCount: null,
      operationalNotes: null,
      issues: [],
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('COMPLETE-EVENT-05-A: a save stores the three items and returns them with the saved message', async () => {
    const { state, service } = world();

    const saved = await service.save(COORDINATOR, EVENT, FULL);

    expect(saved).toMatchObject({
      attendanceCount: 42,
      operationalNotes: 'Setup began 08:00.',
      issues: [{ description: 'Projector bulb failed.' }],
      updatedBy: 'coord-a',
      updatedAt: NOW.toISOString(),
      message: 'Completion details saved.',
    });
    expect(state.record).toMatchObject({ attendance_count: 42, operational_notes: 'Setup began 08:00.' });
  });

  it('COMPLETE-EVENT-05-A: a read returns what a save stored', async () => {
    const { service } = world();
    await service.save(COORDINATOR, EVENT, FULL);

    await expect(service.read(COORDINATOR, EVENT)).resolves.toMatchObject({ attendanceCount: 42, issues: [{ description: 'Projector bulb failed.' }] });
  });
});

describe('COMPLETE-EVENT-05-B: a subset save keeps the items it does not carry', () => {
  it('COMPLETE-EVENT-05-B: a save without issues keeps the saved issues and writes none', async () => {
    const { state, service } = world();
    await service.save(COORDINATOR, EVENT, FULL);

    await service.save(COORDINATOR, EVENT, { attendanceCount: 50 });

    expect(state.issues).toEqual([{ position: 1, description: 'Projector bulb failed.' }]);
    expect(state.record).toMatchObject({ attendance_count: 50, operational_notes: 'Setup began 08:00.' });
  });

  it('COMPLETE-EVENT-05-B: a save without attendance keeps the saved attendance', async () => {
    const { state, service } = world();
    await service.save(COORDINATOR, EVENT, FULL);

    await service.save(COORDINATOR, EVENT, { operationalNotes: 'Revised.' });

    expect(state.record).toMatchObject({ attendance_count: 42, operational_notes: 'Revised.' });
  });

  it('COMPLETE-EVENT-05-B: a first save with no attendance or notes stores them as null', async () => {
    const { state, service } = world();

    await service.save(COORDINATOR, EVENT, { issues: [{ description: 'Only an issue.' }] });

    expect(state.record).toMatchObject({ attendance_count: null, operational_notes: null });
    expect(state.issues).toEqual([{ position: 1, description: 'Only an issue.' }]);
  });
});

describe('COMPLETE-EVENT-05-B: an explicit null clears the saved item', () => {
  it('COMPLETE-EVENT-05-B: a save with null attendance and null notes clears both', async () => {
    const { state, service } = world();
    await service.save(COORDINATOR, EVENT, FULL);

    await service.save(COORDINATOR, EVENT, { attendanceCount: null, operationalNotes: null });

    expect(state.record).toMatchObject({ attendance_count: null, operational_notes: null });
  });
});

describe('COMPLETE-EVENT-05-C and 05-D: refusals write nothing', () => {
  it('COMPLETE-EVENT-05-C: a save on an event that is not Completed is refused with 409 and writes nothing', async () => {
    const { state, service } = world('Confirmed');

    await expect(service.save(COORDINATOR, EVENT, FULL)).rejects.toBeInstanceOf(ConflictException);
    expect(state.record).toBeNull();
  });

  it('COMPLETE-EVENT-05-D: an invalid body is refused with 422 that names the field, and writes nothing', async () => {
    const { state, service } = world();

    const error = await service.save(COORDINATOR, EVENT, { attendanceCount: -4 }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'INVALID_COMPLETION_RECORD', field: 'attendanceCount' });
    expect(state.record).toBeNull();
  });
});

describe('COMPLETE-EVENT-05-F: only the assigned coordinator, and only for a real event', () => {
  it('COMPLETE-EVENT-05-F: a read by another coordinator is refused with 403', async () => {
    const { service } = world();

    await expect(service.read(OTHER, EVENT)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('COMPLETE-EVENT-05-F: a malformed event id is 404 on read', async () => {
    const { service } = world();

    await expect(service.read(COORDINATOR, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('COMPLETE-EVENT-05-F: an unknown event id is 404 on read', async () => {
    const database = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      transaction: vi.fn(),
    };
    const service = new CompletionRecordService(database as never, { now: () => NOW });

    await expect(service.read(COORDINATOR, EVENT)).rejects.toBeInstanceOf(NotFoundException);
  });
});
