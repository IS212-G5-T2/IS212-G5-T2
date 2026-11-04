/*
 * SPM-134 (tentative hold expiry notifications, Coordinator): the messages and the notice writer, in isolation. The
 * database client is a fixture that answers the lookup and records the insert; test/tentative-hold-lifecycle-
 * notifications.e2e-spec.ts runs the same rules against PostgreSQL.
 * Cases: HOLD-EXP-NOTIF-01-A, 01-B, 04-A, 04-B, 04-BND-1, 09-A, 10-A.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  tentativeHoldConvertedMessage,
  tentativeHoldExpiredMessage,
  tentativeHoldReleasedMessage,
  tentativeHoldReminderMessage,
} from '../../registrations/helpers/messages.js';
import {
  type HoldLifecycleChange,
  type HoldLifecycleEvent,
  HOLD_CONVERTED_NOTICE,
  HOLD_EXPIRED_NOTICE,
  HOLD_EXPIRY_REMINDER_NOTICE,
  HOLD_RELEASED_NOTICE,
  notifyHoldLifecycle,
} from './hold-lifecycle-notice.js';

const HOLD = '22222222-2222-4222-8222-222222222401';
const sentAt = new Date('2030-06-01T12:00:00.000Z');
// 2030-06-03 16:30 UTC is 00:30 on 4 Jun in Singapore (UTC+8, no daylight saving).
const expiresAt = new Date('2030-06-03T16:30:00.000Z');

const context = (overrides: Record<string, unknown> = {}) => ({
  rows: [
    {
      coordinator_id: 'coo-01',
      event_id: 'event-1',
      event_name: 'Gala Night',
      event_status: 'Planning',
      venue_name: 'Orchid Hall',
      ...overrides,
    },
  ],
});

function client(...responses: Array<{ rows: unknown[] }>) {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  query.mockResolvedValue({ rows: [] });
  return { query };
}
const inserts = (c: { query: ReturnType<typeof vi.fn> }) =>
  (c.query.mock.calls as Array<[string, unknown[]]>).filter(([sql]) => sql.includes('INSERT INTO notifications'));

const EVENTS = ['reminder', 'expired', 'released', 'converted'] as const;
// Reminder and expired changes carry the expiry (the type requires it); released and converted carry none.
const changeOf = (event: HoldLifecycleEvent): HoldLifecycleChange =>
  event === 'reminder' || event === 'expired' ? { event, expiresAt } : { event };
const TYPE_OF = {
  reminder: HOLD_EXPIRY_REMINDER_NOTICE,
  expired: HOLD_EXPIRED_NOTICE,
  released: HOLD_RELEASED_NOTICE,
  converted: HOLD_CONVERTED_NOTICE,
} as const;

describe('SPM-134 hold lifecycle messages and notice writer', () => {
  /**
   * HOLD-EXP-NOTIF-04-A (SPM-134 AC4): the four messages are exactly the sentences in the story, with the venue name,
   * the quoted event name and, for the reminder and expired ones, the expiry in Singapore time.
   * Kills: any wording change, swapped venue and event name, missing quotes, "has expired" for "expired on".
   */
  it('HOLD-EXP-NOTIF-04-A the four messages are exactly the agreed sentences', () => {
    expect(tentativeHoldReminderMessage('Orchid Hall', 'Gala Night', expiresAt)).toBe(
      'Your tentative hold of Orchid Hall for "Gala Night" expires on 4 Jun 2030, 00:30 SGT.',
    );
    expect(tentativeHoldExpiredMessage('Orchid Hall', 'Gala Night', expiresAt)).toBe(
      'Your tentative hold of Orchid Hall for "Gala Night" expired on 4 Jun 2030, 00:30 SGT.',
    );
    expect(tentativeHoldReleasedMessage('Orchid Hall', 'Gala Night')).toBe(
      'Your tentative hold of Orchid Hall for "Gala Night" has been released.',
    );
    expect(tentativeHoldConvertedMessage('Orchid Hall', 'Gala Night')).toBe(
      'Your tentative hold of Orchid Hall for "Gala Night" has been confirmed as a booking.',
    );
  });

  /**
   * HOLD-EXP-NOTIF-04-B (SPM-134 AC4, SC-SPM134-01, confirmed by the story owner chaw678 on 4 Nov 2026): the expiry is written in the app's existing
   * Singapore format (formatSgt), including when the Singapore date is one day after the UTC date.
   * Kills: formatting in UTC or the server's zone, dropping the SGT label.
   */
  it('HOLD-EXP-NOTIF-04-B writes the expiry in Singapore time even when the UTC date differs', () => {
    expect(tentativeHoldReminderMessage('V', 'E', new Date('2030-12-31T16:00:00.000Z'))).toContain(
      'expires on 1 Jan 2031, 00:00 SGT.',
    );
    expect(tentativeHoldExpiredMessage('V', 'E', new Date('2030-06-01T15:59:00.000Z'))).toContain(
      'expired on 1 Jun 2030, 23:59 SGT.',
    );
  });

  /**
   * HOLD-EXP-NOTIF-04-BND-1 (SPM-134 AC4, boundary): quotes, punctuation and 200+ character names appear unchanged.
   * Kills: escaping or truncating the names.
   */
  it('HOLD-EXP-NOTIF-04-BND-1 keeps quotes and long names in every message unchanged', () => {
    const venue = 'Hall "A" & B (Level 2)';
    const event = `"Annual" Gala: ${'x'.repeat(200)}`;
    expect(tentativeHoldReleasedMessage(venue, event)).toBe(`Your tentative hold of ${venue} for "${event}" has been released.`);
    expect(tentativeHoldConvertedMessage(venue, event)).toBe(
      `Your tentative hold of ${venue} for "${event}" has been confirmed as a booking.`,
    );
    expect(tentativeHoldReminderMessage(venue, event, expiresAt)).toContain(`${venue} for "${event}" expires on`);
    expect(tentativeHoldExpiredMessage(venue, event, expiresAt)).toContain(`${venue} for "${event}" expired on`);
  });

  /**
   * HOLD-EXP-NOTIF-01-A (SPM-134 AC1, AC3): each lifecycle event writes exactly one notification for the Coordinator the
   * event has now, with its own type, linked to the event and the hold, stamped with the time the caller passes.
   * Kills: no insert, two inserts, the wrong type for an event, a missing hold link, a different time source.
   */
  it.each(EVENTS)('HOLD-EXP-NOTIF-01-A a %s notice is one row for the assigned Coordinator, typed, linked and stamped', async (event) => {
    const c = client(context());

    await notifyHoldLifecycle(c, HOLD, changeOf(event), sentAt);

    const rows = inserts(c);
    expect(rows).toHaveLength(1);
    const [id, recipient, type, message, eventId, bookingId, createdAt] = rows[0][1];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect([recipient, type, eventId, bookingId]).toEqual(['coo-01', TYPE_OF[event], 'event-1', HOLD]);
    expect(message).toContain('Your tentative hold of Orchid Hall for "Gala Night"');
    expect(createdAt).toEqual(sentAt);
  });

  /**
   * HOLD-EXP-NOTIF-01-B (SPM-134 AC1): a hold that cannot be found, or whose event has no Coordinator, has no recipient:
   * nothing is written and the call does not fail.
   * Kills: inserting a notification with a null recipient.
   */
  it.each([
    ['the hold is not found', { rows: [] }],
    ['the event has no Coordinator', context({ coordinator_id: null })],
  ])('HOLD-EXP-NOTIF-01-B writes nothing when %s', async (_label, lookup) => {
    const c = client(lookup);

    await expect(notifyHoldLifecycle(c, HOLD, { event: 'reminder', expiresAt }, sentAt)).resolves.toBeUndefined();

    expect(inserts(c)).toHaveLength(0);
  });

  /**
   * HOLD-EXP-NOTIF-09-A (SPM-134 AC9): the recipient is read from the event on every call, so a hold whose event was
   * reassigned between two notices addresses the second to the new Coordinator.
   * Kills: caching or remembering the first recipient.
   */
  it('HOLD-EXP-NOTIF-09-A addresses each notice to the Coordinator the event has at that moment', async () => {
    const c = client(context({ coordinator_id: 'coo-old' }), { rows: [] }, context({ coordinator_id: 'coo-new' }));

    await notifyHoldLifecycle(c, HOLD, { event: 'reminder', expiresAt }, sentAt);
    await notifyHoldLifecycle(c, HOLD, { event: 'expired', expiresAt }, sentAt);

    expect(inserts(c).map(([, params]) => params[1])).toEqual(['coo-old', 'coo-new']);
    const lookup = (c.query.mock.calls as Array<[string]>)[0][0].replace(/\s+/g, ' ');
    expect(lookup).toContain('e.coordinator_id');
    expect(lookup).toContain('FROM venue_bookings b JOIN events e ON e.id = b.event_id JOIN venues v ON v.id = b.venue_id');
  });

  /**
   * HOLD-EXP-NOTIF-10-A (SPM-134 AC10): no hold notification is written for a cancelled event, whichever the lifecycle
   * event; an event in any other status still gets one.
   * Kills: ignoring the event's status.
   */
  it.each(EVENTS)('HOLD-EXP-NOTIF-10-A a %s notice is not written for a Cancelled event', async (event) => {
    const cancelled = client(context({ event_status: 'Cancelled' }));
    await notifyHoldLifecycle(cancelled, HOLD, changeOf(event), sentAt);
    expect(inserts(cancelled)).toHaveLength(0);

    const active = client(context({ event_status: 'Confirmed' }));
    await notifyHoldLifecycle(active, HOLD, changeOf(event), sentAt);
    expect(inserts(active)).toHaveLength(1);
  });
});
