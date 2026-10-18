import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api, ApiError } from "@/utils/api";
import { formatDateTimeRange } from "@/utils/format";
import type { VenueRecord } from "../venue-records";
import { VenueUnavailabilityPanel } from "./VenueUnavailabilityPanel";
import { useAppStore } from "@/store/useAppStore";
import { hasRole, type EventRecord } from "@/types";
import {
  checkVenueAvailability,
  formatVenueInstant,
  formatVenueRange,
  getFreeVenueIntervals,
  parseRequestTime,
} from "../availability";
import { sgtLocalDateTimeToDate } from "@/utils/sgtDate";
import { VenueScheduleCalendar } from "./VenueScheduleCalendar";

function toSgtDateTimeLocal(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** Provides a stable detail-page error even when the record is absent without a transport error. */
export function getVenueDetailErrorMessage(
  error: string,
  venue: VenueRecord | undefined,
): string {
  return error || (!venue ? "Venue not found." : "");
}

export function VenueRecordDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const requestedEventId = searchParams.get("eventId") ?? "";
  const [venue, setVenue] = useState<VenueRecord>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const displayedVenueId = useRef<string | undefined>(undefined);
  const user = useAppStore((state) => state.currentUser);
  const events = useAppStore((state) => state.events);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [calendarDate, setCalendarDate] = useState("");
  const [availabilityNow, setAvailabilityNow] = useState(() => Date.now());
  const [submitted, setSubmitted] = useState(false);
  const [checkedAvailabilityKey, setCheckedAvailabilityKey] = useState("");
  const [requestedEventRevision, setRequestedEventRevision] = useState(0);
  const [requestedEventLoading, setRequestedEventLoading] = useState(false);
  const [requestedEventError, setRequestedEventError] = useState("");
  const prefilledEventKey = useRef("");
  const requestedEvent = events.find((event) => event.id === requestedEventId);
  const selectedRequestEvent = requestedEvent && ["approved", "planning", "confirmed"].includes(requestedEvent.status)
    ? requestedEvent
    : undefined;
  const selectedRequestEventId = selectedRequestEvent?.id;
  const selectedEventTimeReadOnly = Boolean(selectedRequestEvent);
  const [requestError, setRequestError] = useState("");
  const [existingBookingReference, setExistingBookingReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookingReference, setBookingReference] = useState("");
  const [movedToPlanning, setMovedToPlanning] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [checking, setChecking] = useState(false);
  const validRange =
    Number.isFinite(parseRequestTime(start)) &&
    Number.isFinite(parseRequestTime(end)) &&
    parseRequestTime(start) < parseRequestTime(end);
  const availabilityKey = validRange
    ? `${id ?? ""}:${requestedEventId}:${start}:${end}`
    : "";
  const availabilityEstablished = Boolean(availabilityKey) && checkedAvailabilityKey === availabilityKey;
  const activeReservations = useMemo(
    () => (venue?.reservations ?? []).filter(
      (reservation) => reservation.status === "booked" || Date.parse(reservation.holdExpiresAt) > availabilityNow,
    ),
    [venue, availabilityNow],
  );
  const scheduleVenue = useMemo(
    () => (venue ? { ...venue, reservations: activeReservations } : undefined),
    [venue, activeReservations],
  );
  const conflicts = useMemo(
    () => (scheduleVenue ? checkVenueAvailability(scheduleVenue, start, end) : []),
    [scheduleVenue, start, end],
  );
  const scheduleItems = useMemo(() => {
    if (!venue) return [];
    const items = [
      ...venue.unavailablePeriods.map((period) => ({
        title: "Unavailable",
        start: period.start,
        end: period.end,
        detail: period.reason,
      })),
      ...activeReservations.map((item) => ({
        title:
          item.status === "booked" ? "Confirmed booking" : "Tentative hold",
        start: item.start,
        end: item.end,
        detail: `${item.eventName}${item.holdExpiresAt ? ` · hold expires ${formatVenueInstant(item.holdExpiresAt)}` : ""}`,
      })),
    ];
    if (validRange) items.push({
      title: "Selected event time",
      start: sgtLocalDateTimeToDate(start).toISOString(),
      end: sgtLocalDateTimeToDate(end).toISOString(),
      detail: "Requested event time · check availability to confirm.",
    });
    if (validRange)
      items.push(
        ...getFreeVenueIntervals(scheduleVenue!, start, end).map((interval) => ({
          title: "Available slot",
          ...interval,
          detail: "Available",
        })),
      );
    return items.sort(
      (left, right) => Date.parse(left.start) - Date.parse(right.start),
    );
  }, [venue, scheduleVenue, activeReservations, validRange, start, end]);
  const detailError = getVenueDetailErrorMessage(error, venue);
  const availabilityMessage = submitted
    ? "Your request is pending Venue Staff review."
    : existingBookingReference
      ? "A request already exists for this event and venue."
      : availabilityEstablished
        ? "This time is available for this venue."
        : checking
          ? "Checking this time against the latest schedule…"
          : requestError
            ? "Availability could not be confirmed yet."
            : "Availability will be checked automatically.";
  const matchesRequired = (available: string[], required: string[]) => {
    const normalized = new Set(available.map((item) => item.trim().toLocaleLowerCase()));
    return required.filter((item) => !normalized.has(item.trim().toLocaleLowerCase()));
  };
  const suitabilityIssues = selectedRequestEvent && venue ? [
    ...(venue.capacity < selectedRequestEvent.venueRequirements.minCapacity || venue.capacity < selectedRequestEvent.expectedAttendance
      ? [`Capacity ${venue.capacity} is below the required ${Math.max(selectedRequestEvent.venueRequirements.minCapacity, selectedRequestEvent.expectedAttendance)}.`] : []),
    ...matchesRequired(venue.facilities, selectedRequestEvent.venueRequirements.facilities).map((item) => `Missing facility: ${item}.`),
    ...matchesRequired(venue.accessibility, selectedRequestEvent.venueRequirements.accessibility).map((item) => `Missing accessibility feature: ${item}.`),
    ...(selectedRequestEvent.venueRequirements.layout && !matchesRequired(venue.layouts, [selectedRequestEvent.venueRequirements.layout]).length
      ? [] : selectedRequestEvent.venueRequirements.layout ? [`Required layout unavailable: ${selectedRequestEvent.venueRequirements.layout}.`] : []),
  ] : [];

  useEffect(() => {
    const nextExpiry = (venue?.reservations ?? [])
      .flatMap((reservation) => reservation.status === "tentative" ? [Date.parse(reservation.holdExpiresAt)] : [])
      .filter((expiry) => expiry > availabilityNow)
      .sort((left, right) => left - right)[0];
    if (!nextExpiry) return;
    const timer = window.setTimeout(
      () => setAvailabilityNow(Date.now()),
      Math.min(nextExpiry - availabilityNow, 2_147_000_000),
    );
    return () => window.clearTimeout(timer);
  }, [venue, availabilityNow]);

  useEffect(() => {
    if (!requestedEventId) {
      setRequestedEventLoading(false);
      setRequestedEventError("");
      return;
    }

    if (useAppStore.getState().events.some((event) => event.id === requestedEventId)) {
      setRequestedEventLoading(false);
      setRequestedEventError("");
      return;
    }

    let active = true;
    setRequestedEventLoading(true);
    setRequestedEventError("");
    api<EventRecord>(`/events/${encodeURIComponent(requestedEventId)}`).then(
      (event) => {
        if (active) {
          useAppStore.setState((state) => ({
            events: [event, ...state.events.filter((item) => item.id !== event.id)],
          }));
        }
      },
      (failure: unknown) => {
        if (active) {
          setRequestedEventError(
            failure instanceof ApiError && failure.status === 404
              ? "The selected event could not be found. Choose another event or return to the catalogue."
              : "Unable to load the selected event. Try again to restore its time and attendance.",
          );
        }
      },
    ).finally(() => {
      if (active) setRequestedEventLoading(false);
    });
    return () => {
      active = false;
    };
  }, [requestedEventId, requestedEventRevision]);

  useEffect(() => {
    if (!requestedEventId) return;
    const event = events.find((item) => item.id === requestedEventId);
    if (!event) return;
    const eventKey = `${event.id}:${event.startDateTime}:${event.endDateTime}`;
    if (prefilledEventKey.current === eventKey) return;
    prefilledEventKey.current = eventKey;
    setStart(toSgtDateTimeLocal(event.startDateTime));
    setEnd(toSgtDateTimeLocal(event.endDateTime));
    setCalendarDate(toSgtDateTimeLocal(event.startDateTime).slice(0, 10));
    setSubmitted(false);
    setExistingBookingReference("");
    setRequestError("");
  }, [requestedEventId, events]);

  useEffect(() => {
    if (!id || !venue?.id || !selectedRequestEventId || requestedEventLoading || requestedEventError || !availabilityKey) {
      setChecking(false);
      setCheckedAvailabilityKey("");
      return;
    }

    let active = true;
    const requestedAvailabilityKey = availabilityKey;
    setChecking(true);
    setCheckedAvailabilityKey("");
    setRequestError("");
    const timer = window.setTimeout(() => {
      Promise.all([
        api<VenueRecord>(`/venues/${encodeURIComponent(id)}`),
        api<Array<{
          id: string;
          eventId: string;
          venueId: string;
          start: string;
          end: string;
          status: string;
          bookingReference: string;
        }>>("/venues/my-bookings"),
      ]).then(
        ([fresh, bookings]) => {
          if (!active) return;
          const duplicate = bookings.find((booking) =>
          booking.eventId === requestedEventId &&
            booking.venueId === id,
          );
          setVenue(fresh);
          setExistingBookingReference(duplicate?.bookingReference ?? "");
          setSubmitted(false);
          setCheckedAvailabilityKey(requestedAvailabilityKey);
        },
        (failure: unknown) => {
          if (!active) return;
          setRequestError(
            failure instanceof ApiError
              ? failure.message
              : "Unable to refresh venue availability. Try again.",
          );
        },
      ).finally(() => {
        if (active) setChecking(false);
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [id, venue?.id, selectedRequestEventId, requestedEventId, requestedEventLoading, requestedEventError, availabilityKey, revision]);

  // SPM-148 PLAN-STATUS-01-A, 03-D: one request per submit; Submit is disabled while the request is in flight.
  async function submitRequest() {
    // The submit action exists only for a valid, conflict-free, event-selected range.
    const selectedVenue = venue!;
    const eventId = selectedRequestEvent!.id;
    setSubmitting(true);
    setRequestError("");
    try {
      const result = await api<{
        bookingReference: string;
        eventStatus?: string;
        statusChanged?: boolean;
      }>(
        `/venues/${encodeURIComponent(selectedVenue.id)}/booking-requests`,
        {
          method: "POST",
          body: JSON.stringify({
            eventId,
            specialRequests: specialRequests.trim() || undefined,
          }),
        },
      );
      setBookingReference(result.bookingReference);
      // SPM-148 AC1: the first request moved the event to Planning; reflect it without a reload.
      // SPM-148 PLAN-STATUS-01-A, 03-A: MSG-PL-01 and the store update only when the server reports the transition.
      if (result.statusChanged) {
        useAppStore.setState((state) => ({
          events: state.events.map((item) =>
            item.id === eventId ? { ...item, status: "planning" } : item,
          ),
        }));
        setMovedToPlanning(selectedRequestEvent!.name);
      } else {
        setMovedToPlanning("");
      }
      setSubmitted(true);
    } catch (failure) {
      setSubmitted(false);
      if (failure instanceof ApiError && failure.code === "duplicate_venue_request" && failure.bookingReference) {
        setExistingBookingReference(failure.bookingReference);
        setRequestError("");
      } else {
        setRequestError(
          failure instanceof ApiError
            ? failure.message
            : "Unable to submit the booking request. Try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

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
        <p>{detailError}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading(true);
            setRevision((value) => value + 1);
          }}
        >
          Try Again
        </Button>
      </div>
    );

  return (
    <div className="min-w-0 max-w-full">
      <PageHeader
        title={venue.name}
        description={venue.location}
        actions={
          <Link
            to={
              requestedEventId
                ? `/venues?eventId=${encodeURIComponent(requestedEventId)}`
                : "/venue-records"
            }
          >
            <Button variant="secondary">
              {requestedEventId ? "Back to Search Venues" : "Back To Venue Records"}
            </Button>
          </Link>
        }
      />
      {hasRole(user, "coordinator") && (
        <Card className="mb-4 min-w-0 max-w-full">
          <CardHeader>
            <h2 className="font-semibold">Venue availability</h2>
          </CardHeader>
          <CardBody className="min-w-0 space-y-4">
            {requestedEventId && requestedEventLoading && (
              <p role="status">Loading the selected event…</p>
            )}
            {requestedEventId && requestedEventError && (
              <div role="alert" className="flex items-center gap-3">
                <p>{requestedEventError}</p>
                <Button
                  variant="secondary"
                  onClick={() => setRequestedEventRevision((revision) => revision + 1)}
                >
                  Retry event
                </Button>
              </div>
            )}
            {requestedEvent && !selectedRequestEvent && (
              <p role="status">
                This event is not eligible for venue booking. Only approved or planning events can have requests.
                {" "}<Link className="underline" to="/events">Choose another event</Link>.
              </p>
            )}
            {!requestedEventId && (
              <p className="text-sm">
                Venue booking requests must be tied to an approved or planning event.{" "}
                <Link className="underline" to="/events">Choose an event first</Link>.
              </p>
            )}
            <p className="break-words text-sm">
              {selectedRequestEvent ? "This event's period comes from its saved event details. Availability includes" : "Enter the event start and end time. Availability includes"}{" "}
              {venue.setupTimeMinutes} minutes for setup and{" "}
              {venue.turnaroundTimeMinutes} minutes for turnaround. Schedule
              booking rows show event times; available gaps exclude those setup
              and turnaround periods.
            </p>
            <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" role="group" aria-label="Event time and availability">
              <label className="min-w-0 text-sm">
                Event starts
                <input
                  aria-label="Event starts"
                  type="datetime-local"
                  value={start}
                  onChange={(event) => { if (!selectedRequestEvent) setStart(event.target.value); }}
                  readOnly={selectedEventTimeReadOnly}
                  aria-readonly={selectedRequestEvent ? "true" : undefined}
                  className="mt-1 block box-border w-full min-w-0 max-w-full rounded-md border border-gray-300 bg-white p-2 dark:bg-gray-800"
                />
              </label>
              <label className="min-w-0 text-sm">
                Event ends
                <input
                  aria-label="Event ends"
                  type="datetime-local"
                  value={end}
                  onChange={(event) => { if (!selectedRequestEvent) setEnd(event.target.value); }}
                  readOnly={selectedEventTimeReadOnly}
                  aria-readonly={selectedRequestEvent ? "true" : undefined}
                  className="mt-1 block box-border w-full min-w-0 max-w-full rounded-md border border-gray-300 bg-white p-2 dark:bg-gray-800"
                />
              </label>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Availability view"
            >
              <Button
                variant={view === "calendar" ? "primary" : "secondary"}
                onClick={() => setView("calendar")}
              >
                Calendar
              </Button>
              <Button
                variant={view === "list" ? "primary" : "secondary"}
                onClick={() => setView("list")}
              >
                List
              </Button>
            </div>
            {activeReservations.length === 0 && venue.unavailablePeriods.length === 0 && (
              <p className="mb-3 text-sm">No bookings, active holds or unavailable periods.</p>
            )}
            <div hidden={view !== "calendar"}>
              <div role="region" aria-label="Venue schedule">
                <VenueScheduleCalendar
                  venue={scheduleVenue!}
                  initialDate={calendarDate || (scheduleItems[0] ? toSgtDateTimeLocal(scheduleItems[0].start).slice(0, 10) : "")}
                  selectedRange={validRange ? { start, end } : undefined}
                  onSelectRange={!selectedRequestEvent ? (rangeStart, rangeEnd) => {
                    const nextStart = toSgtDateTimeLocal(rangeStart.toISOString());
                    const nextEnd = toSgtDateTimeLocal(rangeEnd.toISOString());
                    setStart(nextStart);
                    setEnd(nextEnd);
                    setCalendarDate(nextStart.slice(0, 10));
                  } : undefined}
                  onClearSelection={!selectedRequestEvent ? () => {
                    setStart("");
                    setEnd("");
                  } : undefined}
                />
              </div>
            </div>
            <div hidden={view !== "list"}>
              <>
              <ul aria-label="Venue schedule" className="space-y-4">
                {scheduleItems.length ? (
                  Object.entries(
                    scheduleItems.reduce<Record<string, typeof scheduleItems>>((groups, item) => {
                      const date = toSgtDateTimeLocal(item.start).slice(0, 10);
                      (groups[date] ??= []).push(item);
                      return groups;
                    }, {}),
                  ).map(([date, items]) => (
                    <li key={date}>
                      <section aria-label={`Schedule for ${date}`}>
                        <h3 className="mb-2 font-semibold">{new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", dateStyle: "full" }).format(new Date(`${date}T12:00:00+08:00`))}</h3>
                        <ul className="grid gap-2 sm:grid-cols-2">
                          {items.map((item, index) => (
                            <li key={`${item.title}-${item.start}-${index}`} className="rounded-lg border bg-white p-3 text-sm shadow-sm dark:bg-gray-800">
                            <strong>{item.title}</strong>
                              <p>{formatVenueRange(item.start, item.end)}</p>
                            <p>{item.detail}</p>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </li>
                  ))
                ) : (
                  <li className="text-sm">No scheduled items for the selected range.</li>
                )}
              </ul>
              </>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              {checking
                ? "Checking the latest schedule…"
                : "Availability updates automatically when the event time changes. Submitting checks again on the server."}
            </p>
            {selectedRequestEvent && <section aria-label="Venue suitability assessment">
              <h3 className="font-semibold">Suitability assessment for {selectedRequestEvent.name}</h3>
              {suitabilityIssues.length > 0
                ? <div role="alert"><p>This venue does not meet the event requirements:</p><ul className="mt-2 space-y-1">{suitabilityIssues.map((issue) => <li key={issue} className="flex items-start gap-2"><span aria-hidden="true" className="shrink-0 font-semibold text-amber-600 dark:text-amber-400">⚠</span><span>{issue}</span></li>)}</ul></div>
                : <p aria-label="Suitability result">This venue meets the event's capacity, facility, accessibility, and layout requirements.</p>}
            </section>}
            {validRange &&
              (conflicts.length ? (
                <div role="alert">
                  <p>
                    This time is unavailable. Resolve the conflicts before
                    submitting a request.
                  </p>
                  <ul>
                    {conflicts.map((conflict, index) => (
                      <li key={`${conflict.label}-${index}`}>
                        {conflict.label}: {conflict.reason} (
                        {formatVenueRange(conflict.start, conflict.end)})
                        {conflict.holdExpiresAt
                          ? ` · hold expires ${formatVenueInstant(conflict.holdExpiresAt)}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div>
                  <p role="status">
                    {availabilityMessage}
                  </p>
                  {(submitted || existingBookingReference) && (
                    <section
                      aria-label={submitted ? "Booking request submitted" : "Existing booking request"}
                      className={`rounded-lg border p-4 ${submitted
                        ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
                        : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"}`}
                    >
                      <h3 className="font-semibold">{submitted ? "Request submitted" : "Request already exists"}</h3>
                      <p className="mt-1 text-sm">
                        {submitted
                          ? "Venue Staff will review your request."
                          : "A request already exists for this event and venue."}
                      </p>
                      <p className="mt-2 text-sm">
                        Booking reference: <strong>{submitted ? bookingReference : existingBookingReference}</strong>
                      </p>
                      <Link className="mt-2 inline-block underline" to="/bookings">View bookings</Link>
                    </section>
                  )}
                  {availabilityEstablished && selectedRequestEvent && !requestedEventLoading && !requestedEventError && suitabilityIssues.length === 0 && !existingBookingReference && !submitted && (
                      <section
                        aria-label="Booking request form"
                        className="space-y-3 rounded border p-4"
                      >
                        <h3 className="font-semibold">Venue booking request</h3>
                        <dl className="grid gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <dt>Venue</dt>
                            <dd>{venue.name}</dd>
                          </div>
                          <div>
                            <dt>Event</dt>
                            <dd>{selectedRequestEvent?.name}</dd>
                          </div>
                          <div>
                            <dt>Expected attendance</dt>
                            <dd>{selectedRequestEvent.expectedAttendance}</dd>
                          </div>
                          <div>
                            <dt>Event period</dt>
                            <dd>{formatVenueRange(start, end)}</dd>
                          </div>
                        </dl>
                        <p className="text-sm">
                          Submitting records a pending booking request for Venue Staff to review.
                        </p>
                        <label className="block text-sm">
                          Special requests (optional)
                          <textarea maxLength={2000} value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} className="mt-1 block w-full rounded-md border p-2" />
                        </label>
                        <Button
                          disabled={
                            submitting || submitted || !validRange || !availabilityEstablished ||
                            !selectedRequestEvent || suitabilityIssues.length > 0 || conflicts.length > 0
                          }
                          onClick={() => void submitRequest()}
                        >
                          {submitting ? "Submitting…" : "Submit booking request"}
                        </Button>
                      </section>
                  )}
                  {submitted && movedToPlanning && (
                    <p role="status">
                      Venue booking request submitted. {movedToPlanning} is now in Planning.
                    </p>
                  )}
                </div>
              ))}
            {requestError && <p role="alert">{requestError}</p>}
          </CardBody>
        </Card>
      )}
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
              <h2 className="font-semibold">Unavailable Periods</h2>
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
                Upcoming Bookings And Tentative Holds
              </h2>
            </CardHeader>
            <CardBody>
              {activeReservations.length === 0 ? (
                <p>No upcoming bookings or active tentative holds.</p>
              ) : (
                <ul className="space-y-3">
                  {activeReservations.map((reservation) => (
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
