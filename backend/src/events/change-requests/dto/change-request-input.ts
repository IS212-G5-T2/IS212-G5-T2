/*
 * SPM-64: pure validation for an organiser's change request. No I/O lives here
 * so the rules can be unit tested in isolation (change-request-input.spec.ts).
 *
 * Request body: { changes: { <field>: <proposed value>, ... }, reason?: string }
 *
 * - AC1: only the permitted change types may appear under `changes`:
 *   description, date/time (start and end), attendee count (expected
 *   attendance), venue requirements (room layout, facilities), equipment
 *   requirements and special requirements (accessibility needs; agreed
 *   mapping, events have no other "special requirements" field).
 * - AC2/AC6: the event name and the organiser can never be changed. Each one
 *   sent gets its own message, and the whole request is rejected (no partial
 *   request is stored). Any other field (purpose, status, registration
 *   settings, unknown keys) is also rejected by name.
 * - Proposed values follow exactly the rules of a coordinator update
 *   (validateEventUpdate, SPM-49), so a request can never hold a value that
 *   could not later be applied. Every problem is reported in one response.
 * - Cross-field rules that need the stored event (end after the stored start,
 *   "is this actually a change") are checked by ChangeRequestsService.
 */
import { BadRequestException } from '@nestjs/common';
import {
  validateEventUpdate,
  type EventFieldKey,
  type EventUpdatePatch,
} from '../../planning/dto/event-update-input.js';

/** The fields an organiser may ask to change (SPM-64 AC1). */
export const PERMITTED_CHANGE_FIELDS = [
  'description',
  'startDateTime',
  'endDateTime',
  'expectedAttendance',
  'layout',
  'facilities',
  'accessibility',
  'equipmentNeeds',
] as const satisfies readonly EventFieldKey[];

export type ChangeField = (typeof PERMITTED_CHANGE_FIELDS)[number];

/** SPM-64 AC2: fields named in the story as never changeable, with their own message. */
const LOCKED_FIELDS: Record<string, string> = {
  name: 'Event name cannot be changed.',
  organiser: 'Event organiser cannot be changed.',
  organiserId: 'Event organiser cannot be changed.',
  organiserName: 'Event organiser cannot be changed.',
  organiserEmail: 'Event organiser cannot be changed.',
};

export const LOCKED_FIELDS_MESSAGE =
  'Event name and organiser cannot be changed. Remove these changes and try again.';
export const INVALID_FIELDS_MESSAGE = 'Please correct the highlighted fields.';
export const NOT_PERMITTED = 'This detail cannot be changed through a change request.';
export const REASON_MAX = 500;

export interface ChangeRequestInput {
  changes: Partial<Pick<EventUpdatePatch, ChangeField>>;
  reason?: string;
}

function isPermitted(key: string): key is ChangeField {
  return (PERMITTED_CHANGE_FIELDS as readonly string[]).includes(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Field errors from validateEventUpdate, or none when the patch is valid. */
function valueErrors(patch: Record<string, unknown>): {
  errors: Record<string, string>;
  cleaned?: EventUpdatePatch;
} {
  if (!Object.keys(patch).length) return { errors: {} };
  try {
    return { errors: {}, cleaned: validateEventUpdate(patch) };
  } catch (error) {
    // validateEventUpdate only ever throws a 400 carrying field errors.
    const body = (error as BadRequestException).getResponse() as { errors: Record<string, string> };
    return { errors: body.errors };
  }
}

/**
 * Validates a change request. Returns the cleaned proposed values (text
 * trimmed, choice lists de-duplicated) and optional reason, or throws a
 * BadRequestException whose body is `{ message, errors }`.
 */
export function validateChangeRequest(input: unknown): ChangeRequestInput {
  if (!isRecord(input) || !isRecord(input.changes))
    throw new BadRequestException({
      message: 'Choose at least one detail to change.',
      errors: {},
    });

  const errors: Record<string, string> = {};
  // The body itself is strict: anything besides `changes` and `reason` is a
  // client error, so server-owned values (status, requester, event) can never
  // be supplied (same rule as the waiting-list join, SPM-138).
  for (const key of Object.keys(input))
    if (key !== 'changes' && key !== 'reason') errors[key] = 'Unknown field.';

  const changes = input.changes;
  const keys = Object.keys(changes);
  if (!keys.length)
    throw new BadRequestException({
      message: 'Choose at least one detail to change.',
      errors: {},
    });

  let locked = false;
  const permitted: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in LOCKED_FIELDS) {
      errors[key] = LOCKED_FIELDS[key];
      locked = true;
    } else if (!isPermitted(key)) errors[key] = NOT_PERMITTED;
    else permitted[key] = changes[key];
  }

  // Values of permitted fields are checked even when a locked field was sent,
  // so the organiser sees every problem at once (AC6).
  const values = valueErrors(permitted);
  Object.assign(errors, values.errors);

  let reason: string | undefined;
  if ('reason' in input && input.reason !== undefined && input.reason !== null) {
    if (typeof input.reason !== 'string') errors.reason = 'Enter valid text.';
    else if (input.reason.trim().length > REASON_MAX)
      errors.reason = `Use ${REASON_MAX} characters or fewer.`;
    else reason = input.reason.trim() || undefined;
  }

  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: locked ? LOCKED_FIELDS_MESSAGE : INVALID_FIELDS_MESSAGE,
      errors,
    });

  return {
    changes: values.cleaned as ChangeRequestInput['changes'],
    ...(reason ? { reason } : {}),
  };
}
