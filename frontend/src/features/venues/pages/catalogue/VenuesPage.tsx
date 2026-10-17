import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { CheckboxGroup, Select, TextInput } from "@/components/ui/FormControls";
import { VenueCard } from "@/features/venues/pages/catalogue/VenueCard";
import { Card, CardBody } from "@/components/ui/Card";
import { api } from "@/utils/api";
import { hasRole, type EventRecord } from "@/types";
import type { VenueRecord } from "@/features/venues/pages/records/venue-records";
import { formatVenueRange } from "@/features/venues/pages/records/availability";
import {
  ACCESSIBILITY_OPTIONS,
  FACILITY_OPTIONS,
  ROOM_LAYOUT_OPTIONS,
} from "@/features/venues/lib/venueOptions";
import {
  EMPTY_VENUE_SEARCH,
  applyVenueSearch,
  criteriaFromEvent,
  validateVenueSearch,
  type VenueSearchCriteria,
} from "@/features/venues/lib/venueSearch";

/** Renders the persisted venue catalogue and its client-side search and filters (SPM-52). */
export function VenuesPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const events = useAppStore((s) => s.events);
  const [venues, setVenues] = useState<VenueRecord[]>([]);
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

  const [criteria, setCriteria] = useState<VenueSearchCriteria>(EMPTY_VENUE_SEARCH);
  const [prefilledEventId, setPrefilledEventId] = useState("");
  // Hold expiry is judged against this clock; it advances when the next active hold expires (SC-004).
  const [searchTime, setSearchTime] = useState(() => Date.now());
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setVenuesLoading(true);
    setVenuesLoadError(false);
    api<VenueRecord[]>("/venues").then(
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
  // Event requirements start the filters once per event, so the user's later edits are kept.
  if (selectedEvent && selectedEvent.id !== prefilledEventId) {
    setPrefilledEventId(selectedEvent.id);
    setCriteria(criteriaFromEvent(selectedEvent));
  }
  const canBook = hasRole(currentUser, "coordinator");
  const errors = useMemo(() => validateVenueSearch(criteria), [criteria]);
  const results = useMemo(
    () => applyVenueSearch(venues, criteria, searchTime),
    [venues, criteria, searchTime],
  );

  useEffect(() => {
    const nextExpiry = venues
      .flatMap((venue) => venue.reservations)
      .flatMap((reservation) =>
        reservation.status === "tentative" ? [Date.parse(reservation.holdExpiresAt)] : [],
      )
      .filter((expiry) => expiry > searchTime)
      .sort((left, right) => left - right)[0];
    if (nextExpiry === undefined) return;
    const timer = window.setTimeout(
      () => setSearchTime(Date.now()),
      Math.min(nextExpiry - searchTime, 2_147_000_000),
    );
    return () => window.clearTimeout(timer);
  }, [venues, searchTime]);

  const updateCriteria = (patch: Partial<VenueSearchCriteria>) =>
    setCriteria((current) => ({ ...current, ...patch }));

  const resultCount = `${results.length} ${results.length === 1 ? "venue matches" : "venues match"} your criteria.`;

  return (
    <div>
      <PageHeader
        title="Venue Catalogue"
        description={
          selectedEvent
            ? `Feature 7, 8 — Searching venues suitable for "${selectedEvent.name}".`
            : "Feature 7 — Search and filter venues by name or location, capacity, layout, facilities, accessibility, and availability."
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
            {selectedEvent.expectedAttendance}
            {selectedEvent.venueRequirements.layout &&
              `, layout: ${selectedEvent.venueRequirements.layout}`}
            {selectedEvent.venueRequirements.facilities.length > 0 &&
              `, facilities: ${selectedEvent.venueRequirements.facilities.join(", ")}`}
            {selectedEvent.venueRequirements.accessibility.length > 0 &&
              `, accessibility: ${selectedEvent.venueRequirements.accessibility.join(", ")}`}
            , {formatVenueRange(selectedEvent.startDateTime, selectedEvent.endDateTime)}.
          </CardBody>
        </Card>
      )}

      <div className="mb-6">
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput
            label="Name or location"
            value={criteria.query}
            onChange={(e) => updateCriteria({ query: e.target.value })}
            placeholder="e.g. Orchid or West Wing"
          />
          <TextInput
            label="Minimum capacity"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={criteria.minCapacity}
            onChange={(e) => updateCriteria({ minCapacity: e.target.value })}
            error={errors.minCapacity}
          />
          <Select
            label="Room layout"
            value={criteria.layout}
            onChange={(e) => updateCriteria({ layout: e.target.value })}
            options={[
              { value: "", label: "Any layout" },
              ...ROOM_LAYOUT_OPTIONS.map((layout) => ({ value: layout, label: layout })),
            ]}
          />
          <TextInput
            label="Start date and time"
            type="datetime-local"
            value={criteria.start}
            onChange={(e) => updateCriteria({ start: e.target.value })}
            error={errors.start}
          />
          <TextInput
            label="End date and time"
            type="datetime-local"
            value={criteria.end}
            onChange={(e) => updateCriteria({ end: e.target.value })}
            error={errors.end}
          />
        </div>
        <CheckboxGroup
          label="Facilities"
          options={[...FACILITY_OPTIONS]}
          values={criteria.facilities}
          onChange={(facilities) => updateCriteria({ facilities })}
        />
        <CheckboxGroup
          label="Accessibility features"
          options={[...ACCESSIBILITY_OPTIONS]}
          values={criteria.accessibility}
          onChange={(accessibility) => updateCriteria({ accessibility })}
        />
        <Button variant="secondary" onClick={() => setCriteria(EMPTY_VENUE_SEARCH)}>
          Clear all filters
        </Button>
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
      ) : (
        <>
          <p role="status" className="mb-3 text-sm text-gray-600 dark:text-gray-400">{resultCount}</p>
          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              <p>No venues match these filters.</p>
              <p className="mt-1">Try adjusting or clearing some of your filters to see more venues.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((v) => (
                <VenueCard
                  key={v.id}
                  venue={v}
                  eventId={eventId || undefined}
                  onCheckAvailability={canBook ? () => {
                    const query = selectedEvent
                      ? `?${new URLSearchParams({ eventId: selectedEvent.id }).toString()}`
                      : "";
                    navigate(`/venue-records/${encodeURIComponent(v.id)}${query}`);
                  } : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
