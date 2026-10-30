/*
 * SPM-64 — the organiser requests a change to a submitted event.
 *
 * - AC1: pre-filled with the current values of the permitted change types:
 *   description, date/time, attendee count, venue requirements (room layout,
 *   facilities), equipment and special requirements (accessibility needs).
 * - AC2: the event name and organiser are shown read-only; they are not inputs.
 * - Only the fields that differ from the current values are sent; an optional
 *   reason helps the coordinator.
 * - AC4: on success the parent shows the confirmation message.
 * - AC6: server errors are shown as a message (role="alert") and beside each
 *   field; the organiser's typed values are kept.
 * - Note: past approval, the form says that if the event has a safety check,
 *   approving the change will need a new one (any approved change resets it).
 *
 * Date inputs are Singapore wall time, matching the rest of the app.
 * Facility and accessibility choices come from the backend venue schema
 * (`useVenueOptions`); a retired stored value is not shown and is dropped from
 * a list the organiser edits.
 */
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxGroup, Select, TextArea, TextInput } from "@/components/ui/FormControls";
import type { ChangeRequest, ChangeRequestSubmission, EventRecord } from "@/types";
import { ApiError } from "@/utils/api";
import { useVenueOptions } from "@/features/venues/api/venue-options-api";
import { ROOM_LAYOUT_OPTIONS } from "@/features/venues/lib/venueOptions";
import { sgtLocalDateTimeToDate, toSgtLocalInput } from "@/utils/sgtDate";
import { changeFieldLabel, mayNeedSafetyCheck } from "@/features/events/lib/changeRequests";

interface Props {
  event: EventRecord;
  onSubmit: (submission: ChangeRequestSubmission) => Promise<ChangeRequest>;
  onCancel: () => void;
}

interface Values {
  description: string;
  startDateTime: string;
  endDateTime: string;
  expectedAttendance: string;
  layout: string;
  facilities: string[];
  accessibility: string[];
  equipmentNeeds: string;
  reason: string;
}

function initialValues(event: EventRecord): Values {
  return {
    description: event.description,
    startDateTime: toSgtLocalInput(event.startDateTime),
    endDateTime: toSgtLocalInput(event.endDateTime),
    expectedAttendance: String(event.expectedAttendance),
    layout: event.venueRequirements.layout,
    facilities: [...event.venueRequirements.facilities],
    accessibility: [...event.venueRequirements.accessibility],
    equipmentNeeds: event.equipmentNeeds,
    reason: "",
  };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((v) => b.includes(v));

/** The proposed values that differ from the event's current ones. */
function changedFields(
  values: Values,
  baseline: Values,
  supported: { facilities: string[]; accessibility: string[] },
): ChangeRequestSubmission["changes"] {
  const changes: ChangeRequestSubmission["changes"] = {};
  for (const key of ["description", "layout", "equipmentNeeds"] as const)
    if (values[key].trim() !== baseline[key].trim()) changes[key] = values[key].trim();
  for (const key of ["startDateTime", "endDateTime"] as const)
    if (values[key] !== baseline[key])
      changes[key] = values[key] ? sgtLocalDateTimeToDate(values[key]).toISOString() : "";
  if (values.expectedAttendance.trim() !== baseline.expectedAttendance) {
    const text = values.expectedAttendance.trim();
    // Anything that is not a whole number is sent as typed so the server names the problem.
    changes.expectedAttendance = /^\d+$/.test(text) ? Number(text) : text;
  }
  for (const key of ["facilities", "accessibility"] as const)
    // Only supported values are sent, so a retired stored value is dropped rather than refused.
    if (!sameSet(values[key], baseline[key])) changes[key] = values[key].filter((v) => supported[key].includes(v));
  return changes;
}

export function RequestChangeForm({ event, onSubmit, onCancel }: Props) {
  const [baseline] = useState(() => initialValues(event));
  const [values, setValues] = useState(baseline);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const options = useVenueOptions();

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));
  const changes = changedFields(values, baseline, options);
  const hasChanges = Object.keys(changes).length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasChanges || saving) return;
    setSaving(true);
    setMessage("");
    setErrors({});
    try {
      const reason = values.reason.trim();
      await onSubmit({ changes, ...(reason ? { reason } : {}) });
    } catch (error) {
      // AC6: keep everything typed; show the server's message and field errors.
      if (error instanceof ApiError) {
        setErrors(error.errors ?? {});
        setMessage(error.message);
      } else setMessage("Could not submit your change request. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Server errors for fields that are not inputs here (e.g. name, organiser) are listed in the alert.
  const otherErrors = Object.entries(errors).filter(([key]) => !(key in baseline));

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Request a change">
      <dl className="mb-4 grid gap-3 rounded-md bg-gray-50 p-3 text-sm sm:grid-cols-2 dark:bg-gray-800">
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Event name</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{event.name}</dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Organiser</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{event.organiserName}</dd>
        </div>
        <p className="text-xs text-gray-500 sm:col-span-2 dark:text-gray-400">
          The event name and organiser cannot be changed. Change only the details below; the assigned coordinator
          reviews your request before anything is updated.
        </p>
      </dl>

      <TextArea id="change-description" label={changeFieldLabel("description")} value={values.description} error={errors.description} onChange={(e) => set("description", e.target.value)} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextInput id="change-start" type="datetime-local" label={changeFieldLabel("startDateTime")} hint="Singapore time" value={values.startDateTime} error={errors.startDateTime} onChange={(e) => set("startDateTime", e.target.value)} />
        <TextInput id="change-end" type="datetime-local" label={changeFieldLabel("endDateTime")} hint="Singapore time" value={values.endDateTime} error={errors.endDateTime} onChange={(e) => set("endDateTime", e.target.value)} />
        <TextInput id="change-attendance" type="number" min={1} step={1} label={changeFieldLabel("expectedAttendance")} value={values.expectedAttendance} error={errors.expectedAttendance} onChange={(e) => set("expectedAttendance", e.target.value)} />
        <Select id="change-layout" label={changeFieldLabel("layout")} value={values.layout} error={errors.layout} options={ROOM_LAYOUT_OPTIONS.map((l) => ({ value: l, label: l }))} onChange={(e) => set("layout", e.target.value)} />
      </div>
      {(["facilities", "accessibility"] as const).map((key) => (
        <div key={key}>
          <CheckboxGroup
            label={changeFieldLabel(key)}
            options={options[key]}
            values={values[key].filter((v) => options[key].includes(v))}
            disabled={options.status !== "loaded"}
            onChange={(v) => set(key, v)}
          />
          {options.status === "loading" && <p className="-mt-3 mb-4 text-xs text-gray-500 dark:text-gray-400">Loading options…</p>}
          {options.status === "error" && (
            <p role="alert" className="-mt-3 mb-4 text-xs text-danger-600">
              Could not load the {changeFieldLabel(key).toLowerCase()} options. {options.error}{" "}
              <button type="button" className="underline" onClick={options.retry}>
                Try again
              </button>
            </p>
          )}
          {errors[key] && <p role="alert" className="-mt-3 mb-4 text-xs text-danger-600">{errors[key]}</p>}
        </div>
      ))}
      <TextArea id="change-equipment" label={changeFieldLabel("equipmentNeeds")} value={values.equipmentNeeds} error={errors.equipmentNeeds} onChange={(e) => set("equipmentNeeds", e.target.value)} />
      <TextArea id="change-reason" label="Reason for the change (optional)" maxLength={500} value={values.reason} error={errors.reason} onChange={(e) => set("reason", e.target.value)} />

      {mayNeedSafetyCheck(event) && (
        <p role="note" className="mb-3 rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-xs text-warning-900 dark:border-warning-700 dark:bg-warning-900/20 dark:text-warning-200">
          If this event has a safety check, approving this change will require a new safety check before the event can be confirmed.
        </p>
      )}

      {message && (
        <div role="alert" className="mb-3 text-sm text-danger-600 dark:text-danger-400">
          <p>{message}</p>
          {otherErrors.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {otherErrors.map(([key, text]) => (
                <li key={key}>{text}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!hasChanges || saving}>
          {saving ? "Submitting…" : "Submit Change Request"}
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {!hasChanges && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Change at least one detail to submit a request.</p>
      )}
    </form>
  );
}
