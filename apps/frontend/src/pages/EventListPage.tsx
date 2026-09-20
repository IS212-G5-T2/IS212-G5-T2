import { api } from "@/utils/api";
import type { EventRecord } from "@/types";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import { EventCard } from "@/components/domain/EventCard";
import type { EventStatus } from "@/types";

const statusOptions: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "planning", label: "Planning" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export function EventListPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const events = useAppStore((s) => s.events);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api<EventRecord[]>("/events")
      .then(events => { if (active) useAppStore.setState({ events }); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const [statusFilter, setStatusFilter] = useState("");

  const scoped = useMemo(() => {
    if (currentUser.role === "attendee") {
      return events.filter((e) => e.registrationEnabled && e.status !== "draft");
    }
    // organiser: the backend already scopes GET /api/events to the caller's own events.
    // coordinator sees everything (assigned + unassigned) to triage
    return events;
  }, [events, currentUser]);

  const filtered = statusFilter
    ? scoped.filter((e) => e.status === (statusFilter as EventStatus))
    : scoped;

  const title =
    currentUser.role === "organiser"
      ? "My Events"
      : currentUser.role === "attendee"
      ? "Browse Events"
      : "All Events";

  return (
    <div>
      <PageHeader
        title={title}
        description={
          currentUser.role === "coordinator"
            ? "Review submissions, track statuses, and manage every event in the pipeline."
            : undefined
        }
        actions={
          currentUser.role === "organiser" ? (
            <Link to="/events/create">
              <Button>+ Create Event</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-xs">
        <Select
          label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={statusOptions.filter((o) => o.value !== "")}
        />
      </div>

      {loading ? <p role="status">Loading events…</p> : error ? <div role="alert">{error} <Button variant="secondary" onClick={() => setRetry(r => r + 1)}>Retry</Button></div> : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No events match this filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
