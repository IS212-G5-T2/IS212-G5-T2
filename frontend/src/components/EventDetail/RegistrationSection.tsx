import { useEffect, useState } from "react";
import type { EventRecord, Registration, User } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useAppStore } from "@/store/useAppStore";
import { registrationState } from "@/pages/EventView";
import {
  REGISTRATION_MESSAGES,
  formatSgt,
  formatSgtDateTime,
  registrationClosingHeading,
} from "@/utils/registration";
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
  const registered = registration?.status === "registered";
  const closedWhileFormOpen = formOpen && state !== "open";
  const spots = event.availableRegistrationSpots ?? event.expectedAttendance;
  const closesAt = event.registrationClosesAt;
  // "Closed on" is only true once the closing time has actually passed; a
  // cancelled or completed event can still have a future scheduled close.
  const hasClosed = Boolean(closesAt) && now.getTime() >= new Date(closesAt as string).getTime();

  let heading: string;
  let meta: { label: string; value: string }[] = [];
  if (registered) {
    // SPM-62 AC3: full registration details, not just the ID. AC4: this
    // branch is checked before any event-timing state, so it stays visible
    // for a Completed or Cancelled event too.
    heading = "You're registered";
    meta = registration
      ? [
          { label: "Registration ID", value: registration.id },
          { label: "Full name", value: registration.fullName || registration.attendeeName },
          ...(registration.email ? [{ label: "Email", value: registration.email }] : []),
          ...(registration.contactNumber
            ? [{ label: "Contact number", value: registration.contactNumber }]
            : []),
          { label: "Registered on", value: formatSgtDateTime(registration.registeredAt) },
          ...(registration.specialRequirements
            ? [{ label: "Special requirements", value: registration.specialRequirements }]
            : []),
        ]
      : [];
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

  const showRegister = !registered && !formOpen && state === "open";

  return (
    <Card className="lg:col-span-3">
      <CardBody className="space-y-3">
        <section aria-label="Registration" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div role="status" className="space-y-2">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{heading}</h3>
              {meta.length > 0 && (
                <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  {meta.map((item) => (
                    <Meta key={item.label} label={item.label} value={item.value} />
                  ))}
                </dl>
              )}
            </div>
            {showRegister && (
              <Button variant="secondary" onClick={() => setFormOpen(true)}>
                Register
              </Button>
            )}
          </div>
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
        </section>
      </CardBody>
    </Card>
  );
}
