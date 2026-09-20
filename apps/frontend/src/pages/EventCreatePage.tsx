import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import {
  TextInput,
  TextArea,
  Select,
  CheckboxGroup,
} from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/utils/api";
import type { EventAttachment, EventRecord } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import type { DraftFields, DraftRecord } from "@/types/draft";

const steps = [
  "Basic Information",
  "Schedule & Venue Needs",
  "Equipment & Review",
];
function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readAttachment(file: File): Promise<EventAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: String(reader.result),
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function EventCreatePage() {
  const { id } = useParams();
  return <EventRequestForm key={id ?? "new"} draftId={id} />;
}

function EventRequestForm({ draftId }: { draftId?: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [uploadFailure, setUploadFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [requestId] = useState(() => draftId ?? crypto.randomUUID());
  const version = useRef(0);
  const inFlight = useRef(false);
  const pending = useRef<{
    fields: DraftFields;
    version: number;
    operationId: string;
  } | null>(null);
  const [loading, setLoading] = useState(Boolean(draftId));
  const [loadFailure, setLoadFailure] = useState("");
  const [locked, setLocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const [minimumStartDate] = useState(todayInputValue);
  const [form, setForm] = useState({
    name: "",
    purpose: "",
    description: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    expectedAttendance: "",
    layout: "",
    facilities: [] as string[],
    accessibility: [] as string[],
    attachments: [] as EventAttachment[],
    equipmentNeeds: "",
  });
  useEffect(() => {
    if (!draftId) return;
    let active = true;
    api<DraftRecord>(`/requests/${draftId}`)
      .then((result) => {
        if (!active) return;
        version.current = result.version;
        if (result.status !== "Draft") setLocked(true);
        else {
          const { formStep, ...values } = result.fields;
          setForm(values);
          setStep(
            Number.isInteger(formStep) &&
              formStep! >= 0 &&
              formStep! < steps.length
              ? formStep!
              : 0,
          );
        }
      })
      .catch((error) => {
        if (active)
          setLoadFailure(
            error instanceof Error
              ? error.message
              : "Unable to load this request.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [draftId]);

  async function persistDraft() {
    const snapshot = { ...form, formStep: step };
    // Retry the exact uncertain operation before saving any edits made after a failure.
    let last: DraftRecord | undefined;
    if (pending.current) {
      last = await api<DraftRecord>(`/requests/${requestId}`, {
        method: "PUT",
        body: JSON.stringify(pending.current),
      });
      version.current = last.version;
      const unchanged =
        JSON.stringify(pending.current.fields) === JSON.stringify(snapshot);
      pending.current = null;
      if (unchanged) return last;
    }
    pending.current = {
      fields: snapshot,
      version: version.current,
      operationId: crypto.randomUUID(),
    };
    last = await api<DraftRecord>(`/requests/${requestId}`, {
      method: "PUT",
      body: JSON.stringify(pending.current),
    });
    version.current = last.version;
    pending.current = null;
    return last;
  }
  async function saveDraft() {
    if (inFlight.current || readingFiles || locked) return;
    inFlight.current = true;
    setBusy(true);
    setSaving(true);
    setFailure("");
    try {
      await persistDraft();
      setErrors({});
      setSaved(true);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Unable to save draft. Please try again.",
      );
      if (error instanceof ApiError && error.errors) {
        setErrors(error.errors);
        pending.current = null;
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      setSaving(false);
    }
  }
  const change = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((f) => ({ ...f, [key]: value }));
  function validate() {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Enter an event name.";
    if (!form.purpose.trim()) next.purpose = "Enter the purpose of your event.";
    if (!form.description.trim())
      next.description = "Enter a description of your event.";
    if (step > 0) {
      for (const key of [
        "startDate",
        "startTime",
        "endDate",
        "endTime",
      ] as const)
        if (!form[key]) next[key] = "This field is required.";
      const start = new Date(`${form.startDate}T${form.startTime}`);
      const end = new Date(`${form.endDate}T${form.endTime}`);
      if (form.startDate && form.startTime && !Number.isFinite(start.getTime()))
        next.startDate = "Enter a valid start date and time.";
      if (
        form.startDate &&
        form.startTime &&
        Number.isFinite(start.getTime()) &&
        start <= new Date()
      )
        next.startDate = "Start date and time must be in the future.";
      if (
        form.endDate &&
        form.endTime &&
        (!Number.isFinite(end.getTime()) || end <= start)
      )
        next.endDate = "End must be after start.";
      const count = Number(form.expectedAttendance);
      if (!Number.isInteger(count) || count < 1 || count > 2147483647)
        next.expectedAttendance = "Enter a positive whole number of attendees.";
      if (!form.layout) next.layout = "Choose a preferred room layout.";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      if (next.name || next.purpose || next.description) setStep(0);
      else setStep(1);
      return false;
    }
    return true;
  }
  async function addFiles(files: File[] | null) {
    if (!files?.length) return;
    setUploadFailure("");
    if (form.attachments.length + files.length > 5) {
      setUploadFailure("Use up to five files.");
      return;
    }
    const existingBytes = form.attachments.reduce(
      (total, attachment) => total + attachment.size,
      0,
    );
    const incomingBytes = Array.from(files).reduce(
      (total, file) => total + file.size,
      0,
    );
    if (existingBytes + incomingBytes > 50 * 1024 * 1024) {
      setUploadFailure("Use up to five files, 50 MB total.");
      return;
    }
    setReadingFiles(true);
    try {
      const attachments = await Promise.all(
        Array.from(files).map(readAttachment),
      );
      setForm((f) => ({
        ...f,
        attachments: [...f.attachments, ...attachments],
      }));
    } catch {
      setUploadFailure("Unable to read the selected file. Please try again.");
    } finally {
      setReadingFiles(false);
    }
  }
  function removeFile(id: string) {
    setForm((f) => ({
      ...f,
      attachments: f.attachments.filter((attachment) => attachment.id !== id),
    }));
  }
  async function advance(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || readingFiles || locked || !validate()) return;
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    inFlight.current = true;
    setFailure("");
    try {
      const isDraft =
        Boolean(draftId) || version.current > 0 || Boolean(pending.current);
      if (isDraft) await persistDraft();
      const result = await api<{ event: EventRecord; message: string }>(
        isDraft ? `/requests/${requestId}/submit` : "/events",
        {
          method: "POST",
          body: JSON.stringify({
            version: version.current,
            name: form.name,
            purpose: form.purpose,
            description: form.description,
            startDateTime: new Date(
              `${form.startDate}T${form.startTime}`,
            ).toISOString(),
            endDateTime: new Date(
              `${form.endDate}T${form.endTime}`,
            ).toISOString(),
            expectedAttendance: Number(form.expectedAttendance),
            layout: form.layout,
            facilities: form.facilities,
            accessibility: form.accessibility,
            attachments: form.attachments,
            equipmentNeeds: form.equipmentNeeds,
            submissionKey,
          }),
        },
      );
      useAppStore.setState((s) => ({
        events: [
          result.event,
          ...s.events.filter((e) => e.id !== result.event.id),
        ],
      }));
      navigate(`/events/${result.event.id}`, { state: { submitted: true } });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Unable to submit. Please try again.",
      );
      if (error instanceof ApiError && error.errors) setErrors(error.errors);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  if (loading) return <p role="status">Loading draft…</p>;
  if (loadFailure || locked)
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title={locked ? "Request submitted" : "Unable to open request"}
        />
        <p role="alert">
          {loadFailure ||
            "This request has been submitted. Further changes must follow the Event Change Requests workflow."}
        </p>
        <Link className="mt-4 inline-block text-primary-700" to="/requests">
          Back to My drafts
        </Link>
      </div>
    );
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={draftId ? "Edit Draft Request" : "Create New Event Request"}
        description="Share your event plans for review and approval."
      />
      <ol className="mb-7 grid grid-cols-3 gap-3" aria-label="Request progress">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={`text-center text-xs ${index <= step ? "text-primary-700" : "text-gray-400"}`}
          >
            <span
              className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full border ${index <= step ? "border-primary-600 bg-primary-600 text-white" : "border-gray-300"}`}
            >
              {index < step ? "✓" : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <form noValidate onSubmit={advance}>
        <fieldset disabled={busy || readingFiles}>
          <Card>
            <CardBody>
              <p className="mb-5 text-xs text-gray-500">
                Fields marked * are required to submit. You can save an
                incomplete draft at any step.
              </p>
              {step === 0 && (
                <>
                  <TextInput
                    label="Event name"
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(e) => change("name", e.target.value)}
                    error={errors.name}
                  />
                  <TextInput
                    label="Purpose"
                    required
                    maxLength={500}
                    placeholder="e.g. Community building"
                    value={form.purpose}
                    onChange={(e) => change("purpose", e.target.value)}
                    error={errors.purpose}
                  />
                  <TextArea
                    label="Description"
                    required
                    maxLength={5000}
                    placeholder="Give reviewers context on what this event involves."
                    value={form.description}
                    onChange={(e) => change("description", e.target.value)}
                    error={errors.description}
                  />
                </>
              )}
              {step === 1 && (
                <>
                  <p className="mb-4 text-xs text-gray-500">
                    Dates and times use your local time zone (
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}).
                  </p>
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <TextInput
                      label="Start date"
                      type="date"
                      required
                      min={minimumStartDate}
                      value={form.startDate}
                      onChange={(e) => change("startDate", e.target.value)}
                      error={errors.startDate || errors.startDateTime}
                    />
                    <TextInput
                      label="Start time"
                      type="time"
                      required
                      value={form.startTime}
                      onChange={(e) => change("startTime", e.target.value)}
                      error={errors.startTime}
                    />
                    <TextInput
                      label="End date"
                      type="date"
                      required
                      min={minimumStartDate}
                      value={form.endDate}
                      onChange={(e) => change("endDate", e.target.value)}
                      error={errors.endDate || errors.endDateTime}
                    />
                    <TextInput
                      label="End time"
                      type="time"
                      required
                      value={form.endTime}
                      onChange={(e) => change("endTime", e.target.value)}
                      error={errors.endTime}
                    />
                  </div>
                  <TextInput
                    label="Expected attendance"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={form.expectedAttendance}
                    onChange={(e) =>
                      change("expectedAttendance", e.target.value)
                    }
                    error={errors.expectedAttendance}
                  />
                  <Select
                    label="Preferred room layout"
                    required
                    value={form.layout}
                    onChange={(e) => change("layout", e.target.value)}
                    error={errors.layout}
                    options={[
                      "Theatre",
                      "Classroom",
                      "Banquet",
                      "Boardroom",
                      "U-shape",
                      "Standing",
                    ].map((value) => ({ value, label: value }))}
                  />
                  <CheckboxGroup
                    label="Required facilities"
                    options={[
                      "Catering",
                      "AV System",
                      "Parking",
                      "Stage",
                      "Projector",
                      "Whiteboard",
                    ]}
                    values={form.facilities}
                    onChange={(value) => change("facilities", value)}
                  />
                  <CheckboxGroup
                    label="Accessibility needs"
                    options={[
                      "Wheelchair ramps",
                      "Accessible restrooms",
                      "Hearing loop",
                      "Elevator access",
                    ]}
                    values={form.accessibility}
                    onChange={(value) => change("accessibility", value)}
                  />
                  <div className="mb-4">
                    <label
                      htmlFor="supporting-files"
                      className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Supporting files
                    </label>
                    <input
                      id="supporting-files"
                      type="file"
                      multiple
                      onChange={(event) => {
                        const input = event.target;
                        // Snapshot the File objects before clearing the input:
                        // resetting value empties input.files, but the captured
                        // File refs stay valid. Clearing it means a rejected
                        // (or removed-then-reselected) file doesn't linger next
                        // to the button, and re-picking the same file re-fires
                        // onChange.
                        const selected = input.files
                          ? Array.from(input.files)
                          : [];
                        input.value = "";
                        void addFiles(selected);
                      }}
                      className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-700 dark:text-gray-300"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Optional. Upload up to five supporting files (50 MB
                      total) for the coordinator to review.
                    </p>
                    {(uploadFailure || errors.attachments) && (
                      <p className="mt-1 text-xs text-danger-600" role="alert">
                        {uploadFailure || errors.attachments}
                      </p>
                    )}
                    {form.attachments.length > 0 && (
                      <ul className="mt-3 space-y-2 text-sm">
                        {form.attachments.map((attachment) => (
                          <li
                            key={attachment.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
                          >
                            <span className="truncate">{attachment.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(attachment.id)}
                            >
                              Remove
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <TextArea
                    label="Equipment needs"
                    maxLength={2000}
                    placeholder="e.g. Two wireless microphones and a portable speaker"
                    value={form.equipmentNeeds}
                    onChange={(e) => change("equipmentNeeds", e.target.value)}
                  />
                  <div className="rounded-lg bg-gray-50 p-4">
                    <h2 className="mb-4 text-sm font-semibold">
                      Review your request
                    </h2>
                    <dl className="space-y-3 text-sm">
                      {Object.entries({
                        "Event name": form.name,
                        Purpose: form.purpose,
                        Description: form.description,
                        Start: `${form.startDate} ${form.startTime}`,
                        End: `${form.endDate} ${form.endTime}`,
                        Attendance: form.expectedAttendance,
                        Layout: form.layout,
                        Facilities: form.facilities.join(", "),
                        Accessibility: form.accessibility.join(", "),
                        Files: form.attachments
                          .map((file) => file.name)
                          .join(", "),
                        Equipment: form.equipmentNeeds,
                      }).map(([label, value]) => (
                        <div
                          key={label}
                          className="grid grid-cols-[100px_1fr] gap-3"
                        >
                          <dt className="text-gray-500">{label}</dt>
                          <dd className="whitespace-pre-wrap break-words">
                            {value || "None specified"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <p className="mt-4 text-sm text-gray-500">
                    Your request will be submitted for review. You can view its
                    details in My Events.
                  </p>
                </>
              )}
            </CardBody>
          </Card>
          {failure && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {failure}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            {step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(step - 1)}
              >
                ← Back
              </Button>
            ) : (
              <Link className="text-sm text-gray-500" to="/requests">
                ← My drafts
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || readingFiles}
                onClick={() => void saveDraft()}
              >
                {saving ? "Saving…" : "Save draft"}
              </Button>
              <Button type="submit" disabled={busy || readingFiles}>
                {busy
                  ? saving
                    ? "Continue ▸"
                    : "Submitting…"
                  : step === 2
                    ? "Submit for Review"
                    : "Continue ▸"}
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
      {saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-saved-title"
            onKeyDown={(event) => {
              if (event.key === "Tab") event.preventDefault();
            }}
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"
          >
            <h2 id="draft-saved-title" className="text-lg font-semibold">
              Draft saved
            </h2>
            <p className="my-4 text-sm">
              Your request is saved as Draft and has not been submitted. Reopen
              it from My drafts to continue.
            </p>
            <Button autoFocus onClick={() => navigate("/requests")}>
              OK
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
