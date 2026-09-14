import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [uploadFailure, setUploadFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submissionKey] = useState(() => crypto.randomUUID());
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
      if (next.name || next.purpose) setStep(0);
      else setStep(1);
      return false;
    }
    return true;
  }
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploadFailure("");
    try {
      const attachments = await Promise.all(Array.from(files).map(readAttachment));
      setForm((f) => ({
        ...f,
        attachments: [...f.attachments, ...attachments],
      }));
    } catch {
      setUploadFailure("Unable to read the selected file. Please try again.");
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
    if (busy || !validate()) return;
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      const result = await api<{ event: EventRecord; message: string }>(
        "/events",
        {
          method: "POST",
          body: JSON.stringify({
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
    }
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Create New Event Request"
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
        <fieldset disabled={busy}>
          <Card>
            <CardBody>
              <p className="mb-5 text-xs text-gray-500">
                Fields marked * are required.
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
                      onChange={(event) => void addFiles(event.target.files)}
                      className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-700 dark:text-gray-300"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Optional. Upload supporting files for the coordinator to review.
                    </p>
                    {uploadFailure && (
                      <p className="mt-1 text-xs text-danger-600" role="alert">
                        {uploadFailure}
                      </p>
                    )}
                    {form.attachments.length > 0 && (
                      <ul className="mt-3 space-y-2 text-sm">
                        {form.attachments.map((attachment) => (
                          <li
                            key={attachment.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
                          >
                            <span className="truncate">
                              {attachment.name}
                            </span>
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
                        Files: form.attachments.map((file) => file.name).join(", "),
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
          <div className="mt-5 flex items-center justify-between">
            {step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(step - 1)}
              >
                ← Back
              </Button>
            ) : (
              <Link className="text-sm text-gray-500" to="/events">
                ← My Events
              </Link>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? "Submitting…"
                : step === 2
                  ? "Submit for Review"
                  : "Continue ▸"}
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
