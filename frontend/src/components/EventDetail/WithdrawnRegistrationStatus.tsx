import clsx from "clsx";
import type { EventRecord, Registration } from "@/types";
import { Button } from "@/components/ui/Button";
import { withdrawnCardFooterState } from "@/pages/EventView";
import { REREGISTER_FOOTER, daysUntilLabel, formatSgtDateTime } from "@/utils/registration";

interface Props {
  event: EventRecord;
  /** The attendee's withdrawn registration for this event. */
  registration: Registration;
  now: Date;
  onRegisterAgain: () => void;
  /** Hides the action footer while the registration form is open below the card. */
  hideFooter?: boolean;
}

function UserMinusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 20v-1a6 6 0 0 1 6-6h1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 11h7" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * SPM-120 withdrawn-card redesign. Replaces the old badge + "Withdrawn today at
 * ..." line with a timeline (registered -> withdrawn, both absolute SGT
 * timestamps), a collapsed disclosure for the previous registration details,
 * and an action footer whose text and button come from
 * `withdrawnCardFooterState` so this can never disagree with the initial
 * register action about whether registering again is currently allowed.
 */
export function WithdrawnRegistrationStatus({ event, registration, now, onRegisterAgain, hideFooter }: Props) {
  const footer = withdrawnCardFooterState(event, now);
  const entries = [
    { key: "registered", label: "Registered", iso: registration.registeredAt, filled: false },
    ...(registration.withdrawnAt
      ? [{ key: "withdrawn", label: "Withdrawn", iso: registration.withdrawnAt, filled: true }]
      : []),
  ];
  const detailFields = [
    { label: "Registration ID", value: registration.id },
    { label: "Full name", value: registration.fullName || registration.attendeeName },
    ...(registration.email ? [{ label: "Email", value: registration.email }] : []),
    ...(registration.contactNumber ? [{ label: "Contact number", value: registration.contactNumber }] : []),
  ];

  let footerHeading = "";
  let footerSubtext = "";
  let footerButtonLabel: string | null = null;
  switch (footer.kind) {
    case "open": {
      footerHeading = REREGISTER_FOOTER.changedYourMind;
      const spotsLabel = `${footer.spots} ${footer.spots === 1 ? "spot" : "spots"} left`;
      const closesLabel = footer.closesAt
        ? ` · Closes ${formatSgtDateTime(footer.closesAt)} (${daysUntilLabel(footer.closesAt, now)})`
        : "";
      footerSubtext = `${spotsLabel}${closesLabel}`;
      footerButtonLabel = "Register again";
      break;
    }
    case "full":
      footerHeading = REREGISTER_FOOTER.full;
      break;
    case "not-yet-open":
      footerHeading = REREGISTER_FOOTER.opensOn(formatSgtDateTime(footer.opensAt));
      break;
    case "closed":
      footerHeading = footer.closesAt
        ? REREGISTER_FOOTER.closedOn(formatSgtDateTime(footer.closesAt))
        : REREGISTER_FOOTER.closed;
      break;
    case "event-started":
      footerHeading = REREGISTER_FOOTER.eventStarted;
      break;
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-warning-100 px-2.5 py-1 text-xs font-medium text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
        <UserMinusIcon className="h-3.5 w-3.5" />
        <span>Registration withdrawn</span>
      </div>

      <ol className="space-y-0">
        {entries.map((entry, index) => (
          <li key={entry.key} className="relative flex gap-3 pb-4 last:pb-0">
            {index < entries.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[5px] top-3 h-full w-px bg-gray-300 dark:bg-gray-600"
              />
            )}
            <span
              aria-hidden="true"
              className={clsx(
                "relative z-10 mt-1 h-[11px] w-[11px] shrink-0 rounded-full",
                entry.filled
                  ? "bg-warning-500"
                  : "border-2 border-gray-400 bg-white dark:border-gray-500 dark:bg-gray-800",
              )}
            />
            <div>
              <p
                className={clsx(
                  "text-sm",
                  entry.filled ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400",
                )}
              >
                {entry.label}
              </p>
              <time dateTime={entry.iso} className="text-sm text-gray-600 dark:text-gray-400">
                {formatSgtDateTime(entry.iso)}
              </time>
            </div>
          </li>
        ))}
      </ol>

      <details className="group rounded-lg border border-gray-200 dark:border-gray-700">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:text-gray-300 [&::-webkit-details-marker]:hidden">
          <span>View previous registration details</span>
          <ChevronIcon className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="grid gap-x-6 gap-y-2 border-t border-gray-100 px-3 py-3 text-sm dark:border-gray-800 sm:grid-cols-2">
          {detailFields.map((field) => (
            <div key={field.label}>
              <dt className="text-gray-400 dark:text-gray-500">{field.label}</dt>
              <dd className="font-normal text-gray-700 dark:text-gray-300">{field.value}</dd>
            </div>
          ))}
        </dl>
      </details>

      {!hideFooter && (
        <div className="flex flex-col gap-3 rounded-lg border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{footerHeading}</p>
            {footerSubtext && <p className="text-sm text-gray-500 dark:text-gray-400">{footerSubtext}</p>}
          </div>
          {footerButtonLabel && (
            <Button className="min-h-[44px] w-full sm:w-auto" onClick={onRegisterAgain}>
              {footerButtonLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
