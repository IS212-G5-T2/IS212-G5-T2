import type { Registration } from "@/types";
import { Button } from "@/components/ui/Button";
import { REGISTRATION_MESSAGES } from "@/utils/registration";

interface Props {
  registration: Registration;
  eventName: string;
  /** True when this registration follows a withdrawal on the same card (SPM-120 "Register again"). */
  reregistered?: boolean;
  onDismiss: () => void;
}

/**
 * SPM-61 AC4: confirmation shown after a successful registration. It stays on
 * the page until dismissed (no timer, no redirect) and is announced politely
 * to assistive technology.
 */
export function RegistrationConfirmation({ registration, eventName, reregistered, onDismiss }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-success-300 bg-success-50 px-4 py-3 text-sm text-success-900 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300"
    >
      <p className="font-medium">
        <span aria-hidden="true">✓ </span>
        {reregistered ? `Registered again for ${eventName}.` : REGISTRATION_MESSAGES.success(eventName)}
      </p>
      <p className="mt-1">
        Registration ID: <span className="font-mono">{registration.id}</span>
      </p>
      <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
