/*
 * SPM-49 — the assigned coordinator updates event information during planning.
 *
 * - Pre-filled with the current information (AC1).
 * - Every field carries an "Applies immediately" or "Needs review" badge from
 *   the server's editableFields (AC2). "Needs review" means a venue booking or
 *   equipment arrangement exists, so the change is flagged for SPM-85 review
 *   instead of being applied.
 * - "Save changes" sends only the fields that actually changed (AC3, AC5).
 * - Blank required fields are caught before sending, and server field errors
 *   are shown beside their field; typed values are never lost (AC4).
 * - Shows when the information was last updated (AC6).
 *
 * The parent should remount this form (key) when the event's updatedAt
 * changes so it re-reads the saved values.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxGroup, Select, TextArea, TextInput } from "@/components/ui/FormControls";
import type { EventRecord, PlanningFieldMode, PlanningUpdatePatch, PlanningUpdateResult } from "@/types";
import { ApiError } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
import { ACCESSIBILITY, FACILITIES, LAYOUTS, fieldLabel } from "@/utils/planning";

interface Props {
  event: EventRecord;
  editableFields: Array<{ field: string; mode: PlanningFieldMode }>;
  lastUpdatedAt: string;
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

function PolicyBadge({ mode }: { mode?: PlanningFieldMode }) {
  if (!mode) return null;
  return mode === "direct" ? (
    <span className="inline-flex rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-800 dark:bg-success-900/30 dark:text-success-300">
      Applies immediately
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
      Needs review
    </span>
  );
}

export function PlanningUpdateForm({ event, editableFields, lastUpdatedAt, onSave }: Props) {
  const [original] = useState(() => initialValues(event));
  const [values, setValues] = useState<FormValues>(original);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const modes = Object.fromEntries(editableFields.map((f) => [f.field, f.mode])) as Record<string, PlanningFieldMode>;
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const field = (key: keyof FormValues, control: ReactNode) => (
    <div>
      <div className="mb-1 flex justify-end">
        <PolicyBadge mode={modes[key]} />
      </div>
      {control}
    </div>
  );

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
      if (values[key].trim() !== original[key].trim()) patch[key] = values[key].trim();
    for (const key of ["startDateTime", "endDateTime"] as const)
      if (values[key] !== original[key]) patch[key] = fromLocalInput(values[key]);
    if (values.expectedAttendance.trim() !== original.expectedAttendance)
      patch.expectedAttendance = Number(values.expectedAttendance);
    for (const key of ["facilities", "accessibility"] as const)
      if (!sameSet(values[key], original[key])) patch[key] = values[key];
    return patch;
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
      const applied = result?.applied?.length ?? 0;
      const flagged = result?.flagged?.length ?? 0;
      setNotice({
        tone: "success",
        text: flagged
          ? `Saved. ${applied} change(s) applied; ${flagged} sent for review because bookings already exist.`
          : "Changes saved.",
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
        {field("startDateTime", <TextInput id="planning-start" type="datetime-local" label="Start date & time" required value={values.startDateTime} error={errors.startDateTime} onChange={(e) => set("startDateTime", e.target.value)} />)}
        {field("endDateTime", <TextInput id="planning-end" type="datetime-local" label="End date & time" required value={values.endDateTime} error={errors.endDateTime} onChange={(e) => set("endDateTime", e.target.value)} />)}
        {field("expectedAttendance", <TextInput id="planning-attendance" type="number" min={1} step={1} label="Expected attendance" required value={values.expectedAttendance} error={errors.expectedAttendance} onChange={(e) => set("expectedAttendance", e.target.value)} />)}
        {field("layout", <Select id="planning-layout" label="Room layout" required value={values.layout} error={errors.layout} options={LAYOUTS.map((l) => ({ value: l, label: l }))} onChange={(e) => set("layout", e.target.value)} />)}
      </div>
      {field("description", <TextArea id="planning-description" label="Description" required value={values.description} error={errors.description} onChange={(e) => set("description", e.target.value)} />)}
      {field("facilities", <CheckboxGroup label="Required facilities" options={FACILITIES} values={values.facilities} onChange={(v) => set("facilities", v)} />)}
      {errors.facilities && <p role="alert" className="-mt-3 mb-4 text-xs text-danger-600">{errors.facilities}</p>}
      {field("accessibility", <CheckboxGroup label="Accessibility needs" options={ACCESSIBILITY} values={values.accessibility} onChange={(v) => set("accessibility", v)} />)}
      {errors.accessibility && <p role="alert" className="-mt-3 mb-4 text-xs text-danger-600">{errors.accessibility}</p>}
      {field("equipmentNeeds", <TextArea id="planning-equipment" label="Equipment requirements" value={values.equipmentNeeds} error={errors.equipmentNeeds} onChange={(e) => set("equipmentNeeds", e.target.value)} />)}

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
