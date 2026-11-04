/*
 * SPM-181 Event Change Notification (Attendee): the shared helper that tells attendees an event was rescheduled.
 * The database is a recording fixture; test/event-reschedule-notification.e2e-spec.ts runs the same rules against
 * PostgreSQL. Cases: EVENT-CHANGE-NOTIF-01-A, 02-A, 02-C, 04-A, 05-A, 05-B.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  EVENT_RESCHEDULED_NOTICE,
  eventRescheduledMessage,
  notifyAttendeesOfReschedule,
  scheduleChanged,
} from './event-reschedule-notice.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000181';
const APPLIED_AT = new Date('2026-11-04T03:00:00.000Z');
const before = {
  id: EVENT_ID,
  name: 'Welcome Evening',
  startDateTime: '2026-11-10T10:00:00.000Z',
  endDateTime: '2026-11-10T13:00:00.000Z',
};
const db = () => ({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 3 }) });

describe('SPM-181 eventRescheduledMessage', () => {
  /**
   * EVENT-CHANGE-NOTIF-02-A (AC2): the exact wording, with the start and end in Singapore time.
   * Kills: a different sentence, dropping "(SGT)", showing UTC instead of Singapore time.
   */
  it('EVENT-CHANGE-NOTIF-02-A words the notice exactly, in Singapore time', () => {
    expect(eventRescheduledMessage(before)).toBe(
      '"Welcome Evening" has been rescheduled. It now runs 10 Nov 2026, 6:00 pm to 10 Nov 2026, 9:00 pm (SGT).',
    );
  });

  /**
   * EVENT-CHANGE-NOTIF-02-C (AC2): the event's current (saved) name is used, and a period crossing midnight in
   * Singapore shows both dates.
   * Kills: using the stored name from before the change, hiding the end date.
   */
  it('EVENT-CHANGE-NOTIF-02-C uses the name after the change and shows both dates across midnight', () => {
    const message = eventRescheduledMessage({
      ...before,
      name: 'Welcome Night',
      startDateTime: '2026-11-10T15:00:00.000Z',
      endDateTime: '2026-11-10T18:30:00.000Z',
    });
    expect(message).toBe(
      '"Welcome Night" has been rescheduled. It now runs 10 Nov 2026, 11:00 pm to 11 Nov 2026, 2:30 am (SGT).',
    );
  });
});

describe('SPM-181 scheduleChanged', () => {
  /**
   * EVENT-CHANGE-NOTIF-05-B (AC5): only a different start or end instant is a change; the same instant written in
   * another form, or a different name, is not.
   * Kills: comparing the strings instead of the instants, treating a name change as a schedule change.
   */
  it.each([
    ['the same instants in another form', { startDateTime: '2026-11-10T18:00:00+08:00' }, false],
    ['only the name', { name: 'Renamed' }, false],
    ['a different start', { startDateTime: '2026-11-10T10:00:01.000Z' }, true],
    ['a different end', { endDateTime: '2026-11-10T13:00:01.000Z' }, true],
  ])('EVENT-CHANGE-NOTIF-05-B %s -> changed: %s', (_label, change, expected) => {
    expect(scheduleChanged(before, { ...before, ...change })).toBe(expected);
  });
});

describe('SPM-181 notifyAttendeesOfReschedule', () => {
  /**
   * EVENT-CHANGE-NOTIF-01-A (AC1, AC2): one statement notifies the Registered and Waitlisted entries of this event only,
   * with the event's type, the new wording and the time the change was applied.
   * Kills: notifying Withdrawn, Removed or Cancelled entries, another event's attendees, a different stamp.
   */
  it('EVENT-CHANGE-NOTIF-01-A writes one statement for Registered and Waitlisted entries, stamped with the change time', async () => {
    const database = db();
    const after = { ...before, startDateTime: '2026-11-10T11:00:00.000Z' };

    const written = await notifyAttendeesOfReschedule(database, before, after, APPLIED_AT);

    expect(written).toBe(3);
    expect(database.query).toHaveBeenCalledTimes(1);
    const [sql, params] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO notifications');
    expect(sql).toContain('FROM event_registrations');
    expect(sql).toContain('r.event_id = $1::uuid');
    expect(params).toEqual([
      EVENT_ID,
      EVENT_RESCHEDULED_NOTICE,
      eventRescheduledMessage(after),
      APPLIED_AT,
      ['Registered', 'Waitlisted'],
    ]);
  });

  /**
   * EVENT-CHANGE-NOTIF-04-A (AC4): moving the start and the end in one save is still one statement, so one notice per
   * attendee.
   * Kills: one statement per changed field.
   */
  it('EVENT-CHANGE-NOTIF-04-A writes a single statement when both start and end changed', async () => {
    const database = db();

    await notifyAttendeesOfReschedule(
      database,
      before,
      { ...before, startDateTime: '2026-11-11T10:00:00.000Z', endDateTime: '2026-11-11T13:00:00.000Z' },
      APPLIED_AT,
    );

    expect(database.query).toHaveBeenCalledTimes(1);
  });

  /**
   * EVENT-CHANGE-NOTIF-05-A (AC5): nothing is written, and the database is not asked, when the schedule is unchanged.
   * Kills: notifying on any saved change, or on a name-only change.
   */
  it('EVENT-CHANGE-NOTIF-05-A writes nothing when the schedule is unchanged', async () => {
    const database = db();

    await expect(notifyAttendeesOfReschedule(database, before, { ...before, name: 'Renamed' }, APPLIED_AT)).resolves.toBe(0);

    expect(database.query).not.toHaveBeenCalled();
  });

  /**
   * EVENT-CHANGE-NOTIF-01-A: a driver result without a row count counts as zero notices.
   * Kills: returning undefined or NaN.
   */
  it('EVENT-CHANGE-NOTIF-01-A reports zero when the driver gives no row count', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await expect(
      notifyAttendeesOfReschedule(database, before, { ...before, endDateTime: '2026-11-10T14:00:00.000Z' }, APPLIED_AT),
    ).resolves.toBe(0);
  });
});
