import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api, ApiError } from "@/utils/api";
import { formatDateRange } from "@/utils/format";
import type { Venue } from "@/types";

export function VenueDetailPage() {
  const { id } = useParams();
  const bookings = useAppStore((s) => s.bookings);
  const [venue, setVenue] = useState<Venue>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!id) {
      setError("Venue not found.");
      setLoading(false);
      return () => { active = false; };
    }

    api<Venue>(`/venues/${encodeURIComponent(id)}`).then(
      (record) => {
        if (active) setVenue(record);
      },
      (failure: unknown) => {
        if (active) {
          setError(
            failure instanceof ApiError && failure.status === 404
              ? "Venue not found."
              : "Unable to load venue details.",
          );
        }
      },
    ).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id, revision]);

  if (loading) return <p role="status">Loading venue details…</p>;
  if (error || !venue) {
    return (
      <div role="alert">
        <p>{error || "Venue not found."}</p>
        <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
          Try again
        </Button>
      </div>
    );
  }

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

      {venue.image && (
        <img
          src={venue.image.dataUrl}
          alt={`${venue.name} venue`}
          className="mb-4 h-64 w-full rounded-xl border border-gray-200 object-cover shadow-sm dark:border-gray-700"
        />
      )}

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
                <dd className="font-medium text-gray-800 dark:text-gray-200">
                  {venue.operatingDays.join(", ")} · {venue.operatingStartTime}–{venue.operatingEndTime}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Operating information</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{venue.operatingInformation}</dd>
              </div>
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Setup time</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{venue.setupTimeMinutes} minutes</dd>
              </div>
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Turnaround time</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{venue.turnaroundTimeMinutes} minutes</dd>
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
