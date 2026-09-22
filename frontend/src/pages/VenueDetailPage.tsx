import { Link, useParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateRange } from "@/utils/format";

export function VenueDetailPage() {
  const { id } = useParams();
  const venues = useAppStore((s) => s.venues);
  const bookings = useAppStore((s) => s.bookings);

  const venue = venues.find((v) => v.id === id);
  if (!venue) return <p className="text-sm text-gray-500 dark:text-gray-400">Venue not found.</p>;

  const venueBookings = bookings.filter((b) => b.venueId === venue.id);

  return (
    <div>
      <PageHeader
        title={venue.name}
        description={venue.location}
        actions={
          <Link to="/venues">
            <Button variant="secondary">Back to Catalogue</Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Venue Information</h2>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Capacity</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{venue.capacity}</dd>
              </div>
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Operating hours</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{venue.operatingHours}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-400 dark:text-gray-500">Facilities</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{venue.facilities.join(", ")}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-400 dark:text-gray-500">Accessibility</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{venue.accessibility.join(", ")}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-400 dark:text-gray-500">Available layouts</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{venue.layouts.join(", ")}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Upcoming Bookings</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {venueBookings.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No bookings recorded.</p>
            )}
            {venueBookings.map((b) => (
              <div key={b.id} className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{b.eventName}</span>
                  <StatusBadge status={b.status} />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateRange(b.start, b.end)}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
