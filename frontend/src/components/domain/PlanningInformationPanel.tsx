/*
 * SPM-97 — read-only view of event information during planning. Shown to the
 * owning organiser and, as an overview, to the assigned coordinator. It has no
 * controls at all (SPM-97 AC4); the coordinator edits through
 * PlanningUpdateForm and FlaggedChangeReview instead.
 *
 * A field with a change awaiting the coordinator's review is marked
 * "Change pending" with its reason (SPM-97 AC3). A venue that became
 * unavailable is marked on its booking as "Replacement venue required".
 */
import { useId } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { FlaggedChange, PendingChange, PlanningView, ReplacementRequired } from "@/types";
import { formatDateTime, formatDateTimeRange } from "@/utils/format";
import { formatFieldValue } from "@/utils/planning";

interface Props {
  view: PlanningView;
  /** Set when the latest automatic refresh failed; the last data stays visible. */
  refreshError?: string;
}

const PENDING_BADGE =
  "inline-flex items-center rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800 dark:bg-warning-900/30 dark:text-warning-300";

function isFieldChange(change: PendingChange): change is FlaggedChange {
  return change.kind === "booking_conflict";
}

function PendingMarker({ changes }: { changes: FlaggedChange[] }) {
  if (!changes.length) return null;
  return (
    <div className="mt-1 space-y-1">
      {changes.map((change) => (
        <p key={change.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span className={PENDING_BADGE}>Change pending</span>
          <span>Booking conflict</span>
          <span>Proposed: {formatFieldValue(change.field, change.proposedValue)}</span>
        </p>
      ))}
    </div>
  );
}

export function PlanningInformationPanel({ view, refreshError }: Props) {
  const headingId = useId();
  const { event } = view;
  const fieldChanges = view.pendingChanges.filter(isFieldChange);
  const replacements = view.pendingChanges.filter(
    (change): change is ReplacementRequired => change.kind === "replacement_venue_required",
  );
  const pendingFor = (...fields: string[]) => fieldChanges.filter((change) => fields.includes(change.field));
  const bookingIds = new Set(view.venueBookings.map((booking) => booking.id));
  const orphanReplacements = replacements.filter((r) => !bookingIds.has(r.bookingId));

  const rows: Array<{ label: string; value: string; fields: string[] }> = [
    {
      label: "Date & time",
      value: formatDateTimeRange(event.startDateTime, event.endDateTime),
      fields: ["startDateTime", "endDateTime"],
    },
    { label: "Expected attendance", value: String(event.expectedAttendance), fields: ["expectedAttendance"] },
    { label: "Room layout", value: event.venueRequirements.layout || "—", fields: ["layout"] },
    {
      label: "Required facilities",
      value: formatFieldValue("facilities", event.venueRequirements.facilities),
      fields: ["facilities"],
    },
    {
      label: "Accessibility needs",
      value: formatFieldValue("accessibility", event.venueRequirements.accessibility),
      fields: ["accessibility"],
    },
    {
      label: "Equipment requirements",
      value: formatFieldValue("equipmentNeeds", event.equipmentNeeds),
      fields: ["equipmentNeeds"],
    },
  ];

  return (
    <section aria-labelledby={headingId} className="mb-6">
      <Card>
        <CardHeader>
          <h2 id={headingId} className="font-semibold text-gray-900 dark:text-gray-100">
            Planning information
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {view.readOnly
              ? "Read-only. Your coordinator keeps these arrangements up to date and changes appear here automatically."
              : "Current arrangements as seen by the organiser."}
          </p>
        </CardHeader>
        <CardBody className="space-y-6 text-sm">
          {refreshError && (
            <p role="alert" className="text-xs text-danger-600 dark:text-danger-400">
              {refreshError}
            </p>
          )}

          <div>
            <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Event information</h3>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map((row) => (
                <div key={row.label}>
                  <dt className="text-gray-400 dark:text-gray-500">{row.label}</dt>
                  <dd className="font-medium text-gray-800 dark:text-gray-200">{row.value}</dd>
                  <PendingMarker changes={pendingFor(...row.fields)} />
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Venues</h3>
            {view.venueBookings.length ? (
              <ul className="space-y-2">
                {view.venueBookings.map((booking) => {
                  const replacement = replacements.find((r) => r.bookingId === booking.id);
                  return (
                    <li
                      key={booking.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
                    >
                      <span className="font-medium text-gray-800 dark:text-gray-200">{booking.venueName}</span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatDateTimeRange(booking.start, booking.end)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{booking.status}</span>
                        {replacement && <span className={PENDING_BADGE}>Replacement venue required</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No venue booked yet.</p>
            )}
            {orphanReplacements.map((r) => (
              <p key={r.id} className="mt-2 flex items-center gap-2">
                <span className={PENDING_BADGE}>Replacement venue required</span>
                <span>{r.venueName}</span>
              </p>
            ))}
          </div>

          <div>
            <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Equipment</h3>
            {view.equipmentArrangements.length ? (
              <ul className="space-y-2">
                {view.equipmentArrangements.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
                  >
                    <span className="font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">Qty {item.quantity}</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{item.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No equipment arranged yet.</p>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Last updated <time dateTime={view.lastUpdatedAt}>{formatDateTime(view.lastUpdatedAt)}</time>
          </p>
        </CardBody>
      </Card>
    </section>
  );
}
