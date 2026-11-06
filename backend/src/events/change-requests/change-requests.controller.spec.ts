/*
 * SPM-64: the controller only forwards the verified session identity and the
 * route values to ChangeRequestsService; it never reads identity from the body.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY, type AuthenticatedUser } from '../../auth/types/auth.models.js';
import { ChangeRequestsController } from './change-requests.controller.js';
import type { ChangeRequestsService } from './change-requests.service.js';
import type { ChangeRequestReviewService } from './review/change-request-review.service.js';

const user = { uid: 'org-1', roles: ['ORGANISER'] } as AuthenticatedUser;
const request = { [CURRENT_USER_REQUEST_KEY]: user } as unknown as Request;

function controller() {
  const service = {
    create: vi.fn().mockResolvedValue('created'),
    listForEvent: vi.fn().mockResolvedValue('event-list'),
    withdraw: vi.fn().mockResolvedValue('withdrawn'),
    listMine: vi.fn().mockResolvedValue('mine'),
  };
  const review = {
    auditLog: vi.fn().mockResolvedValue('audit'),
    preview: vi.fn().mockResolvedValue('preview'),
    approve: vi.fn().mockResolvedValue('approved'),
    deny: vi.fn().mockResolvedValue('denied'),
    markRechecked: vi.fn().mockResolvedValue('rechecked'),
  };
  return {
    service,
    review,
    controller: new ChangeRequestsController(
      service as unknown as ChangeRequestsService,
      review as unknown as ChangeRequestReviewService,
    ),
  };
}

describe('ChangeRequestsController', () => {
  /** REQ-CHANGE-08-B: the session user, not the body, identifies the requester. */
  it('passes the session user, event id and body to create', async () => {
    const { service, controller: c } = controller();
    const body = { changes: { description: 'New' }, requestedBy: 'someone-else' };
    await expect(c.create('evt', body, request as never)).resolves.toBe('created');
    expect(service.create).toHaveBeenCalledWith(user, 'evt', body);
  });

  /** REQ-CHANGE-05-A: the event list, withdraw and dashboard routes delegate with the session user. */
  it('delegates the list, withdraw and dashboard routes', async () => {
    const { service, controller: c } = controller();
    await expect(c.listForEvent('evt', request as never)).resolves.toBe('event-list');
    expect(service.listForEvent).toHaveBeenCalledWith(user, 'evt');
    await expect(c.withdraw('evt', 'req', request as never)).resolves.toBe('withdrawn');
    expect(service.withdraw).toHaveBeenCalledWith(user, 'evt', 'req');
    await expect(c.listMine('Pending', request as never)).resolves.toBe('mine');
    expect(service.listMine).toHaveBeenCalledWith(user, 'Pending');
  });

  /** SPM-65 (REVIEW-CHANGE-11-A): the review routes delegate with the session user and route values only. */
  it('delegates the SPM-65 review routes', async () => {
    const { review, controller: c } = controller();
    await expect(c.auditLog('evt', request as never)).resolves.toBe('audit');
    expect(review.auditLog).toHaveBeenCalledWith(user, 'evt');
    await expect(c.preview('evt', 'req', request as never)).resolves.toBe('preview');
    expect(review.preview).toHaveBeenCalledWith(user, 'evt', 'req');
    await expect(c.approve('evt', 'req', {}, request as never)).resolves.toBe('approved');
    expect(review.approve).toHaveBeenCalledWith(user, 'evt', 'req', {});
    await expect(c.deny('evt', 'req', { reason: 'r' }, request as never)).resolves.toBe('denied');
    expect(review.deny).toHaveBeenCalledWith(user, 'evt', 'req', { reason: 'r' });
    await expect(c.markRechecked('evt', 'req', 'item', request as never)).resolves.toBe('rechecked');
    expect(review.markRechecked).toHaveBeenCalledWith(user, 'evt', 'req', 'item');
  });
});
