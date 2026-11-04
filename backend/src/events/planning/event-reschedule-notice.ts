/*
 * SPM-181 Event Change Notification (Attendee). One shared place that tells attendees an event was rescheduled, used by
 * every way a start or end change is applied: the Coordinator's direct edit and a confirmed flagged change
 * (EventPlanningService), and an approved change request (ChangeRequestReviewService). Each caller invokes it inside
 * its own transaction right after the fields are saved, so a failed or rolled-back change leaves no notice behind.
 *
 * Only a change to the start or end date and time notifies. Every Registered or Waitlisted attendee gets exactly one
 * notice per save, however many of the two fields changed; Withdrawn, Removed and Cancelled entries get none.
 */
import type pg from 'pg';
import { sgtDateTime } from '../../common/sgt-time.js';

export const EVENT_RESCHEDULED_NOTICE = 'EventRescheduled';

/** The registration statuses that still hold a place or a waitlist place on the event. */
export const NOTIFIABLE_REGISTRATION_STATUSES = ['Registered', 'Waitlisted'] as const;

interface ScheduleRow {
  id: string;
  name: string;
  startDateTime: string;
  endDateTime: string;
}

/** SPM-181 AC2: `"<event name>" has been rescheduled. It now runs <start> to <end> (SGT).` */
export function eventRescheduledMessage(event: ScheduleRow): string {
  const start = sgtDateTime(Date.parse(event.startDateTime));
  const end = sgtDateTime(Date.parse(event.endDateTime));
  return `"${event.name}" has been rescheduled. It now runs ${start} to ${end} (SGT).`;
}

/** Whether the start or end instant differs between the stored and the saved event. */
export function scheduleChanged(before: ScheduleRow, after: ScheduleRow): boolean {
  return (
    Date.parse(before.startDateTime) !== Date.parse(after.startDateTime) ||
    Date.parse(before.endDateTime) !== Date.parse(after.endDateTime)
  );
}

/**
 * Writes one unread notice per Registered or Waitlisted attendee, stamped with the moment the change was applied, when
 * the saved event's start or end differs from `before`. Returns the number of notices written.
 */
export async function notifyAttendeesOfReschedule(
  db: { query(text: string, params?: unknown[]): Promise<pg.QueryResult> },
  before: ScheduleRow,
  after: ScheduleRow,
  appliedAt: Date,
): Promise<number> {
  if (!scheduleChanged(before, after)) return 0;
  const result = await db.query(
    `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_user_id, created_at)
     SELECT gen_random_uuid(), r.attendee_id::text, $2, $3, $1::uuid, r.attendee_id, $4::timestamptz
       FROM event_registrations r
      WHERE r.event_id = $1::uuid AND r.status = ANY($5::text[])`,
    [after.id, EVENT_RESCHEDULED_NOTICE, eventRescheduledMessage(after), appliedAt, [...NOTIFIABLE_REGISTRATION_STATUSES]],
  );
  return result.rowCount ?? 0;
}
