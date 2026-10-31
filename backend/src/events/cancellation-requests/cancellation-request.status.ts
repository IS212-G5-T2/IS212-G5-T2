/*
 * SPM-155 AC2 / D4: what the Organiser and Coordinator are shown for a request. The stored status is
 * pending, accepted or declined. A pending request whose event is Completed or Cancelled can never be decided,
 * so it is shown as Closed with the reason. This is derived on every read and never written.
 */
import { CANCELLATION_REQUEST_MESSAGES as MESSAGES } from './cancellation-request.messages.js';

export type StoredCancellationStatus = 'pending' | 'accepted' | 'declined';
export type DisplayCancellationStatus = StoredCancellationStatus | 'closed';

export interface DisplayStatus {
  displayStatus: DisplayCancellationStatus;
  /** Present only for a closed request. */
  closedNote?: string;
}

export function displayStatusOf(stored: StoredCancellationStatus, eventStatus: string): DisplayStatus {
  if (stored !== 'pending') return { displayStatus: stored };
  if (eventStatus === 'Cancelled') return { displayStatus: 'closed', closedNote: MESSAGES.closedCancelled };
  if (eventStatus === 'Completed') return { displayStatus: 'closed', closedNote: MESSAGES.closedCompleted };
  return { displayStatus: 'pending' };
}
