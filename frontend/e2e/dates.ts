// SPM-187: the one place a spec asks "what day is it, plus N days". Specs that need a future date to type into a form
// or send to the API call this instead of doing `Date.now() + N * 86_400_000` themselves.
//
// Why not millisecond arithmetic: adding N * 24h moves the wall-clock time across a DST change and, near midnight,
// can land on the wrong calendar day. Here the calendar day is built with Date.UTC(year, month, day + N), which the
// Date constructor normalises across month and year ends exactly, and the result is always UTC midnight, so the
// caller chooses the time of day explicitly (`atUtcHour`, or local fields in the browser).
//
// This is NOT a clock freeze. It only makes the arithmetic correct. Tests that need the application's clock to be
// fixed or advanced use ./clock.ts.

export interface CalendarDay { year: number; month: number; day: number }

/** The calendar day `days` after `from` (default: now), in UTC. `month` is 1-12. */
export function calendarDayFromNow(days: number, from: Date = new Date()): CalendarDay {
  const shifted = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** `YYYY-MM-DD` for the day `days` after `from`. */
export function isoDateFromNow(days: number, from: Date = new Date()): string {
  const { year, month, day } = calendarDayFromNow(days, from);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The instant at `hour`:00 UTC on the day `days` after `from`. */
export function atUtcHour(days: number, hour: number, from: Date = new Date()): Date {
  const { year, month, day } = calendarDayFromNow(days, from);
  return new Date(Date.UTC(year, month - 1, day, hour));
}
