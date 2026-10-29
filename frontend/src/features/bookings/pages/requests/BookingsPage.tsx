import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/FormControls";
import { BookingCard } from "@/features/bookings/pages/requests/BookingCard";
import { formatSingaporeDateTime, formatSingaporeRange } from "@/utils/format";
import { BookingDetailModal } from "@/features/bookings/pages/requests/BookingDetailModal";
import type { Booking, PendingBookingRequest, VenueBookingConflict } from "@/types";

import { api, ApiError } from "@/utils/api";
import { hasRole } from "@/types";

type CoordinatorBooking = Pick<
  Booking,
  | "id"
  | "eventId"
  | "eventName"
  | "venueId"
  | "venueName"
  | "start"
  | "end"
  | "createdAt"
> & {
  status: string;
  bookingReference: string;
  specialRequest?: string;
  requestKind: "booking" | "tentative_hold";
  holdExpiresAt?: string;
  holdExpired: boolean;
  affected: boolean;
  venueStaffName?: string;
  rejectionReason?: string;
};

function coordinatorHoldLabel(booking: CoordinatorBooking): string | null {
  if (booking.requestKind !== "tentative_hold") return null;
  if (booking.status === "pending")
    return "Tentative hold request pending Venue Staff approval. The hold is not active.";
  if (booking.status !== "approved" || !booking.holdExpiresAt) return null;
  return `${booking.holdExpired ? "Expired tentative hold" : "Active tentative hold"} until ${formatSingaporeDateTime(booking.holdExpiresAt)}.`;
}

export function BookingsPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const staff = hasRole(currentUser, "venue_staff");
  const [staffStatusFilter, setStaffStatusFilter] = useState("pending");
  const [coordinatorStatusFilter, setCoordinatorStatusFilter] = useState("");
  const [selected, setSelected] = useState<PendingBookingRequest | null>(null);
  const [staffBookings, setStaffBookings] = useState<PendingBookingRequest[]>([]);
  const [coordinatorBookings, setCoordinatorBookings] = useState<
    CoordinatorBooking[]
  >([]);
  // Each section owns its own error so one section's load result never clears the other's message.
  const [staffError, setStaffError] = useState("");
  const [coordError, setCoordError] = useState("");
  const [confirmation, setConfirmation] = useState<CoordinatorBooking | null>(
    null,
  );
  const [lastActiveConfirmation, setLastActiveConfirmation] = useState(false);
  const [conflictAlert, setConflictAlert] = useState<{ message: string; conflicts?: VenueBookingConflict[] } | null>(null);
  const coordinator = hasRole(currentUser, "coordinator");

  useEffect(() => {
    if (!coordinator) return;
    api<CoordinatorBooking[]>("/venues/bookings/mine")
      .then(setCoordinatorBookings)
      .catch(() => setCoordError("Unable to load your venue bookings."));
  }, [coordinator]);

  /** SPM-55 AC1: loads all pending/approved/rejected requests for the venues this Venue Staff member owns. */
  const loadPendingRequests = useCallback(() => {
    api<PendingBookingRequest[]>("/venues/bookings/pending")
      .then((rows) => {
        setStaffError("");
        setStaffBookings(rows);
      })
      .catch(() => setStaffError("Unable to load pending booking requests."));
  }, []);

  useEffect(() => {
    if (!staff) return;
    loadPendingRequests();
  }, [staff, loadPendingRequests]);

  async function cancelBooking(booking: CoordinatorBooking, confirmed = false) {
    setCoordError("");
    try {
      await api(`/venues/bookings/${encodeURIComponent(booking.id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ confirmed }),
      });
      setCoordinatorBookings((rows) =>
        rows.map((row) =>
          row.id === booking.id ? { ...row, status: "cancelled" } : row,
        ),
      );
      setConfirmation(null);
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.code === "LAST_ACTIVE_VENUE_BOOKING"
      ) {
        setConfirmation(booking);
        setLastActiveConfirmation(true);
      } else
        setCoordError(
          failure instanceof Error
            ? failure.message
            : "Unable to cancel this booking.",
        );
    }
  }

  const coordinatorFiltered = useMemo(
    () =>
      coordinatorBookings
        .filter((booking) => !coordinatorStatusFilter || booking.status === coordinatorStatusFilter)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [coordinatorBookings, coordinatorStatusFilter],
  );
  const coordinatorGroups = useMemo(() => {
    const groups = new Map<string, CoordinatorBooking[]>();
    for (const item of coordinatorFiltered) {
      const group = groups.get(item.eventId) ?? [];
      group.push(item);
      groups.set(item.eventId, group);
    }
    return [...groups.entries()].map(([eventId, items]) => ({
      eventId,
      eventName: items[0].eventName,
      items,
    }));
  }, [coordinatorFiltered]);
  const staffFiltered = useMemo(
    () => staffBookings.filter((b) => !staffStatusFilter || b.status === staffStatusFilter),
    [staffBookings, staffStatusFilter],
  );

  const emptyState = (
    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
      No bookings match this filter.
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Venue Booking Requests"
        description={
          staff
            ? "Review venue booking requests and resolve scheduling conflicts."
            : "Track and manage the venue requests you've submitted."
        }
      />

      {staffError && <p role="alert">{staffError}</p>}
      {coordError && <p role="alert">{coordError}</p>}
      {/* A user with both roles (e.g. Coor_Venue) sees the staff review list and the coordinator bookings. */}
      {staff && (
        <>
          <div className="mb-4 max-w-xs">
            <Select
              label="Status filter"
              value={staffStatusFilter}
              onChange={(e) => setStaffStatusFilter(e.target.value)}
              options={[
                { value: "", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ]}
            />
          </div>
          {staffFiltered.length === 0 ? (
            emptyState
          ) : (
            <div className="grid gap-5">
              {staffFiltered.map((b) => (
                <BookingCard key={b.id} booking={b} onReview={setSelected} />
              ))}
            </div>
          )}
        </>
      )}
      {coordinator && (
        <>
          <div className="mb-4 max-w-xs">
            <Select
              label="Status filter"
              value={coordinatorStatusFilter}
              onChange={(e) => setCoordinatorStatusFilter(e.target.value)}
              options={[
                { value: "", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </div>
          {coordinatorFiltered.length === 0 ? (
            emptyState
          ) : (
        <div className="grid gap-5">
          {coordinatorGroups.map((group) => (
                <section
                  key={group.eventId}
                  aria-labelledby={`event-${group.eventId}`}
                  className="space-y-3"
                >
                  <h2
                    id={`event-${group.eventId}`}
                    className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    {group.eventName}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.items.map((booking) => (
                      <article
                        key={booking.id}
                        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                              {booking.eventName}
                            </h3>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                              Venue: {booking.venueName}
                            </p>
                            {booking.venueStaffName && (
                              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                                Managed by {booking.venueStaffName}
                              </p>
                            )}
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              Reference {booking.bookingReference}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${booking.status === "approved" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : booking.status === "pending" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"}`}
                          >
                            {booking.status}
                          </span>
                        </div>
                        <dl className="mt-4 space-y-2 text-sm">
                          <div>
                            <dt className="font-medium text-gray-700 dark:text-gray-300">
                              Date and time (Singapore)
                            </dt>
                            <dd className="text-gray-600 dark:text-gray-300">
                              {formatSingaporeRange(booking.start, booking.end)}
                            </dd>
                          </div>
                          {booking.specialRequest && (
                            <div>
                              <dt className="font-medium text-gray-700 dark:text-gray-300">
                                Special request
                              </dt>
                              <dd className="text-gray-600 dark:text-gray-300">
                                {booking.specialRequest}
                              </dd>
                            </div>
                          )}
                        </dl>
                        {coordinatorHoldLabel(booking) && (
                          <p role="status" className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                            {coordinatorHoldLabel(booking)}
                          </p>
                        )}
                        {booking.affected && (
                          <p
                            role="status"
                            className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
                          >
                            ⚠ This booking is affected by a venue availability
                            change.
                          </p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-3">
                          {(booking.status === "pending" ||
                            booking.status === "approved") && (
                            <button
                              type="button"
                              className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
                              onClick={() => {
                                setLastActiveConfirmation(false);
                                setConfirmation(booking);
                              }}
                            >
                              Cancel booking
                            </button>
                          )}
                          {booking.status === "rejected" && (
                            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                              Rejection reason: {booking.rejectionReason ?? "Not provided"}
                            </p>
                          )}
                          {(booking.status === "cancelled" ||
                            booking.status === "rejected" ||
                            booking.affected) && (
                            <a
                              className="inline-flex items-center rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              href={`/venues?eventId=${encodeURIComponent(booking.eventId)}`}
                            >
                              Find a replacement venue
                            </a>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
        </div>
          )}
        </>
      )}

      {conflictAlert && (
        <div role="alert" className="fixed top-4 left-4 right-4 z-50 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 shadow-lg dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
          <p>{conflictAlert.message}</p>
          {conflictAlert.conflicts && conflictAlert.conflicts.length > 0 && (
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {conflictAlert.conflicts.map((c) => (
                <li key={c.id}>
                  {c.kind === "unavailable"
                    ? `Unavailable period: ${formatSingaporeRange(c.occupiedStart, c.occupiedEnd)} — ${c.reason}`
                    : c.requestKind === "tentative_hold"
                      ? `Active tentative hold: ${c.reason}; occupied ${formatSingaporeRange(c.occupiedStart, c.occupiedEnd)}`
                      : `Confirmed booking: ${c.reason}; occupied ${formatSingaporeRange(c.occupiedStart, c.occupiedEnd)}`}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="mt-3 rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
            onClick={() => setConflictAlert(null)}
          >
            Dismiss conflict alert
          </button>
        </div>
      )}

      <BookingDetailModal
        key={selected?.id ?? "none"}
        booking={selected}
        onClose={() => setSelected(null)}
        onConflict={(message, conflicts) => setConflictAlert({ message, conflicts })}
        onDecided={(outcome) => {
          setStaffBookings((prev) =>
            prev.map((b) =>
              b.id === outcome.id
                ? { ...b, status: outcome.status, rejectionReason: outcome.reason, holdExpiresAt: outcome.holdExpiresAt, holdExpired: false }
                : b,
            ),
          );
          setCoordinatorBookings((prev) =>
            prev.map((b) =>
              b.id === outcome.id
                ? { ...b, status: outcome.status, rejectionReason: outcome.reason, holdExpiresAt: outcome.holdExpiresAt, holdExpired: false }
                : b,
            ),
          );
        }}
      />
      {confirmation && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="last-booking-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
        >
          <section className="w-full max-w-md rounded bg-white p-4 text-gray-900 sm:p-6">
            <h2 id="last-booking-title" className="font-semibold">
              {lastActiveConfirmation
                ? "Cancel the last active venue booking?"
                : "Cancel this venue booking?"}
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              {lastActiveConfirmation
                ? "This event will have no pending or confirmed venue booking. You can search for a replacement venue afterwards."
                : `Cancel the request for ${confirmation.venueName}? Its history will remain visible as Cancelled.`}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="w-full rounded-md border px-3 py-2 sm:w-auto"
                onClick={() => {
                  setConfirmation(null);
                  setLastActiveConfirmation(false);
                }}
              >
                Keep booking
              </button>
              <button
                type="button"
                className="w-full rounded-md bg-red-700 px-3 py-2 font-medium text-white sm:w-auto"
                onClick={() =>
                  void cancelBooking(confirmation, lastActiveConfirmation)
                }
              >
                Confirm cancellation
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
