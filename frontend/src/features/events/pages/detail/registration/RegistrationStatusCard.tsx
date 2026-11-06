import type { Registration } from "@/types";
import { WAITLIST_MESSAGES, formatSgtDateTime } from "@/features/events/lib/registration";
import { NOT_PROVIDED } from "@/utils/format";

export type RegistrationCardVariant = "confirmed" | "waitlisted";

interface Props {
  variant: RegistrationCardVariant;
  registration: Registration;
  /** Opens the confirmation dialog for this action ("Withdraw" or "Leave waitlist"). */
  onAction: () => void;
  /** Hides the action (the event has started, so the server would refuse it). */
  actionHidden?: boolean;
  /** Shown in place of the action when it is hidden. */
  actionHiddenText?: string;
}

/**
 * The attendee's active registration (SPM-62 confirmed, SPM-138 waitlisted), in one layout: a status headline with the
 * action on the right, the details in a labelled grid, and the registration ID in the footer. Only the headline, the
 * waitlist notice and the action change between the two variants. Colours map the spec tokens to the Tailwind palette.
 */
export function RegistrationStatusCard({ variant, registration, onAction, actionHidden = false, actionHiddenText }: Props) {
  const waitlisted = variant === "waitlisted";
  const headline = waitlisted ? "You're on the waitlist" : "You're registered";
  const position = registration.waitlistPosition;

  const details: { label: string; value: string }[] = [
    { label: "Full name", value: registration.fullName || registration.attendeeName || NOT_PROVIDED },
    { label: "Email", value: registration.email || NOT_PROVIDED },
    ...(registration.contactNumber ? [{ label: "Contact number", value: registration.contactNumber }] : []),
    waitlisted
      ? { label: "Joined waitlist on", value: registration.joinedAt ? formatSgtDateTime(registration.joinedAt) : NOT_PROVIDED }
      : { label: "Registered on", value: formatSgtDateTime(registration.registeredAt) },
    ...(registration.specialRequirements ? [{ label: "Special requirements", value: registration.specialRequirements }] : []),
  ];

  return (
    <section
      aria-label={waitlisted ? "Waitlist registration" : "Registration details"}
      className="rounded-xl border-[0.5px] border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {waitlisted ? (
            <ClockIcon className="h-[22px] w-[22px] shrink-0 text-primary-700 dark:text-primary-300" />
          ) : (
            <CircleCheckIcon className="h-[22px] w-[22px] shrink-0 text-success-700 dark:text-success-300" />
          )}
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{headline}</h3>
        </div>
        {actionHidden ? (
          actionHiddenText && <p className="text-sm text-gray-600 dark:text-gray-400">{actionHiddenText}</p>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="rounded-lg border-[0.5px] border-danger-300 bg-transparent px-3.5 py-1.5 text-sm font-medium text-danger-700 transition-colors hover:bg-danger-50 focus-visible:outline-danger-600 dark:border-danger-700 dark:text-danger-300 dark:hover:bg-danger-900/30"
          >
            {waitlisted ? "Leave waitlist" : "Withdraw"}
          </button>
        )}
      </div>

      {waitlisted && position != null && (
        <div className="mt-4 rounded-lg bg-gray-100 px-4 py-3 dark:bg-gray-900/40">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{WAITLIST_MESSAGES.inLine(position)}</p>
          <p className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-400">We'll notify you if a spot opens up.</p>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-6 gap-y-3 border-t-[0.5px] border-gray-200 pt-4 dark:border-gray-700">
        {details.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
            <dd className="mt-0.5 break-words text-sm text-gray-900 dark:text-gray-100">{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        Registration ID <span className="font-mono">{registration.id}</span>
      </p>
    </section>
  );
}

function CircleCheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
