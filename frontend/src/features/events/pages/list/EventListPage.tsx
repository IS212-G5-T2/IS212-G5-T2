import { api } from "@/utils/api";
import { fetchMyChangeRequests, fetchNewChangeRequestEventIds } from "@/features/events/api/change-requests-api";
import { PendingChangeRequests } from "@/features/events/pages/list/PendingChangeRequests";
import type { ChangeRequest, EventRecord } from "@/types";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { CheckboxGroup, Select } from "@/components/ui/FormControls";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { DraftRecord } from "@/features/events/types/draft";
import { EventCard, type CardRegistrationStatus } from "@/features/events/pages/list/EventCard";
import { AssignmentNotifications } from "@/features/events/pages/list/AssignmentNotifications";
import type { EventStatus, RegistrationStatus } from "@/types";
import {
  ATTENDEE_BROWSE_FILTERS,
  matchesAttendeeFilter,
  type AttendeeBrowseFilter,
} from "@/features/events/lib/EventView";
import {
  ORGANISER_STATUS_FILTERS,
  matchesOrganiserStatusFilters,
  type OrganiserStatusFilter,
} from "@/features/events/lib/organiserStatusFilter";

/** The card's registration badge: only the three states an attendee can hold on a listed event. */
function cardRegistrationStatus(status: RegistrationStatus | undefined): CardRegistrationStatus | undefined {
  return status === "registered" || status === "waitlisted" || status === "withdrawn" ? status : undefined;
}

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
  // SPM-94 AC1 / R1: an organiser's unsubmitted drafts show in My Events too; they are read from the same requests API My Requests uses.
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  useEffect(() => {
    if (currentUser.role !== "organiser") return;
    let active = true;
    api<DraftRecord[]>("/requests")
      .then(list => { if (active) setDrafts(Array.isArray(list) ? list.filter(d => d.status === "Draft") : []); })
      .catch(() => { if (active) setDrafts([]); });
    return () => { active = false; };
  }, [currentUser.role, retry]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api<EventRecord[]>("/events")
      .then(events => { if (active) useAppStore.setState({ events }); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  // SPM-64 AC5: an organiser's dashboard marks events with a change request awaiting review.
  // SPM-65 AC1: so does a coordinator's, which also lists the pending requests for their
  // assigned events. If that cannot load, the events still show and a notice says so.
  const tracksChangeRequests = currentUser.role === "organiser" || currentUser.role === "coordinator";
  const isCoordinator = currentUser.role === "coordinator";
  const [pendingChangeRequests, setPendingChangeRequests] = useState<ChangeRequest[] | null>(null);
  const pendingChangeEvents = new Set((pendingChangeRequests ?? []).map((request) => request.eventId));
  const [changeRequestError, setChangeRequestError] = useState("");
  // Requests the coordinator has not opened yet (unread SPM-64 AC3 notice) are tagged New.
  const [newChangeRequestEvents, setNewChangeRequestEvents] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!isCoordinator) return;
    let active = true;
    fetchNewChangeRequestEventIds()
      .then((ids) => {
        if (active) setNewChangeRequestEvents(ids);
      })
      // Without the notices the list still shows every pending request, just without New tags.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isCoordinator, retry]);
  useEffect(() => {
    if (!tracksChangeRequests) return;
    let active = true;
    setChangeRequestError("");
    fetchMyChangeRequests("Pending")
      .then((requests) => {
        if (active) setPendingChangeRequests(requests);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setPendingChangeRequests(null);
        setChangeRequestError(
          `Could not check your events for pending change requests.${e instanceof Error && e.message ? ` ${e.message}` : ""}`,
        );
      });
    return () => {
      active = false;
    };
  }, [tracksChangeRequests, retry]);
  // Coordinators land on pending Submitted requests. Rejected requests remain
  // accessible through the explicit Rejected filter rather than mixing into
  // their decision queue.
  const eventListFilters = useAppStore((s) => s.eventListFilters);
  const setEventListFilters = useAppStore((s) => s.setEventListFilters);
  const statusFilter =
    eventListFilters.status ?? (currentUser.role === "coordinator" ? "submitted" : "");
  const setStatusFilter = (status: string) => setEventListFilters({ status });
  // SPM-61: attendees filter by their own relationship to each event instead
  // of by raw workflow status.
  const isAttendee = currentUser.role === "attendee";
  const attendeeFilter = eventListFilters.attendee as AttendeeBrowseFilter;
  const setAttendeeFilter = (attendee: AttendeeBrowseFilter) => setEventListFilters({ attendee });
  // SPM-95 AC2, AC7: an organiser's multi-select lives in local state, so leaving the list for an event's details resets it.
  const [organiserFilters, setOrganiserFilters] = useState<ReadonlySet<OrganiserStatusFilter>>(() => new Set());
  const selectedOrganiserLabels = ORGANISER_STATUS_FILTERS.filter((o) => organiserFilters.has(o.value)).map((o) => o.label);

  const scoped = useMemo(() => {
    if (currentUser.role === "attendee") {
      return events.filter((e) => e.registrationEnabled && e.status !== "draft");
    }
    // SPM-38: the backend scopes GET /api/events to the caller's own events —
    // an organiser sees their submitted requests, a coordinator sees only the
    // requests the Event Coordinator Lead assigned to them (SPM-123).
    return events;
  }, [events, currentUser]);

  // Every view lists events from the earliest start date to the latest, so each grid row reads left (earlier) to right (later).
  const byStartDate = (list: EventRecord[]) =>
    [...list].sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
  const filtered = byStartDate(isAttendee
    ? scoped.filter((e) => matchesAttendeeFilter(e, attendeeFilter, new Date()))
    // SPM-95 AC1, AC2, AC5: an organiser sees all events until a filter is chosen, then any-of-the-selected filters.
    : isOrganiser
      ? scoped.filter((e) => matchesOrganiserStatusFilters(e, organiserFilters))
    : statusFilter
            // SPM-148 PLAN-STATUS-05-A, 05-C: the Planning filter; with no match the list shows 'No events match this filter.'
      ? scoped.filter((e) => e.status === (statusFilter as EventStatus))
      : scoped);

  const title =
    currentUser.role === "organiser"
      ? "My Events"
      : currentUser.role === "attendee"
      ? "Browse Events"
      : statusFilter === "submitted"
        ? "Pending Requests"
        : "All Events";

  return (
    <div>
      {/* SPM-65 AC1: the coordinator's pending change requests come first, tagged New until opened. */}
      {isCoordinator && pendingChangeRequests && (
        <PendingChangeRequests requests={pendingChangeRequests} newEventIds={newChangeRequestEvents} />
      )}
      {/* SPM-123 AC9: new assignments from the Event Coordinator Lead (coordinators only). */}
      <AssignmentNotifications />
      <PageHeader
        title={isPlanning ? "Event Planning" : title}
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

      {isOrganiser ? (
        <div>
          {/* SPM-95 AC2, AC3, AC5: checkboxes show which filters are on; Clear all filters turns them all off. */}
          <CheckboxGroup
            label="Filter by status"
            options={ORGANISER_STATUS_FILTERS.map((o) => o.label)}
            values={selectedOrganiserLabels}
            onChange={(labels) =>
              setOrganiserFilters(new Set(ORGANISER_STATUS_FILTERS.filter((o) => labels.includes(o.label)).map((o) => o.value)))
            }
          />
          {selectedOrganiserLabels.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
              <p>Active filters: {selectedOrganiserLabels.join(", ")}</p>
              <Button size="sm" variant="secondary" onClick={() => setOrganiserFilters(new Set())}>
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      ) : (
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
      )}

      {currentUser.role === "organiser" && drafts.length > 0 && (
        <section aria-label="Draft requests" className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Drafts</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link to={`/requests/${d.id}`} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <span className="truncate font-medium text-gray-900 dark:text-gray-100">{d.fields.name || "Untitled draft"}</span>
                  <StatusBadge status="draft" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {changeRequestError && !error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-sm text-warning-900 dark:border-warning-700 dark:bg-warning-900/20 dark:text-warning-200">
          {changeRequestError}{" "}
          <Button size="sm" variant="secondary" onClick={() => setRetry(r => r + 1)}>Retry</Button>
        </div>
      )}

      {loading ? <p role="status">Loading events…</p> : error ? <div role="alert">{error} <Button variant="secondary" onClick={() => setRetry(r => r + 1)}>Retry</Button></div> : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {/* SPM-95 AC4: the organiser's empty state; other roles keep the SPM-148 wording. */}
          {isOrganiser ? "No matching events found" : "No events match this filter."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              attendeeView={isAttendee}
              registrationStatus={isAttendee ? cardRegistrationStatus(e.myRegistrationStatus) : undefined}
              changeRequestPending={pendingChangeEvents.has(e.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
