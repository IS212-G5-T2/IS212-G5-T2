import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select, TextInput } from '@/components/ui/FormControls';
import type { EquipmentRecord } from '@/types';
import type { EquipmentRequestEvent, EquipmentRequestItemInput, EquipmentRequestRecord } from '../../api/equipment-requests-api';

const equipmentTypes: EquipmentRecord['type'][] = ['Audio', 'Visual', 'Furniture', 'Lighting', 'Other'];
interface DraftItem { equipmentName: string; equipmentType: string; quantity: string }
const blankItem = (): DraftItem => ({ equipmentName: '', equipmentType: '', quantity: '1' });
const eventDateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function EquipmentReservationForm({
  events, initialEventId, submitting, onSubmit, request, isEditing = false,
}: {
  events: EquipmentRequestEvent[]; initialEventId: string; submitting: boolean;
  onSubmit: (eventId: string, items: EquipmentRequestItemInput[]) => Promise<void>;
  request?: EquipmentRequestRecord; isEditing?: boolean;
}) {
  const [eventId, setEventId] = useState(initialEventId);
  const [items, setItems] = useState<DraftItem[]>(request?.items.map((item) => ({
    equipmentName: item.equipmentName, equipmentType: item.equipmentType, quantity: String(item.quantity),
  })) ?? [blankItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // An existing request is permanently tied to its event.  Do not depend on the
  // create-only eligible-events feed to rediscover it: that feed can change as
  // the event progresses, while the request itself remains updateable.
  const event = request
    ? {
      id: request.eventId,
      name: request.eventName,
      startDateTime: request.eventStart,
      endDateTime: request.eventEnd,
      expectedAttendance: request.expectedAttendance,
    }
    : events.find((candidate) => candidate.id === eventId);
  const updateItem = (index: number, patch: Partial<DraftItem>) => setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!event) next.eventId = 'Choose an eligible event.';
    items.forEach((item, index) => {
      if (!item.equipmentName.trim()) next[`name-${index}`] = 'Equipment name is required.';
      if (!equipmentTypes.includes(item.equipmentType as EquipmentRecord['type'])) next[`type-${index}`] = 'Choose an equipment type.';
      const quantity = Number(item.quantity);
      if (!item.quantity.trim()) next[`quantity-${index}`] = 'Quantity is required.';
      else if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2_147_483_647) next[`quantity-${index}`] = 'Enter a positive whole number.';
    });
    setErrors(next);
    if (Object.keys(next).length || !event) return;
    await onSubmit(event.id, items.map((item) => ({
      equipmentName: item.equipmentName.trim(),
      equipmentType: item.equipmentType as EquipmentRecord['type'],
      quantity: Number(item.quantity),
    })));
  };

  return <form onSubmit={submit} noValidate className="space-y-5">
    <h2 className="text-lg font-semibold">{isEditing ? 'Update equipment request' : 'Request equipment'}</h2>
    {!isEditing && <Select id="equipment-request-event" label="Event" required value={eventId} onChange={(e) => setEventId(e.target.value)} error={errors.eventId}
      options={events.map((item) => ({ value: item.id, label: item.name }))} />}
    {event && <dl className="grid gap-2 rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-800 sm:grid-cols-2" aria-label="Selected event details">
      <div><dt className="text-gray-500">Event name</dt><dd>{event.name}</dd></div>
      <div><dt className="text-gray-500">Date</dt><dd>{eventDateFormat.format(new Date(event.startDateTime))}</dd></div>
      <div><dt className="text-gray-500">Time</dt><dd>{new Date(event.startDateTime).toLocaleTimeString()} – {new Date(event.endDateTime).toLocaleTimeString()}</dd></div>
      <div><dt className="text-gray-500">Expected attendance</dt><dd>{event.expectedAttendance}</dd></div>
    </dl>}
    {items.map((item, index) => <fieldset key={index} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <legend className="px-1 font-medium">Equipment item {index + 1}</legend>
      <TextInput id={`equipment-request-name-${index}`} label="Equipment name" required value={item.equipmentName}
        error={errors[`name-${index}`]} onChange={(e) => updateItem(index, { equipmentName: e.target.value })} />
      <Select id={`equipment-request-type-${index}`} label="Equipment type" required value={item.equipmentType} error={errors[`type-${index}`]}
        onChange={(e) => updateItem(index, { equipmentType: e.target.value })}
        options={equipmentTypes.map((type) => ({ value: type, label: type }))} />
      <TextInput id={`equipment-request-quantity-${index}`} label="Quantity" required type="number" min={1} step={1} value={item.quantity}
        error={errors[`quantity-${index}`]} onChange={(e) => updateItem(index, { quantity: e.target.value })} />
      {items.length > 1 && <Button type="button" variant="secondary" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>Remove item {index + 1}</Button>}
    </fieldset>)}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, blankItem()])}>Add another item</Button>
      <Button type="submit" disabled={submitting || (!isEditing && !events.length) || (isEditing && !event)}>{submitting ? (isEditing ? 'Updating…' : 'Submitting…') : (isEditing ? 'Update Event' : 'Submit Request')}</Button>
    </div>
  </form>;
}
