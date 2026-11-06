import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Select, TextInput } from "@/components/ui/FormControls";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getEquipmentAvailability,
  type EquipmentAvailabilityResult,
} from "@/features/equipment/api/equipment-api";
import { ApiError } from "@/utils/api";

const equipmentTypes = ["Audio", "Visual", "Furniture", "Lighting", "Other"] as const;

function toIso(localDateTime: string): string | null {
  if (!localDateTime) return null;
  const date = new Date(localDateTime);
  /* v8 ignore next -- a native datetime-local input never emits an unparsable non-empty value. */
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function AvailabilityBadge({ available }: { available: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${available
      ? "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300"
      : "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300"}`}>
      {available ? "Available" : "Unavailable"}
    </span>
  );
}

/** SPM-113 AC1–AC7: Technical Support checks equipment stock for an event period. */
export function EquipmentAvailabilityCheckPage() {
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [results, setResults] = useState<EquipmentAvailabilityResult[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function checkAvailability(event: React.FormEvent) {
    event.preventDefault();
    const start = toIso(startDateTime);
    const end = toIso(endDateTime);
    const nextErrors: Record<string, string> = {};
    if (!start) nextErrors.startDateTime = "Start date and time are required.";
    if (!end) nextErrors.endDateTime = "End date and time are required.";
    if (start && end && new Date(end).getTime() - new Date(start).getTime() < 60_000) {
      nextErrors.endDateTime = "End date and time must be at least one minute after the start.";
    }
    setResults(null);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const loaded = await getEquipmentAvailability({
        startDateTime: start!,
        endDateTime: end!,
        ...(equipmentType && { equipmentType: equipmentType as (typeof equipmentTypes)[number] }),
      });
      setResults(loaded);
    } catch (error) {
      if (error instanceof ApiError && error.errors) setErrors(error.errors);
      else setErrors({ form: "Unable to check equipment availability. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  const columns: Column<EquipmentAvailabilityResult>[] = [
    { header: "Equipment name", render: (row) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.name}</span> },
    { header: "Equipment type", render: (row) => row.type },
    { header: "Location", render: (row) => row.location },
    {
      header: "Quantity",
      render: (row) => (
        <div className="space-y-1" aria-label={`Quantity breakdown: Active ${row.activeQuantity}, Reserved ${row.reservedQuantity}, Under Maintenance ${row.underMaintenanceQuantity}, Retired ${row.retiredQuantity}, Available ${row.availableQuantity}`}>
          <p>Active: {row.activeQuantity}</p>
          <p>Reserved: {row.reservedQuantity}</p>
          <p>Under Maintenance: {row.underMaintenanceQuantity}</p>
          <p>Retired: {row.retiredQuantity}</p>
          <p className="font-medium">Available: {row.availableQuantity}</p>
        </div>
      ),
    },
    { header: "Availability", render: (row) => <AvailabilityBadge available={row.isAvailable} /> },
    {
      header: "Reason / reserved until",
      render: (row) => row.reason
        ? <span>{row.reason}{row.reservedUntil ? ` — reserved until ${formatDateTime(row.reservedUntil)}` : ""}</span>
        : "—",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Equipment Availability"
        description="Check active equipment against reserved equipment requests for an event period."
      />
      <form className="mb-6 max-w-4xl" onSubmit={(event) => void checkAvailability(event)} noValidate>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextInput
            label="Start date and time"
            type="datetime-local"
            required
            value={startDateTime}
            onChange={(event) => { setStartDateTime(event.target.value); setErrors((previous) => ({ ...previous, startDateTime: "", period: "", form: "" })); }}
            error={errors.startDateTime ?? errors.period}
          />
          <TextInput
            label="End date and time"
            type="datetime-local"
            required
            value={endDateTime}
            onChange={(event) => { setEndDateTime(event.target.value); setErrors((previous) => ({ ...previous, endDateTime: "", period: "", form: "" })); }}
            error={errors.endDateTime ?? errors.period}
          />
          <Select
            label="Equipment type"
            value={equipmentType}
            onChange={(event) => { setEquipmentType(event.target.value); setErrors((previous) => ({ ...previous, equipmentType: "", form: "" })); }}
            error={errors.equipmentType}
            options={equipmentTypes.map((type) => ({ value: type, label: type }))}
          />
        </div>
        {errors.form && <p role="alert" className="mb-4 text-sm text-danger-600 dark:text-danger-400">{errors.form}</p>}
        <Button type="submit" disabled={loading}>{loading ? "Checking…" : "Check availability"}</Button>
      </form>
      {results !== null && (
        <DataTable
          columns={columns}
          rows={results}
          rowKey={(row) => row.id}
          emptyMessage="No equipment matches this availability check."
        />
      )}
    </div>
  );
}
