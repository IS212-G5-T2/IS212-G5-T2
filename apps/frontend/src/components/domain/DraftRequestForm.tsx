import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { eventRequests, RequestError } from '@/api/eventRequests';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { TextInput, TextArea, Select } from '@/components/ui/FormControls';
import { emptyDraft } from '@/types/eventRequest';
import type { DraftFields, EventRequest } from '@/types/eventRequest';
import { RequirementGrid } from './RequirementGrid';

const requiredLabels: Record<keyof DraftFields, string> = {
  name: 'Event name', purpose: 'Purpose', description: 'Description',
  startDateTime: 'Start date and time', endDateTime: 'End date and time',
  expectedAttendance: 'Expected attendance', venueRequirements: 'Venue requirements',
  accessibilityNeeds: 'Accessibility needs', layout: 'Room layout',
  equipmentRequirements: 'Equipment requirements', registrationEnabled: 'attendees register for event through the system',
};
function missingFields(fields: DraftFields) {
  return (Object.keys(requiredLabels) as (keyof DraftFields)[]).filter(key =>
    fields[key] === null || (typeof fields[key] === 'string' && !fields[key].trim()));
}

export function DraftRequestForm({ initial }: { initial?: EventRequest }) {
  const navigate = useNavigate();
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [fields, setFields] = useState<DraftFields>(() => ({ ...emptyDraft, ...initial?.fields }));
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errorTitle, setErrorTitle] = useState('');
  const [saved, setSaved] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const missing = submitAttempted ? missingFields(fields) : [];
  const required = (key: keyof DraftFields) => ({ required: true, error: missing.includes(key) ? `Please fill in ${requiredLabels[key]}.` : undefined });
  const [locked, setLocked] = useState(false);
  const inFlight = useRef(false);
  const pending = useRef<{ operationId: string; fields: DraftFields; version: number }>();
  const set = <K extends keyof DraftFields>(key: K, value: DraftFields[K]) => {
    setFields(previous => ({ ...previous, [key]: value })); setSaved(false);
  };
  const goToRequests = () => navigate('/events', { state: { saved: true, savedRequestId: id } });
  const save = async () => {
    if (inFlight.current || locked) return;
    setSubmitAttempted(false);
    inFlight.current = true; setSaving(true); setError(''); setSaved(false);
    // Retain the exact operation after an uncertain response, preventing duplicate writes.
    pending.current ??= { operationId: crypto.randomUUID(), fields: { ...fields }, version };
    try {
      const result = await eventRequests.save(id, pending.current.fields, pending.current.version, pending.current.operationId);
      setVersion(result.version); pending.current = undefined; setSaved(true);
    } catch (cause) {
      let editable = true;
      let message: string;
      if (cause instanceof RequestError && [400, 401, 403, 404, 409].includes(cause.status)) {
        pending.current = undefined;
        if ([403, 404, 409].includes(cause.status)) { setLocked(true); editable = false; }
        message = cause.message;
      } else if (cause instanceof Error && !(cause instanceof RequestError)) {
        // A network or connectivity failure carries its own actionable message.
        message = cause.message;
      } else {
        // Any other status (e.g. 500, 503) or non-standard failure: show a generic, retryable message.
        message = 'Something went wrong while saving your draft. Please try again.';
      }
      setErrorTitle(editable ? 'Draft could not be saved' : 'This request can no longer be edited');
      setError(message);
    } finally { inFlight.current = false; setSaving(false); }
  };
  const submit = () => {
    if (inFlight.current || locked || pending.current) return;
    setSubmitAttempted(true); setSaved(false); setError('');
    const missing = missingFields(fields);
    if (missing.length) {
      document.getElementById(requiredLabels[missing[0]].toLowerCase().replace(/\s+/g, '-'))?.focus();
    } else {
      setErrorTitle('Event submission unavailable');
      setError('All mandatory fields are filled in, but event submission is not available yet. Save your draft to keep your entries.');
    }
  };
  return (
    <form noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
      <Card><CardBody>
        <div className="mb-5 space-y-1 text-sm text-gray-500">
          <p><span className="text-danger-600 dark:text-danger-400">*</span> indicates a mandatory field</p>
          <p>You need to fill up all mandatory fields in order to submit the event request form.</p>
        </div>
        <fieldset disabled={saving || !!pending.current || locked}>
          <TextInput label="Event name" {...required('name')} maxLength={2000} value={fields.name} onChange={e => set('name', e.target.value)} />
          <TextInput label="Purpose" {...required('purpose')} maxLength={2000} value={fields.purpose} onChange={e => set('purpose', e.target.value)} />
          <TextArea label="Description" {...required('description')} maxLength={10000} value={fields.description} onChange={e => set('description', e.target.value)} />
          <div className="grid gap-x-4 sm:grid-cols-2">
            <TextInput label="Start date and time" {...required('startDateTime')} type="datetime-local" value={fields.startDateTime} onChange={e => set('startDateTime', e.target.value)} />
            <TextInput label="End date and time" {...required('endDateTime')} type="datetime-local" value={fields.endDateTime} onChange={e => set('endDateTime', e.target.value)} />
          </div>
          <TextInput label="Expected attendance" {...required('expectedAttendance')} type="number" min={0} step={1} value={fields.expectedAttendance ?? ''} onChange={e => set('expectedAttendance', e.target.value === '' ? null : Number(e.target.value))} />
          <h2 className="mb-3 mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">Event requirements</h2>
          <RequirementGrid label="Venue requirements" {...required('venueRequirements')}
            columns={[{ key: 'requirement', label: 'Requirement' }, { key: 'details', label: 'Details' }]}
            value={fields.venueRequirements} onChange={value => set('venueRequirements', value)} />
          <TextArea label="Accessibility needs" {...required('accessibilityNeeds')} maxLength={2000} value={fields.accessibilityNeeds} onChange={e => set('accessibilityNeeds', e.target.value)} />
          <TextInput label="Room layout" {...required('layout')} maxLength={2000} value={fields.layout} onChange={e => set('layout', e.target.value)} />
          <RequirementGrid label="Equipment requirements" {...required('equipmentRequirements')}
            columns={[{ key: 'item', label: 'Equipment item' }, { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'notes', label: 'Notes' }]}
            value={fields.equipmentRequirements} onChange={value => set('equipmentRequirements', value)} />
          <Select label="attendees register for event through the system" {...required('registrationEnabled')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
            value={fields.registrationEnabled === null ? '' : fields.registrationEnabled ? 'yes' : 'no'}
            onChange={e => set('registrationEnabled', e.target.value === '' ? null : e.target.value === 'yes')} />
        </fieldset>
        {missing.length > 0 && <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-300">Please fill in the following mandatory fields before submitting: {missing.map(key => requiredLabels[key]).join(', ')}.</p>}
        <Modal open={saved} onClose={goToRequests} title="Draft saved"
          footer={<Button type="button" onClick={goToRequests}>OK</Button>}>
          <p role="status" className="text-sm text-green-700 dark:text-green-300">Draft saved successfully.</p>
        </Modal>
        <Modal open={!!error} onClose={() => setError('')} title={errorTitle || 'Notice'}
          footer={<Button type="button" onClick={() => setError('')}>OK</Button>}>
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>
          {pending.current && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Your entries are retained. Retry this save to continue editing.</p>}
        </Modal>
        {locked && <p className="mb-4 text-sm"><a className="underline" href={`/requests/${id}`}>Reopen the saved request</a> to load its current status and values. Unsaved changes will be discarded.</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <Link to="/events"><Button type="button" variant="secondary">My Requests</Button></Link>
          <Button type="submit" disabled={saving || locked}>{saving ? 'Saving…' : pending.current ? 'Retry save' : 'Save draft'}</Button>
          <Button type="button" disabled={saving || locked || !!pending.current} onClick={submit}>Submit event request</Button>
        </div>
      </CardBody></Card>
    </form>
  );
}
