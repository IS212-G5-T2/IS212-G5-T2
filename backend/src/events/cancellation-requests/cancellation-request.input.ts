/*
 * SPM-155 pure body validation. No I/O. Both bodies are strict (unknown keys are refused), so a status, a
 * requester, an event or a decider can never be supplied by the client.
 *
 * Create: { reason?: string | null }. The reason is optional, trimmed, 0 to 500 code points; spaces only means no
 * reason (stored as null); more than 500 is 422 INVALID_REASON; a value that is not text is 400.
 * Decision: { decision: 'accept' | 'decline' }; anything else is 400 INVALID_DECISION.
 */
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { CANCELLATION_REQUEST_CODES as CODES, CANCELLATION_REQUEST_MESSAGES as MESSAGES } from './cancellation-request.messages.js';

export const REASON_MAX = 500;

export type CancellationDecision = 'accept' | 'decline';

function invalidRequest(): BadRequestException {
  return new BadRequestException({ code: CODES.invalidRequest, message: MESSAGES.invalidRequest });
}

/** A JSON object body; `undefined` (no body) counts as an empty object. Arrays and scalars are refused. */
function bodyRecord(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  const record = body === undefined ? {} : body;
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw invalidRequest();
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw invalidRequest();
  return record as Record<string, unknown>;
}

export function validateCreateBody(body: unknown): { reason: string | null } {
  const { reason } = bodyRecord(body, ['reason']);
  if (reason === undefined || reason === null) return { reason: null };
  if (typeof reason !== 'string') throw invalidRequest();
  const trimmed = reason.trim();
  // Code points, not UTF16 units: the database CHECK (char_length) counts the same way.
  if (Array.from(trimmed).length > REASON_MAX)
    throw new UnprocessableEntityException({ code: CODES.invalidReason, message: MESSAGES.invalidReason });
  return { reason: trimmed === '' ? null : trimmed };
}

export function validateDecisionBody(body: unknown): { decision: CancellationDecision } {
  const { decision } = bodyRecord(body, ['decision']);
  if (decision !== 'accept' && decision !== 'decline')
    throw new BadRequestException({ code: CODES.invalidDecision, message: MESSAGES.invalidDecision });
  return { decision };
}
