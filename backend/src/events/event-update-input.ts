/*
 * SPM-49 (Update Event Information) and SPM-85 (Review and Resolve Flagged
 * Event Changes): pure validation for a coordinator's partial event update and
 * the per-field edit policy. No I/O lives here so the rules can be unit tested
 * in isolation (see event-update-input.spec.ts).
 *
 * Assumptions (also recorded in backend/HANDOVER.md):
 * - An update is a PATCH: only the fields being changed are sent. Omitted
 *   fields keep their stored value.
 * - Field rules mirror event creation (event-input.ts): same max lengths, the
 *   same layout/facility/accessibility vocabularies and the same date format.
 * - Cross-field rules that need stored data (e.g. a new end time compared with
 *   the stored start time) are checked by EventPlanningService, not here.
 */
import { BadRequestException } from '@nestjs/common';
import { ACCESSIBILITY, FACILITIES, LAYOUTS } from './event-input.js';

/** Every event field a coordinator may edit during the planning phase. */
export const EDITABLE_FIELDS = [
  'name',
  'purpose',
  'description',
  'startDateTime',
  'endDateTime',
  'expectedAttendance',
  'layout',
  'facilities',
  'accessibility',
  'equipmentNeeds',
] as const;

export type EventFieldKey = (typeof EDITABLE_FIELDS)[number];

/**
 * 'direct'              – can never affect a venue booking or equipment
 *                         arrangement, so it is always applied immediately.
 * 'review_if_impacting' – may affect an existing booking/arrangement. Applied
 *                         immediately when the proposed value stays compatible
 *                         with every active arrangement (SPM-49 AC3/AC5);
 *                         flagged "Needs Review" only when it is incompatible
 *                         with at least one (SPM-85 AC1). Compatibility is
 *                         decided per arrangement by event-impact.ts and
 *                         EventPlanningService, not by whether anything is
 *                         booked at all.
 *
 * Accessibility needs are 'direct' because SPM-85 AC1 lists only date, time,
 * attendance, venue requirements and equipment requirements as review fields.
 * Venue requirements map to `layout` and `facilities`.
 */
export type FieldPolicy = 'direct' | 'review_if_impacting';

export const FIELD_POLICY: Record<EventFieldKey, FieldPolicy> = {
  name: 'direct',
  purpose: 'direct',
  description: 'direct',
  accessibility: 'direct',
  startDateTime: 'review_if_impacting',
  endDateTime: 'review_if_impacting',
  expectedAttendance: 'review_if_impacting',
  layout: 'review_if_impacting',
  facilities: 'review_if_impacting',
  equipmentNeeds: 'review_if_impacting',
};

/** Fields the server owns. Sending any of them is a client error. */
const SERVER_CONTROLLED_FIELDS = new Set([
  'id',
  'status',
  'organiserId',
  'organiserName',
  'coordinatorId',
  'coordinatorName',
  'venueId',
  'venueName',
  'createdAt',
  'updatedAt',
  'submissionKey',
  'attachments',
  'registrationEnabled',
  'rejectionReason',
]);

export type EventUpdatePatch = Partial<{
  name: string;
  purpose: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  expectedAttendance: number;
  layout: string;
  facilities: string[];
  accessibility: string[];
  equipmentNeeds: string;
}>;

const REQUIRED = 'This field is required.';
const MAX_INT = 2147483647;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function isEditable(key: string): key is EventFieldKey {
  return (EDITABLE_FIELDS as readonly string[]).includes(key);
}

/**
 * Validates a partial update. Returns the cleaned patch containing only the
 * supplied fields (text trimmed, choice lists de-duplicated) or throws a
 * BadRequestException whose body is `{ message, errors }`, with every invalid
 * field reported at once (SPM-49 AC4).
 */
export function validateEventUpdate(input: unknown): EventUpdatePatch {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException({
      message: 'Send the fields you want to update.',
      errors: {},
    });
  const data = input as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length === 0)
    throw new BadRequestException({
      message: 'Send the fields you want to update.',
      errors: {},
    });

  const errors: Record<string, string> = {};
  const patch: Record<string, unknown> = {};

  for (const key of keys) {
    if (SERVER_CONTROLLED_FIELDS.has(key))
      errors[key] = 'This field cannot be changed here.';
    else if (!isEditable(key)) errors[key] = 'Unknown field.';
  }

  function text(key: EventFieldKey, max: number, required: boolean) {
    if (!(key in data)) return;
    const value = data[key];
    if (typeof value !== 'string') {
      errors[key] =
        required && (value === null || value === undefined)
          ? REQUIRED
          : 'Enter valid text.';
      return;
    }
    const trimmed = value.trim();
    if (required && !trimmed) errors[key] = REQUIRED;
    else if (trimmed.length > max)
      errors[key] = `Use ${max} characters or fewer.`;
    else patch[key] = trimmed;
  }

  text('name', 200, true);
  text('purpose', 500, true);
  text('description', 5000, true);
  text('equipmentNeeds', 2000, false);
  text('layout', 40, true);
  if (typeof patch.layout === 'string' && !LAYOUTS.includes(patch.layout)) {
    errors.layout = 'Choose a valid room layout.';
    delete patch.layout;
  }

  function choices(key: 'facilities' | 'accessibility', allowed: string[]) {
    if (!(key in data)) return;
    const value = data[key];
    if (
      !Array.isArray(value) ||
      value.length > allowed.length ||
      value.some((v) => typeof v !== 'string' || !allowed.includes(v))
    ) {
      errors[key] = 'Choose valid options.';
      return;
    }
    patch[key] = [...new Set(value as string[])];
  }
  choices('facilities', FACILITIES);
  choices('accessibility', ACCESSIBILITY);

  for (const key of ['startDateTime', 'endDateTime'] as const) {
    if (!(key in data)) continue;
    const value = data[key];
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      errors[key] = REQUIRED;
      continue;
    }
    if (
      !ISO_UTC.test(trimmed) ||
      !Number.isFinite(Date.parse(trimmed)) ||
      // Rejects calendar roll-overs such as 2026-02-30 that Date would accept.
      new Date(trimmed).toISOString().slice(0, 19) !== trimmed.slice(0, 19)
    ) {
      errors[key] = 'Enter a valid date and time.';
      continue;
    }
    patch[key] = trimmed;
  }
  if (
    typeof patch.startDateTime === 'string' &&
    Date.parse(patch.startDateTime) <= Date.now()
  )
    errors.startDateTime = 'Start date and time must be in the future.';
  if (
    typeof patch.startDateTime === 'string' &&
    typeof patch.endDateTime === 'string' &&
    Date.parse(patch.endDateTime) <= Date.parse(patch.startDateTime)
  )
    errors.endDateTime = 'End must be after start.';

  if ('expectedAttendance' in data) {
    const value = data.expectedAttendance;
    if (value === null || value === undefined || value === '')
      errors.expectedAttendance = REQUIRED;
    else if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > MAX_INT
    )
      errors.expectedAttendance = 'Enter a positive whole number of attendees.';
    else patch.expectedAttendance = value;
  }

  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: 'Please correct the highlighted fields.',
      errors,
    });
  return patch as EventUpdatePatch;
}

/**
 * Splits the changed fields into those applied now and those that must be
 * reviewed first, preserving the caller's field order. A 'direct' field is
 * always immediate; a 'review_if_impacting' field is held for review only when
 * `isImpacting(field)` reports that its proposed value is incompatible with an
 * existing booking or arrangement.
 */
export function classifyUpdate(
  fields: EventFieldKey[],
  isImpacting: (field: EventFieldKey) => boolean,
): { immediate: EventFieldKey[]; needsReview: EventFieldKey[] } {
  const immediate: EventFieldKey[] = [];
  const needsReview: EventFieldKey[] = [];
  for (const field of fields) {
    if (FIELD_POLICY[field] === 'review_if_impacting' && isImpacting(field))
      needsReview.push(field);
    else immediate.push(field);
  }
  return { immediate, needsReview };
}
