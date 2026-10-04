import { api } from "@/utils/api";
import type { EventRecord } from "@/types";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import { EventCard } from "@/components/domain/EventCard";
import type { EventStatus } from "@/types";
import {
  ATTENDEE_BROWSE_FILTERS,
  matchesAttendeeFilter,
  type AttendeeBrowseFilter,
} from "./EventView";

const statusOptions: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "planning", label: "Planning" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export function EventListPage() {
  const isPlanning = useLocation().pathname === "/planning";
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
  // Coordinators land on pending Submitted requests. Rejected requests remain
  // accessible through the explicit Rejected filter rather than mixing into
  // their decision queue.
  const [statusFilter, setStatusFilter] = useState(
    currentUser.role === "coordinator" ? "submitted" : "",
  );
  // SPM-61: attendees filter by their own relationship to each event instead
  // of by raw workflow status.
  const isAttendee = currentUser.role === "attendee";
  const [attendeeFilter, setAttendeeFilter] = useState<AttendeeBrowseFilter>("upcoming");

  const scoped = useMemo(() => {
    if (currentUser.role === "attendee") {
      return events.filter((e) => e.registrationEnabled && e.status !== "draft");
    }
    // SPM-38: the backend scopes GET /api/events to the caller's own events —
    // an organiser sees their submitted requests, a coordinator sees only the
    // requests round-robin has assigned to them.
    return events;
  }, [events, currentUser]);

  const filtered = isAttendee
    ? scoped.filter((e) => matchesAttendeeFilter(e, attendeeFilter, new Date()))
    : statusFilter
      ? scoped.filter((e) => e.status === (statusFilter as EventStatus))
      : scoped;

  const title =
    currentUser.role === "organiser"
      ? "My Events"
      : currentUser.role === "attendee"
      ? "Browse Events"
      : currentUser.role === "coordinator"
      ? "My Assigned Requests"
      : statusFilter === "submitted"
        ? "Pending Requests"
        : "All Events";

  return (
    <div>
      <PageHeader
        title={isPlanning ? "Event Planning" : title}
        description={
          currentUser.role === "coordinator"
            ? "Requests assigned to you. Pending ones show first; use the status filter to see approved and rejected requests, which stay assigned to you."
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
        {isAttendee ? (
          <Select
            label="Show"
            value={attendeeFilter}
            onChange={(e) => setAttendeeFilter(e.target.value as AttendeeBrowseFilter)}
            options={ATTENDEE_BROWSE_FILTERS}
          />
        ) : (
          <Select
            label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={statusOptions.filter((o) => o.value !== "")}
          />
        )}
      </div>

      {loading ? <p role="status">Loading events…</p> : error ? <div role="alert">{error} <Button variant="secondary" onClick={() => setRetry(r => r + 1)}>Retry</Button></div> : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No events match this filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((e) => (
            <EventCard
              key={e.id}
              // "Approved" and "Confirmed" are the same published state for attendees.
              event={isAttendee && e.status === "approved" ? { ...e, status: "confirmed" } : e}
              registered={isAttendee && e.myRegistrationStatus === "registered"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
