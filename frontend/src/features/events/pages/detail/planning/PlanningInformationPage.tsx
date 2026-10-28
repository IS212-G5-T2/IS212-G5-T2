/*
 * SPM-135 coordinator planning page: Event info, Venues and Equipment tabs with
 * status icons, then the operational safety check section. Rendered for the
 * assigned coordinator; the organiser keeps the read-only PlanningInformationPanel.
 * Every state comes from the server checklist (GET arrangements-status), so the
 * icons, the prerequisites and the Request safety check gate follow the same
 * rule the backend enforces.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/utils/api";
import type { PlanningView } from "@/types";
import { formatDateTime } from "@/utils/format";
import { PLANNING_REFRESH_MS } from "@/utils/planning";
import {
  confirmNoEquipment,
  fetchArrangementsStatus,
  removeEquipmentRequest,
  removeVenueRequest,
  requestSafetyCheck,
  type PlanningChecklist,
  type RequestStatus,
} from "@/utils/arrangements";
import { EventInformationList } from "@/features/events/pages/detail/planning/PlanningInformationPanel";
import { ConfirmEventPanel } from "@/features/events/pages/detail/planning/ConfirmEventPanel";
import { SafetyCheckChangesNeeded } from "@/features/events/pages/detail/planning/SafetyCheckChangesNeeded";
import { activeVenueRequests } from "@/features/events/pages/detail/planning/activeVenueRequests";
import {
  StateLabel,
  safetyLabel,
} from "@/features/events/components/StatusLabels";

type TabKey = "event" | "venues" | "equipment" | "registration";

interface Props {
  view: PlanningView;
  /** Lower-case status as the page holds it. */
  status: string;
  onConfirmed: () => void;
  /** Set when the latest automatic refresh failed; the last data stays visible. */
  refreshError?: string;
  /** People for the event (organiser, coordinator), shown as a sub-section of Event Information. */
  people?: ReactNode;
  /** SPM-139: the Registration tab's content. Passed only for approved, planning and confirmed events, so the tab exists only then. */
  registration?: ReactNode;
  /** Whether both registration dates are set; drives the Registration tab's status icon. */
  registrationPeriodSet?: boolean;
}

const ALERT =
  "rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300";

function StatusIcon({
  done,
  unavailable = false,
}: {
  done: boolean;
  unavailable?: boolean;
}) {
  if (done)
    return (
      <span
        role="img"
        aria-label="Complete"
        className="text-success-600 dark:text-success-400"
      >
        ✓
      </span>
    );
  return unavailable ? (
    <span
      role="img"
      aria-label="Unavailable"
      className="text-danger-600 dark:text-danger-400"
    >
      ⚠
    </span>
  ) : (
    <span
      role="img"
      aria-label="Action needed"
      className="text-warning-600 dark:text-warning-400"
    >
      ⚠
    </span>
  );
}

function StatusCard({
  done,
  unavailable = false,
  title,
  children,
}: {
  done: boolean;
  unavailable?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-start gap-3">
        <StatusIcon done={done} unavailable={unavailable} />
        <div className="space-y-1">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {children}
        </div>
      </div>
    </div>
  );
}

const muted = "text-sm text-gray-600 dark:text-gray-400";
const date = (iso?: string) => (iso ? formatDateTime(iso) : "");

const BADGE: Record<RequestStatus, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmed",
    className:
      "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300",
  },
  pending: {
    label: "Pending",
    className:
      "bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300",
  },
  unavailable: {
    label: "Unavailable",
    className:
      "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300",
  },
  not_requested: {
    label: "Not requested",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
};

function RequestList({
  items,
  renderAction,
}: {
  items: Array<{
    id: string;
    label: string;
    status: RequestStatus;
    requestedDate?: string;
  }>;
  renderAction?: (item: {
    id: string;
    label: string;
    status: RequestStatus;
  }) => ReactNode;
}) {
  return (
    <ul aria-label="Requests" className="mt-2 space-y-1">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-center gap-2 text-sm text-gray-800 dark:text-gray-200"
        >
          <StatusIcon
            done={item.status === "confirmed"}
            unavailable={item.status === "unavailable"}
          />
          <span>{item.label}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[item.status].className}`}
          >
            {BADGE[item.status].label}
          </span>
          {item.requestedDate && (
            <span className={muted}>Requested {date(item.requestedDate)}</span>
          )}
          {renderAction?.(item)}
        </li>
      ))}
    </ul>
  );
}

const LINK =
  "mt-2 inline-block text-sm font-medium text-primary-700 underline dark:text-primary-400";

const REMOVE_BUTTON =
  "rounded-md border px-2 py-0.5 text-xs font-medium disabled:opacity-50";

function RemoveRequestButton({
  label,
  busy,
  confirming,
  onAsk,
  onConfirm,
  onCancel,
}: {
  label: string;
  busy: boolean;
  confirming: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!confirming)
    return (
      <button
        type="button"
        onClick={onAsk}
        disabled={busy}
        aria-label={`Remove ${label} From List`}
        className={`${REMOVE_BUTTON} border-danger-300 text-danger-700 hover:bg-danger-50 dark:border-danger-700 dark:text-danger-300 dark:hover:bg-danger-900/20`}
      >
        Remove From List
      </button>
    );
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        aria-busy={busy}
        className={`${REMOVE_BUTTON} border-danger-600 bg-danger-600 text-white hover:bg-danger-700`}
      >
        {busy ? "Removing…" : "Confirm Remove"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className={`${REMOVE_BUTTON} border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800`}
      >
        Cancel
      </button>
    </span>
  );
}

function VenueStatusCard({
  venue,
  eventId,
  busy,
  confirmingId,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  venue: PlanningChecklist["venue"];
  eventId: string;
  busy: boolean;
  confirmingId: string | null;
  onAskRemove: (venueRequestId: string) => void;
  onCancelRemove: () => void;
  onRemove: (venueRequestId: string) => void;
}) {
  if (venue.status === "not_requested")
    return (
      <StatusCard done={false} title="Venue Yet To Be Requested">
        <p className={muted}>No venue has been requested for this event yet</p>
        <Link to={`/venues?eventId=${eventId}`} className={LINK}>
          View Venue Catalogue
        </Link>
      </StatusCard>
    );
  const titles: Record<"confirmed" | "pending" | "unavailable", string> = {
    confirmed: "Venue Confirmed",
    pending: "Venue Request Pending",
    unavailable: "Venue Unavailable",
  };
  const status = venue.status as "confirmed" | "pending" | "unavailable";
  return (
    <StatusCard
      done={status === "confirmed"}
      unavailable={status === "unavailable"}
      title={titles[status]}
    >
      <RequestList
        items={activeVenueRequests(venue.items).map((item) => ({
          id: item.id,
          label: item.venueName,
          status: item.status,
          requestedDate: item.requestedDate,
        }))}
        renderAction={(item) =>
          item.status === "unavailable" && (
            <RemoveRequestButton
              label={item.label}
              busy={busy}
              confirming={confirmingId === item.id}
              onAsk={() => onAskRemove(item.id)}
              onConfirm={() => onRemove(item.id)}
              onCancel={onCancelRemove}
            />
          )
        }
      />
      <Link to="/bookings" className={LINK}>
        View Venue Request
      </Link>
      {status === "unavailable" && (
        <Link to={`/venues?eventId=${eventId}`} className={`${LINK} ml-4`}>
          Request Another Venue
        </Link>
      )}
    </StatusCard>
  );
}

function EquipmentStatusCard({
  equipment,
  pending,
  confirmingId,
  onAskRemove,
  onCancelRemove,
  onConfirmNone,
  onRemove,
}: {
  equipment: PlanningChecklist["equipment"];
  pending: boolean;
  confirmingId: string | null;
  onAskRemove: (equipmentReservationId: string) => void;
  onCancelRemove: () => void;
  onConfirmNone: () => void;
  onRemove: (equipmentReservationId: string) => void;
}) {
  const checkboxId = useId();
  if (
    equipment.status === "not_requested" &&
    !equipment.required &&
    equipment.confirmedByCoordinator
  )
    return (
      <StatusCard done title="No Equipment Required">
        <p className={muted}>
          <span className="rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-800 dark:bg-success-900/30 dark:text-success-300">
            Confirmed
          </span>{" "}
          on {date(equipment.confirmedDate)}
        </p>
      </StatusCard>
    );
  if (equipment.status === "not_requested")
    return (
      <StatusCard done={false} title="Equipment Yet To Be Requested">
        <p className={muted}>
          {equipment.required
            ? "No equipment has been requested for this event yet"
            : "No equipment has been requested yet. This event lists no equipment needs, so you can confirm none is needed instead."}
        </p>
        <Link to="/equipment/requests" className={LINK}>
          Request Equipment
        </Link>
        {!equipment.required && (
          <label
            htmlFor={checkboxId}
            className="mt-3 flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={false}
              disabled={pending}
              onChange={onConfirmNone}
            />
            Confirm no equipment needed
          </label>
        )}
      </StatusCard>
    );
  const titles: Record<"confirmed" | "pending" | "unavailable", string> = {
    confirmed: "Equipment Confirmed",
    pending: "Equipment Request Pending",
    unavailable: "Equipment Unavailable",
  };
  const status = equipment.status as "confirmed" | "pending" | "unavailable";
  return (
    <StatusCard
      done={status === "confirmed"}
      unavailable={status === "unavailable"}
      title={titles[status]}
    >
      <RequestList
        items={equipment.items.map((item) => ({
          id: item.id,
          label: `${item.name} x${item.quantity}`,
          status: item.status,
          requestedDate: item.requestedDate,
        }))}
        renderAction={(item) =>
          item.status === "unavailable" && (
            <RemoveRequestButton
              label={item.label}
              busy={pending}
              confirming={confirmingId === item.id}
              onAsk={() => onAskRemove(item.id)}
              onConfirm={() => onRemove(item.id)}
              onCancel={onCancelRemove}
            />
          )
        }
      />
      <Link to="/equipment/requests" className={LINK}>
        View Equipment Request
      </Link>
      {status === "unavailable" && (
        <Link to="/equipment/requests" className={`${LINK} ml-4`}>
          Request Another Equipment
        </Link>
      )}
    </StatusCard>
  );
}

function Prerequisite({ label, done }: { label: string; done: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
      <StatusIcon done={done} />
      <span>
        {label}: {done ? "Confirmed" : "Pending"}
      </span>
    </li>
  );
}

export function PlanningInformationPage({
  view,
  status,
  onConfirmed,
  refreshError,
  people,
  registration,
  registrationPeriodSet,
}: Props) {
  const tabsId = useId();
  const [tab, setTab] = useState<TabKey>("event");
  const [checklist, setChecklist] = useState<PlanningChecklist | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Keeps the confirm panel (and its success message) mounted after the status flips.
  const [confirmedHere, setConfirmedHere] = useState(false);
  const eventId = view.event.id;
  const planning = status === "planning";
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const result = await fetchArrangementsStatus(eventId);
      if (!aliveRef.current) return;
      setChecklist(result.checklist ?? null);
      setLoadError("");
    } catch (error) {
      if (!aliveRef.current) return;
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load the planning checklist.",
      );
    }
  }, [eventId]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    const timer = setInterval(() => {
      if (
        typeof document === "undefined" ||
        document.visibilityState !== "hidden"
      )
        load();
    }, PLANNING_REFRESH_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(timer);
    };
  }, [load, view.lastUpdatedAt]);

  const act = async (run: () => Promise<unknown>, failure: string) => {
    if (pending) return;
    setPending(true);
    setActionError("");
    setNotice("");
    try {
      await run();
      await load();
    } catch (error) {
      setActionError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : failure,
      );
    } finally {
      if (aliveRef.current) setPending(false);
    }
  };

  const venueDone = checklist?.venue.status === "confirmed";
  const equipmentDone =
    checklist?.equipment.status === "confirmed" ||
    (!!checklist && checklist.equipment.confirmedByCoordinator);
  const safety = checklist?.safetyCheck;

  const tabs: Array<{
    key: TabKey;
    label: string;
    done: boolean;
    unavailable: boolean;
  }> = [
    // Confirmed events show the same information as the requirements the event was confirmed against.
    { key: "event", label: status === "confirmed" ? "Requirements" : "Event Info", done: true, unavailable: false },
    // Each section is a tick only when every remaining request is confirmed; otherwise a yellow
    // caution (an unavailable request is cleared with "Remove From List").
    { key: "venues", label: "Venues", done: !!venueDone, unavailable: false },
    {
      key: "equipment",
      label: "Equipment",
      done: !!equipmentDone,
      unavailable: checklist?.equipment.status === "unavailable",
    },
    ...(registration
      ? [{ key: "registration" as const, label: "Registration", done: !!registrationPeriodSet, unavailable: false }]
      : []),
  ];

  // SPM-135: always offered while planning, greyed out with its reasons until every prerequisite is met.
  const showConfirm = confirmedHere || planning;

  return (
    <section aria-label="Planning information" className="mb-6 space-y-6">
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            {status === "confirmed" ? "Event Information" : "Planning Information"}
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          {refreshError && (
            <p
              role="alert"
              className="text-xs text-danger-600 dark:text-danger-400"
            >
              {refreshError}
            </p>
          )}
          <div
            role="tablist"
            aria-label="Planning sections"
            className="flex gap-1 border-b border-gray-200 dark:border-gray-700"
          >
            {tabs.map((item) => (
              <button
                key={item.key}
                id={`${tabsId}-${item.key}-tab`}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                aria-controls={`${tabsId}-${item.key}-panel`}
                onClick={() => setTab(item.key)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
                  tab === item.key
                    ? "border-primary-600 text-primary-700 dark:text-primary-400"
                    : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400"
                }`}
              >
                <StatusIcon done={item.done} unavailable={item.unavailable} />
                {item.label}
              </button>
            ))}
          </div>

          {loadError && !checklist && (
            <p role="alert" className={ALERT}>
              {loadError}
            </p>
          )}
          {actionError && (
            <p role="alert" className={ALERT}>
              {actionError}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="text-sm text-success-700 dark:text-success-300"
            >
              {notice}
            </p>
          )}

          {tabs.map((item) => (
            <div
              key={item.key}
              id={`${tabsId}-${item.key}-panel`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-${item.key}-tab`}
              hidden={tab !== item.key}
              className="text-sm"
            >
              {item.key === "event" && (
                <div className="space-y-3">
                  <EventInformationList view={view} coordinator />
                  {people && (
                    <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
                      <h4 className="mb-2 font-medium text-gray-900 dark:text-gray-100">
                        People
                      </h4>
                      {people}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Last updated{" "}
                    <time dateTime={view.lastUpdatedAt}>
                      {formatDateTime(view.lastUpdatedAt)}
                    </time>
                  </p>
                </div>
              )}
              {item.key === "registration" && registration}
              {item.key === "venues" &&
                (checklist ? (
                  <VenueStatusCard
                    venue={checklist.venue}
                    eventId={eventId}
                    busy={pending}
                    confirmingId={confirmingId}
                    onAskRemove={setConfirmingId}
                    onCancelRemove={() => setConfirmingId(null)}
                    onRemove={(venueRequestId) =>
                      act(async () => {
                        setConfirmingId(null);
                        await removeVenueRequest(eventId, venueRequestId);
                        setNotice("Venue removed from list");
                      }, "Could not remove the venue.")
                    }
                  />
                ) : (
                  <p className={muted}>Loading…</p>
                ))}
              {item.key === "equipment" &&
                (checklist ? (
                  <EquipmentStatusCard
                    equipment={checklist.equipment}
                    pending={pending}
                    onConfirmNone={() =>
                      act(
                        () => confirmNoEquipment(eventId),
                        "Could not confirm no equipment.",
                      )
                    }
                    confirmingId={confirmingId}
                    onAskRemove={setConfirmingId}
                    onCancelRemove={() => setConfirmingId(null)}
                    onRemove={(equipmentReservationId) =>
                      act(async () => {
                        setConfirmingId(null);
                        await removeEquipmentRequest(
                          eventId,
                          equipmentReservationId,
                        );
                        setNotice("Equipment removed from list");
                      }, "Could not remove the equipment.")
                    }
                  />
                ) : (
                  <p className={muted}>Loading…</p>
                ))}
            </div>
          ))}
        </CardBody>
      </Card>

      {planning && checklist && safety && (
        <Card id="safety-check">
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Operational Safety Check
            </h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <ul aria-label="Safety check prerequisites" className="space-y-1">
              <Prerequisite
                label="Venues"
                done={checklist.venue.status === "confirmed"}
              />
              <Prerequisite label="Equipment" done={!!equipmentDone} />
            </ul>

            {safety.status === "not_requested" && (
              <div className="space-y-2">
                {safety.resetReason && (
                  <p
                    role="status"
                    className="rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-sm text-warning-900 dark:border-warning-700 dark:bg-warning-900/20 dark:text-warning-200"
                  >
                    <span className="font-medium">Re-request needed.</span>{" "}
                    {safety.resetReason}
                    {safety.resetDate && <> on {date(safety.resetDate)}</>}, so
                    the earlier safety check no longer applies.
                  </p>
                )}
                <Button
                  onClick={() =>
                    act(
                      () => requestSafetyCheck(eventId),
                      "Could not request the safety check.",
                    )
                  }
                  disabled={!checklist.canRequestSafetyCheck || pending}
                  aria-busy={pending}
                >
                  {safety.resetReason
                    ? "Re-Request For Safety Check"
                    : "Request For Safety Check"}
                </Button>
                {!checklist.canRequestSafetyCheck && (
                  <p className={muted}>
                    Pending {checklist.blocking.join(" and ")} confirmation to
                    proceed
                  </p>
                )}
              </div>
            )}
            <p className="mb-2">
              <StateLabel {...safetyLabel(safety.status)} />
            </p>
            {safety.status === "pending" && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                Requested {date(safety.requestedDate)}
              </p>
            )}
            {safety.status === "changes_needed" &&
              (Array.isArray(safety.feedback) && safety.feedback.length > 0 ? (
                <SafetyCheckChangesNeeded
                  eventId={eventId}
                  feedback={safety.feedback}
                  canRequestSafetyCheck={checklist.canRequestSafetyCheck}
                  onRefresh={load}
                  pending={pending}
                  onError={setActionError}
                />
              ) : (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger-800 dark:bg-danger-900/30 dark:text-danger-300">
                      Changes needed
                    </span>
                  </p>
                  <Button
                    onClick={() =>
                      act(
                        () => requestSafetyCheck(eventId),
                        "Could not request the safety check.",
                      )
                    }
                    disabled={!checklist.canRequestSafetyCheck || pending}
                    aria-busy={pending}
                  >
                    Re-Request Safety Check
                  </Button>
                </div>
              ))}
            {/* SPM-48 AC7: a rejected arrangement can be revised and requested again (SPM-131 AC6). */}
            {safety.status === "rejected" && (
              <Button
                onClick={() =>
                  act(
                    () => requestSafetyCheck(eventId),
                    "Could not request the safety check.",
                  )
                }
                disabled={!checklist.canRequestSafetyCheck || pending}
                aria-busy={pending}
              >
                Re-Request Safety Check
              </Button>
            )}
            {safety.status === "approved" && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                <span className="rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-800 dark:bg-success-900/30 dark:text-success-300">
                  Approved
                </span>
                {safety.approverName && <>Verified by {safety.approverName}</>}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {showConfirm && (
        <ConfirmEventPanel
          eventId={eventId}
          status={status}
          isAssignedCoordinator
          refreshKey={`${safety?.status ?? ""}|${checklist?.canRequestSafetyCheck ?? ""}|${checklist?.blocking.join(",") ?? ""}`}
          onConfirmed={() => {
            setConfirmedHere(true);
            onConfirmed();
          }}
        />
      )}
    </section>
  );
}
