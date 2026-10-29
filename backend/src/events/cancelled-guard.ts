/*
 * SPM-136 AC7: nobody can change the arrangements of a cancelled event. Every existing mutation that takes
 * an event calls this guard after its own identity and assignment checks and before any write.
 * The code and text are the MSG-CN-04 catalogue entry (cancel.messages.ts).
 */
import { ConflictException } from '@nestjs/common';
import { CANCEL_MESSAGES } from './cancel/cancel.messages.js';

export const EVENT_CANCELLED_CODE = 'EVENT_CANCELLED';
export const EVENT_CANCELLED_MESSAGE = CANCEL_MESSAGES.eventCancelled;

export function assertEventNotCancelled(status: string | null | undefined): void {
  if (status === 'Cancelled')
    throw new ConflictException({ code: EVENT_CANCELLED_CODE, message: EVENT_CANCELLED_MESSAGE });
}
