/*
 * SPM-153 AC5 (COMPLETE-EVENT-05-A): the controller passes the path id, the session identity and the body to the service.
 */
import { describe, expect, it, vi } from 'vitest';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import { CompletionRecordController } from './completion-record.controller.js';

describe('COMPLETE-EVENT-05-A: the completion record route', () => {
  const identity = { uid: 'coord-a', roles: ['COORDINATOR'] };
  const request = { [CURRENT_USER_REQUEST_KEY]: identity } as never;

  it('COMPLETE-EVENT-05-A: GET reads the record of the path event for the session user', async () => {
    const records = { read: vi.fn(async () => ({ attendanceCount: 3 })), save: vi.fn() };
    const controller = new CompletionRecordController(records as never);

    await expect(controller.read('event-1', request)).resolves.toEqual({ attendanceCount: 3 });
    expect(records.read).toHaveBeenCalledWith(identity, 'event-1');
  });

  it('COMPLETE-EVENT-05-A: PUT saves the body for the path event and the session user', async () => {
    const records = { read: vi.fn(), save: vi.fn(async () => ({ message: 'Completion details saved.' })) };
    const controller = new CompletionRecordController(records as never);

    await expect(controller.save('event-1', { attendanceCount: 3 }, request)).resolves.toEqual({ message: 'Completion details saved.' });
    expect(records.save).toHaveBeenCalledWith(identity, 'event-1', { attendanceCount: 3 });
  });
});
