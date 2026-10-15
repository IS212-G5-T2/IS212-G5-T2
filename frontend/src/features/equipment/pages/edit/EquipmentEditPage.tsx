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
const maintenanceStatuses = ['Active', 'Under Maintenance', 'Retired'] as const;
const MAX_EQUIPMENT_QUANTITY = 2_147_483_647;

/** SPM-118 AC1–AC5: edit only the fields available when creating an equipment record. */
export function EquipmentEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<EquipmentRecord | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [quantity, setQuantity] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getEquipment({ includeUnavailable: true })
      .then((records) => {
        if (!active) return;
        const selected = records.find((item) => item.id === id);
        if (!selected) {
          setLoadError(true);
          return;
        }
        setRecord(selected);
        setName(selected.name);
        setType(selected.type);
        setLocation(selected.location);
        setQuantity(String(selected.quantity));
        setMaintenanceStatus(selected.maintenanceStatus);
        setLocations([...new Set([...records.map((item) => item.location), selected.location])]);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'Equipment name is required.';
    if (!type) nextErrors.type = 'Equipment type is required.';
    if (!location.trim()) nextErrors.location = 'Location is required.';
    if (quantity === '') nextErrors.quantity = 'Quantity is required.';
    else if (!/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > MAX_EQUIPMENT_QUANTITY) {
      nextErrors.quantity = `Quantity must be a whole number between 1 and ${MAX_EQUIPMENT_QUANTITY}.`;
    }
    if (!maintenanceStatus) nextErrors.maintenanceStatus = 'Maintenance status is required.';
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
        quantity: Number(quantity),
        maintenanceStatus: maintenanceStatus as EquipmentInput['maintenanceStatus'],
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
        actions={<Button variant="secondary" onClick={() => navigate('/equipment/availability')}>Back to inventory</Button>}
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
              <TextInput label="Quantity available" required type="text" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} error={errors.quantity} />
              <Select label="Maintenance status" required value={maintenanceStatus} onChange={(event) => setMaintenanceStatus(event.target.value)} error={errors.maintenanceStatus} options={maintenanceStatuses.map((value) => ({ value, label: value }))} />
              {(errors.form || errors.body) && <p role="alert" className="mb-4 text-sm text-danger-600 dark:text-danger-400">{errors.form ?? errors.body}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save changes'}</Button>
                <Button type="button" variant="secondary" onClick={() => navigate('/equipment/availability')}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
      <Modal
        open={Boolean(confirmation)}
        onClose={() => setConfirmation('')}
        title="Equipment Record Updated"
        footer={<Button onClick={() => navigate('/equipment/availability')}>OK</Button>}
      >
        <p className="text-sm text-success-800 dark:text-success-300">{confirmation}</p>
      </Modal>
    </div>
  );
}
