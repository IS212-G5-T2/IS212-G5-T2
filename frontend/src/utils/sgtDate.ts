const SGT_TIME_ZONE = "Asia/Singapore";

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
