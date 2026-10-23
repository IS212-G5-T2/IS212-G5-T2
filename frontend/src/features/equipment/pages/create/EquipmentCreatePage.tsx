import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ComboBox, Select, TextInput } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError } from "@/utils/api";
import { createEquipment, getEquipmentLocations } from "@/features/equipment/api/equipment-api";

const equipmentTypes = [
  "Audio",
  "Visual",
  "Furniture",
  "Lighting",
  "Other",
] as const;
const MAX_EQUIPMENT_QUANTITY = 2_147_483_647;
const quantityFields = [
  { key: "activeQuantity", label: "Active quantity" },
  { key: "underMaintenanceQuantity", label: "Under Maintenance quantity" },
  { key: "retiredQuantity", label: "Retired quantity" },
] as const;

export function EquipmentCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [activeQuantity, setActiveQuantity] = useState("");
  const [underMaintenanceQuantity, setUnderMaintenanceQuantity] = useState("0");
  const [retiredQuantity, setRetiredQuantity] = useState("0");
  const [location, setLocation] = useState("");
  const [locations, setLocations] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const quantitiesForRender = { activeQuantity, underMaintenanceQuantity, retiredQuantity };
  const settersForRender = {
    activeQuantity: setActiveQuantity,
    underMaintenanceQuantity: setUnderMaintenanceQuantity,
    retiredQuantity: setRetiredQuantity,
  };

  // Populate the location dropdown with previously-stored distinct locations.
  useEffect(() => {
    let active = true;
    getEquipmentLocations()
      .then((stored) => {
        /* v8 ignore next -- state after unmount has no observable UI; this guard is defensive cleanup. */
        if (active) setLocations(stored);
      })
      .catch(() => {
        // A failed lookup leaves the combobox usable for free-text entry.
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setConfirmation("");
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Equipment name is required.";
    if (!type) nextErrors.type = "Equipment type is required.";
    const quantities = { activeQuantity, underMaintenanceQuantity, retiredQuantity };
    for (const { key, label } of quantityFields) {
      const value = quantities[key];
      if (value === "") nextErrors[key] = `${label} is required.`;
      else if (!/^\d+$/.test(value)) nextErrors[key] = `${label} must be a non-negative whole number.`;
    }
    if (quantityFields.every(({ key }) => quantities[key] !== "") &&
        quantityFields.every(({ key }) => /^\d+$/.test(quantities[key]))) {
      const total = quantityFields.reduce((sum, { key }) => sum + Number(quantities[key]), 0);
      if (total < 1) nextErrors.activeQuantity = "At least one equipment item is required across all statuses.";
      else if (total > MAX_EQUIPMENT_QUANTITY) nextErrors.activeQuantity = `Total quantity must not exceed ${MAX_EQUIPMENT_QUANTITY}.`;
    }
    if (!location.trim()) nextErrors.location = "Location is required.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const trimmedLocation = location.trim();
      const result = await createEquipment({
        name: name.trim(),
        type: type as (typeof equipmentTypes)[number],
        activeQuantity: Number(activeQuantity),
        underMaintenanceQuantity: Number(underMaintenanceQuantity),
        retiredQuantity: Number(retiredQuantity),
        location: trimmedLocation,
      });
      // A newly created location becomes available in the dropdown for later records.
      setLocations((previous) =>
        previous.includes(trimmedLocation)
          ? previous
          : [...previous, trimmedLocation],
      );
      setConfirmation(result.message);
    } catch (error) {
      if (error instanceof ApiError && error.errors) setErrors(error.errors);
      else
        setErrors({
          form: "Unable to create the equipment record. Please try again.",
        });
    } finally {
      setSubmitting(false);
    }
  }

  function acknowledgeConfirmation() {
    setConfirmation("");
    navigate("/equipment/inventory");
  }

  return (
    <div>
      <PageHeader
        title="Create Equipment Record"
        description="Add an item to the Technical Support equipment inventory."
      />
      <Card className="max-w-2xl">
        <CardBody>
          <form onSubmit={submit} noValidate>
            <TextInput
              label="Equipment name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={errors.name}
            />
            <Select
              label="Equipment type"
              required
              value={type}
              onChange={(event) => setType(event.target.value)}
              error={errors.type}
              options={equipmentTypes.map((value) => ({ value, label: value }))}
            />
            {quantityFields.map(({ key, label }) => (
              <TextInput
                key={key}
                label={label}
                required
                type="text"
                inputMode="numeric"
                value={quantitiesForRender[key]}
                onChange={(event) => settersForRender[key](event.target.value)}
                error={errors[key]}
              />
            ))}
            <ComboBox
              label="Location"
              required
              options={locations}
              value={location}
              onChange={setLocation}
              error={errors.location}
              hint="Choose a saved location or type a new one."
            />
            {(errors.form || errors.body) && (
              <p
                role="alert"
                className="mb-4 text-sm text-danger-600 dark:text-danger-400"
              >
                {errors.form ?? errors.body}
              </p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Equipment"}
            </Button>
          </form>
        </CardBody>
      </Card>
      <Modal
        open={Boolean(confirmation)}
        onClose={() => setConfirmation("")}
        title="Equipment Record Created"
        footer={<Button onClick={acknowledgeConfirmation}>OK</Button>}
      >
        <p className="text-sm text-success-800 dark:text-success-300">
          {confirmation}
        </p>
      </Modal>
    </div>
  );
}
