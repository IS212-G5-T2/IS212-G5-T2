/*
 * SPM-139: the assigned coordinator sets the registration period and capacity, and switches registration on or off.
 * The server decides every rule and answers with field errors; this form only checks the same rules first so the
 * problem is explained before a request is sent, and it keeps what was typed when a save is refused.
 * An event outside Approved, Planning and Confirmed shows its saved settings read-only (BR13).
 */
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/FormControls";
import { ApiError } from "@/utils/api";
import { formatSingaporeDateTime } from "@/utils/format";
import {
  fetchRegistrationSettings,
  saveRegistrationSettings,
  type RegistrationSettings,
} from "@/features/events/api/registration-settings-api";
import {
  checkSettingsForm,
  closingError,
  isoToSgtInput,
  SETTINGS_MESSAGES,
  type SettingsFormValues,
} from "@/features/events/lib/registrationSettings";

/** SPM-139 AC4 (v2.0): details can be set only while the event is Approved, Planning or Confirmed. */
const CONFIGURABLE_STATUSES = ["approved", "planning", "confirmed"];

interface Props {
  eventId: string;
  /** Event start (ISO), the closing time may not be after it. */
  startDateTime: string;
  /** Lower-case status as the page holds it. */
  status: string;
  /** Called after a successful save so the page can reload the event. */
  onSaved?: () => void;
}

type FieldErrors = Partial<Record<keyof SettingsFormValues | "registrationOpensAt" | "registrationClosesAt", string>>;

const FIELD_FOR_SERVER_KEY: Record<string, keyof FieldErrors> = {
  registrationOpensAt: "registrationOpensAt",
  registrationClosesAt: "registrationClosesAt",
  capacity: "capacity",
  registrationEnabled: "enabled",
};

function valuesFrom(settings: RegistrationSettings): SettingsFormValues {
  return {
    enabled: settings.registrationEnabled,
    opens: settings.registrationOpensAt ? isoToSgtInput(settings.registrationOpensAt) : "",
    closes: settings.registrationClosesAt ? isoToSgtInput(settings.registrationClosesAt) : "",
    capacity: String(settings.capacity),
  };
}

export function RegistrationSettingsForm({ eventId, startDateTime, status, onSaved }: Props) {
  const ids = useId();
  const [settings, setSettings] = useState<RegistrationSettings | null>(null);
  const [values, setValues] = useState<SettingsFormValues | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await fetchRegistrationSettings(eventId);
      setSettings(loaded);
      setValues(valuesFrom(loaded));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Registration settings could not be loaded.");
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const editable = CONFIGURABLE_STATUSES.includes(status);
  const readOnlyMessage = editable ? undefined : SETTINGS_MESSAGES.notConfigurable;

  if (loadError)
    return (
      <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
        {loadError}
      </p>
    );
  if (!settings || !values) return null;

  // The end must be after the opening time and not after the event start. Shown as soon as it is entered, and Save stays off until it is corrected.
  const liveClosesError = closingError(values.opens, values.closes, startDateTime);

  // Editing a field clears the errors of the last Save, so a corrected field never keeps showing its old message.
  const update = (patch: Partial<SettingsFormValues>) => {
    setValues({ ...values, ...patch });
    setSavedMessage(null);
    setErrors({});
  };

  const reload = async () => {
    setConflict(false);
    setErrors({});
    setFormError(null);
    await load();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSavedMessage(null);
    const check = checkSettingsForm(values, startDateTime, settings.version);
    setErrors(check.errors);
    if (!check.request) return;

    setSaving(true);
    try {
      const saved = await saveRegistrationSettings(eventId, check.request);
      setSettings(saved);
      setValues(valuesFrom(saved));
      setErrors({});
      setSavedMessage(saved.message);
      onSaved?.();
    } catch (error) {
      if (error instanceof ApiError && error.code === "SETTINGS_CONFLICT") {
        setConflict(true);
      } else if (error instanceof ApiError && error.errors) {
        const mapped: FieldErrors = {};
        for (const [key, message] of Object.entries(error.errors)) {
          const field = FIELD_FOR_SERVER_KEY[key];
          if (field) mapped[field] = message;
        }
        setErrors(mapped);
        if (Object.keys(mapped).length === 0) setFormError(error.message);
      } else {
        setFormError(error instanceof ApiError ? error.message : "Registration settings could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
        {!editable ? (
          <div className="space-y-2 text-sm">
            <p className="text-gray-600 dark:text-gray-400">{readOnlyMessage}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-gray-500 dark:text-gray-400">Registration</dt>
              <dd>{settings.registrationEnabled ? "Enabled" : "Disabled"}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Opens</dt>
              <dd>{settings.registrationOpensAt ? formatSingaporeDateTime(settings.registrationOpensAt) : "Not set"}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Closes</dt>
              <dd>{settings.registrationClosesAt ? formatSingaporeDateTime(settings.registrationClosesAt) : "Not set"}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Capacity</dt>
              <dd>{settings.capacity}</dd>
            </dl>
          </div>
        ) : (
          <form onSubmit={submit} aria-busy={saving} noValidate>
            {conflict && (
              <div role="alert" className="mb-4 rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 text-sm dark:border-warning-700 dark:bg-warning-900/20">
                <p>{SETTINGS_MESSAGES.conflict}</p>
                <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={reload}>
                  Reload
                </Button>
              </div>
            )}
            {formError && (
              <p role="alert" className="mb-4 text-sm text-danger-700 dark:text-danger-300">
                {formError}
              </p>
            )}

            <div className="mb-4 flex items-center gap-2">
              <input
                id={`${ids}-enabled`}
                type="checkbox"
                checked={values.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor={`${ids}-enabled`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Registration enabled
              </label>
            </div>

            <TextInput
              id={`${ids}-opens`}
              label="Registration opens (SGT)"
              type="datetime-local"
              value={values.opens}
              onChange={(e) => update({ opens: e.target.value })}
              error={errors.registrationOpensAt}
            />
            <TextInput
              id={`${ids}-closes`}
              label="Registration closes (SGT)"
              type="datetime-local"
              value={values.closes}
              onChange={(e) => update({ closes: e.target.value })}
              error={liveClosesError ?? errors.registrationClosesAt}
            />
            <TextInput
              id={`${ids}-capacity`}
              label="Registration capacity"
              type="text"
              inputMode="numeric"
              hint="The number of attendees who can register. Separate from venue capacity."
              value={values.capacity}
              onChange={(e) => update({ capacity: e.target.value })}
              error={errors.capacity}
            />

            {savedMessage && (
              <p role="status" className="mb-3 text-sm text-success-700 dark:text-success-300">
                {savedMessage}
              </p>
            )}

            <Button type="submit" disabled={saving || Boolean(liveClosesError)}>
              {saving ? "Saving…" : "Save registration settings"}
            </Button>
          </form>
        )}
    </div>
  );
}
