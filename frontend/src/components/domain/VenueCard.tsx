import { Link } from "react-router-dom";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Venue } from "@/types";

export function VenueCard({
  venue,
  highlightSuitable,
  onBook,
}: {
  venue: Venue;
  highlightSuitable?: boolean;
  onBook?: () => void;
}) {
  return (
    <Card className={highlightSuitable ? "border-success-300 dark:border-success-700 ring-1 ring-success-200 dark:ring-success-800" : undefined}>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{venue.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{venue.location}</p>
          </div>
          {highlightSuitable && (
            <span className="inline-flex items-center rounded-full bg-success-100 dark:bg-success-900/30 px-2.5 py-0.5 text-xs font-medium text-success-800 dark:text-success-300">
              Suitable
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Capacity: {venue.capacity}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {venue.facilities.map((f) => (
            <span key={f} className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400">
              {f}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Hours: {venue.operatingHours}</p>
        <div className="mt-3 flex items-center justify-between">
          <Link
            to={`/venues/${venue.id}`}
            className="text-sm font-medium text-primary-700 dark:text-primary-300 hover:underline"
          >
            View details →
          </Link>
          {onBook && (
            <Button size="sm" onClick={onBook}>
              Submit Booking Request
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
