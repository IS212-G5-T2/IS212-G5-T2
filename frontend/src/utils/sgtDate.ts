const SGT_TIME_ZONE = "Asia/Singapore";
const SGT_OFFSET = "+08:00";

// Fixed abbreviations avoid the ICU-dependent "Sept" spelling.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_TIME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: SGT_TIME_ZONE,
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: SGT_TIME_ZONE });

/** Shared SGT date and time parts; callers choose their own display punctuation. */
export function sgtDateTimeParts(value: string | Date): { date: string; time: string } {
  const parts = DATE_TIME_PARTS.formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${Number(part("day"))} ${MONTHS[Number(part("month")) - 1]} ${part("year")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

/** Singapore calendar day as YYYY-MM-DD. */
export function sgtDayKey(value: string | Date): string {
  return DAY_FORMAT.format(new Date(value));
}

/** Parse a datetime-local value as Singapore wall time, regardless of the host timezone. */
export function sgtLocalDateTimeToDate(value: string): Date {
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  return new Date(`${withSeconds}${SGT_OFFSET}`);
}

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "6:30 pm" in Singapore time, whatever the browser's time zone. */
export function formatSgtTime(value: string | Date): string {
  const d = new Date(new Date(value).getTime() + SGT_OFFSET_MS);
  const hours = d.getUTCHours();
  return `${hours % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

/** "5 Feb 2027, 6:30 pm" in Singapore time, whatever the browser's time zone. */
export function formatSgtDateTime(value: string | Date): string {
  return `${sgtDateTimeParts(value).date}, ${formatSgtTime(value)}`;
}

/**
 * A Singapore-time period that names the date once when both ends fall on the
 * same Singapore day: "5 Feb 2027, 6:00 pm – 10:00 pm".
 */
export function formatSgtDateTimeRange(start: string | Date, end: string | Date): string {
  return sgtDayKey(start) === sgtDayKey(end)
    ? `${formatSgtDateTime(start)} – ${formatSgtTime(end)}`
    : `${formatSgtDateTime(start)} – ${formatSgtDateTime(end)}`;
}

/** An instant as a datetime-local value in Singapore wall time ("2027-02-05T18:30"). */
export function toSgtLocalInput(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 16);
}
