import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateRange } from "@/utils/format";

export function VenueAvailabilityPage() {
  const venues = useAppStore((s) => s.venues);
  const bookings = useAppStore((s) => s.bookings);

  return (
    <div>
      <PageHeader
        title="Venue Availability"
        description="Feature 8 — Internal view of existing bookings and unavailability per venue, so date/time conflicts are visible at a glance."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {venues.map((venue) => {
          const venueBookings = bookings
            .filter((b) => b.venueId === venue.id && b.status !== "rejected")
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

          return (
            <Card key={venue.id}>
              <CardHeader className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">{venue.name}</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">Capacity {venue.capacity}</span>
              </CardHeader>
              <CardBody>
                {venueBookings.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No bookings — fully available.</p>
                ) : (
                  <ul className="space-y-2">
                    {venueBookings.map((b) => (
                      <li
                        key={b.id}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                          b.status === "approved" ? "border-gray-200 dark:border-gray-700" : "border-warning-300 dark:border-warning-700 bg-warning-50 dark:bg-warning-900/20"
                        }`}
                      >
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-200">{b.eventName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDateRange(b.start, b.end)}</p>
                        </div>
                        <StatusBadge status={b.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
