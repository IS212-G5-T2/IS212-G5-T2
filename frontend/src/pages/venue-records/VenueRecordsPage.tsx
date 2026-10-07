import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select, TextInput } from "@/components/ui/FormControls";
import { api } from "@/utils/api";
import { VenueRecordCard } from "./VenueRecordCard";
import {
  visibleVenues,
  type VenueRecord,
  type VenueSortKey,
} from "./venue-records";

const sortableColumns: { key: VenueSortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "capacity", label: "Capacity" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
];

export function VenueRecordsPage() {
  const [venues, setVenues] = useState<VenueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [catalogueScope, setCatalogueScope] = useState<"all" | "mine">("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<VenueSortKey>("name");
  const [descending, setDescending] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    api<VenueRecord[]>(
      catalogueScope === "mine" ? "/venues?mine=true" : "/venues",
    ).then(
      (records) => {
        if (active) {
          setVenues(records);
          setError(false);
          setLoading(false);
        }
      },
      () => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [revision, catalogueScope]);

  const displayed = useMemo(
    () => visibleVenues(venues, query, sortKey, descending),
    [venues, query, sortKey, descending],
  );

  function chooseSort(key: VenueSortKey) {
    if (sortKey === key) setDescending((current) => !current);
    else {
      setSortKey(key);
      setDescending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Venue Catalogue"
        description="View venue details, availability, bookings, and tentative holds."
      />
      <div className="mb-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        <Select
          label="Catalogue"
          value={catalogueScope}
          onChange={(event) => setCatalogueScope(event.target.value as "all" | "mine")}
          options={[
            { value: "all", label: "All venues" },
            { value: "mine", label: "My venues" },
          ]}
        />
        <TextInput
          label="Search by name or location"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div
        role="group"
        aria-label="Sort venues"
        className="mb-5 flex flex-wrap items-center gap-2"
      >
        <span className="mr-1 text-sm text-gray-600 dark:text-gray-400">
          Sort by
        </span>
        {sortableColumns.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => chooseSort(key)}
            aria-pressed={sortKey === key}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              sortKey === key
                ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {label} {sortKey === key ? (descending ? "↓" : "↑") : "↕"}
          </button>
        ))}
      </div>
      {loading && <p role="status">Loading venue records…</p>}
      {!loading && error && (
        <div role="alert">
          <p>Unable to load venue records.</p>
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
      )}
      {!loading && !error && displayed.length === 0 && (
        <p>
          {venues.length
            ? "No venues match your search."
            : "No venue records yet."}
        </p>
      )}
      {!loading && !error && displayed.length > 0 && (
        <div
          role="list"
          aria-label="Venue catalogue"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {displayed.map((venue) => (
            <VenueRecordCard key={venue.id} venue={venue} />
          ))}
        </div>
      )}
    </div>
  );
}
