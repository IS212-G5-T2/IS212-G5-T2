/** SPM-125 AC5: one booking or tentative hold of `GET /api/venues/:id/booking-history`, latest slot first. */
export interface VenueBookingHistoryEntry {
  id: string;
  bookingReference: string;
  eventId: string;
  eventName: string;
  coordinatorName: string | null;
  start: string;
  end: string;
  status: "pending" | "approved" | "rejected" | "released" | "cancelled";
  requestKind: "booking" | "tentative_hold";
  holdExpiresAt?: string;
  affectedByUnavailablePeriod: boolean;
  requestedAt: string;
}

/** The status shown for an entry; an approved hold is a tentative hold until it expires, never a confirmed booking. */
export function bookingHistoryStatus(entry: VenueBookingHistoryEntry, now: number): string {
  const hold = entry.requestKind === "tentative_hold";
  if (entry.status === "pending") return hold ? "Hold requested" : "Pending";
  if (entry.status === "approved") {
    if (!hold) return "Confirmed";
    return entry.holdExpiresAt && new Date(entry.holdExpiresAt).getTime() <= now ? "Hold expired" : "Tentative hold";
  }
  return { rejected: "Rejected", released: "Released", cancelled: "Cancelled" }[entry.status];
}
