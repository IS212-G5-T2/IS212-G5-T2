import { BadRequestException } from '@nestjs/common';

export const FACILITIES = [
  'Catering',
  'AV System',
  'Parking',
  'Stage',
  'Projector',
  'Whiteboard',
];
export const ACCESSIBILITY = [
  'Wheelchair ramps',
  'Accessible restrooms',
  'Hearing loop',
  'Elevator access',
];
export const LAYOUTS = [
  'Theatre',
  'Classroom',
  'Banquet',
  'Boardroom',
  'U-shape',
  'Standing',
];
export interface EventInput {
  name: string;
  purpose: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  expectedAttendance: number;
  layout: string;
  facilities: string[];
  accessibility: string[];
  attachments: EventAttachment[];
  equipmentNeeds: string;
  submissionKey: string;
  registrationEnabled: boolean;
}

export interface EventAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}
export function validateEvent(input: unknown): EventInput {
  const data = (
    input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  ) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  function text(key: string, max: number, required = false): string {
    const value = data[key];
    if (value !== undefined && typeof value !== 'string')
      errors[key] = 'Enter valid text.';
    const result = typeof value === 'string' ? value.trim() : '';
    if (required && !result) errors[key] = 'This field is required.';
    if (result.length > max) errors[key] = `Use ${max} characters or fewer.`;
    return result;
  }
  const name = text('name', 200, true);
  const purpose = text('purpose', 500, true);
  const description = text('description', 5000, true);
  const equipmentNeeds = text('equipmentNeeds', 2000);
  const layout = text('layout', 40, true);
  if (layout && !LAYOUTS.includes(layout))
    errors.layout = 'Choose a valid room layout.';
  function choices(key: string, allowed: string[]) {
    const value = data[key] ?? [];
    if (
      !Array.isArray(value) ||
      value.length > allowed.length ||
      value.some((v) => typeof v !== 'string' || !allowed.includes(v))
    ) {
      errors[key] = 'Choose valid options.';
      return [];
    }
    return [...new Set(value as string[])];
  }
  const facilities = choices('facilities', FACILITIES);
  const accessibility = choices('accessibility', ACCESSIBILITY);
  function attachments(): EventAttachment[] {
    const value = data.attachments ?? [];
    if (!Array.isArray(value) || value.length > 5) {
      errors.attachments = 'Upload up to five valid files.';
      return [];
    }

    return value.map((attachment) => {
      const item =
        attachment && typeof attachment === 'object' && !Array.isArray(attachment)
          ? (attachment as Record<string, unknown>)
          : {};
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const type = typeof item.type === 'string' ? item.type.trim() : '';
      const size = item.size;
      const dataUrl = typeof item.dataUrl === 'string' ? item.dataUrl.trim() : '';

      if (
        !id ||
        !name ||
        name.length > 255 ||
        !type ||
        type.length > 100 ||
        typeof size !== 'number' ||
        !Number.isInteger(size) ||
        size < 0 ||
        !dataUrl.startsWith('data:')
      )
        errors.attachments = 'Upload valid files.';

      return { id, name, type, size: size as number, dataUrl };
    });
  }
  const attachedFiles = attachments();
  const startDateTime = text('startDateTime', 40, true);
  const endDateTime = text('endDateTime', 40, true);
  for (const [key, value] of Object.entries({ startDateTime, endDateTime })) {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)
    )
      errors[key] = 'Enter a valid date and time.';
  }
  if (
    !errors.startDateTime &&
    !errors.endDateTime &&
    Date.parse(endDateTime) <= Date.parse(startDateTime)
  )
    errors.endDateTime = 'End must be after start.';
  if (!errors.startDateTime && new Date(startDateTime) <= new Date())
    errors.startDateTime = 'Start date and time must be in the future.';
  const expectedAttendance = data.expectedAttendance;
  if (
    typeof expectedAttendance !== 'number' ||
    !Number.isInteger(expectedAttendance) ||
    expectedAttendance < 1 ||
    expectedAttendance > 2147483647
  )
    errors.expectedAttendance = 'Enter a positive whole number of attendees.';
  const submissionKey = text('submissionKey', 36, true);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      submissionKey,
    )
  )
    errors.submissionKey = 'Invalid submission identifier. Reload the form.';
  let registrationEnabled = false;
  if (data.registrationEnabled !== undefined) {
    if (typeof data.registrationEnabled !== 'boolean') {
      errors.registrationEnabled = 'Registration enabled must be a boolean.';
    } else {
      registrationEnabled = data.registrationEnabled;
    }
  }
  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: 'Please correct the highlighted fields.',
      errors,
    });
  return {
    name,
    purpose,
    description,
    startDateTime,
    endDateTime,
    expectedAttendance: expectedAttendance as number,
    layout,
    facilities,
    accessibility,
    attachments: attachedFiles,
    equipmentNeeds,
    submissionKey,
    registrationEnabled,
  };
}
