/* SPM-157 AC10: the history routes. */
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { EventHistoryController } from './event-history.controller.js';
import type { EventHistoryService } from './event-history.service.js';

function response() {
  const res = { status: vi.fn(), set: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.set.mockReturnValue(res);
  return res;
}

describe('SPM-157 EventHistoryController', () => {
  // Traceability: Jira 157 AC9 (matrix 39813204)
  /** AUDIT-HISTORY-09-A: the identity comes from the session, never the request body or query. */
  it('AUDIT-HISTORY-09-A reads the history for the session user', async () => {
    const history = { history: vi.fn().mockResolvedValue({ ok: true }) };
    const controller = new EventHistoryController(history as unknown as EventHistoryService);
    const user = { uid: 'coord-1', roles: ['COORDINATOR'] };
    await expect(controller.read('event-1', { currentUser: user } as never)).resolves.toEqual({ ok: true });
    expect(history.history).toHaveBeenCalledWith(user, 'event-1');
  });

  // Traceability: Jira 157 AC10 (matrix 39813204)
  /** AUDIT-HISTORY-10-A: every change route answers 405 with Allow: GET. */
  it.each([
    ['rejectPut', RequestMethod.PUT, '/'],
    ['rejectPatch', RequestMethod.PATCH, '/'],
    ['rejectDelete', RequestMethod.DELETE, '/'],
    ['rejectEntryPut', RequestMethod.PUT, ':entryId'],
    ['rejectEntryPatch', RequestMethod.PATCH, ':entryId'],
    ['rejectEntryDelete', RequestMethod.DELETE, ':entryId'],
  ] as const)('AUDIT-HISTORY-10-A %s answers 405 with Allow: GET', (handler, method, path) => {
    const controller = new EventHistoryController({} as EventHistoryService);
    const prototype = EventHistoryController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(METHOD_METADATA, prototype[handler])).toBe(method);
    expect(Reflect.getMetadata(PATH_METADATA, prototype[handler])).toBe(path);
    const res = response();
    (controller[handler] as (r: unknown) => void)(res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.set).toHaveBeenCalledWith('Allow', 'GET');
    expect(res.json).toHaveBeenCalledWith({ statusCode: 405, message: 'The event history cannot be changed.' });
  });
});
