import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EquipmentReservationForm } from './EquipmentReservationForm';
import {
  getAssignedEvents, getMyEquipmentRequests, submitEquipmentRequest, updateEquipmentRequest,
  type EquipmentRequestEvent, type EquipmentRequestRecord,
} from '../../api/equipment-requests-api';

const openStatuses = ['approved', 'planning'];

export function EquipmentRequestEditorPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const { requestId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EquipmentRequestEvent[]>([]);
  const [requests, setRequests] = useState<EquipmentRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(requestId);
  const requestedEventId = searchParams.get('eventId') ?? '';
  const request = requests.find((record) => record.id === requestId);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [assigned, mine] = await Promise.all([getAssignedEvents(), getMyEquipmentRequests()]);
        if (!active) return;
        setEvents(assigned.filter((event) => openStatuses.includes(event.status)));
        setRequests(mine);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load equipment request details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const formEvents = isEditing
    ? events.filter((event) => event.id === request?.eventId)
    : events.filter((event) => !requests.some((record) => record.eventId === event.id));

  const save = async (eventId: string, items: Parameters<typeof submitEquipmentRequest>[0]['items']) => {
    setSubmitting(true);
    setError('');
    try {
      if (isEditing && requestId) {
        const result = await updateEquipmentRequest(requestId, { eventId, items });
        navigate(`/equipment/requests?updated=${encodeURIComponent(result.requestReference)}`);
      } else {
        const result = await submitEquipmentRequest({ eventId, items });
        navigate(`/equipment/requests?submitted=${encodeURIComponent(result.requestReference)}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${isEditing ? 'update' : 'submit'} equipment request.`);
    } finally { setSubmitting(false); }
  };

  if (currentUser.role !== 'coordinator') return <div role="alert">Coordinator access required.</div>;
  if (loading) return <p role="status">Loading equipment request form…</p>;
  if (error && !formEvents.length) return <div>
    <p role="alert" className="mb-4">{error}</p>
    <Link to="/equipment/requests" className="text-primary-700 underline dark:text-primary-300">Back to My Equipment Requests</Link>
  </div>;
  if (isEditing && !request) return <div>
    <PageHeader title="Update Equipment Request" />
    <p role="alert" className="mb-4">Equipment request not found.</p>
    <Link to="/equipment/requests" className="text-primary-700 underline dark:text-primary-300">Back to My Equipment Requests</Link>
  </div>;
  if (isEditing && request && !['Approved', 'Planning'].includes(request.eventStatus)) return <div>
    <PageHeader title="Update Equipment Request" />
    <p role="alert" className="mb-4">This event is {request.eventStatus.toLowerCase()}. Its equipment request can no longer be updated.</p>
    <Link to="/equipment/requests" className="text-primary-700 underline dark:text-primary-300">Back to My Equipment Requests</Link>
  </div>;

  return <div>
    <PageHeader title={isEditing ? 'Update Equipment Request' : 'Create Equipment Request'}
      description={isEditing ? `Update the items for ${request?.eventName}. The request reference will remain unchanged.` : 'Choose an event and add the equipment needed for it.'}
      actions={<Button type="button" variant="secondary" onClick={() => navigate('/equipment/requests')}>Cancel</Button>} />
    {error && <p role="alert" className="mb-4">{error}</p>}
    {!formEvents.length && !isEditing && <p className="mb-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      No eligible events are available. Each event can have one equipment request; use Update Event from the request list to change an existing request.
    </p>}
    <Card><CardBody>
      <EquipmentReservationForm
        key={request?.id ?? 'new'}
        events={formEvents}
        initialEventId={request?.eventId ?? requestedEventId}
        submitting={submitting}
        onSubmit={save}
        request={request}
        isEditing={isEditing}
      />
    </CardBody></Card>
  </div>;
}
