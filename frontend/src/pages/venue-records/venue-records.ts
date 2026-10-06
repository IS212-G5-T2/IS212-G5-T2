export interface VenueUnavailablePeriod {
  id: string;
  start: string;
  end: string;
  reason: string;
}

export interface VenueReservation {
  id: string;
  eventName: string;
  start: string;
  end: string;
  status: "booked" | "tentative";
  affectedByUnavailablePeriod: boolean;
}

/** Read-only Venue Staff view of the SPM-50 venue record and schedule. */
export interface VenueRecord {
  id: string;
  name: string;
  location: string;
  capacity: number;
  facilities: string[];
  layouts: string[];
  accessibility: string[];
  operatingInformation: string;
  operatingDays: string[];
  operatingStartTime: string;
  operatingEndTime: string;
  setupTimeMinutes: number;
  turnaroundTimeMinutes: number;
  image?: { name: string; type: string; size: number; dataUrl: string };
  availabilityStatus: "available" | "unavailable";
  unavailablePeriods: VenueUnavailablePeriod[];
  reservations: VenueReservation[];
}

export type VenueSortKey = "name" | "capacity" | "location" | "status";

export function visibleVenues(
  venues: VenueRecord[],
  query: string,
  sortKey: VenueSortKey,
  descending: boolean,
): VenueRecord[] {
  const normalized = query.trim().toLocaleLowerCase();
  return venues
    .filter(
      (venue) =>
        !normalized ||
        venue.name.toLocaleLowerCase().includes(normalized) ||
        venue.location.toLocaleLowerCase().includes(normalized),
    )
    .sort((a, b) => {
      const comparison =
        sortKey === "capacity"
          ? a.capacity - b.capacity
          : (sortKey === "status"
              ? a.availabilityStatus
              : a[sortKey]
            ).localeCompare(
              sortKey === "status" ? b.availabilityStatus : b[sortKey],
            );
      return (descending ? -1 : 1) * (comparison || a.id.localeCompare(b.id));
    });
}
