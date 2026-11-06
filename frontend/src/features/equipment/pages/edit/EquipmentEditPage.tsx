import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { ComboBox, Select, TextInput } from '@/components/ui/FormControls';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  getEquipment,
  updateEquipment,
  type EquipmentInput,
} from '@/features/equipment/api/equipment-api';
import { ApiError } from '@/utils/api';
import type { EquipmentRecord } from '@/types';

const equipmentTypes = ['Audio', 'Visual', 'Furniture', 'Lighting', 'Other'] as const;
const MAX_EQUIPMENT_QUANTITY = 2_147_483_647;
const quantityFields = [
  { key: 'activeQuantity', label: 'Active quantity' },
  { key: 'underMaintenanceQuantity', label: 'Under Maintenance quantity' },
  { key: 'retiredQuantity', label: 'Retired quantity' },
] as const;

/** SPM-118 AC1–AC5: edit only the fields available when creating an equipment record. */
export function EquipmentEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<EquipmentRecord | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [activeQuantity, setActiveQuantity] = useState('0');
  const [underMaintenanceQuantity, setUnderMaintenanceQuantity] = useState('0');
  const [retiredQuantity, setRetiredQuantity] = useState('0');
  const [locations, setLocations] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getEquipment({ includeUnavailable: true })
      .then((records) => {
        const selected = records.find((item) => item.id === id);
        if (!selected) {
          setLoadError(true);
          return;
        }
        setRecord(selected);
        setName(selected.name);
        setType(selected.type);
        setLocation(selected.location);
        setActiveQuantity(String(selected.activeQuantity));
        setUnderMaintenanceQuantity(String(selected.underMaintenanceQuantity));
        setRetiredQuantity(String(selected.retiredQuantity));
        setLocations([...new Set([...records.map((item) => item.location), selected.location])]);
      })
      .catch(() => {
        setLoadError(true);
      });
  }, [id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'Equipment name is required.';
    if (!type) nextErrors.type = 'Equipment type is required.';
    if (!location.trim()) nextErrors.location = 'Location is required.';
    const quantities = { activeQuantity, underMaintenanceQuantity, retiredQuantity };
    for (const { key, label } of quantityFields) {
      const value = quantities[key];
      if (value === '') nextErrors[key] = `${label} is required.`;
      else if (!/^\d+$/.test(value)) nextErrors[key] = `${label} must be a non-negative whole number.`;
    }
    if (quantityFields.every(({ key }) => quantities[key] !== '') &&
        quantityFields.every(({ key }) => /^\d+$/.test(quantities[key]))) {
      const total = quantityFields.reduce((sum, { key }) => sum + Number(quantities[key]), 0);
      if (total < 1) nextErrors.activeQuantity = 'At least one equipment item is required across all statuses.';
      else if (total > MAX_EQUIPMENT_QUANTITY) nextErrors.activeQuantity = `Total quantity must not exceed ${MAX_EQUIPMENT_QUANTITY}.`;
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const input: EquipmentInput = {
        name: name.trim(),
        type: type as EquipmentInput['type'],
        location: location.trim(),
        activeQuantity: Number(activeQuantity),
        underMaintenanceQuantity: Number(underMaintenanceQuantity),
        retiredQuantity: Number(retiredQuantity),
      };
      const result = await updateEquipment(record!.id, input);
      setRecord(result.equipment);
      setConfirmation(result.message);
    } catch (error) {
      if (error instanceof ApiError && error.errors) setErrors(error.errors);
      else setErrors({ form: 'Unable to update the equipment record. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Edit Equipment Record"
        description="Update the same inventory details collected when the record was created."
        actions={<Button variant="secondary" onClick={() => navigate('/equipment/inventory')}>Back to inventory</Button>}
      />
      {loadError ? (
        <p role="alert" className="text-sm text-danger-600 dark:text-danger-400">
          Unable to load this equipment record. It may have been removed or you may not have access.
        </p>
      ) : !record ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-400">Loading equipment record…</p>
      ) : (
        <Card className="max-w-2xl">
          <CardBody>
            <form onSubmit={submit} noValidate>
              <TextInput label="Equipment name" required value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
              <Select label="Equipment type" required value={type} onChange={(event) => setType(event.target.value)} error={errors.type} options={equipmentTypes.map((value) => ({ value, label: value }))} />
              <ComboBox label="Location" required options={locations} value={location} onChange={setLocation} error={errors.location} hint="Choose a saved location or type a new one." />
              {quantityFields.map(({ key, label }) => {
                const value = { activeQuantity, underMaintenanceQuantity, retiredQuantity }[key];
                const setter = { activeQuantity: setActiveQuantity, underMaintenanceQuantity: setUnderMaintenanceQuantity, retiredQuantity: setRetiredQuantity }[key];
                return <TextInput key={key} label={label} required type="text" inputMode="numeric" value={value} onChange={(event) => setter(event.target.value)} error={errors[key]} />;
              })}
              {(errors.form || errors.body) && <p role="alert" className="mb-4 text-sm text-danger-600 dark:text-danger-400">{errors.form ?? errors.body}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save changes'}</Button>
                <Button type="button" variant="secondary" onClick={() => navigate('/equipment/inventory')}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
      <Modal
        open={Boolean(confirmation)}
        onClose={() => setConfirmation('')}
        title="Equipment Record Updated"
        footer={<Button onClick={() => navigate('/equipment/inventory')}>OK</Button>}
      >
        <p className="text-sm text-success-800 dark:text-success-300">{confirmation}</p>
      </Modal>
    </div>
  );
}
