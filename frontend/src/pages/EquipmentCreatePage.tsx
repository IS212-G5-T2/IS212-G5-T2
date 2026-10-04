import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ComboBox, Select, TextInput } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError } from "@/utils/api";
import { createEquipment, getEquipmentLocations } from "@/utils/equipment-api";

const equipmentTypes = [
  "Audio",
  "Visual",
  "Furniture",
  "Lighting",
  "Other",
] as const;
const maintenanceStatuses = ["Active", "Under Maintenance", "Retired"] as const;
const MAX_EQUIPMENT_QUANTITY = 2_147_483_647;

export function EquipmentCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [maintenanceStatus, setMaintenanceStatus] = useState("");
  const [location, setLocation] = useState("");
  const [locations, setLocations] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Populate the location dropdown with previously-stored distinct locations.
  useEffect(() => {
    let active = true;
    getEquipmentLocations()
      .then((stored) => {
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
    if (quantity === "") nextErrors.quantity = "Quantity is required.";
    else if (
      !/^\d+$/.test(quantity) ||
      Number(quantity) < 1 ||
      Number(quantity) > MAX_EQUIPMENT_QUANTITY
    ) {
      nextErrors.quantity = `Quantity must be a whole number between 1 and ${MAX_EQUIPMENT_QUANTITY}.`;
    }
    if (!maintenanceStatus)
      nextErrors.maintenanceStatus = "Maintenance status is required.";
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
        quantity: Number(quantity),
        maintenanceStatus:
          maintenanceStatus as (typeof maintenanceStatuses)[number],
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
    navigate("/equipment/availability");
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
            <TextInput
              label="Quantity"
              required
              type="text"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              error={errors.quantity}
            />
            <Select
              label="Maintenance status"
              required
              value={maintenanceStatus}
              onChange={(event) => setMaintenanceStatus(event.target.value)}
              error={errors.maintenanceStatus}
              options={maintenanceStatuses.map((value) => ({
                value,
                label: value,
              }))}
            />
            <ComboBox
              label="Location"
              required
              options={locations}
              value={location}
              onChange={setLocation}
              error={errors.location}
              hint="Choose a saved location or type a new one."
            />
            {errors.form && (
              <p
                role="alert"
                className="mb-4 text-sm text-danger-600 dark:text-danger-400"
              >
                {errors.form}
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
        title="Equipment record created"
        footer={<Button onClick={acknowledgeConfirmation}>OK</Button>}
      >
        <p className="text-sm text-success-800 dark:text-success-300">
          {confirmation}
        </p>
      </Modal>
    </div>
  );
}
