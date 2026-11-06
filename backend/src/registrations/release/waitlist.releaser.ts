/*
 * SPM-138 AC12 (waitlist side): the waiting list of a cancelled event. The releaser settles the list, cancels each
 * Waitlisted entry and writes one EventCancelled notice per cancelled entry, inside the cancellation transaction.
 * Registered, Withdrawn and Removed rows are untouched (JOIN-WAITLIST-12-C). The logic lives in
 * registrations/waitlist/cancel-releaser.ts; this file only registers it with the cancellation core.
 */
import type pg from 'pg';
import type { EventReleaser } from '../../events/cancel/release.registry.js';
import { releaseWaitlistForCancelledEvent } from '../waitlist/cancel-releaser.js';

export const waitlistReleaser: EventReleaser = {
  name: 'event_registrations.waitlist',
  async release(eventId: string, client: pg.PoolClient, now: Date) {
    await releaseWaitlistForCancelledEvent(client, eventId, now);
  },
};
