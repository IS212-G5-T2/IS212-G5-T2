import { BadRequestException } from '@nestjs/common';

export interface UnavailabilityInput {
  start: Date;
  end: Date;
  reason: string;
}

const timestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Validate the public interval and free-text reason before any write. */
export function validateUnavailability(value: unknown, now: Date = new Date()): UnavailabilityInput {
  const body =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const errors: Record<string, string> = {};
  const parse = (key: 'start' | 'end') => {
    const raw = body[key];
    const date = typeof raw === 'string' ? raw.slice(0, 10) : '';
    const calendarDay = new Date(`${date}T00:00:00.000Z`);
    if (
      typeof raw !== 'string' ||
      !timestamp.test(raw) ||
      !Number.isFinite(Date.parse(raw)) ||
      !Number.isFinite(calendarDay.getTime()) ||
      calendarDay.toISOString().slice(0, 10) !== date
    ) {
      errors[key] = 'Enter a valid date and time with a time zone.';
      return new Date(0);
    }
    return new Date(raw);
  };
  const start = parse('start');
  const end = parse('end');
  if (!errors.start && !errors.end && end <= start)
    errors.end = 'End date and time must be after start date and time.';
  else if (!errors.end && end <= now)
    errors.end = 'End date and time must be in the future.';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) errors.reason = 'A reason is required.';
  else if (reason.length > 500) errors.reason = 'Use 500 characters or fewer.';
  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: 'Check the unavailable period.',
      errors,
    });
  return { start, end, reason };
}
