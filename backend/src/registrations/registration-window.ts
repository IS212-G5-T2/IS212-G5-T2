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

export const ATTENDEE_VISIBLE_STATUSES = ['Confirmed', 'Completed', 'Cancelled'] as const;

export type WindowState = 'open' | 'not_open' | 'closed';

/** Classifies why registration is (not) available at the given instant. */
export function registrationWindowState(event: RegistrationWindow, now: Date): WindowState {
  // Only published Confirmed events with registration enabled accept registrations.
  if (!event.registrationEnabled || event.status !== 'Confirmed') return 'closed';
  const instant = now.getTime();
  if (event.opensAt && instant < event.opensAt.getTime()) return 'not_open';
  if (event.closesAt && instant >= event.closesAt.getTime()) return 'closed';
  return 'open';
}

/** True only while an attendee may register. */
export function isRegistrationOpen(event: RegistrationWindow, now: Date): boolean {
  return registrationWindowState(event, now) === 'open';
}
