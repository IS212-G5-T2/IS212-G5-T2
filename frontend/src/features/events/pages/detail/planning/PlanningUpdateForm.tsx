/*
 * SPM-49 — the assigned coordinator updates event information during planning.
 *
 * - Pre-filled with the current information (AC1).
 * - Every field carries a badge from the server's editableFields (AC2):
 *   "Applies immediately" (always direct), "Needs review" (any change is
 *   flagged) or "Review if it affects bookings" (conditional: the rule is shown
 *   under the field, and once the field is edited the form says whether that
 *   value will apply immediately or be sent for review).
 * - "Save changes" sends only the fields that actually changed (AC3, AC5). The
 *   server applies every change that stays compatible with existing bookings
 *   and flags only the incompatible ones (SPM-85 AC1).
 * - Blank required fields are caught before sending, and server field errors
 *   are shown beside their field; typed values are never lost on error (AC4).
 * - Shows when the information was last updated (AC6).
 *
 * The form always shows the event's authoritative current values. After a
 * save it resets to the event the server returned, so a value that was only
 * proposed for review is not left in the field (where it could be mistaken for
 * the current value or submitted again). Pending proposals are shown
 * separately under their field, which stays locked until the change is
 * resolved, matching the server's one-pending-change-per-field rule.
 *
 * When the parent passes a newer event (polling or after a decision), fields
 * the coordinator has not touched take the new values; edits in progress are
 * kept.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxGroup, Select, TextArea, TextInput } from "@/components/ui/FormControls";
import type {
  EventRecord,
  FlaggedChange,
  PlanningEditableField,
  PlanningFieldMode,
  PlanningUpdatePatch,
  PlanningUpdateResult,
} from "@/types";
import { ApiError } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
import {
  ACCESSIBILITY,
  FACILITIES,
  LAYOUTS,
  describeCondition,
  fieldLabel,
  formatFieldValue,
  satisfiesCondition,
} from "@/utils/planning";

interface Props {
  event: EventRecord;
  editableFields: PlanningEditableField[];
  lastUpdatedAt: string;
  /** Changes awaiting review; their fields are locked and the proposal is shown. */
  pendingChanges?: FlaggedChange[];
  onSave: (patch: PlanningUpdatePatch) => Promise<PlanningUpdateResult | void | unknown>;
}

interface FormValues {
  name: string;
  purpose: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  expectedAttendance: string;
  layout: string;
  facilities: string[];
  accessibility: string[];
  equipmentNeeds: string;
}

type FieldKey = keyof FormValues;
const FIELD_KEYS: FieldKey[] = [
  "name",
  "purpose",
  "description",
  "startDateTime",
  "endDateTime",
  "expectedAttendance",
  "layout",
  "facilities",
  "accessibility",
  "equipmentNeeds",
];

// ISO (UTC) → value for <input type="datetime-local"> in the user's time zone.
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// datetime-local value (local time) → ISO UTC string the API expects.
function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

function initialValues(event: EventRecord): FormValues {
  return {
    name: event.name,
    purpose: event.purpose,
    description: event.description,
    startDateTime: toLocalInput(event.startDateTime),
    endDateTime: toLocalInput(event.endDateTime),
    expectedAttendance: String(event.expectedAttendance),
    layout: event.venueRequirements.layout,
    facilities: [...event.venueRequirements.facilities],
    accessibility: [...event.venueRequirements.accessibility],
    equipmentNeeds: event.equipmentNeeds,
  };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((v) => b.includes(v));

function sameValue(a: FormValues[FieldKey], b: FormValues[FieldKey]): boolean {
  return Array.isArray(a) && Array.isArray(b) ? sameSet(a, b) : a === b;
}

/** Newer authoritative values for untouched fields; in-progress edits stay. */
function mergeUntouched(values: FormValues, baseline: FormValues, incoming: FormValues): FormValues {
  const merged = { ...values } as Record<FieldKey, FormValues[FieldKey]>;
  for (const key of FIELD_KEYS) if (sameValue(values[key], baseline[key])) merged[key] = incoming[key];
  return merged as FormValues;
}

const BADGE = "inline-flex rounded-full px-2 py-0.5 text-xs font-medium";
const BADGES: Record<PlanningFieldMode, { text: string; className: string }> = {
  direct: {
    text: "Applies immediately",
    className: "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300",
  },
  conditional: {
    text: "Review if it affects bookings",
    className: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  },
  needs_review: {
    text: "Needs review",
    className: "bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300",
  },
};

function PolicyBadge({ mode }: { mode?: PlanningFieldMode }) {
  if (!mode) return null;
  const badge = BADGES[mode];
  return <span className={`${BADGE} ${badge.className}`}>{badge.text}</span>;
}

export function PlanningUpdateForm({ event, editableFields, lastUpdatedAt, pendingChanges = [], onSave }: Props) {
  const incoming = initialValues(event);
  const incomingKey = JSON.stringify(incoming);
  const [baseline, setBaseline] = useState<FormValues>(incoming);
  const [values, setValues] = useState<FormValues>(incoming);
  const [syncedKey, setSyncedKey] = useState(incomingKey);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // A newer authoritative event arrived from the parent: adopt it for every
  // field the coordinator has not touched (React's "adjust state on prop
  // change" pattern, so no extra render with stale values).
  if (syncedKey !== incomingKey) {
    setSyncedKey(incomingKey);
    setValues((current) => mergeUntouched(current, baseline, incoming));
    setBaseline(incoming);
  }

  const entries = Object.fromEntries(editableFields.map((f) => [f.field, f])) as Record<string, PlanningEditableField>;
  const pendingByField = Object.fromEntries(pendingChanges.map((c) => [c.field, c])) as Record<string, FlaggedChange>;
  const set = <K extends FieldKey>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const locked = (key: FieldKey) => !!pendingByField[key];

  /** Whether the edited value of a conditional field would apply immediately. */
  function predictedOutcome(key: FieldKey): "immediate" | "review" | null {
    const entry = entries[key];
    if (entry?.mode !== "conditional" || !entry.condition) return null;
    const touched =
      key === "startDateTime" || key === "endDateTime"
        ? values.startDateTime !== baseline.startDateTime || values.endDateTime !== baseline.endDateTime
        : !sameValue(values[key], baseline[key]);
    if (!touched) return null;
    const toIso = (v: string) => (v ? fromLocalInput(v) : undefined);
    const ok = satisfiesCondition(entry.condition, {
      startDateTime: toIso(values.startDateTime),
      endDateTime: toIso(values.endDateTime),
      expectedAttendance: Number(values.expectedAttendance),
      facilities: values.facilities,
      currentFacilities: baseline.facilities,
    });
    return ok ? "immediate" : "review";
  }

  const field = (key: FieldKey, control: ReactNode) => {
    const entry = entries[key];
    const pending = pendingByField[key];
    const outcome = pending ? null : predictedOutcome(key);
    return (
      <div>
        <div className="mb-1 flex justify-end">
          <PolicyBadge mode={entry?.mode} />
        </div>
        {control}
        {pending ? (
          <p
            data-testid={`pending-${key}`}
            className="-mt-3 mb-4 rounded-md border border-warning-300 bg-warning-50 px-2 py-1 text-xs text-warning-900 dark:border-warning-700 dark:bg-warning-900/20 dark:text-warning-200"
          >
            Awaiting review — proposed: {formatFieldValue(pending.field, pending.proposedValue)}. The value above is
            still current. Confirm or reject it under “Changes awaiting review” before changing this field again.
          </p>
        ) : (
          entry?.condition && (
            <p className="-mt-3 mb-4 text-xs text-gray-500 dark:text-gray-400">
              {describeCondition(entry.condition)}
              {outcome && (
                <span
                  className={`ml-1 font-medium ${outcome === "immediate" ? "text-success-700 dark:text-success-300" : "text-warning-800 dark:text-warning-300"}`}
                >
                  {outcome === "immediate" ? "This change will apply immediately." : "This change will be sent for review."}
                </span>
              )}
            </p>
          )
        )}
      </div>
    );
  };

  /** Client-side checks; the server repeats them (and more) authoritatively. */
  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    for (const key of ["name", "purpose", "description", "layout", "startDateTime", "endDateTime"] as const)
      if (!values[key].trim()) found[key] = `${fieldLabel(key)} is required.`;
    if (!values.expectedAttendance.trim()) found.expectedAttendance = "Expected attendance is required.";
    else if (!/^\d+$/.test(values.expectedAttendance.trim()) || Number(values.expectedAttendance) < 1)
      found.expectedAttendance = "Enter a positive whole number of attendees.";
    if (!found.startDateTime && !found.endDateTime && new Date(values.endDateTime) <= new Date(values.startDateTime))
      found.endDateTime = "End must be after start.";
    return found;
  }

  function changedFields(): PlanningUpdatePatch {
    const patch: PlanningUpdatePatch = {};
    for (const key of ["name", "purpose", "description", "equipmentNeeds", "layout"] as const)
      if (values[key].trim() !== baseline[key].trim()) patch[key] = values[key].trim();
    for (const key of ["startDateTime", "endDateTime"] as const)
      if (values[key] !== baseline[key]) patch[key] = fromLocalInput(values[key]);
    if (values.expectedAttendance.trim() !== baseline.expectedAttendance)
      patch.expectedAttendance = Number(values.expectedAttendance);
    for (const key of ["facilities", "accessibility"] as const)
      if (!sameSet(values[key], baseline[key])) patch[key] = values[key];
    return patch;
  }

  /**
   * After a successful save, show the authoritative values. With the server's
   * event that is exact; without one (older callers), applied fields keep the
   * saved value and flagged fields return to their current value.
   */
  function resetAfterSave(result: Partial<PlanningUpdateResult> | undefined) {
    let next: FormValues;
    if (result?.event) next = initialValues(result.event);
    else {
      const flaggedFields = new Set((result?.flagged ?? []).map((c) => c.field));
      next = { ...values } as FormValues;
      for (const key of FIELD_KEYS)
        if (flaggedFields.has(key)) (next as Record<FieldKey, unknown>)[key] = baseline[key];
    }
    setBaseline(next);
    setValues(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setNotice({ tone: "error", text: "Please correct the highlighted fields." });
      return;
    }
    const patch = changedFields();
    if (!Object.keys(patch).length) {
      setNotice({ tone: "error", text: "No changes to save." });
      return;
    }
    setSaving(true);
    try {
      const result = (await onSave(patch)) as Partial<PlanningUpdateResult> | undefined;
      resetAfterSave(result);
      const applied = result?.applied?.length ?? 0;
      const flagged = result?.flagged ?? [];
      const flaggedNames = flagged.map((c) => c.field).filter(Boolean).map(fieldLabel).join(", ");
      const reason = `because they affect existing bookings${flaggedNames ? ` (${flaggedNames})` : ""}`;
      setNotice({
        tone: "success",
        text: !flagged.length
          ? "Changes saved."
          : applied
            ? `Saved. ${applied} change(s) applied; ${flagged.length} sent for review ${reason}.`
            : `${flagged.length} change(s) sent for review ${reason}. The current values stay in place until you confirm.`,
      });
    } catch (error) {
      // Keep everything the coordinator typed; show the server's field errors.
      if (error instanceof ApiError) {
        setErrors(error.errors ?? {});
        setNotice({ tone: "error", text: error.message });
      } else {
        setNotice({ tone: "error", text: "Could not save changes. Please try again." });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Update event information">
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Last updated: <time dateTime={lastUpdatedAt}>{formatDateTime(lastUpdatedAt)}</time>
      </p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {field("name", <TextInput id="planning-name" label="Event name" required value={values.name} error={errors.name} onChange={(e) => set("name", e.target.value)} />)}
        {field("purpose", <TextInput id="planning-purpose" label="Purpose" required value={values.purpose} error={errors.purpose} onChange={(e) => set("purpose", e.target.value)} />)}
        {field("startDateTime", <TextInput id="planning-start" type="datetime-local" label="Start date & time" required disabled={locked("startDateTime")} value={values.startDateTime} error={errors.startDateTime} onChange={(e) => set("startDateTime", e.target.value)} />)}
        {field("endDateTime", <TextInput id="planning-end" type="datetime-local" label="End date & time" required disabled={locked("endDateTime")} value={values.endDateTime} error={errors.endDateTime} onChange={(e) => set("endDateTime", e.target.value)} />)}
        {field("expectedAttendance", <TextInput id="planning-attendance" type="number" min={1} step={1} label="Expected attendance" required disabled={locked("expectedAttendance")} value={values.expectedAttendance} error={errors.expectedAttendance} onChange={(e) => set("expectedAttendance", e.target.value)} />)}
        {field("layout", <Select id="planning-layout" label="Room layout" required disabled={locked("layout")} value={values.layout} error={errors.layout} options={LAYOUTS.map((l) => ({ value: l, label: l }))} onChange={(e) => set("layout", e.target.value)} />)}
      </div>
      {field("description", <TextArea id="planning-description" label="Description" required value={values.description} error={errors.description} onChange={(e) => set("description", e.target.value)} />)}
      {field("facilities", <CheckboxGroup label="Required facilities" options={FACILITIES} values={values.facilities} disabled={locked("facilities")} onChange={(v) => set("facilities", v)} />)}
      {errors.facilities && <p role="alert" className="-mt-3 mb-4 text-xs text-danger-600">{errors.facilities}</p>}
      {field("accessibility", <CheckboxGroup label="Accessibility needs" options={ACCESSIBILITY} values={values.accessibility} onChange={(v) => set("accessibility", v)} />)}
      {errors.accessibility && <p role="alert" className="-mt-3 mb-4 text-xs text-danger-600">{errors.accessibility}</p>}
      {field("equipmentNeeds", <TextArea id="planning-equipment" label="Equipment requirements" disabled={locked("equipmentNeeds")} value={values.equipmentNeeds} error={errors.equipmentNeeds} onChange={(e) => set("equipmentNeeds", e.target.value)} />)}

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mb-3 text-sm ${notice.tone === "error" ? "text-danger-600 dark:text-danger-400" : "text-success-700 dark:text-success-300"}`}
        >
          {notice.text}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
