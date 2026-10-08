import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, api } from "@/utils/api";
import { formatDateTimeRange } from "@/utils/format";
import type { VenueRecord } from "../venue-records";
import { VenueUnavailabilityPanel } from "./VenueUnavailabilityPanel";
import { useAppStore } from "@/store/useAppStore";
import { hasRole } from "@/types";

export function VenueRecordDetailPage() {
  const { id } = useParams();
  const [venue, setVenue] = useState<VenueRecord>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const displayedVenueId = useRef<string | undefined>(undefined);
  const user = useAppStore((state) => state.currentUser);

  useEffect(() => {
    let active = true;
    if (displayedVenueId.current !== id) {
      setLoading(true);
      setVenue(undefined);
      displayedVenueId.current = id;
    }
    setError("");
    if (!id) {
      setError("Venue not found.");
      setLoading(false);
      return () => {
        active = false;
      };
    }
    api<VenueRecord>(`/venues/${encodeURIComponent(id)}`).then(
      (record) => {
        if (active) {
          setVenue(record);
          setLoading(false);
          setError("");
        }
      },
      (failure: unknown) => {
        if (active) {
          setError(
            failure instanceof ApiError && failure.status === 404
              ? "Venue not found."
              : "Unable to load venue details.",
          );
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [id, revision]);

  if (loading) return <p role="status">Loading venue details…</p>;
  if (error || !venue)
    return (
      <div role="alert">
        <p>{error || "Venue not found."}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading(true);
            setRevision((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );

  return (
    <div>
      <PageHeader
        title={venue.name}
        description={venue.location}
        actions={
          <Link to="/venue-records">
            <Button variant="secondary">Back to Venue Records</Button>
          </Link>
        }
      />
      {venue.image && (
        <img
          src={venue.image.dataUrl}
          alt={`${venue.name} venue`}
          className="mb-4 h-64 w-full rounded-xl object-cover"
        />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Venue Information</h2>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt>Capacity</dt>
                <dd>{venue.capacity}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd className="capitalize">{venue.availabilityStatus}</dd>
              </div>
              <div>
                <dt>Facilities</dt>
                <dd>{venue.facilities.join(", ") || "None"}</dd>
              </div>
              <div>
                <dt>Layout options</dt>
                <dd>{venue.layouts.join(", ") || "None"}</dd>
              </div>
              <div>
                <dt>Accessibility features</dt>
                <dd>{venue.accessibility.join(", ") || "None"}</dd>
              </div>
              <div>
                <dt>Operating days and hours</dt>
                <dd>
                  {venue.operatingDays.join(", ")} · {venue.operatingStartTime}–
                  {venue.operatingEndTime}
                </dd>
              </div>
              <div>
                <dt>Operating information</dt>
                <dd>{venue.operatingInformation}</dd>
              </div>
              <div>
                <dt>Setup requirements</dt>
                <dd>{venue.setupTimeMinutes} minutes before an event</dd>
              </div>
              <div>
                <dt>Turnaround time</dt>
                <dd>{venue.turnaroundTimeMinutes} minutes after an event</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Unavailable periods</h2>
            </CardHeader>
            <CardBody>
              <VenueUnavailabilityPanel
                venueId={venue.id}
                periods={venue.unavailablePeriods}
                canManage={hasRole(user, "venue_staff")}
                onSaved={() => setRevision((value) => value + 1)}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="font-semibold">
                Upcoming bookings and tentative holds
              </h2>
            </CardHeader>
            <CardBody>
              {venue.reservations.length === 0 ? (
                <p>No upcoming bookings or active tentative holds.</p>
              ) : (
                <ul className="space-y-3">
                  {venue.reservations.map((reservation) => (
                    <li key={reservation.id}>
                      <strong>{reservation.eventName}</strong> ·{" "}
                      {reservation.status === "booked"
                        ? "Booked"
                        : "Tentative hold"}
                      <br />
                      {formatDateTimeRange(reservation.start, reservation.end)}
                      {reservation.affectedByUnavailablePeriod && (
                        <p className="text-danger-700 dark:text-danger-300">
                          Affected by an unavailable period
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
