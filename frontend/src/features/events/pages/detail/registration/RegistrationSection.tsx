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
} from "@/features/events/lib/registration";
import { RegistrationConfirmation } from "./RegistrationConfirmation";
import { RegistrationForm } from "./RegistrationForm";
import { WithdrawalConfirmation, WithdrawalSuccessBanner } from "./WithdrawalConfirmation";
import { WithdrawnRegistrationStatus } from "./WithdrawnRegistrationStatus";

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
 * SPM-61 AC1 to AC5 for the attendee. The heading follows the registration
 * state: not yet open, closes in N days, closes today, closed, or fully
 * booked. The Register button is rendered only while registration is open;
 * every other state is text only. The server still enforces every rule.
 */
export function RegistrationSection({ event, currentUser, registration, onWithdrawn }: Props) {
  const loadMyRegistration = useAppStore((s) => s.loadMyRegistration);
  const submitWithdrawal = useAppStore((s) => s.submitWithdrawal);
  // The store holds the freshest copy (it is updated by a withdrawal or a re-registration); matched by
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
  // SPM-120 withdrawal state.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawalMessage, setWithdrawalMessage] = useState("");
  const [serverSaysOccurred, setServerSaysOccurred] = useState(false);
  const withdrawInFlight = useRef(false);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

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
  // AC4: the cut-off is the event start. The server re-checks it; a 422 also sets serverSaysOccurred.
  const eventOccurred = hasEventStarted(event, now) || serverSaysOccurred;
  const closedWhileFormOpen = formOpen && state !== "open";
  const spots = event.availableRegistrationSpots ?? event.expectedAttendance;
  const closesAt = event.registrationClosesAt;
  // "Closed on" is only true once the closing time has actually passed; a
  // cancelled or completed event can still have a future scheduled close.
  const hasClosed = Boolean(closesAt) && now.getTime() >= new Date(closesAt as string).getTime();

  // SPM-62 AC3: the registration details; kept after a withdrawal too (SPM-120 07-A "details still shown").
  const detailRows: { label: string; value: string }[] = current
    ? [
        { label: "Registration ID", value: current.id },
        { label: "Full name", value: current.fullName || current.attendeeName },
        ...(current.email ? [{ label: "Email", value: current.email }] : []),
        ...(current.contactNumber ? [{ label: "Contact number", value: current.contactNumber }] : []),
        { label: "Registered on", value: formatSgtDateTime(current.registeredAt) },
        ...(current.specialRequirements
          ? [{ label: "Special requirements", value: current.specialRequirements }]
          : []),
      ]
    : [];

  let heading: string;
  let meta: { label: string; value: string }[] = [];
  if (registered) {
    // SPM-62 AC3: full registration details, not just the ID. AC4: this
    // branch is checked before any event-timing state, so it stays visible
    // for a Completed or Cancelled event too.
    heading = "You're registered";
    meta = detailRows;
  } else if (state === "not-yet-open" && event.registrationOpensAt) {
    heading = `Registration opens on ${formatSgt(event.registrationOpensAt)}`;
    meta = [{ label: "Available", value: `${spots} ${spots === 1 ? "spot" : "spots"}` }];
    if (closesAt) meta.push({ label: "Closes", value: formatSgtDateTime(closesAt) });
  } else if (state === "open" && closesAt) {
    heading = registrationClosingHeading(closesAt, now);
    meta = [
      { label: "Available", value: `${spots} ${spots === 1 ? "spot" : "spots"}` },
    ];
    if (event.registrationOpensAt) meta.push({ label: "Opens", value: formatSgtDateTime(event.registrationOpensAt) });
    meta.push({ label: "Closes", value: formatSgtDateTime(closesAt) });
  } else if (state === "full") {
    heading = REGISTRATION_MESSAGES.full;
    if (closesAt) meta = [{ label: "Closes", value: formatSgtDateTime(closesAt) }];
  } else {
    heading = "Registration closed";
    if (closesAt && hasClosed) meta = [{ label: "Closed on", value: formatSgtDateTime(closesAt) }];
  }

  // The withdrawn card has its own "Register again" action in its footer (SPM-120 redesign).
  const showRegister = !registered && !withdrawn && !formOpen && state === "open";

  /** SPM-120 AC3: sends the withdrawal; the server decides, the UI mirrors the outcome. */
  const confirmWithdrawal = async () => {
    if (!current || withdrawInFlight.current) return;
    withdrawInFlight.current = true;
    setWithdrawPending(true);
    setWithdrawError("");
    try {
      await submitWithdrawal(current.id);
      setDialogOpen(false);
      // D9: the banner is built here from the event name, never echoed from the response.
      setWithdrawalMessage(WITHDRAWAL_MESSAGES.success(event.name));
      onWithdrawn?.();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      if (code === "event_already_occurred") {
        setDialogOpen(false);
        setServerSaysOccurred(true);
      } else if (code === "registration_already_withdrawn") {
        // Withdrawn elsewhere (another tab): show the server's truth, not a stale "Registered".
        setDialogOpen(false);
        void loadMyRegistration(event.id).catch(() => undefined);
      } else {
        setWithdrawError(
          error instanceof Error ? error.message : "We couldn't process your withdrawal. Please try again.",
        );
      }
    } finally {
      withdrawInFlight.current = false;
      setWithdrawPending(false);
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
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div role="status" className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{heading}</h3>
                  {registered && <StatusBadge status="registered" />}
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
              {registered && (
                <section aria-label="Withdrawal" className="space-y-1">
                  {eventOccurred ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">{WITHDRAWAL_MESSAGES.eventAlreadyOccurred}</p>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setWithdrawError("");
                        setDialogOpen(true);
                      }}
                    >
                      Withdraw
                    </Button>
                  )}
                </section>
              )}
            </div>
          )}
          {withdrawalMessage && (
            <WithdrawalSuccessBanner message={withdrawalMessage} onDismiss={() => setWithdrawalMessage("")} />
          )}
          {dialogOpen && registered && (
            <WithdrawalConfirmation
              eventName={event.name}
              pending={withdrawPending}
              error={withdrawError}
              onConfirm={confirmWithdrawal}
              onCancel={closeDialog}
            />
          )}
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
