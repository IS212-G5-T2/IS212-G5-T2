export function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay) {
    return `${s.toLocaleDateString(undefined, dateFmt)}, ${s.toLocaleTimeString(undefined, timeFmt)} – ${e.toLocaleTimeString(undefined, timeFmt)}`;
  }
  return `${s.toLocaleDateString(undefined, dateFmt)} – ${e.toLocaleDateString(undefined, dateFmt)}`;
}

// Like formatDateRange but always includes the start and end time-of-day, even
// when the event spans multiple days (formatDateRange drops the time in that
// case). Rendered day-month-year with lowercase am/pm, e.g.
// "21 Sep 2026, 10:08pm – 22 Sep 2026, 11:08pm". Used where the exact schedule
// matters, such as the event detail page.
export function formatDateTimeRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  // Explicit 3-letter months so the abbreviation is stable ("Sep", not the
  // locale-dependent "Sept" some environments produce).
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const fmtTime = (d: Date) =>
    d
      .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
      .replace(/\s+/g, "")
      .toLowerCase();
  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay) {
    return `${fmtDate(s)}, ${fmtTime(s)} – ${fmtTime(e)}`;
  }
  return `${fmtDate(s)}, ${fmtTime(s)} – ${fmtDate(e)}, ${fmtTime(e)}`;
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function timeAgo(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}
