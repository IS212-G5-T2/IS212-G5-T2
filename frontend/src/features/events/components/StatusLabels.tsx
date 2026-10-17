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

/** Venue request: the request decides the label, because a pending hold is shown as Booked in the planning view. */
export function venueLabel(booking: Pick<PlanningVenueBooking, "status" | "requestStatus">): StateLabelInfo {
  if (booking.requestStatus === "pending") return { label: "Requested", tone: "amber" };
  if (booking.requestStatus === "approved") return { label: "Approved", tone: "green" };
  if (booking.requestStatus === "rejected") return { label: "Rejected", tone: "red" };
  if (booking.requestStatus === "released" || booking.status === "Cancelled") return { label: "Cancelled", tone: "red" };
  if (booking.status === "Unavailable") return { label: "Unavailable", tone: "red" };
  return { label: booking.status, tone: "gray" };
}

/** Equipment reservation states, as the server reports them. */
export function equipmentLabel(status: string): StateLabelInfo {
  switch (status) {
    case "Requested":
      return { label: "Requested", tone: "amber" };
    case "Reserved":
      return { label: "Reserved", tone: "green" };
    case "Unavailable":
      return { label: "Unavailable", tone: "red" };
    case "Cancelled":
      return { label: "Cancelled", tone: "red" };
    default:
      return { label: status, tone: "gray" };
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

/** Card labels name the resource and its state. "Reserved" states count only in the planning phase; when a planning event has
 *  both its venue and all its equipment reserved, one combined label is shown. */
export function cardArrangementLabels(
  event: Pick<EventRecord, "status" | "venueRequestStatus" | "equipmentStatuses">,
): StateLabelInfo[] {
  const planning = event.status === "planning";
  const statuses = event.equipmentStatuses ?? [];
  const venueReserved = event.venueRequestStatus === "approved";
  const equipmentReserved = statuses.length > 0 && statuses.every((s) => s === "Reserved");
  const labels: StateLabelInfo[] = [];

  if (planning && venueReserved && equipmentReserved) {
    labels.push({ label: "Equipment & Venue Reserved", tone: "green" });
  } else {
    if (venueReserved && planning) labels.push({ label: "Venue reserved", tone: "green" });
    if (equipmentReserved && planning) labels.push({ label: "Equipment reserved", tone: "green" });
  }

  switch (event.venueRequestStatus) {
    case "pending":
      labels.push({ label: "Awaiting venue request", tone: "amber" });
      break;
    case "rejected":
      labels.push({ label: "Venue rejected", tone: "red" });
      break;
    case "released":
      labels.push({ label: "Venue cancelled", tone: "red" });
      break;
  }
  const equipment: Record<string, StateLabelInfo> = {
    Requested: { label: "Awaiting equipment request", tone: "amber" },
    Unavailable: { label: "Equipment unavailable", tone: "red" },
    Cancelled: { label: "Equipment cancelled", tone: "red" },
  };
  for (const status of new Set(statuses)) {
    if (equipment[status]) labels.push(equipment[status]);
  }
  return labels;
}
