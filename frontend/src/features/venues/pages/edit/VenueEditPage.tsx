import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { api, ApiError } from "@/utils/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { CheckboxGroup, TextArea, TextInput } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import type { AffectedBooking, VenueCreateInput, VenueImage } from "@/types";
import { readFileAsDataUrl } from "@/utils/uploads";
import { FACILITY_OPTIONS, ROOM_LAYOUT_OPTIONS } from "@/features/venues/lib/venueOptions";
import { formatDateTimeRange } from "@/utils/format";

type Field = Exclude<keyof VenueCreateInput, "accessibility" | "facilities" | "layouts" | "image">;

const accessibilityOptions = [
  "Wheelchair access",
  "Accessible restrooms",
  "Hearing loop",
  "Elevator access",
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
  setupTimeMinutes: "Setup time (minutes)",
  turnaroundTimeMinutes: "Turnaround time (minutes)",
};

/** SPM-121: two-step form for editing an owned venue record. Pre-fills current values. */
export function VenueEditPage() {
  const { id } = useParams<{ id: string }>();
  const updateVenue = useAppStore((state) => state.updateVenue);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Field, string>>({
    name: "",
    location: "",
    capacity: "",
    operatingInformation: "",
    setupTimeMinutes: "",
    turnaroundTimeMinutes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accessibility, setAccessibility] = useState<string[]>([]);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [layouts, setLayouts] = useState<string[]>([]);
  const [image, setImage] = useState<VenueImage | undefined>();
  const [busy, setBusy] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [affectedBookings, setAffectedBookings] = useState<AffectedBooking[]>([]);
  const [capacityBookings, setCapacityBookings] = useState<AffectedBooking[]>([]);

  // AC1: pre-fill form with current venue values on mount.
  useEffect(() => {
    if (!id) { setLoadError(true); setLoading(false); return; }
    api<{
      id: string; name: string; location: string; capacity: number;
      facilities: string[]; accessibility: string[]; layouts: string[];
      operatingInformation: string; setupTimeMinutes: number;
      turnaroundTimeMinutes: number; image?: VenueImage;
    }>(`/venues/${id}`).then(
      (venue) => {
        setValues({
          name: venue.name,
          location: venue.location,
          capacity: String(venue.capacity),
          operatingInformation: venue.operatingInformation,
          setupTimeMinutes: String(venue.setupTimeMinutes),
          turnaroundTimeMinutes: String(venue.turnaroundTimeMinutes),
        });
        setFacilities(venue.facilities);
        setLayouts(venue.layouts);
        setAccessibility(venue.accessibility);
        setImage(venue.image);
        setLoading(false);
      },
      () => { setLoadError(true); setLoading(false); },
    );
  }, [id]);

  function change(field: Field, value: string): void {
    setValues((old) => ({ ...old, [field]: value }));
    clearError(field);
  }

  function clearError(field: string): void {
    setErrors((old) => { const next = { ...old }; delete next[field]; return next; });
  }

  function validateDetails(): boolean {
    const next: Record<string, string> = {};
    for (const field of Object.keys(labels) as Field[]) {
      if (!values[field].trim()) next[field] = `${labels[field]} is required.`;
    }
    const capacity = Number(values.capacity);
    if (values.capacity.trim() && (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000_000))
      next.capacity = "Enter a whole number from 1 to 1000000.";
    for (const field of ["setupTimeMinutes", "turnaroundTimeMinutes"] as const) {
      const d = Number(values[field]);
      if (values[field].trim() && (!Number.isSafeInteger(d) || d < 0 || d > MAX_DURATION_MINUTES))
        next[field] = "Enter a valid duration in whole minutes (0 or more).";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function continueToOptions(): void {
    if (validateDetails()) setStep(1);
  }

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
      setImage({ name: uploaded.name, type: uploaded.type, size: uploaded.size, dataUrl: uploaded.dataUrl });
    } catch {
      setErrors((old) => ({ ...old, image: "The image could not be read. Try another file." }));
    } finally {
      setReadingImage(false);
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy || readingImage || !id) return;
    const next: Record<string, string> = {};
    if (!facilities.length) next.facilities = "Choose at least one facility.";
    if (!layouts.length) next.layouts = "Choose at least one room layout.";
    if (Object.keys(next).length) { setErrors(next); return; }

    const venue: VenueCreateInput = {
      name: values.name.trim(),
      location: values.location.trim(),
      capacity: Number(values.capacity),
      facilities,
      accessibility,
      layouts,
      operatingInformation: values.operatingInformation.trim(),
      setupTimeMinutes: Number(values.setupTimeMinutes),
      turnaroundTimeMinutes: Number(values.turnaroundTimeMinutes),
      ...(image ? { image } : {}),
    };
    setBusy(true);
    try {
      const result = await updateVenue(id, venue);
      setErrors({});
      setSuccessMessage(result.message);
      setAffectedBookings(result.affectedBookings);
      setCapacityBookings(result.capacityBookings);
    } catch (error) {
      if (error instanceof ApiError) {
        const apiErrors = error.errors ?? { form: error.message };
        setErrors(apiErrors);
        if (Object.keys(apiErrors).some((field) => [...Object.keys(labels), "accessibility"].includes(field)))
          setStep(0);
      } else {
        setErrors({ form: "Unable to update the venue. Try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="p-6 text-gray-500">Loading venue…</p>;
  if (loadError) return <p role="alert" className="p-6 text-danger-600">Venue not found or could not be loaded.</p>;

  return (
    <div>
      <PageHeader
        title="Edit Venue"
        description="Update the venue details, then review its facilities and room layouts."
      />

      {/* AC5: confirmation message */}
      {successMessage && (
        <div role="alert" className="mb-6 rounded-lg bg-success-50 px-4 py-3 text-success-800 dark:bg-success-900/30 dark:text-success-300">
          <p className="font-medium">{successMessage}</p>
          {/* AC8: list of affected bookings */}
          {affectedBookings.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium">
                The following existing bookings are now affected by the changed setup or turnaround time:
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {affectedBookings.map((b) => (
                  <li key={b.bookingId} className="rounded bg-warning-50 px-3 py-1.5 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
                    <span className="font-medium">{b.eventName}</span>
                    {" — "}{formatDateTimeRange(b.start, b.end)}
                    {" — "}<span className="capitalize">{b.status}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">These bookings remain recorded and have not been removed.</p>
            </div>
          )}
          {/* AC9: list all pending/approved bookings when capacity changed */}
          {capacityBookings.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium">
                The following pending or approved bookings exist at this venue and may be affected by the capacity change:
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {capacityBookings.map((b) => (
                  <li key={b.bookingId} className="rounded bg-blue-50 px-3 py-1.5 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    <span className="font-medium">{b.eventName}</span>
                    {" — "}{formatDateTimeRange(b.start, b.end)}
                    {" — "}<span className="capitalize">{b.status}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">These bookings remain recorded and have not been removed.</p>
            </div>
          )}
          <div className="mt-3 flex gap-3">
            <Button size="sm" onClick={() => navigate("/venue-records")}>
              Back to venues
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSuccessMessage(null)}>
              Continue editing
            </Button>
          </div>
        </div>
      )}

      {!successMessage && (
        <>
          <div className="mb-6" aria-label={`Step ${step + 1} of 2`}>
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
              <span className={step === 0 ? "text-primary-700 dark:text-primary-300" : ""}>1. Venue details</span>
              <span className={step === 1 ? "text-primary-700 dark:text-primary-300" : ""}>2. Facilities &amp; layouts</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: step === 0 ? "50%" : "100%" }} />
            </div>
          </div>

          <Card>
            <CardBody>
              <form noValidate onSubmit={(event) => void submit(event)}>
                {errors.form && <p role="alert" className="mb-4 text-danger-600">{errors.form}</p>}

                {step === 0 ? (
                  <section aria-labelledby="venue-details-heading">
                    <h2 id="venue-details-heading" className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Venue Details
                    </h2>
                    {(["name", "location", "capacity", "operatingInformation"] as Field[]).map((field) =>
                      field === "operatingInformation" ? (
                        <TextArea
                          key={field}
                          label={labels[field]}
                          required
                          maxLength={200}
                          value={values[field]}
                          error={errors[field]}
                          onChange={(e) => change(field, e.target.value)}
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
                          onChange={(e) => change(field, e.target.value)}
                        />
                      ),
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(["setupTimeMinutes", "turnaroundTimeMinutes"] as const).map((field) => (
                        <TextInput
                          key={field}
                          label={labels[field]}
                          labelAccessory={
                            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[10px] font-bold text-gray-600 dark:border-gray-500 dark:text-gray-300" role="img" aria-label={`Information: ${durationHelp[field]}`} title={durationHelp[field]}>i</span>
                          }
                          required
                          type="number"
                          min={0}
                          step={1}
                          max={MAX_DURATION_MINUTES}
                          value={values[field]}
                          error={errors[field]}
                          onChange={(e) => change(field, e.target.value)}
                        />
                      ))}
                    </div>
                    <CheckboxGroup
                      label="Accessibility (optional)"
                      options={accessibilityOptions}
                      values={accessibility}
                      onChange={(selected) => { setAccessibility(selected); clearError("accessibility"); }}
                    />
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="secondary" onClick={() => navigate("/venue-records")}>Cancel</Button>
                      <Button type="button" onClick={continueToOptions}>Continue</Button>
                    </div>
                  </section>
                ) : (
                  <section aria-labelledby="facilities-layouts-heading">
                    <h2 id="facilities-layouts-heading" className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Facilities &amp; room layouts
                    </h2>
                    <CheckboxGroup
                      label="Facilities"
                      options={[...FACILITY_OPTIONS]}
                      values={facilities}
                      onChange={(selected) => { setFacilities(selected); clearError("facilities"); }}
                    />
                    {errors.facilities && <p role="alert" className="-mt-2 mb-4 text-sm text-danger-600">{errors.facilities}</p>}
                    <CheckboxGroup
                      label="Room layouts"
                      options={[...ROOM_LAYOUT_OPTIONS]}
                      values={layouts}
                      onChange={(selected) => { setLayouts(selected); clearError("layouts"); }}
                    />
                    {errors.layouts && <p role="alert" className="-mt-2 mb-4 text-sm text-danger-600">{errors.layouts}</p>}

                    <div className="mb-6">
                      <label htmlFor="venue-image" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Venue image <span className="font-normal text-gray-500">(optional)</span>
                      </label>
                      <input id="venue-image" type="file" accept="image/*" disabled={readingImage} onChange={(e) => void selectImage(e)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:font-medium file:text-primary-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300" />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Image file, up to 5 MB.</p>
                      {errors.image && <p role="alert" className="mt-1 text-sm text-danger-600">{errors.image}</p>}
                      {image && (
                        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                          <img className="h-48 w-full object-cover" src={image.dataUrl} alt="Venue preview" />
                          <div className="flex items-center justify-between gap-3 px-4 py-3">
                            <span className="truncate text-sm text-gray-700 dark:text-gray-300">{image.name}</span>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setImage(undefined)}>Remove</Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Button type="button" variant="secondary" onClick={() => setStep(0)}>Back</Button>
                      <Button type="submit" disabled={busy || readingImage}>
                        {busy ? "Saving…" : "Save Changes"}
                      </Button>
                    </div>
                  </section>
                )}
              </form>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
