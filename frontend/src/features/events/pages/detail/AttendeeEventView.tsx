/*
 * The attendee's view of one event: when and where it is, whether registration is still open and by when, the
 * accessibility features on offer, and the action footer that leads into the registration flow. The registration
 * form, waitlist panel and status card stay in RegistrationSection, below this view. Coordinator, room, facility,
 * equipment, attendance and internal status details are not shown to attendees.
 *
 * Times are formatted in the viewer's local time zone (the attendee's own clock), as the spec asks. The rest of the
 * registration UI uses Singapore time; this view deliberately does not. The rules and formatters live in
 * features/events/lib/attendeeEventView.ts.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { EventAttachment, EventRecord, Registration } from "@/types";
import { Button } from "@/components/ui/Button";
import {
  type IconName,
  accessibilityFeatures,
  accessibilityIcon,
  attendeeAction,
  attendeeBadge,
  deadlineValue,
  formatAttendeeDate,
  formatAttendeeTime,
  venueText,
} from "@/features/events/lib/attendeeEventView";

const RECHECK_MS = 5_000;
const ICON_PATHS: Record<IconName, ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5V10l2.5 1.5" />
    </>
  ),
  "map-pin": (
    <>
      <path d="M10 17.5s5.5-4.9 5.5-9a5.5 5.5 0 1 0-11 0c0 4.1 5.5 9 5.5 9Z" />
      <circle cx="10" cy="8.5" r="2" />
    </>
  ),
  hourglass: (
    <>
      <path d="M5.5 3h9M5.5 17h9M6.5 3c0 4 7 4 7 7s-7 3-7 7M13.5 3c0 4-7 4-7 7s7 3 7 7" />
    </>
  ),
  access: (
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="7" r="1" />
      <path d="M8 9.5h4M10 9.5v3l1.5 2.5" />
    </>
  ),
  hearing: (
    <>
      <path d="M6 8.5a4 4 0 1 1 8 0c0 2.5-2 3-2 5.5a2 2 0 0 1-4 0" />
    </>
  ),
  vision: (
    <>
      <path d="M2.5 10S5 5 10 5s7.5 5 7.5 5-2.5 5-7.5 5S2.5 10 2.5 10Z" />
      <circle cx="10" cy="10" r="2" />
    </>
  ),
  check: <path d="M4.5 10.5 8 14l7.5-8" />,
};


function Icon({ name, className }: { name: IconName; className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/** A label above its value, with an icon beside it (the key facts row). */
function Fact({ icon, label, value, warning = false }: { icon: IconName; label: string; value: string; warning?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Icon
        name={icon}
        className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${warning ? "text-warning-800 dark:text-warning-300" : "text-gray-600 dark:text-gray-400"}`}
      />
      <div className="min-w-0">
        <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</dd>
      </div>
    </div>
  );
}

interface Props {
  event: EventRecord;
  /** The attendee's own registration for this event, of any status, if any. */
  registration?: Registration;
  /** Focuses and opens the registration form in RegistrationSection. */
  onRegister: () => void;
  /** Joins the waitlist through RegistrationSection's existing join. */
  onJoinWaitlist: () => void;
  onViewAttachment: (attachment: EventAttachment) => void;
}

export function AttendeeEventView({ event, registration, onRegister, onJoinWaitlist, onViewAttachment }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), RECHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const badge = attendeeBadge(event, now);
  const start = event.startDateTime;
  const end = event.endDateTime;
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  const dateValue = sameDay
    ? formatAttendeeDate(start)
    : `${formatAttendeeDate(start)} to ${formatAttendeeDate(end)}`;
  const timeValue = `${formatAttendeeTime(start)} to ${formatAttendeeTime(end)}`;
  const deadline = deadlineValue(event, now);
  const features = accessibilityFeatures(event);
  const action = attendeeAction(event, now, registration);
  const attachments = event.attachments ?? [];

  return (
    <div className="space-y-4 lg:col-span-3">
      <header className="space-y-2 border-b-[0.5px] border-gray-200 pb-4 dark:border-gray-700">
        <span className="inline-block rounded-md bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
          {badge === "upcoming" ? "Upcoming" : badge === "ongoing" ? "Ongoing" : "Ended"}
        </span>
        <p className="text-sm text-gray-600 dark:text-gray-400">{event.description || "No description provided."}</p>
      </header>

      <section aria-label="Key facts" className="rounded-xl border-[0.5px] border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-4">
          <Fact icon="calendar" label="Date" value={dateValue} />
          <Fact icon="clock" label="Time" value={timeValue} />
          <Fact icon="map-pin" label="Venue" value={venueText(event)} />
          {deadline !== null && <Fact icon="hourglass" label="Register by" value={deadline} warning />}
        </dl>
      </section>

      {features.length > 0 && (
        <section aria-labelledby="attendee-accessibility" className="rounded-xl border-[0.5px] border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 id="attendee-accessibility" className="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            Accessibility
          </h2>
          <ul className="flex flex-wrap gap-2">
            {features.map((feature) => (
              <li
                key={feature}
                className="inline-flex items-center gap-2 rounded-md border-[0.5px] border-gray-200 bg-gray-100 px-3 py-1.5 text-[13px] text-gray-900 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
              >
                <Icon name={accessibilityIcon(feature)} className="h-4 w-4 shrink-0 text-gray-700 dark:text-gray-300" />
                {feature}
              </li>
            ))}
          </ul>
        </section>
      )}

      {attachments.length > 0 && (
        <section aria-labelledby="attendee-programme" className="rounded-xl border-[0.5px] border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 id="attendee-programme" className="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            Event programme
          </h2>
          <ul className="space-y-2">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
              >
                <span className="break-all text-gray-900 dark:text-gray-100">{attachment.name}</span>
                <span className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => onViewAttachment(attachment)}
                    className="text-primary-700 underline dark:text-primary-300"
                  >
                    View
                  </button>
                  <a
                    href={attachment.dataUrl}
                    download={attachment.name}
                    className="text-primary-700 underline dark:text-primary-300"
                  >
                    Download
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {action.kind !== "hidden" && (
        <footer className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-[0.5px] border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Ready to attend?</p>
            <p className="text-[13px] text-gray-600 dark:text-gray-400">
              Organised by {event.organiserName}.
              {event.coordinatorName ? ` Questions go to ${event.coordinatorName}.` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-3">
              {action.kind === "disabled" && action.waitlistAvailable && (
                <Button variant="secondary" onClick={onJoinWaitlist}>
                  Join waitlist
                </Button>
              )}
              <Button onClick={onRegister} disabled={action.kind === "disabled"}>
                Register for this event
              </Button>
            </div>
            {action.kind === "disabled" && (
              <p className="text-right text-[13px] text-gray-600 dark:text-gray-400">{action.reason}</p>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
