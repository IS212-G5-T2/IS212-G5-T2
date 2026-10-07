import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { CheckboxGroup, TextArea, TextInput } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import type { VenueCreateInput, VenueImage } from "@/types";
import { readFileAsDataUrl } from "@/utils/uploads";
import { FACILITY_OPTIONS, ROOM_LAYOUT_OPTIONS } from "@/utils/venueOptions";

type Field = Exclude<
  keyof VenueCreateInput,
  "accessibility" | "facilities" | "layouts" | "image" | "operatingDays"
>;

const accessibilityOptions = [
  "Wheelchair access",
  "Accessible restrooms",
  "Hearing loop",
  "Elevator access",
];
const operatingDayOptions = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MAX_DURATION_MINUTES = 2_147_483_647;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const durationHelp: Record<"setupTimeMinutes" | "turnaroundTimeMinutes", string> = {
  setupTimeMinutes: "Time needed to prepare the venue before an event starts.",
  turnaroundTimeMinutes: "Time needed after an event ends before the venue is ready for the next event.",
};
const labels: Record<Field, string> = {
  name: "Venue name",
  location: "Location",
  capacity: "Capacity",
  operatingInformation: "Operating information",
  operatingStartTime: "Operating start time",
  operatingEndTime: "Operating end time",
  setupTimeMinutes: "Setup time (minutes)",
  turnaroundTimeMinutes: "Turnaround time (minutes)",
};
const initial: Record<Field, string> = {
  name: "",
  location: "",
  capacity: "",
  operatingInformation: "",
  operatingStartTime: "",
  operatingEndTime: "",
  setupTimeMinutes: "",
  turnaroundTimeMinutes: "",
};

/** Renders the two-step Venue Staff flow for creating one venue catalogue record. */
export function VenueCreatePage() {
  const createVenue = useAppStore((state) => state.createVenue);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accessibility, setAccessibility] = useState<string[]>([]);
  const [operatingDays, setOperatingDays] = useState<string[]>([]);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [layouts, setLayouts] = useState<string[]>([]);
  const [image, setImage] = useState<VenueImage>();
  const [busy, setBusy] = useState(false);
  const [readingImage, setReadingImage] = useState(false);

  /** Updates a text field and clears its stale validation error. */
  function change(field: Field, value: string): void {
    setValues((old) => ({ ...old, [field]: value }));
    clearError(field);
  }

  /** Clears one validation error. */
  function clearError(field: string): void {
    setErrors((old) => {
      const next = { ...old };
      delete next[field];
      return next;
    });
  }

  /** Validates the venue-details step before showing venue options. */
  function validateVenueDetails(): boolean {
    const next: Record<string, string> = {};
    for (const field of Object.keys(initial) as Field[]) {
      if (!values[field].trim()) next[field] = `${labels[field]} is required.`;
    }
    if (!operatingDays.length)
      next.operatingDays = "Choose at least one operating day.";
    if (
      values.operatingStartTime &&
      values.operatingEndTime &&
      values.operatingStartTime >= values.operatingEndTime
    )
      next.operatingEndTime = "End time must be after start time.";

    const capacity = Number(values.capacity);
    if (
      values.capacity.trim() &&
      (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000_000)
    )
      next.capacity = "Enter a whole number from 1 to 1000000.";

    for (const field of ["setupTimeMinutes", "turnaroundTimeMinutes"] as const) {
      const duration = Number(values[field]);
      if (
        values[field].trim() &&
        (!Number.isSafeInteger(duration) ||
          duration < 0 ||
          duration > MAX_DURATION_MINUTES)
      )
        next[field] = "Enter a valid duration in whole minutes (0 or more).";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /** Moves to facilities and layouts only after required location data is valid. */
  function continueToOptions(): void {
    if (validateVenueDetails()) setStep(1);
  }

  /** Reads a selected image with the same shared upload helper used by events. */
  async function selectImage(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearError("image");

    if (!file.type.startsWith("image/")) {
      setErrors((old) => ({ ...old, image: "Choose an image file." }));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrors((old) => ({ ...old, image: "Image must be 5 MB or smaller." }));
      return;
    }

    setReadingImage(true);
    try {
      const uploaded = await readFileAsDataUrl(file);
      setImage({
        name: uploaded.name,
        type: uploaded.type,
        size: uploaded.size,
        dataUrl: uploaded.dataUrl,
      });
    } catch {
      setErrors((old) => ({
        ...old,
        image: "The image could not be read. Try another file.",
      }));
    } finally {
      setReadingImage(false);
    }
  }

  /** Validates and persists the completed two-step venue form. */
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy || readingImage) return;
    const next: Record<string, string> = {};
    if (!facilities.length) next.facilities = "Choose at least one facility.";
    if (!layouts.length) next.layouts = "Choose at least one room layout.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    const venue: VenueCreateInput = {
      name: values.name.trim(),
      location: values.location.trim(),
      capacity: Number(values.capacity),
      facilities,
      accessibility,
      layouts,
      operatingInformation: values.operatingInformation.trim(),
      operatingDays,
      operatingStartTime: values.operatingStartTime,
      operatingEndTime: values.operatingEndTime,
      setupTimeMinutes: Number(values.setupTimeMinutes),
      turnaroundTimeMinutes: Number(values.turnaroundTimeMinutes),
      ...(image ? { image } : {}),
    };
    setBusy(true);
    try {
      const confirmation = await createVenue(venue);
      setErrors({});
      navigate("/venue-records", {
        replace: true,
        state: { creationMessage: confirmation },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        const apiErrors = error.errors ?? { form: error.message };
        setErrors(apiErrors);
        if (
          Object.keys(apiErrors).some((field) =>
            [...Object.keys(initial), "accessibility", "operatingDays"].includes(field),
          )
        )
          setStep(0);
      } else setErrors({ form: "Unable to create the venue. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Create Venue"
        description="Enter the venue details, then define its facilities and supported room layouts."
      />
      <div className="mb-6" aria-label={`Step ${step + 1} of 2`}>
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
          <span className={step === 0 ? "text-primary-700 dark:text-primary-300" : ""}>
            1. Venue details
          </span>
          <span className={step === 1 ? "text-primary-700 dark:text-primary-300" : ""}>
            2. Facilities &amp; layouts
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-primary-600 transition-all"
            style={{ width: step === 0 ? "50%" : "100%" }}
          />
        </div>
      </div>
      <Card>
        <CardBody>
          <form noValidate onSubmit={(event) => void submit(event)}>
            {errors.form && (
              <p role="alert" className="mb-4 text-danger-600">
                {errors.form}
              </p>
            )}
            {step === 0 ? (
              <section aria-labelledby="venue-details-heading">
                <h2 id="venue-details-heading" className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Venue details
                </h2>
                <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
                  Each venue has one location. Its identifier is generated automatically when this record is saved.
                </p>
                {(Object.keys(initial) as Field[])
                  .filter(
                    (field) =>
                      field !== "operatingStartTime" &&
                      field !== "operatingEndTime" &&
                      field !== "setupTimeMinutes" &&
                      field !== "turnaroundTimeMinutes",
                  )
                  .map((field) =>
                  field === "operatingInformation" ? (
                    <TextArea
                      key={field}
                      label={labels[field]}
                      required
                      maxLength={200}
                      value={values[field]}
                      error={errors[field]}
                      onChange={(event) => change(field, event.target.value)}
                    />
                  ) : (
                    <TextInput
                      key={field}
                      label={labels[field]}
                      required
                      type={field === "capacity" ? "number" : "text"}
                      min={field === "capacity" ? 1 : undefined}
                      max={field === "capacity" ? 1_000_000 : undefined}
                      maxLength={field === "location" ? 300 : 200}
                      value={values[field]}
                      error={errors[field]}
                      onChange={(event) => change(field, event.target.value)}
                    />
                  ),
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {(["setupTimeMinutes", "turnaroundTimeMinutes"] as const).map((field) => (
                    <TextInput
                      key={field}
                      label={labels[field]}
                      labelAccessory={
                        <span
                          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[10px] font-bold text-gray-600 dark:border-gray-500 dark:text-gray-300"
                          role="img"
                          aria-label={`Information: ${durationHelp[field]}`}
                          title={durationHelp[field]}
                        >
                          i
                        </span>
                      }
                      required
                      type="number"
                      min={0}
                      step={1}
                      max={MAX_DURATION_MINUTES}
                      value={values[field]}
                      error={errors[field]}
                      onChange={(event) => change(field, event.target.value)}
                    />
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(["operatingStartTime", "operatingEndTime"] as const).map((field) => (
                    <TextInput
                      key={field}
                      label={labels[field]}
                      required
                      type="time"
                      value={values[field]}
                      error={errors[field]}
                      onChange={(event) => change(field, event.target.value)}
                    />
                  ))}
                </div>
                <CheckboxGroup
                  label="Operating days"
                  options={operatingDayOptions}
                  values={operatingDays}
                  onChange={(selected) => {
                    setOperatingDays(selected);
                    clearError("operatingDays");
                  }}
                />
                {errors.operatingDays && (
                  <p role="alert" className="-mt-2 mb-4 text-sm text-danger-600">
                    {errors.operatingDays}
                  </p>
                )}
                <CheckboxGroup
                  label="Accessibility (optional)"
                  options={accessibilityOptions}
                  values={accessibility}
                  onChange={(selected) => {
                    setAccessibility(selected);
                    clearError("accessibility");
                  }}
                />
                <div className="flex justify-end gap-3">
                  <Button type="button" onClick={continueToOptions}>
                    Continue
                  </Button>
                </div>
              </section>
            ) : (
              <section aria-labelledby="facilities-layouts-heading">
                <h2 id="facilities-layouts-heading" className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Facilities &amp; room layouts
                </h2>
                <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
                  Select all facilities and layouts supported by this location.
                </p>
                <CheckboxGroup
                  label="Facilities"
                  options={[...FACILITY_OPTIONS]}
                  values={facilities}
                  onChange={(selected) => {
                    setFacilities(selected);
                    clearError("facilities");
                  }}
                />
                {errors.facilities && (
                  <p role="alert" className="-mt-2 mb-4 text-sm text-danger-600">
                    {errors.facilities}
                  </p>
                )}
                <CheckboxGroup
                  label="Room layouts"
                  options={[...ROOM_LAYOUT_OPTIONS]}
                  values={layouts}
                  onChange={(selected) => {
                    setLayouts(selected);
                    clearError("layouts");
                  }}
                />
                {errors.layouts && (
                  <p role="alert" className="-mt-2 mb-4 text-sm text-danger-600">
                    {errors.layouts}
                  </p>
                )}

                <div className="mb-6">
                  <label htmlFor="venue-image" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Venue image <span className="font-normal text-gray-500">(optional)</span>
                  </label>
                  <input
                    id="venue-image"
                    type="file"
                    accept="image/*"
                    disabled={readingImage}
                    onChange={(event) => void selectImage(event)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:font-medium file:text-primary-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Image file, up to 5 MB.</p>
                  {errors.image && (
                    <p role="alert" className="mt-1 text-sm text-danger-600">
                      {errors.image}
                    </p>
                  )}
                  {image && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                      <img className="h-48 w-full object-cover" src={image.dataUrl} alt="Venue preview" />
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="truncate text-sm text-gray-700 dark:text-gray-300">{image.name}</span>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setImage(undefined)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                    Back
                  </Button>
                  <Button type="submit" disabled={busy || readingImage}>
                    {busy ? "Creating…" : "Create Venue"}
                  </Button>
                </div>
              </section>
            )}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
