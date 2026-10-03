/*
 * Server-side registration window rule (D5/D6). The window is inclusive at
 * the opening instant and exclusive at the closing instant.
 */
export interface RegistrationWindow {
  registrationEnabled: boolean;
  status: string;
  opensAt: Date | null;
  closesAt: Date | null;
}

// Only Confirmed events are published to attendees; Approved events are internal
// workflow state and not visible in the attendee view.
export const REGISTRABLE_STATUSES = ['Confirmed'] as const;
export const ATTENDEE_VISIBLE_STATUSES = ['Confirmed', 'Completed', 'Cancelled'] as const;

export type WindowState = 'open' | 'not_open' | 'closed';

/** Classifies why registration is (not) available at the given instant. */
export function registrationWindowState(event: RegistrationWindow, now: Date): WindowState {
  // Only published (Approved/Confirmed) events with registration enabled accept registrations.
  if (!event.registrationEnabled || !REGISTRABLE_STATUSES.includes(event.status)) return 'closed';
  const instant = now.getTime();
  if (event.opensAt && instant < event.opensAt.getTime()) return 'not_open';
  if (event.closesAt && instant >= event.closesAt.getTime()) return 'closed';
  return 'open';
}

/** True only while an attendee may register. */
export function isRegistrationOpen(event: RegistrationWindow, now: Date): boolean {
  return registrationWindowState(event, now) === 'open';
}
