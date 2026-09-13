import { BadRequestException } from '@nestjs/common';

export interface DraftFields {
  name: string;
  purpose: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  expectedAttendance: number | null;
  venueRequirements: string;
  accessibilityNeeds: string;
  equipmentRequirements: string;
  layout: string;
  registrationEnabled: boolean | null;
}

export interface SaveDraftDto {
  fields: DraftFields;
  version: number;
  operationId: string;
}

const textFields = ['name', 'purpose', 'description', 'startDateTime', 'endDateTime',
  'venueRequirements', 'accessibilityNeeds', 'equipmentRequirements', 'layout'] as const;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Drafts accept missing required information, but never arbitrary storage fields. */
export function parseSaveDraft(value: unknown): SaveDraftDto {
  const fail = (): never => { throw new BadRequestException('Invalid draft data.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(k => !['fields', 'version', 'operationId'].includes(k))) return fail();
  if (!Number.isSafeInteger(body.version) || (body.version as number) < 0 ||
      typeof body.operationId !== 'string' || !uuidPattern.test(body.operationId)) return fail();
  if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) return fail();
  const fields = body.fields as Record<string, unknown>;
  const allowed = [...textFields, 'expectedAttendance', 'registrationEnabled'];
  if (Object.keys(fields).some(k => !allowed.includes(k))) return fail();
  const result: Record<string, unknown> = {};
  for (const key of textFields) {
    const input = fields[key] ?? '';
    if (typeof input !== 'string' || input.length > (key === 'description' ? 10000 : 2000)) return fail();
    result[key] = input;
  }
  const attendance = fields.expectedAttendance ?? null;
  if (attendance !== null && (!Number.isSafeInteger(attendance) || (attendance as number) < 0)) return fail();
  const registration = fields.registrationEnabled ?? null;
  if (registration !== null && typeof registration !== 'boolean') return fail();
  return { fields: { ...result, expectedAttendance: attendance, registrationEnabled: registration } as unknown as DraftFields,
    version: body.version as number, operationId: body.operationId };
}
