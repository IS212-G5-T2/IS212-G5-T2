import { BadRequestException } from '@nestjs/common';
import {
  ACCESSIBILITY,
  FACILITIES,
  LAYOUTS,
  type EventAttachment,
} from './event-input.js';

export interface DraftFields {
  formStep?: number;
  name: string;
  purpose: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  expectedAttendance: string;
  layout: string;
  facilities: string[];
  accessibility: string[];
  attachments: EventAttachment[];
  equipmentNeeds: string;
}
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Drafts preserve incomplete values; only shape, size and supported choices are checked.
export function validateDraft(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException('Invalid draft.');
  const data = body as Record<string, unknown>;
  if (
    !Number.isSafeInteger(data.version) ||
    (data.version as number) < 0 ||
    typeof data.operationId !== 'string' ||
    !uuid.test(data.operationId)
  )
    throw new BadRequestException('Invalid save identifier or version.');
  if (
    !data.fields ||
    typeof data.fields !== 'object' ||
    Array.isArray(data.fields)
  )
    throw new BadRequestException('Invalid draft fields.');
  const fields = data.fields as Record<string, unknown>;
  const errors: Record<string, string> = {};
  if (
    fields.formStep !== undefined &&
    (!Number.isInteger(fields.formStep) ||
      (fields.formStep as number) < 0 ||
      (fields.formStep as number) > 2)
  )
    errors.formStep = 'Choose a valid form step.';
  const text = (key: string, max: number) => {
    const value = fields[key] ?? '';
    if (typeof value !== 'string' || value.length > max) {
      errors[key] = `Use text of ${max} characters or fewer.`;
      return '';
    }
    return value;
  };
  const choices = (key: string, allowed: string[]) => {
    const value = fields[key] ?? [];
    if (
      !Array.isArray(value) ||
      value.length > allowed.length ||
      value.some((v) => !allowed.includes(v))
    ) {
      errors[key] = 'Choose valid options.';
      return [];
    }
    return [...new Set(value)] as string[];
  };
  const layout = text('layout', 40);
  if (layout && !LAYOUTS.includes(layout))
    errors.layout = 'Choose a valid layout.';
  const attachments = fields.attachments ?? [];
  if (
    !Array.isArray(attachments) ||
    attachments.length > 5 ||
    attachments.some(
      (a) =>
        !a ||
        typeof a !== 'object' ||
        typeof a.id !== 'string' ||
        a.id.length > 100 ||
        typeof a.name !== 'string' ||
        a.name.length > 255 ||
        typeof a.type !== 'string' ||
        a.type.length > 100 ||
        !Number.isInteger(a.size) ||
        a.size < 0 ||
        a.size > 1024 * 1024 ||
        typeof a.dataUrl !== 'string' ||
        !a.dataUrl.startsWith('data:') ||
        a.dataUrl.length > 1400000,
    )
  )
    errors.attachments = 'Use up to five files, each no larger than 1 MB.';
  const result: DraftFields = {
    ...(fields.formStep !== undefined
      ? { formStep: fields.formStep as number }
      : {}),
    name: text('name', 200),
    purpose: text('purpose', 500),
    description: text('description', 5000),
    startDate: text('startDate', 10),
    startTime: text('startTime', 8),
    endDate: text('endDate', 10),
    endTime: text('endTime', 8),
    expectedAttendance: text('expectedAttendance', 20),
    layout,
    facilities: choices('facilities', FACILITIES),
    accessibility: choices('accessibility', ACCESSIBILITY),
    attachments: attachments as EventAttachment[],
    equipmentNeeds: text('equipmentNeeds', 2000),
  };
  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: 'Please correct the highlighted fields.',
      errors,
    });
  return {
    fields: result,
    version: data.version as number,
    operationId: data.operationId,
  };
}
