/*
 * SPM-63 display formats for the registration report, the CSV and the PDF (D5, D8). Instants are stored and
 * transported as UTC; everything shown is Singapore time. The month name comes from a fixed table because the
 * "en-GB" short form of September is "Sept" in newer ICU data. These formats are deliberately separate from
 * messages.ts `formatSgt` (SPM-61, "12 Mar 2027, 23:59 SGT"): the SPM-63 cases fix a different wording.
 */
const SGT_TIME_ZONE = 'Asia/Singapore';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SGT_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: SGT_TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface SgtFields {
  day: number;
  month: number;
  year: string;
  hour: string;
  minute: string;
}

function sgtFields(value: Date): SgtFields {
  const parts = SGT_PARTS.formatToParts(value);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: Number(part('day')),
    month: Number(part('month')),
    year: part('year'),
    hour: part('hour'),
    minute: part('minute'),
  };
}

const dateOf = (f: SgtFields) => `${f.day} ${MONTHS[f.month - 1]} ${f.year}`;
const timeOf = (f: SgtFields) => `${f.hour}:${f.minute}`;

/** "28 Sep 2026 10:30": the CSV registration date (no zone suffix). */
export function formatReportDateTime(value: Date): string {
  const f = sgtFields(value);
  return `${dateOf(f)} ${timeOf(f)}`;
}

/** "28 Sep 2026 10:30 SGT": the on-screen and PDF registration date. */
export function formatReportDateTimeSgt(value: Date): string {
  return `${formatReportDateTime(value)} SGT`;
}

/** "9 Oct 2026 18:00-21:00 SGT" (same SGT day) or "9 Oct 2026 18:00 - 11 Oct 2026 03:00 SGT". */
export function formatReportEventRange(start: Date, end: Date): string {
  const s = sgtFields(start);
  const e = sgtFields(end);
  if (dateOf(s) === dateOf(e)) return `${dateOf(s)} ${timeOf(s)}-${timeOf(e)} SGT`;
  return `${dateOf(s)} ${timeOf(s)} - ${dateOf(e)} ${timeOf(e)} SGT`;
}

/** "Generated 29 Sep 2026 12:00 SGT". */
export function formatReportGenerated(value: Date): string {
  return `Generated ${formatReportDateTimeSgt(value)}`;
}

/** "3 Attendees Registered (3 / 50)"; singular "1 Attendee Registered (1 / 50)". */
export function attendeeCountLine(count: number, capacity: number): string {
  const noun = count === 1 ? 'Attendee' : 'Attendees';
  return `${count} ${noun} Registered (${count} / ${capacity})`;
}

/** "47 spots available"; singular "1 spot available". */
export function spotsLine(spots: number): string {
  return `${spots} ${spots === 1 ? 'spot' : 'spots'} available`;
}
