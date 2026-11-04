/*
 * SPM-157 display rules for the event history. The server decides which sections a viewer gets, the
 * order of entries (oldest first, AC6) and every wording; the client only formats values and titles.
 */
import { formatSgtDateTime, formatSgtDateTimeRange, sgtDateTimeParts, sgtDayKey } from "@/utils/sgtDate";
import type { EventHistory, HistoryChange, HistorySection } from "@/features/events/types/eventHistory";

export const SECTION_TITLES: Record<HistorySection, string> = {
  event: "Event Changes",
  venueBookings: "Venue Bookings",
  equipment: "Equipment Reservations",
  registrations: "Registrations",
};

const SECTION_ORDER: HistorySection[] = ["event", "venueBookings", "equipment", "registrations"];

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** The sections the server returned, in the AC1 to AC4 order. */
export function visibleSections(history: EventHistory): HistorySection[] {
  return SECTION_ORDER.filter((section) => Array.isArray(history.sections[section]));
}

/** A changed value as text: instants in Singapore time, lists joined, nothing as "None". */
export function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "None";
  if (Array.isArray(value)) return value.length ? value.map((item) => formatHistoryValue(item)).join(", ") : "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value))) return `${formatSgtDateTime(value)} SGT`;
    return value;
  }
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

/** Fields whose new value is free text the reader should see whole, set apart as a quote. */
const QUOTED_FIELDS = new Set(["message", "operationalNotes", "description", "purpose"]);

/**
 * One readable line of an entry:
 * - change: "Status: Submitted → Approved"
 * - set: a value given for the first time, "Status: Pending"
 * - cleared: a value removed, "Status: Approved → removed"
 * - quote: free text (a message, notes) shown whole
 * - period: a new start and end merged into one line, "Time: 5 Nov 2026, 7:01 am – 9:01 am SGT"
 */
export type ChangeLine =
  | { kind: "change"; label: string; from: string; to: string }
  | { kind: "set"; label: string; value: string }
  | { kind: "cleared"; label: string; from: string }
  | { kind: "quote"; label: string; value: string }
  | { kind: "period"; label: string; value: string };

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

/** The entry's changes as readable lines, in the server's order. */
export function changeLines(changes: HistoryChange[]): ChangeLine[] {
  const start = changes.find((change) => change.field === "start");
  const end = changes.find((change) => change.field === "end");
  const mergePeriod =
    start && end && isEmpty(start.from) && isEmpty(end.from) && typeof start.to === "string" && typeof end.to === "string";
  const lines: ChangeLine[] = [];
  for (const change of changes) {
    if (mergePeriod && change === end) continue;
    if (mergePeriod && change === start) {
      lines.push({ kind: "period", label: "Time", value: `${formatSgtDateTimeRange(start.to as string, end!.to as string)} SGT` });
      continue;
    }
    if (isEmpty(change.from) && isEmpty(change.to)) continue;
    if (isEmpty(change.from)) {
      const value = formatHistoryValue(change.to);
      lines.push(QUOTED_FIELDS.has(change.field)
        ? { kind: "quote", label: change.label, value }
        : { kind: "set", label: change.label, value });
    } else if (isEmpty(change.to)) {
      lines.push({ kind: "cleared", label: change.label, from: formatHistoryValue(change.from) });
    } else {
      lines.push({ kind: "change", label: change.label, from: formatHistoryValue(change.from), to: formatHistoryValue(change.to) });
    }
  }
  return lines;
}

/** Entries grouped by Singapore day, keeping the server's order, e.g. [{ day: "3 Nov 2026", entries }]. */
export function groupByDay<T extends { occurredAt: string }>(entries: T[]): { day: string; entries: T[] }[] {
  const groups: { key: string; day: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const key = sgtDayKey(entry.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, day: sgtDateTimeParts(entry.occurredAt).date, entries: [entry] });
  }
  return groups.map(({ day, entries: grouped }) => ({ day, entries: grouped }));
}
