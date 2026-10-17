import { Link } from "react-router-dom";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Venue } from "@/types";

export function VenueCard({
  venue,
  eventId,
  onCheckAvailability,
}: {
  venue: Venue;
  eventId?: string;
  onCheckAvailability?: () => void;
}) {
  const detailsQuery = eventId
    ? `?${new URLSearchParams({ eventId }).toString()}`
    : "";
  return (
    <Card>
      <CardBody>
        {venue.image && (
          <img
            src={venue.image.dataUrl}
            alt={`${venue.name} venue`}
            className="mb-4 h-40 w-full rounded-lg object-cover"
          />
        )}
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{venue.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{venue.location}</p>
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Capacity: {venue.capacity}</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Layouts: {venue.layouts.length > 0 ? venue.layouts.join(", ") : "None listed"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {venue.facilities.map((f) => (
            <span key={f} className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400">
              {f}
            </span>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Info: {venue.operatingInformation}</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Setup: {venue.setupTimeMinutes} min · Turnaround: {venue.turnaroundTimeMinutes} min
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Link
            to={`/venues/${encodeURIComponent(venue.id)}${detailsQuery}`}
            className="whitespace-nowrap text-sm font-medium text-primary-700 dark:text-primary-300 hover:underline"
          >
            View Details →
          </Link>
          {onCheckAvailability && (
            <Button size="sm" className="whitespace-nowrap" onClick={onCheckAvailability}>
              Check Availability
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
