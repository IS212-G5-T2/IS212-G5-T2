/*
 * SPM-136 release registry. The cancellation core (cancel-event.service.ts) knows no table names: it asks
 * each registered releaser for the recipients it must notify (before anything changes) and then asks it
 * to release its own rows, inside the same transaction. Adding a table means adding a releaser here.
 */
import type pg from 'pg';
import { equipmentReservationReleaser } from '../../equipment/release/equipment-reservation.releaser.js';
import { registrationReleaser } from '../../registrations/release/registration.releaser.js';
import { venueBookingReleaser } from '../../venues/release/venue-booking.releaser.js';

export interface EventReleaser {
  /** Stable name for logs and tests. */
  readonly name: string;
  /** Users to notify of the cancellation, read before any release (optional). */
  collectRecipients?(eventId: string, client: pg.PoolClient): Promise<string[]>;
  /** Releases this table's rows for the event. Must touch only rows of `eventId`. */
  release(eventId: string, client: pg.PoolClient, now: Date): Promise<void>;
}

/** Injection token for the list of releasers (tests replace it for fault injection). */
export const EVENT_RELEASERS = 'EVENT_RELEASERS';

/** Order matters only for fault injection: the equipment releaser runs last (CANCEL-EVENT-04-C). */
export const DEFAULT_RELEASERS: readonly EventReleaser[] = [
  venueBookingReleaser,
  registrationReleaser,
  equipmentReservationReleaser,
];
