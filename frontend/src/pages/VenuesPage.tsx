import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select, TextInput } from "@/components/ui/FormControls";
import { VenueCard } from "@/components/domain/VenueCard";
import { SubmitBookingModal } from "@/components/domain/SubmitBookingModal";
import { Card, CardBody } from "@/components/ui/Card";
import type { Venue } from "@/types";

export function VenuesPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const venues = useAppStore((s) => s.venues);
  const events = useAppStore((s) => s.events);
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId") ?? "";

  const [minCapacity, setMinCapacity] = useState("");
  const [facility, setFacility] = useState("");
  const [accessibility, setAccessibility] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [bookingVenue, setBookingVenue] = useState<Venue | null>(null);

  const selectedEvent = events.find((e) => e.id === eventId);
  const canBook = currentUser.role === "coordinator";

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
      />

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

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No venues match these filters.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <VenueCard
              key={v.id}
              venue={v}
              highlightSuitable={!!selectedEvent && isSuitable(v)}
              onBook={canBook && selectedEvent ? () => setBookingVenue(v) : undefined}
            />
          ))}
        </div>
      )}

      <SubmitBookingModal
        event={bookingVenue ? selectedEvent ?? null : null}
        venue={bookingVenue}
        onClose={() => setBookingVenue(null)}
      />
    </div>
  );
}
