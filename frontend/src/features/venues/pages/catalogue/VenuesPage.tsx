import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select, TextInput } from "@/components/ui/FormControls";
import { VenueCard } from "@/features/venues/pages/catalogue/VenueCard";
import { Card, CardBody } from "@/components/ui/Card";
import { api } from "@/utils/api";
import { hasRole, type EventRecord, type Venue } from "@/types";

/** Renders the persisted venue catalogue and its client-side filters. */
export function VenuesPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const events = useAppStore((s) => s.events);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(true);
  const [venuesLoadError, setVenuesLoadError] = useState(false);
  const [venuesRevision, setVenuesRevision] = useState(0);
  const [eventRevision, setEventRevision] = useState(0);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventLoadError, setEventLoadError] = useState(false);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId") ?? "";
  const creationMessage = (location.state as { creationMessage?: string } | null)
    ?.creationMessage;

  const [minCapacity, setMinCapacity] = useState("");
  const [facility, setFacility] = useState("");
  const [accessibility, setAccessibility] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setVenuesLoading(true);
    setVenuesLoadError(false);
    api<Venue[]>("/venues").then(
      (records) => {
        if (active) setVenues(records);
      },
      () => {
        if (active) setVenuesLoadError(true);
      },
    ).finally(() => {
      if (active) setVenuesLoading(false);
    });
    return () => {
      active = false;
    };
  }, [venuesRevision]);

  useEffect(() => {
    if (!eventId) {
      setEventLoading(false);
      setEventLoadError(false);
      return;
    }
    if (useAppStore.getState().events.some((event) => event.id === eventId)) {
      setEventLoading(false);
      setEventLoadError(false);
      return;
    }

    let active = true;
    setEventLoading(true);
    setEventLoadError(false);
    api<EventRecord>(`/events/${encodeURIComponent(eventId)}`).then(
      (event) => {
        if (active) {
          useAppStore.setState((state) => ({
            events: [event, ...state.events.filter((item) => item.id !== event.id)],
          }));
        }
      },
      () => {
        if (active) setEventLoadError(true);
      },
    ).finally(() => {
      if (active) setEventLoading(false);
    });
    return () => {
      active = false;
    };
  }, [eventId, eventRevision]);

  const selectedEvent = events.find((e) => e.id === eventId);
  const canBook = hasRole(currentUser, "coordinator");

  const allFacilities = Array.from(new Set(venues.flatMap((v) => v.facilities))).sort();
  const allAccessibility = Array.from(new Set(venues.flatMap((v) => v.accessibility))).sort();

  const filtered = useMemo(() => {
    return venues.filter((v) => {
      if (minCapacity && v.capacity < Number(minCapacity)) return false;
      if (facility && !v.facilities.includes(facility)) return false;
      if (accessibility && !v.accessibility.includes(accessibility)) return false;
      if (locationQuery && !v.location.toLowerCase().includes(locationQuery.toLowerCase())) return false;
      return true;
    });
  }, [venues, minCapacity, facility, accessibility, locationQuery]);

  const isSuitable = (venue: Venue) => {
    if (!selectedEvent) return false;
    const capacityOk = venue.capacity >= selectedEvent.venueRequirements.minCapacity;
    const facilitiesOk = selectedEvent.venueRequirements.facilities.every((f) =>
      venue.facilities.includes(f)
    );
    const accessibilityOk = selectedEvent.venueRequirements.accessibility.every((a) =>
      venue.accessibility.includes(a)
    );
    return capacityOk && facilitiesOk && accessibilityOk;
  };

  return (
    <div>
      <PageHeader
        title="Venue Catalogue"
        description={
          selectedEvent
            ? `Feature 7, 8 — Searching venues suitable for "${selectedEvent.name}". Suitable matches are highlighted.`
            : "Feature 7 — Search and filter venues by capacity, facilities, accessibility, and location."
        }
        actions={selectedEvent ? (
          <Link to={`/events/${encodeURIComponent(selectedEvent.id)}`}>
            <Button variant="secondary">Back to event</Button>
          </Link>
        ) : undefined}
      />

      {creationMessage && (
        <p role="status" className="mb-4 text-success-700">
          {creationMessage}
        </p>
      )}

      {eventId && eventLoading && (
        <p role="status" className="mb-4">Loading the selected event…</p>
      )}
      {eventId && eventLoadError && (
        <div role="alert" className="mb-4 flex items-center gap-3">
          <p>Unable to load the selected event. Try again to restore its venue requirements.</p>
          <Button variant="secondary" onClick={() => setEventRevision((revision) => revision + 1)}>
            Retry event
          </Button>
        </div>
      )}

      {selectedEvent && (
        <Card className="mb-4 border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30">
          <CardBody className="text-sm text-primary-900 dark:text-primary-200">
            Checking suitability for <strong>{selectedEvent.name}</strong> — needs capacity ≥{" "}
            {selectedEvent.venueRequirements.minCapacity}
            {selectedEvent.venueRequirements.facilities.length > 0 &&
              `, facilities: ${selectedEvent.venueRequirements.facilities.join(", ")}`}
            {selectedEvent.venueRequirements.accessibility.length > 0 &&
              `, accessibility: ${selectedEvent.venueRequirements.accessibility.join(", ")}`}
            .
          </CardBody>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-x-4 sm:grid-cols-4">
        <TextInput
          label="Location contains"
          value={locationQuery}
          onChange={(e) => setLocationQuery(e.target.value)}
          placeholder="e.g. West Wing"
        />
        <TextInput
          label="Minimum capacity"
          type="number"
          min={0}
          value={minCapacity}
          onChange={(e) => setMinCapacity(e.target.value)}
        />
        <Select
          label="Facility"
          value={facility}
          onChange={(e) => setFacility(e.target.value)}
          options={allFacilities.map((f) => ({ value: f, label: f }))}
        />
        <Select
          label="Accessibility"
          value={accessibility}
          onChange={(e) => setAccessibility(e.target.value)}
          options={allAccessibility.map((a) => ({ value: a, label: a }))}
        />
      </div>

      {venuesLoading ? (
        <p role="status">Loading venues…</p>
      ) : venuesLoadError ? (
        <div role="alert" className="space-y-3">
          <p>Unable to load venues from the catalogue.</p>
          <Button
            variant="secondary"
            onClick={() => setVenuesRevision((revision) => revision + 1)}
          >
            Try again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No venues match these filters.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <VenueCard
              key={v.id}
              venue={v}
              highlightSuitable={isSuitable(v)}
              onCheckAvailability={canBook && selectedEvent ? () => {
                const query = new URLSearchParams({ eventId: selectedEvent.id });
                navigate(`/venue-records/${encodeURIComponent(v.id)}?${query.toString()}`);
              } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
