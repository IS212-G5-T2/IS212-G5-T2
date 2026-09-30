import { useEffect, useState } from "react";
import type { EventRecord, Registration, User } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useAppStore } from "@/store/useAppStore";
import { registrationState, registrationStateLabel } from "@/pages/EventView";
import { formatDateTime } from "@/utils/format";
import { REGISTRATION_MESSAGES, formatSgt } from "@/utils/registration";
import { RegistrationConfirmation } from "./RegistrationConfirmation";
import { RegistrationForm } from "./RegistrationForm";

interface Props {
  event: EventRecord;
  currentUser: User;
  /** The attendee's active registration for this event, if any. */
  registration?: Registration;
}

// How often the open/closed state is re-checked while the page stays open.
const RECHECK_MS = 5_000;

/**
 * SPM-61 AC1 to AC5 for the attendee: the Register button is rendered only
 * while registration is open; closed, not-yet-open and full states show text
 * only. The server still enforces every rule.
 */
export function RegistrationSection({ event, currentUser, registration }: Props) {
  const loadMyRegistration = useAppStore((s) => s.loadMyRegistration);
  const [now, setNow] = useState(() => new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Registration | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), RECHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const state = registrationState(event, now);
  const registered = registration?.status === "registered";
  const closedWhileFormOpen = formOpen && state !== "open";

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Registration</h2>
      </CardHeader>
      {!event.registrationEnabled ? (
        <CardBody className="text-sm text-gray-600 dark:text-gray-400">
          Registration through the website is not enabled for this event.
        </CardBody>
      ) : (
        <CardBody className="space-y-3">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Registration opens</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{event.registrationOpensAt ? formatDateTime(event.registrationOpensAt) : "Not specified"}</dd>
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Registration closes</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{event.registrationClosesAt ? formatDateTime(event.registrationClosesAt) : "Not specified"}</dd>
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Available registration spots</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{event.availableRegistrationSpots ?? event.expectedAttendance}</dd>
            </div>
          </dl>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100" role="status">
            {registrationStateLabel(state)}
          </p>
          {state === "not-yet-open" && event.registrationOpensAt && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Registration opens on {formatSgt(event.registrationOpensAt)}.
            </p>
          )}
          {confirmation && (
            <RegistrationConfirmation
              registration={confirmation}
              eventName={event.name}
              onDismiss={() => setConfirmation(null)}
            />
          )}
          {duplicateNotice && (
            <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
              <span aria-hidden="true">⚠ </span>
              {duplicateNotice}
            </p>
          )}
          {!registered && !formOpen && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Please sign up through the website first to attend this event.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Status:{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {registered ? "You're registered" : "Not registered"}
              </span>
              {registered && registration && (
                <>
                  {" "}
                  <span className="text-gray-500 dark:text-gray-400">
                    (Registration ID: <span className="font-mono">{registration.id}</span>)
                  </span>
                </>
              )}
            </p>
            {!registered && !formOpen && state === "open" && (
              <Button onClick={() => setFormOpen(true)}>Register</Button>
            )}
          </div>
          {closedWhileFormOpen && (
            <p role="status" className="text-sm text-danger-700 dark:text-danger-300">
              <span aria-hidden="true">⚠ </span>
              {REGISTRATION_MESSAGES.closed}
            </p>
          )}
          {!registered && formOpen && (
            <RegistrationForm
              eventId={event.id}
              initialName={currentUser.name}
              initialEmail={currentUser.email}
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
        </CardBody>
      )}
    </Card>
  );
}
