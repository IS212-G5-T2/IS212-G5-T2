import { Link } from "react-router-dom";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDateTimeRange } from "@/utils/format";
import type { VenueRecord } from "../venue-records";

/** SPM-50 style venue card enriched with the SPM-124 schedule summary. */
export function VenueRecordCard({ venue, currentUserId }: { venue: VenueRecord; currentUserId?: string }) {
  const bookings = venue.reservations.filter(
    (reservation) => reservation.status === "booked",
  ).length;
  const holds = venue.reservations.length - bookings;
  const isOwner = Boolean(currentUserId && venue.ownerId === currentUserId);

  return (
    <div role="listitem" className="h-full">
      <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
        <Link
          to={`/venue-records/${venue.id}`}
          aria-label={venue.name}
          className="block flex-1 rounded-t-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <CardBody>
            {venue.image ? (
              <img
                src={venue.image.dataUrl}
                alt={`${venue.name} venue`}
                className="mb-4 h-40 w-full rounded-lg object-cover"
              />
            ) : (
              <div className="mb-4 flex h-40 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                No venue image
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                  {venue.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {venue.location}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  venue.availabilityStatus === "available"
                    ? "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300"
                    : "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300"
                }`}
              >
                {venue.availabilityStatus}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Capacity: <span>{venue.capacity}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {venue.facilities.map((facility) => (
                <span
                  key={facility}
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                >
                  {facility}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Layout options: {venue.layouts.join(", ") || "None"}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {bookings} {bookings === 1 ? "booking" : "bookings"} · {holds}{" "}
              tentative {holds === 1 ? "hold" : "holds"}
            </p>
            {venue.unavailablePeriods.map((period) => (
              <p
                key={period.id}
                className="mt-2 text-xs text-danger-700 dark:text-danger-300"
              >
                Unavailable {formatDateTimeRange(period.start, period.end)}: {period.reason}
              </p>
            ))}
          </CardBody>
        </Link>
        {isOwner && (
          <div className="flex justify-end border-t border-gray-100 px-5 py-3 dark:border-gray-700">
            <Link
              to={`/venue-records/${venue.id}/edit`}
              aria-label={`Edit ${venue.name}`}
            >
              <Button size="sm" variant="secondary">
                Edit
              </Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
