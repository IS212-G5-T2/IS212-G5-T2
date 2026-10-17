import type { EventRecord, PlanningVenueBooking } from "@/types";

/** Colour by significance: awaiting or requested is amber, approved is green, rejected or cancelled is red. */
type Tone = "amber" | "green" | "red" | "gray";

const TONE: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  green: "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200",
  red: "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export interface StateLabelInfo {
  label: string;
  tone: Tone;
}

/** A small status pill used on the planning page for venue, equipment and safety states. */
export function StateLabel({ label, tone }: StateLabelInfo) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>{label}</span>;
}

/** Names the state on the planning page ("Sample Orchid Hall reserved"); on cards the bare word is used. */
function named(word: string, name?: string): string {
  return name ? `${name} ${word.toLowerCase()}` : word;
}

/** Venue request: the request decides the label, because a pending hold is shown as Booked in the planning view. */
export function venueLabel(booking: Pick<PlanningVenueBooking, "status" | "requestStatus"> & { venueName?: string }): StateLabelInfo {
  const name = booking.venueName;
  if (booking.requestStatus === "pending") return { label: named("Requested", name), tone: "amber" };
  if (booking.requestStatus === "approved") return { label: named("Reserved", name), tone: "green" };
  if (booking.requestStatus === "rejected") return { label: named("Rejected", name), tone: "red" };
  if (booking.requestStatus === "released" || booking.status === "Cancelled") return { label: named("Cancelled", name), tone: "red" };
  if (booking.status === "Unavailable") return { label: named("Unavailable", name), tone: "red" };
  return { label: named(booking.status, name), tone: "gray" };
}

/** Equipment reservation states, as the server reports them; the item name is used on the planning page. */
export function equipmentLabel(status: string, itemName?: string): StateLabelInfo {
  switch (status) {
    case "Requested":
      return { label: named("Requested", itemName), tone: "amber" };
    case "Reserved":
      return { label: named("Reserved", itemName), tone: "green" };
    case "Unavailable":
      return { label: named("Unavailable", itemName), tone: "red" };
    case "Cancelled":
      return { label: named("Cancelled", itemName), tone: "red" };
    default:
      return { label: named(status, itemName), tone: "gray" };
  }
}

/** Safety check states on the planning page. */
export function safetyLabel(status: string): StateLabelInfo {
  switch (status) {
    case "pending":
      return { label: "Awaiting Safety Officer check", tone: "amber" };
    case "changes_needed":
      return { label: "Changes requested", tone: "amber" };
    case "approved":
      return { label: "Approved", tone: "green" };
    default:
      return { label: "Not requested", tone: "gray" };
  }
}

/** Card labels: only the states that need attention (amber requested, red rejected, unavailable or cancelled). */
export function cardArrangementLabels(event: Pick<EventRecord, "venueRequestStatus" | "equipmentStatuses">): StateLabelInfo[] {
  const labels: StateLabelInfo[] = [];
  if (event.venueRequestStatus) {
    labels.push(venueLabel({ status: "Booked", requestStatus: event.venueRequestStatus }));
  }
  for (const status of new Set(event.equipmentStatuses ?? [])) {
    labels.push(equipmentLabel(status));
  }
  return labels.filter((l) => l.tone === "amber" || l.tone === "red");
}
