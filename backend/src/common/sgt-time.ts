/*
 * Singapore (UTC+08:00, no daylight saving) wall-clock formatting for text the
 * server builds for people to read, such as the conflict details shown under
 * "Changes Awaiting Review". Computed arithmetically so the output never
 * depends on the host time zone or ICU data: "5 Feb 2027, 6:30 pm".
 */
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sgt(value: number): Date {
  return new Date(value + SGT_OFFSET_MS);
}

/** "6:30 pm" in Singapore time. */
export function sgtTime(value: number): string {
  const d = sgt(value);
  const hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

/** "5 Feb 2027" in Singapore time. */
export function sgtDate(value: number): string {
  const d = sgt(value);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "5 Feb 2027, 6:30 pm" in Singapore time. */
export function sgtDateTime(value: number): string {
  return `${sgtDate(value)}, ${sgtTime(value)}`;
}

/**
 * A period in Singapore time, naming the date once when both ends fall on the
 * same Singapore day: "5 Feb 2027, 6:00 pm – 10:00 pm", otherwise
 * "5 Feb 2027, 11:00 pm – 6 Feb 2027, 1:00 am".
 */
export function sgtRange(start: number, end: number): string {
  return sgtDate(start) === sgtDate(end)
    ? `${sgtDateTime(start)} – ${sgtTime(end)}`
    : `${sgtDateTime(start)} – ${sgtDateTime(end)}`;
}
