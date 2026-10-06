import { useRef, useState, type FormEvent } from "react";
import type { Registration } from "@/types";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/FormControls";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/api";
import {
  REGISTRATION_LIMITS,
  REGISTRATION_MESSAGES,
  validateRegistrationDetails,
  type RegistrationDetails,
  type RegistrationErrors,
} from "@/utils/registration";

interface Props {
  eventId: string;
  initialName: string;
  initialEmail: string;
  /** Prefills contact number, e.g. from a withdrawn registration being re-registered (SPM-120). */
  initialContactNumber?: string;
  onRegistered: (registration: Registration) => void;
  /** Called when the server reports the attendee is already registered (409). */
  onAlreadyRegistered: () => void;
}

const FIELD_ORDER: (keyof RegistrationDetails)[] = ["fullName", "email", "contactNumber", "specialRequirements"];

/**
 * SPM-61 AC3: collects attendee details and submits them. The server decides
 * every rule; errors it returns are shown here and the typed values are always
 * kept. A failed POST is never retried automatically (D14): the attendee
 * presses Retry so a request that already succeeded cannot surface as a
 * confusing duplicate.
 */
export function RegistrationForm({
  eventId,
  initialName,
  initialEmail,
  initialContactNumber = "",
  onRegistered,
  onAlreadyRegistered,
}: Props) {
  const registerForEvent = useAppStore((s) => s.registerForEvent);
  const [values, setValues] = useState<RegistrationDetails>({
    fullName: initialName,
    email: initialEmail,
    contactNumber: initialContactNumber,
    specialRequirements: "",
  });
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [formError, setFormError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const set = (field: keyof RegistrationDetails) => (
    event: { target: { value: string } },
  ) => setValues((current) => ({ ...current, [field]: event.target.value }));

  const focusFirstInvalid = (fieldErrors: RegistrationErrors) => {
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    const target = first ? formRef.current?.elements.namedItem(first) : errorRef.current;
    (target as HTMLElement | null)?.focus();
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    // Guards a double click or Enter key while a request is in flight.
    if (inFlight.current) return;
    setFormError("");
    setCanRetry(false);
    const clientErrors = validateRegistrationDetails(values);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      setFormError(REGISTRATION_MESSAGES.validation);
      requestAnimationFrame(() => focusFirstInvalid(clientErrors));
      return;
    }
    setErrors({});
    inFlight.current = true;
    setSubmitting(true);
    try {
      onRegistered(await registerForEvent(eventId, values));
    } catch (error) {
      if (error instanceof ApiError && error.code === "already_registered") {
        setFormError(error.message);
        onAlreadyRegistered();
      } else if (error instanceof ApiError && error.code === "validation_error") {
        const serverErrors = (error.errors ?? {}) as RegistrationErrors;
        setErrors(serverErrors);
        setFormError(error.message);
        requestAnimationFrame(() => focusFirstInvalid(serverErrors));
      } else if (error instanceof ApiError && error.code) {
        // Closed, not open, full: the server's own message, values preserved.
        setFormError(error.message);
        requestAnimationFrame(() => errorRef.current?.focus());
      } else {
        setFormError(REGISTRATION_MESSAGES.failure);
        setCanRetry(true);
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-label="Event registration" className="space-y-1">
      <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className="text-sm text-danger-700 dark:text-danger-300">
        {formError && (
          <p>
            <span aria-hidden="true">⚠ </span>
            {formError}
          </p>
        )}
      </div>
      <TextInput
        label="Full name"
        name="fullName"
        required
        autoComplete="name"
        maxLength={REGISTRATION_LIMITS.fullNameMax + 50}
        value={values.fullName}
        onChange={set("fullName")}
        error={errors.fullName}
      />
      <TextInput
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        value={values.email}
        onChange={set("email")}
        error={errors.email}
      />
      <TextInput
        label="Contact number"
        name="contactNumber"
        type="tel"
        autoComplete="tel"
        hint="Optional. 8 to 15 digits; spaces and a leading + are allowed."
        value={values.contactNumber}
        onChange={set("contactNumber")}
        error={errors.contactNumber}
      />
      <TextArea
        label="Special requirements"
        name="specialRequirements"
        hint="Optional. For example dietary or accessibility needs."
        rows={3}
        value={values.specialRequirements}
        onChange={set("specialRequirements")}
        error={errors.specialRequirements}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Submitting…" : "Submit registration"}
        </Button>
        {canRetry && !submitting && (
          <Button type="button" variant="secondary" onClick={() => void submit()}>
            Retry
          </Button>
        )}
      </div>
    </form>
  );
}
