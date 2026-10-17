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
  const [reviewingRequest, setReviewingRequest] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requestedEventRevision, setRequestedEventRevision] = useState(0);
  const [requestedEventLoading, setRequestedEventLoading] = useState(false);
  const [requestedEventError, setRequestedEventError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState(requestedEventId);
  const prefilledEventId = useRef("");
  const selectedRequestEvent = events.find(
    (event) => event.id === (selectedEventId || requestedEventId),
  ) ?? (requestedEventId ? undefined : events[0]);
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookingReference, setBookingReference] = useState("");
  const [movedToPlanning, setMovedToPlanning] = useState("");
  const [checking, setChecking] = useState(false);
  const validRange =
    Number.isFinite(parseRequestTime(start)) &&
    Number.isFinite(parseRequestTime(end)) &&
    parseRequestTime(start) < parseRequestTime(end);
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

    setSelectedEventId(requestedEventId);
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
    if (!requestedEventId || prefilledEventId.current === requestedEventId) return;
    const event = events.find((item) => item.id === requestedEventId);
    if (!event) return;
    prefilledEventId.current = event.id;
    setSelectedEventId(event.id);
    setStart(toSgtDateTimeLocal(event.startDateTime));
    setEnd(toSgtDateTimeLocal(event.endDateTime));
    setCalendarDate(toSgtDateTimeLocal(event.startDateTime).slice(0, 10));
    setReviewingRequest(false);
    setSubmitted(false);
  }, [requestedEventId, events]);

  async function refreshAvailability() {
    // The coordinator-only form renders this action only for a loaded venue and valid range.
    const selectedVenueId = id!;
    setChecking(true);
    setRequestError("");
    try {
      const fresh = await api<VenueRecord>(
        `/venues/${encodeURIComponent(selectedVenueId)}`,
      );
      setVenue(fresh);
      setReviewingRequest(false);
      setSubmitted(false);
    } catch (failure) {
      setReviewingRequest(false);
      setRequestError(
        failure instanceof ApiError
          ? failure.message
          : "Unable to refresh venue availability. Try again.",
      );
    } finally {
      setChecking(false);
    }
  }

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
            start: sgtLocalDateTimeToDate(start).toISOString(),
            end: sgtLocalDateTimeToDate(end).toISOString(),
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
      setReviewingRequest(false);
      setRequestError(
        failure instanceof ApiError
          ? failure.message
          : "Unable to submit the booking request. Try again.",
      );
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
    <div>
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
        <Card className="mb-4">
          <CardHeader>
            <h2 className="font-semibold">Venue availability</h2>
          </CardHeader>
          <CardBody className="space-y-4">
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
            <p className="text-sm">
              Enter the event start and end time. Availability includes{" "}
              {venue.setupTimeMinutes} minutes for setup and{" "}
              {venue.turnaroundTimeMinutes} minutes for turnaround. Schedule
              booking rows show event times; available gaps exclude those setup
              and turnaround periods.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Event starts
                <input
                  aria-label="Event starts"
                  type="datetime-local"
                  value={start}
                  onChange={(event) => {
                    setStart(event.target.value);
                    if (event.target.value) setCalendarDate(event.target.value.slice(0, 10));
                    setReviewingRequest(false);
                    setSubmitted(false);
                    setRequestError("");
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 dark:bg-gray-800"
                />
              </label>
              <label className="text-sm">
                Event ends
                <input
                  aria-label="Event ends"
                  type="datetime-local"
                  value={end}
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setReviewingRequest(false);
                    setSubmitted(false);
                    setRequestError("");
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 dark:bg-gray-800"
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
                  onSelectRange={(rangeStart, rangeEnd) => {
                    const nextStart = toSgtDateTimeLocal(rangeStart.toISOString());
                    const nextEnd = toSgtDateTimeLocal(rangeEnd.toISOString());
                    setStart(nextStart);
                    setEnd(nextEnd);
                    setCalendarDate(nextStart.slice(0, 10));
                    setReviewingRequest(false);
                    setSubmitted(false);
                    setRequestError("");
                  }}
                  onClearSelection={() => {
                    setStart("");
                    setEnd("");
                    setReviewingRequest(false);
                    setSubmitted(false);
                    setRequestError("");
                  }}
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
              Availability reflects the displayed schedule. You can refresh the schedule; submitting also checks again on the server.
            </p>
            <Button
              disabled={!validRange || checking}
              onClick={() => void refreshAvailability()}
            >
              {checking ? "Refreshing schedule…" : "Refresh schedule"}
            </Button>
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
                  <p role="status">This time is available for this venue.</p>
                  {events.length ? (
                    reviewingRequest ? (
                      <section
                        aria-label="Review booking request"
                        className="space-y-3 rounded border p-4"
                      >
                        <h3 className="font-semibold">Review booking request</h3>
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
                            <dd>{selectedRequestEvent?.expectedAttendance}</dd>
                          </div>
                          <div>
                            <dt>Event period</dt>
                            <dd>{formatVenueRange(start, end)}</dd>
                          </div>
                        </dl>
                        <p className="text-sm">
                          Submitting records a pending booking request for Venue Staff to review.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            disabled={submitting || submitted}
                            onClick={() => setReviewingRequest(false)}
                          >
                            Back to availability
                          </Button>
                          <Button
                            disabled={submitting || submitted}
                            onClick={() => void submitRequest()}
                          >
                            {submitting ? "Submitting…" : "Submit booking request"}
                          </Button>
                        </div>
                      </section>
                    ) : (
                      <div className="space-y-2">
                        <label
                          htmlFor="availability-event"
                          className="block text-sm"
                        >
                          Event for booking request
                        </label>
                        <select
                          id="availability-event"
                          aria-label="Event for booking request"
                          value={selectedRequestEvent?.id ?? ""}
                          className="mt-1 block w-full rounded-md border p-2"
                          onChange={(event) => {
                            const nextEvent = events.find((item) => item.id === event.target.value);
                            setSelectedEventId(event.target.value);
                            if (nextEvent) {
                              const nextStart = toSgtDateTimeLocal(nextEvent.startDateTime);
                              const nextEnd = toSgtDateTimeLocal(nextEvent.endDateTime);
                              if (nextStart !== start || nextEnd !== end) {
                                setStart(nextStart);
                                setEnd(nextEnd);
                                setCalendarDate(nextStart.slice(0, 10));
                                setReviewingRequest(false);
                                setSubmitted(false);
                              }
                            }
                            setReviewingRequest(false);
                            setSubmitted(false);
                          }}
                        >
                          {!selectedRequestEvent && <option value="">Choose an event…</option>}
                          {events.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          disabled={!selectedRequestEvent}
                          onClick={() => {
                            setRequestError("");
                            setReviewingRequest(true);
                          }}
                        >
                          Continue to booking request
                        </Button>
                      </div>
                    )
                  ) : (
                    <p>
                      Choose an event in the venue catalogue to submit a booking
                      request.
                    </p>
                  )}
                  {submitted && (
                    <p role="status">
                      Booking request submitted. Reference: {bookingReference}.
                    </p>
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
