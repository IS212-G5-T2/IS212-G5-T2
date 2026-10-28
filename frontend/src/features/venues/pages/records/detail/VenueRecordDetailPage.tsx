import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
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

type CoordinatorVenueBooking = {
  id: string;
  eventId: string;
  eventName: string;
  venueId: string;
  venueName: string;
  start: string;
  end: string;
  status: string;
  requestKind?: "booking" | "tentative_hold";
  holdExpiresAt?: string;
  specialRequest?: string;
  bookingReference: string;
};

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
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function formatVenueOccupiedRange(
  start: string,
  end: string,
  setupMinutes: number,
  turnaroundMinutes: number,
): string {
  const occupiedStart =
    sgtLocalDateTimeToDate(start).getTime() - setupMinutes * 60_000;
  const occupiedEnd =
    sgtLocalDateTimeToDate(end).getTime() + turnaroundMinutes * 60_000;
  return formatVenueRange(
    new Date(occupiedStart).toISOString(),
    new Date(occupiedEnd).toISOString(),
  );
}

/** Provides a stable detail-page error even when the record is absent without a transport error. */
export function getVenueDetailErrorMessage(
  error: string,
  venue: VenueRecord | undefined,
): string {
  return error || (!venue ? "Venue not found." : "");
}

/** Returns only failed suitability checks; equality at capacity is suitable. */
export function getVenueSuitabilityMismatches(
  venue: VenueRecord,
  event: EventRecord,
): string[] {
  const needs = event.venueRequirements;
  return [
    ...needs.facilities
      .filter((item) => !venue.facilities.includes(item))
      .map((item) => `Missing facility: ${item}.`),
    ...needs.accessibility
      .filter((item) => !venue.accessibility.includes(item))
      .map((item) => `Missing accessibility feature: ${item}.`),
    ...(needs.layout && !venue.layouts.includes(needs.layout)
      ? [`Required layout unavailable: ${needs.layout}.`]
      : []),
  ];
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
  const canCoordinate = Boolean(user && hasRole(user, "coordinator"));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [view, setView] = useState<"calendar" | "list">(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 639px)").matches
      ? "list"
      : "calendar",
  );
  const [calendarDate, setCalendarDate] = useState("");
  const [availabilityNow, setAvailabilityNow] = useState(() => Date.now());
  const [submitted, setSubmitted] = useState(false);
  const [requestedEventRevision, setRequestedEventRevision] = useState(0);
  const [requestedEventLoading, setRequestedEventLoading] = useState(false);
  const [requestedEventError, setRequestedEventError] = useState("");
  const prefilledEventId = useRef("");
  const selectedRequestEvent = requestedEventId
    ? events.find((event) => event.id === requestedEventId)
    : undefined;
  const bookingMode = Boolean(
    canCoordinate &&
    requestedEventId &&
    selectedRequestEvent &&
    !requestedEventLoading &&
    !requestedEventError,
  );
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [holdPrompt, setHoldPrompt] = useState(false);
  const [requestHolding, setRequestHolding] = useState(false);
  const [holdError, setHoldError] = useState("");
  const [bookingReference, setBookingReference] = useState("");
  const [specialRequest, setSpecialRequest] = useState("");
  const [eventVenueBooking, setEventVenueBooking] =
    useState<CoordinatorVenueBooking>();
  const [bookingSummaryLoading, setBookingSummaryLoading] = useState(true);
  const [bookingSummaryError, setBookingSummaryError] = useState("");
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [cancelNeedsLastWarning, setCancelNeedsLastWarning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const activeEventVenueBooking =
    eventVenueBooking &&
    (eventVenueBooking.status === "pending" ||
      eventVenueBooking.status === "approved")
      ? eventVenueBooking
      : undefined;
  const submittedRequestMessage =
    eventVenueBooking?.requestKind === "tentative_hold"
      ? `Tentative hold request submitted for Venue Staff approval. The hold is not active yet. Reference: ${bookingReference}.`
      : `Booking request submitted. Reference: ${bookingReference}.`;
  const [movedToPlanning, setMovedToPlanning] = useState("");
  const [checking, setChecking] = useState(false);
  const validRange =
    Number.isFinite(parseRequestTime(start)) &&
    Number.isFinite(parseRequestTime(end)) &&
    parseRequestTime(start) < parseRequestTime(end);
  const suitabilityMismatches =
    bookingMode && validRange && venue && selectedRequestEvent
      ? getVenueSuitabilityMismatches(venue, selectedRequestEvent)
      : [];
  const activeReservations = useMemo(
    () =>
      (venue?.reservations ?? []).filter(
        (reservation) =>
          reservation.status === "booked" ||
          Date.parse(reservation.holdExpiresAt) > availabilityNow,
      ),
    [venue, availabilityNow],
  );
  const scheduleVenue = useMemo(
    () => (venue ? { ...venue, reservations: activeReservations } : undefined),
    [venue, activeReservations],
  );
  const conflicts = useMemo(
    () =>
      scheduleVenue ? checkVenueAvailability(scheduleVenue, start, end) : [],
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
    if (validRange)
      items.push({
        title: "Selected event time",
        start: sgtLocalDateTimeToDate(start).toISOString(),
        end: sgtLocalDateTimeToDate(end).toISOString(),
        detail: "Requested event time · check availability to confirm.",
      });
    if (validRange)
      items.push(
        ...getFreeVenueIntervals(scheduleVenue!, start, end).map(
          (interval) => ({
            title: "Available slot",
            ...interval,
            detail: "Available",
          }),
        ),
      );
    return items.sort(
      (left, right) => Date.parse(left.start) - Date.parse(right.start),
    );
  }, [venue, scheduleVenue, activeReservations, validRange, start, end]);
  const detailError = getVenueDetailErrorMessage(error, venue);

  useEffect(() => {
    if (!canCoordinate || !requestedEventId || !bookingMode) {
      setEventVenueBooking(undefined);
      setBookingSummaryLoading(false);
      setBookingSummaryError("");
      return;
    }
    if (!venue?.id) {
      setEventVenueBooking(undefined);
      setBookingSummaryLoading(true);
      setBookingSummaryError("");
      return;
    }
    let active = true;
    setBookingSummaryLoading(true);
    setBookingSummaryError("");
    api<CoordinatorVenueBooking[]>("/venues/bookings/mine")
      .then(
        (rows) => {
          if (active) {
            setEventVenueBooking(
              Array.isArray(rows)
                ? rows.find(
                    (row) =>
                      row.eventId === requestedEventId &&
                      row.venueId === venue.id &&
                      (row.status === "pending" ||
                        (row.status === "approved" &&
                          (row.requestKind !== "tentative_hold" ||
                            !row.holdExpiresAt ||
                            Date.parse(row.holdExpiresAt) > availabilityNow))),
                  )
                : undefined,
            );
            if (!Array.isArray(rows))
              setBookingSummaryError(
                "Unable to verify an existing request for this event and venue. Retry before submitting.",
              );
          }
        },
        () => {
          if (active)
            setBookingSummaryError(
              "Unable to verify an existing request for this event and venue. Retry before submitting.",
            );
        },
      )
      .finally(() => {
        if (active) setBookingSummaryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canCoordinate, requestedEventId, venue?.id, bookingMode, revision, availabilityNow]);

  async function cancelEventVenueBooking(confirmed = false) {
    if (!eventVenueBooking) return;
    setCancelling(true);
    setRequestError("");
    try {
      await api(
        `/venues/bookings/${encodeURIComponent(eventVenueBooking.id)}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({ confirmed }),
        },
      );
      setEventVenueBooking({ ...eventVenueBooking, status: "cancelled" });
      setCancelPrompt(false);
      setCancelNeedsLastWarning(false);
      setRevision((value) => value + 1);
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.code === "LAST_ACTIVE_VENUE_BOOKING"
      )
        setCancelNeedsLastWarning(true);
      else
        setRequestError(
          failure instanceof Error
            ? failure.message
            : "Unable to cancel this booking.",
        );
    } finally {
      setCancelling(false);
    }
  }

  useEffect(() => {
    const nextExpiry = (venue?.reservations ?? [])
      .flatMap((reservation) =>
        reservation.status === "tentative"
          ? [Date.parse(reservation.holdExpiresAt)]
          : [],
      )
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
    if (!requestedEventId || !canCoordinate) {
      setRequestedEventLoading(false);
      setRequestedEventError("");
      setStart("");
      setEnd("");
      setSubmitted(false);
      return;
    }

    if (
      useAppStore
        .getState()
        .events.some((event) => event.id === requestedEventId)
    ) {
      setRequestedEventLoading(false);
      setRequestedEventError("");
      return;
    }

    let active = true;
    setRequestedEventLoading(true);
    setRequestedEventError("");
    api<EventRecord>(`/events/${encodeURIComponent(requestedEventId)}`)
      .then(
        (event) => {
          if (active) {
            useAppStore.setState((state) => ({
              events: [
                event,
                ...state.events.filter((item) => item.id !== event.id),
              ],
            }));
          }
        },
        (failure: unknown) => {
          if (active) {
            setRequestedEventError(
              failure instanceof ApiError && failure.status === 404
                ? "This event is not available to your Coordinator account."
                : "Unable to load this event for your Coordinator account. Retry to continue.",
            );
          }
        },
      )
      .finally(() => {
        if (active) setRequestedEventLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestedEventId, requestedEventRevision, canCoordinate]);

  useEffect(() => {
    if (
      !canCoordinate ||
      !requestedEventId ||
      prefilledEventId.current === requestedEventId
    )
      return;
    const event = events.find((item) => item.id === requestedEventId);
    if (!event) return;
    prefilledEventId.current = event.id;
    setStart(toSgtDateTimeLocal(event.startDateTime));
    setEnd(toSgtDateTimeLocal(event.endDateTime));
    setCalendarDate(toSgtDateTimeLocal(event.startDateTime).slice(0, 10));
    setSubmitted(false);
  }, [canCoordinate, requestedEventId, events]);

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
      setSubmitted(false);
    } catch (failure) {
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
        id: string;
        bookingReference: string;
        eventStatus?: string;
        statusChanged?: boolean;
      }>(`/venues/${encodeURIComponent(selectedVenue.id)}/booking-requests`, {
        method: "POST",
        body: JSON.stringify({
          eventId,
          start: sgtLocalDateTimeToDate(start).toISOString(),
          end: sgtLocalDateTimeToDate(end).toISOString(),
          ...(specialRequest.trim()
            ? { specialRequest: specialRequest.trim() }
            : {}),
        }),
      });
      setBookingReference(result.bookingReference);
      setEventVenueBooking({
        id: result.id,
        eventId,
        eventName: selectedRequestEvent!.name,
        venueId: selectedVenue.id,
        venueName: selectedVenue.name,
        start: sgtLocalDateTimeToDate(start).toISOString(),
        end: sgtLocalDateTimeToDate(end).toISOString(),
        status: "pending",
        specialRequest: specialRequest.trim() || undefined,
        bookingReference: result.bookingReference,
      });
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
      setRequestError(
        failure instanceof ApiError
          ? failure.message
          : "Unable to submit the booking request. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** VEN-HOLD-05-A: submit an assigned coordinator's hold request for the persisted event interval. */
  async function submitTentativeHoldRequest() {
    if (!venue || !selectedRequestEvent || !bookingMode) return;
    setHoldSubmitting(true);
    setHoldError("");
    setSubmitted(false);
    try {
      const result = await api<{
        id: string;
        start: string;
        end: string;
        bookingReference: string;
        specialRequest?: string;
      }>(`/venues/${encodeURIComponent(venue.id)}/booking-requests`, {
        method: "POST",
        body: JSON.stringify({
          eventId: selectedRequestEvent.id,
          request_kind: "tentative_hold",
          ...(specialRequest.trim()
            ? { specialRequest: specialRequest.trim() }
            : {}),
        }),
      });
      setBookingReference(result.bookingReference);
      setEventVenueBooking({
        id: result.id,
        eventId: selectedRequestEvent.id,
        eventName: selectedRequestEvent.name,
        venueId: venue.id,
        venueName: venue.name,
        start: result.start,
        end: result.end,
        status: "pending",
        requestKind: "tentative_hold",
        specialRequest: result.specialRequest,
        bookingReference: result.bookingReference,
      });
      setSubmitted(true);
      setHoldPrompt(false);
    } catch (failure) {
      setHoldError(
        failure instanceof ApiError || failure instanceof Error
          ? failure.message
          : "Unable to submit the tentative hold request. Try again.",
      );
    } finally {
      setHoldSubmitting(false);
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
              {requestedEventId
                ? "Back to Search Venues"
                : "Back To Venue Records"}
            </Button>
          </Link>
        }
      />
      {user && (
        <Card className="mb-4">
          <CardHeader>
            <h2 className="font-semibold">Venue schedule</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {requestedEventId && requestedEventLoading && (
              <p role="status">Loading the selected event…</p>
            )}
            {requestedEventId && canCoordinate && requestedEventError && (
              <div role="alert" className="flex items-center gap-3">
                <p>{requestedEventError}</p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setRequestedEventRevision((revision) => revision + 1)
                  }
                >
                  Retry event
                </Button>
              </div>
            )}
            {bookingMode && selectedRequestEvent && (
              <>
                <p className="text-sm" aria-label="Booking event context">
                  Booking for <strong>{selectedRequestEvent.name}</strong>.
                  Availability includes {venue.setupTimeMinutes} minutes for
                  setup and {venue.turnaroundTimeMinutes} minutes for
                  turnaround.
                </p>
                {bookingSummaryLoading && (
                  <p role="status">Checking for an existing booking request…</p>
                )}
                {bookingSummaryError && (
                  <p role="alert">{bookingSummaryError}</p>
                )}
                {activeEventVenueBooking && (
                  <section
                    aria-label="Existing venue booking request"
                    className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          Existing request for{" "}
                          {activeEventVenueBooking.eventName}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          Reference {activeEventVenueBooking.bookingReference} ·{" "}
                          <span className="capitalize">
                            {activeEventVenueBooking.status}
                          </span>
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold capitalize text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                        {activeEventVenueBooking.status}
                      </span>
                    </div>
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="font-medium">Venue</dt>
                        <dd>{activeEventVenueBooking.venueName}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">
                          Date and time (Singapore)
                        </dt>
                        <dd>
                          {formatVenueRange(
                            activeEventVenueBooking.start,
                            activeEventVenueBooking.end,
                          )}
                        </dd>
                      </div>
                      {activeEventVenueBooking.specialRequest && (
                        <div className="sm:col-span-2">
                          <dt className="font-medium">Special request</dt>
                          <dd>{activeEventVenueBooking.specialRequest}</dd>
                        </div>
                      )}
                    </dl>
                    {activeEventVenueBooking.requestKind === "tentative_hold" &&
                      activeEventVenueBooking.status === "pending" && (
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Tentative hold request pending Venue Staff approval; the
                        venue is not held yet.
                      </p>
                    )}
                    {activeEventVenueBooking.requestKind === "tentative_hold" &&
                      activeEventVenueBooking.status === "approved" &&
                      activeEventVenueBooking.holdExpiresAt && (
                        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                          Tentative hold approved and active until{" "}
                          {formatVenueInstant(activeEventVenueBooking.holdExpiresAt)}.
                        </p>
                      )}
                    {submitted && (
                      <p role="status">
                        {submittedRequestMessage}
                      </p>
                    )}
                    {submitted && movedToPlanning && (
                      <p role="status">
                        Venue booking request submitted. {movedToPlanning} is
                        now in Planning.
                      </p>
                    )}
                    <button
                      type="button"
                      className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-800 dark:text-red-300"
                      onClick={() => {
                        setCancelNeedsLastWarning(false);
                        setCancelPrompt(true);
                      }}
                    >
                      Cancel booking
                    </button>
                  </section>
                )}
                {!bookingSummaryLoading &&
                  !bookingSummaryError &&
                  !activeEventVenueBooking && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm">
                        Event starts
                        <input
                          aria-label="Event starts"
                          type="datetime-local"
                          value={start}
                          readOnly
                          aria-readonly="true"
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 dark:bg-gray-800"
                        />
                      </label>
                      <label className="text-sm">
                        Event ends
                        <input
                          aria-label="Event ends"
                          type="datetime-local"
                          value={end}
                          readOnly
                          aria-readonly="true"
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 dark:bg-gray-800"
                        />
                      </label>
                    </div>
                  )}
              </>
            )}
            {bookingMode && (
              <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Schedule availability may change. Refresh to check the latest
                  schedule; we also verify again when you submit.
                </p>
                <Button
                  disabled={!validRange || checking}
                  onClick={() => void refreshAvailability()}
                >
                  {checking ? "Refreshing schedule…" : "Refresh schedule"}
                </Button>
              </div>
            )}
            {bookingMode && validRange && (
              <div
                aria-label="Venue suitability"
                role={suitabilityMismatches.length ? "alert" : "status"}
                className={`rounded-lg border p-4 ${
                  suitabilityMismatches.length
                    ? "border-warning-300 bg-warning-50 dark:border-warning-700 dark:bg-warning-900/20"
                    : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`text-lg ${
                      suitabilityMismatches.length
                        ? "text-warning-600 dark:text-warning-400"
                        : "text-green-700 dark:text-green-400"
                    }`}
                  >
                    {suitabilityMismatches.length ? "⚠" : "✓"}
                  </span>
                  <strong>
                    {suitabilityMismatches.length
                      ? "Suitability needs review"
                      : "Suitable for this event"}
                  </strong>
                </div>
                {suitabilityMismatches.length ? (
                  <ul className="space-y-1 pl-7 text-sm">
                    {suitabilityMismatches.map((mismatch) => (
                      <li key={mismatch}>
                        <span
                          aria-hidden="true"
                          className="mr-2 text-warning-600 dark:text-warning-400"
                        >
                          ⚠
                        </span>
                        {mismatch}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pl-7 text-sm text-gray-700 dark:text-gray-200">
                    Capacity, facilities, accessibility, and room layout match
                    this event.
                  </p>
                )}
              </div>
            )}
            {bookingMode &&
              !bookingSummaryLoading &&
              !bookingSummaryError &&
              !activeEventVenueBooking &&
              validRange &&
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
                  {selectedRequestEvent && !activeEventVenueBooking && (
                    <section
                      aria-label="Review booking request"
                      className="space-y-3 rounded border p-4"
                    >
                      <h3 className="font-semibold">
                        Booking request for {selectedRequestEvent.name}
                      </h3>
                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt>Venue</dt>
                          <dd>{venue.name}</dd>
                        </div>
                        <div>
                          <dt>Event</dt>
                          <dd>{selectedRequestEvent.name}</dd>
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
                      <label
                        className="block text-sm"
                        htmlFor="booking-special-request"
                      >
                        Special requests (optional)
                      </label>
                      <textarea
                        id="booking-special-request"
                        maxLength={1000}
                        value={specialRequest}
                        onChange={(event) =>
                          setSpecialRequest(event.target.value)
                        }
                        className="block w-full rounded-md border p-2"
                      />
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={requestHolding}
                          disabled={holdSubmitting || submitted}
                          onChange={(event) => setRequestHolding(event.target.checked)}
                        />
                        <span>
                          <span className="font-medium">Request holding</span>
                          <span className="block text-gray-600 dark:text-gray-300">
                            Ask Venue Staff to place a tentative hold instead of submitting a booking request.
                          </span>
                        </span>
                      </label>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          disabled={requestHolding
                            ? holdSubmitting || submitted
                            : submitting || submitted}
                          onClick={() => {
                            if (requestHolding) {
                              setHoldError("");
                              setHoldPrompt(true);
                            } else {
                              void submitRequest();
                            }
                          }}
                        >
                          {requestHolding
                            ? holdSubmitting
                              ? "Submitting hold request…"
                              : "Submit booking request"
                            : submitting
                              ? "Submitting…"
                              : "Submit booking request"}
                        </Button>
                      </div>
                    </section>
                  )}
                  {submitted && (
                    <p role="status">
                      {submittedRequestMessage}
                    </p>
                  )}
                  {submitted && movedToPlanning && (
                    <p role="status">
                      Venue booking request submitted. {movedToPlanning} is now
                      in Planning.
                    </p>
                  )}
                </div>
              ))}
            {requestError && <p role="alert">{requestError}</p>}
            <Modal
              open={holdPrompt}
              onClose={() => {
                if (!holdSubmitting) setHoldPrompt(false);
              }}
              title="Confirm tentative hold request"
              footer={
                <>
                  <Button
                    variant="secondary"
                    disabled={holdSubmitting}
                    onClick={() => setHoldPrompt(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={holdSubmitting}
                    onClick={() => void submitTentativeHoldRequest()}
                  >
                    {holdSubmitting
                      ? "Submitting hold request…"
                      : holdError
                        ? "Retry request"
                        : "Confirm request"}
                  </Button>
                </>
              }
            >
              {selectedRequestEvent && venue && (
                <div className="space-y-3 text-sm">
                  {holdError && (
                    <div
                      role="alert"
                      className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                    >
                      <p className="font-semibold">Request not submitted</p>
                      <p>{holdError}</p>
                    </div>
                  )}
                  <p>
                    This request uses the event’s scheduled time and this venue’s
                    {` ${venue.setupTimeMinutes}-minute setup and ${venue.turnaroundTimeMinutes}-minute turnaround`}.
                    If Venue Staff approves it, the hold lasts 14 days (336
                    hours) from approval.
                  </p>
                  <p>
                    Event time: {formatVenueRange(
                      selectedRequestEvent.startDateTime,
                      selectedRequestEvent.endDateTime,
                    )}.
                  </p>
                  <p>
                    Venue occupied period, including setup and turnaround: {formatVenueOccupiedRange(
                      toSgtDateTimeLocal(selectedRequestEvent.startDateTime),
                      toSgtDateTimeLocal(selectedRequestEvent.endDateTime),
                      venue.setupTimeMinutes,
                      venue.turnaroundTimeMinutes,
                    )}.
                  </p>
                  <p>
                    Confirming submits this request for Pending Venue Staff
                    review; it does not make the venue hold active.
                  </p>
                </div>
              )}
            </Modal>
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
            {activeReservations.length === 0 &&
              venue.unavailablePeriods.length === 0 && (
                <p className="mb-3 text-sm">
                  No bookings, active holds or unavailable periods.
                </p>
              )}
            <div hidden={view !== "calendar"}>
              <div role="region" aria-label="Venue schedule">
                <VenueScheduleCalendar
                  venue={scheduleVenue!}
                  initialDate={
                    calendarDate ||
                    (selectedRequestEvent
                      ? toSgtDateTimeLocal(
                          selectedRequestEvent.startDateTime,
                        ).slice(0, 10)
                      : toSgtDateTimeLocal(new Date().toISOString()).slice(
                          0,
                          10,
                        ))
                  }
                  selectedRange={
                    bookingMode && validRange ? { start, end } : undefined
                  }
                  onSelectRange={undefined}
                  onClearSelection={undefined}
                />
              </div>
            </div>
            <div hidden={view !== "list"}>
              <>
                <ul aria-label="Venue schedule" className="space-y-4">
                  {scheduleItems.length ? (
                    Object.entries(
                      scheduleItems.reduce<
                        Record<string, typeof scheduleItems>
                      >((groups, item) => {
                        const date = toSgtDateTimeLocal(item.start).slice(
                          0,
                          10,
                        );
                        (groups[date] ??= []).push(item);
                        return groups;
                      }, {}),
                    ).map(([date, items]) => (
                      <li key={date}>
                        <section aria-label={`Schedule for ${date}`}>
                          <h3 className="mb-2 font-semibold">
                            {new Intl.DateTimeFormat("en-SG", {
                              timeZone: "Asia/Singapore",
                              dateStyle: "full",
                            }).format(new Date(`${date}T12:00:00+08:00`))}
                          </h3>
                          <ul className="grid gap-2 sm:grid-cols-2">
                            {items.map((item, index) => (
                              <li
                                key={`${item.title}-${item.start}-${index}`}
                                className="rounded-lg border bg-white p-3 text-sm shadow-sm dark:bg-gray-800"
                              >
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
                    <li className="text-sm">
                      No scheduled items for the selected range.
                    </li>
                  )}
                </ul>
              </>
            </div>
            {cancelPrompt && eventVenueBooking && (
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="venue-booking-cancel-title"
                className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
              >
                <section className="w-full max-w-md rounded-lg bg-white p-4 text-gray-900 shadow-xl dark:bg-gray-800 dark:text-gray-100 sm:p-6 sm:dark:bg-gray-800 sm:dark:text-gray-100">
                  <h2 id="venue-booking-cancel-title" className="font-semibold">
                    {cancelNeedsLastWarning
                      ? "Cancel the last active venue booking?"
                      : "Cancel this venue booking?"}
                  </h2>
                  <p className="mt-2 text-sm">
                    {cancelNeedsLastWarning
                      ? "This event will have no pending or approved venue booking. You can search for a replacement afterwards."
                      : `Cancel the request for ${eventVenueBooking.venueName}? Its history will remain visible as Cancelled.`}
                  </p>
                  <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      className="w-full rounded-md border px-3 py-2 sm:w-auto"
                      disabled={cancelling}
                      onClick={() => {
                        setCancelPrompt(false);
                        setCancelNeedsLastWarning(false);
                      }}
                    >
                      Keep booking
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-md bg-red-700 px-3 py-2 font-medium text-white disabled:opacity-60 sm:w-auto"
                      disabled={cancelling}
                      onClick={() =>
                        void cancelEventVenueBooking(cancelNeedsLastWarning)
                      }
                    >
                      {cancelling ? "Cancelling…" : "Confirm cancellation"}
                    </button>
                  </div>
                </section>
              </div>
            )}
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
                      {reservation.status === "tentative" && reservation.holdExpiresAt && (
                        <>
                          <br />
                          Hold expires {formatVenueInstant(reservation.holdExpiresAt)}
                        </>
                      )}
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
