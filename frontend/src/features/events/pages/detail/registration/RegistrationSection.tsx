import { useCallback, useEffect, useRef, useState } from "react";
import type { EventRecord, Registration, User } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAppStore } from "@/store/useAppStore";
import { registrationState } from "@/features/events/lib/EventView";
import { ApiError } from "@/utils/api";
import {
  REGISTRATION_MESSAGES,
  WITHDRAWAL_MESSAGES,
  formatSgt,
  formatSgtDateTime,
  hasEventStarted,
  registrationClosingHeading,
  registrationUiState,
} from "@/features/events/lib/registration";
import { Toast } from "@/components/ui/Toast";
import { RegistrationConfirmation } from "./RegistrationConfirmation";
import { RegistrationForm } from "./RegistrationForm";
import { ConfirmDialog, type ConfirmVariant } from "./ConfirmDialog";
import { RegistrationStatusCard } from "./RegistrationStatusCard";
import { WaitlistPanel } from "./WaitlistPanel";
import { WithdrawnRegistrationStatus } from "./WithdrawnRegistrationStatus";
import { NOT_PROVIDED } from "@/utils/format";

interface Props {
  event: EventRecord;
  currentUser: User;
  /** The attendee's latest registration for this event, of any status, if any. */
  registration?: Registration;
  /** Called after a successful withdrawal so the page can refetch the event's capacity. */
  onWithdrawn?: () => void;
}

// How often the open/closed state is re-checked while the page stays open.
const RECHECK_MS = 5_000;
// The inline error inside the confirmation dialog when a withdrawal or a leave fails for any reason the page does not handle.
const WITHDRAW_FAILED = "Couldn't withdraw your registration. Try again.";

/** A labelled value under the heading, such as "Closes / 12 Mar 2027, 23:59". */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800 dark:text-gray-200">{value}</dd>
    </div>
  );
}

/**
 * SPM-61 AC1 to AC5 for the attendee, extended by SPM-120 (withdrawal) and SPM-138 (waitlist). The heading follows the
 * registration state. Register is offered only while a place is free and registration is open; Join Waitlist is offered
 * while the event is full and open. Every other state is text only. The server still enforces every rule.
 */
export function RegistrationSection({ event, currentUser, registration, onWithdrawn }: Props) {
  const loadMyRegistration = useAppStore((s) => s.loadMyRegistration);
  const submitWithdrawal = useAppStore((s) => s.submitWithdrawal);
  const joinWaitlist = useAppStore((s) => s.joinWaitlist);
  // The store holds the freshest copy (it is updated by a withdrawal, a join or a re-registration); matched by
  // event + attendee, which is what registerForEvent uses to replace the withdrawn row in the store.
  const stored = useAppStore((s) =>
    s.registrations.find((r) => r.eventId === event.id && r.attendeeId === currentUser.id),
  );
  const current = stored ?? registration;
  const [now, setNow] = useState(() => new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Registration | null>(null);
  const [reregistering, setReregistering] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState("");
  // SPM-120 / SPM-138 withdrawal state. The dialog variant is set by the card's action: Withdraw or Leave waitlist.
  const [dialogVariant, setDialogVariant] = useState<ConfirmVariant | null>(null);
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [toast, setToast] = useState("");
  const [serverSaysOccurred, setServerSaysOccurred] = useState(false);
  const withdrawInFlight = useRef(false);
  const closeDialog = useCallback(() => setDialogVariant(null), []);
  const dismissToast = useCallback(() => setToast(""), []);
  // SPM-138 join state. The ref blocks a second request before the pending state has rendered (01-E double click).
  const [joinPending, setJoinPending] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinedPosition, setJoinedPosition] = useState<number | null>(null);
  const joinInFlight = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), RECHECK_MS);
    return () => clearInterval(timer);
  }, []);

  if (!event.registrationEnabled) {
    return (
      <Card className="lg:col-span-3">
        <CardBody className="text-sm text-gray-600 dark:text-gray-400">
          Registration through the website is not enabled for this event.
        </CardBody>
      </Card>
    );
  }

  const state = registrationState(event, now);
  const registered = current?.status === "registered";
  const withdrawn = current?.status === "withdrawn";
  // SPM-62 state only: a cancelled registration is shown, with no action (the cancel story is not built yet).
  const cancelled = current?.status === "cancelled";
  const waitlisted = current?.status === "waitlisted";
  // AC4: the cut-off is the event start. The server re-checks it; a 422 also sets serverSaysOccurred.
  const eventOccurred = hasEventStarted(event, now) || serverSaysOccurred;
  const closedWhileFormOpen = formOpen && state !== "open";
  const spots = event.availableRegistrationSpots ?? event.expectedAttendance;
  const closesAt = event.registrationClosesAt;
  // "Closed on" is only true once the closing time has actually passed; a
  // cancelled or completed event can still have a future scheduled close.
  const hasClosed = Boolean(closesAt) && now.getTime() >= new Date(closesAt as string).getTime();
  // SPM-138: the window decides open, closed or not yet open; "full" is still an open window.
  const windowState = state === "not-yet-open" ? "not-yet-open" : state === "closed" || state === "disabled" ? "closed" : "open";
  const full = event.isFull ?? spots <= 0;
  const uiState = registrationUiState(windowState, full, current?.status);
  const limit = event.registrationLimit ?? event.expectedAttendance;

  // A registered or waitlisted attendee sees RegistrationStatusCard (the card carries its own details and action). A
  // cancelled registration keeps the header below, with its details.
  // SPM-62 AC3: the registration details; kept after a withdrawal too (SPM-120 07-A "details still shown").
  const detailRows: { label: string; value: string }[] = current
    ? [
        { label: "Registration ID", value: current.id },
        { label: "Full name", value: current.fullName || current.attendeeName || NOT_PROVIDED },
        { label: "Email", value: current.email || NOT_PROVIDED },
        ...(current.contactNumber ? [{ label: "Contact number", value: current.contactNumber }] : []),
        { label: "Registered on", value: formatSgtDateTime(current.registeredAt) },
        ...(current.specialRequirements
          ? [{ label: "Special requirements", value: current.specialRequirements }]
          : []),
      ]
    : [];

  let heading: string;
  let meta: { label: string; value: string }[] = [];
  if (cancelled) {
    heading = "Registration cancelled";
    meta = detailRows;
  } else if (current?.status === "removed") {
    // SPM-138 AC11: a waiting entry removed when registration closed. No position, no controls.
    heading = "Registration closed";
    if (closesAt && hasClosed) meta = [{ label: "Closed on", value: formatSgtDateTime(closesAt) }];
  } else if (uiState === "not-yet-open" && event.registrationOpensAt) {
    heading = `Registration opens on ${formatSgt(event.registrationOpensAt)}`;
    meta = [{ label: "Available", value: `${spots} ${spots === 1 ? "spot" : "spots"}` }];
    if (closesAt) meta.push({ label: "Closes", value: formatSgtDateTime(closesAt) });
  } else if (uiState === "register" && closesAt) {
    heading = registrationClosingHeading(closesAt, now);
    meta = [
      { label: "Available", value: `${spots} ${spots === 1 ? "spot" : "spots"}` },
    ];
    if (event.registrationOpensAt) meta.push({ label: "Opens", value: formatSgtDateTime(event.registrationOpensAt) });
    meta.push({ label: "Closes", value: formatSgtDateTime(closesAt) });
  } else if (uiState === "full-join") {
    // SPM-138 AC2: the full event says so, shows the availability and the closing date, and offers the waitlist.
    heading = "Event full";
    meta = [{ label: "Available", value: `${Math.max(spots, 0)} of ${limit} available` }];
    if (closesAt) meta.push({ label: "Closes", value: formatSgtDateTime(closesAt) });
  } else {
    heading = "Registration closed";
    if (closesAt && hasClosed) meta = [{ label: "Closed on", value: formatSgtDateTime(closesAt) }];
  }

  // The withdrawn card has its own "Register again" action in its footer (SPM-120 redesign).
  const showRegister = uiState === "register" && !withdrawn && !formOpen;

  /**
   * SPM-120 / SPM-138: sends the withdrawal (Withdraw, or Leave waitlist, which also withdraws the registration). The server
   * decides; the UI mirrors the outcome. On failure the dialog stays open with the inline error.
   */
  const confirmWithdrawal = async () => {
    if (!current || !dialogVariant || withdrawInFlight.current) return;
    const variant = dialogVariant;
    withdrawInFlight.current = true;
    setWithdrawPending(true);
    setWithdrawError("");
    try {
      await submitWithdrawal(current.id);
      setDialogVariant(null);
      // D9: the toast is built here, never echoed from the response.
      setToast(variant === "leave-waitlist" ? "Left the waitlist" : "Registration withdrawn");
      onWithdrawn?.();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      if (code === "event_already_occurred") {
        setDialogVariant(null);
        setServerSaysOccurred(true);
      } else if (code === "registration_already_withdrawn") {
        // Withdrawn elsewhere (another tab): show the server's truth, not a stale "Registered".
        setDialogVariant(null);
        void loadMyRegistration(event.id).catch(() => undefined);
      } else {
        setWithdrawError(WITHDRAW_FAILED);
      }
    } finally {
      withdrawInFlight.current = false;
      setWithdrawPending(false);
    }
  };

  /**
   * SPM-138 AC1/AC4: joins the waitlist. The server decides; a refusal shows the server's sentence. A duplicate, a
   * registration or a close means the page's view is stale, so the attendee's own entry is read again.
   */
  const joinNow = async () => {
    if (joinInFlight.current) return;
    joinInFlight.current = true;
    setJoinPending(true);
    setJoinError("");
    try {
      const result = await joinWaitlist(event.id);
      // D14: the banner is built here from the event name and the response position, never from the server's text.
      setJoinedPosition(result.position);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      if (code === "already_on_waitlist" || code === "already_registered" || code === "registration_closed" || code === "registration_not_open") {
        void loadMyRegistration(event.id).catch(() => undefined);
      }
      setJoinError(error instanceof Error ? error.message : "We couldn't join the waitlist. Please try again.");
    } finally {
      joinInFlight.current = false;
      setJoinPending(false);
    }
  };

  return (
    <Card className="lg:col-span-3">
      <CardBody className="space-y-3">
        <section aria-label="Registration" className="space-y-3">
          {withdrawn && current ? (
            <WithdrawnRegistrationStatus
              event={event}
              registration={current}
              now={now}
              hideFooter={formOpen}
              onRegisterAgain={() => {
                setDuplicateNotice("");
                setReregistering(true);
                setFormOpen(true);
              }}
            />
          ) : (registered || waitlisted) && current ? (
            <RegistrationStatusCard
              variant={waitlisted ? "waitlisted" : "confirmed"}
              registration={current}
              onAction={() => {
                setWithdrawError("");
                setDialogVariant(waitlisted ? "leave-waitlist" : "withdraw");
              }}
              actionHidden={eventOccurred}
              actionHiddenText={WITHDRAWAL_MESSAGES.eventAlreadyOccurred}
            />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div role="status" className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{heading}</h3>
                  {cancelled && <StatusBadge status="cancelled" />}
                  {current?.status === "removed" && <StatusBadge status="removed" />}
                </div>
                {meta.length > 0 && (
                  <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                    {meta.map((item) => (
                      <Meta key={item.label} label={item.label} value={item.value} />
                    ))}
                  </dl>
                )}
              </div>
              {showRegister && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setReregistering(false);
                    setFormOpen(true);
                  }}
                >
                  Register
                </Button>
              )}
            </div>
          )}
          {/* SPM-138 rejoin: a withdrawn attendee on a full, open event may join the list again at the back (D2). */}
          {(uiState === "full-join" || joinedPosition !== null || joinError) && (
            <WaitlistPanel
              eventName={event.name}
              pending={joinPending}
              error={joinError}
              joinedPosition={joinedPosition}
              onJoin={uiState === "full-join" && !formOpen ? joinNow : undefined}
              onDismissBanner={() => setJoinedPosition(null)}
            />
          )}
          {dialogVariant && (registered || waitlisted) && (
            <ConfirmDialog
              variant={dialogVariant}
              position={current?.waitlistPosition}
              pending={withdrawPending}
              error={withdrawError}
              onConfirm={confirmWithdrawal}
              onCancel={closeDialog}
            />
          )}
          {toast && <Toast message={toast} onDismiss={dismissToast} />}
          {confirmation && (
            <RegistrationConfirmation
              registration={confirmation}
              eventName={event.name}
              reregistered={reregistering}
              onDismiss={() => {
                setConfirmation(null);
                setReregistering(false);
              }}
            />
          )}
          {duplicateNotice && (
            <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
              <span aria-hidden="true">⚠ </span>
              {duplicateNotice}
            </p>
          )}
          {closedWhileFormOpen && (
            <p role="status" className="text-sm text-danger-700 dark:text-danger-300">
              <span aria-hidden="true">⚠ </span>
              {REGISTRATION_MESSAGES.closed}
            </p>
          )}
          {!registered && formOpen && (
            <RegistrationForm
              eventId={event.id}
              initialName={current?.fullName || currentUser.name}
              initialEmail={current?.email || currentUser.email}
              initialContactNumber={current?.contactNumber || ""}
              onRegistered={(created) => {
                setConfirmation(created);
                setFormOpen(false);
                setDuplicateNotice("");
              }}
              onAlreadyRegistered={() => {
                setDuplicateNotice(REGISTRATION_MESSAGES.alreadyRegistered);
                void loadMyRegistration(event.id)
                  .then(() => setFormOpen(false))
                  .catch(() => undefined);
              }}
            />
          )}
        </section>
      </CardBody>
    </Card>
  );
}
