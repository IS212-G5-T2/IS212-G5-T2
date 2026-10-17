import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { getEquipmentRequestQueue, getMyEquipmentRequests, type EquipmentRequestRecord } from '../../api/equipment-requests-api';
import { EquipmentRequestConfirmationDialog } from './EquipmentRequestConfirmationDialog';

export function EquipmentRequestsPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get('eventId');
  const [requests, setRequests] = useState<EquipmentRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(() => {
    const submitted = searchParams.get('submitted');
    const updated = searchParams.get('updated');
    return submitted ? { action: 'submitted' as const, reference: submitted }
      : updated ? { action: 'updated' as const, reference: updated } : null;
  });
  const isCoordinator = currentUser.role === 'coordinator';
  const dismissConfirmation = useCallback(() => {
    setConfirmation(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('submitted');
      next.delete('updated');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRequests(isCoordinator ? await getMyEquipmentRequests() : await getEquipmentRequestQueue());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load equipment requests.');
    } finally { setLoading(false); }
  }, [isCoordinator]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createTo = requestedEventId
    ? `/equipment/requests/create?eventId=${encodeURIComponent(requestedEventId)}`
    : '/equipment/requests/create';

  return <div>
    <PageHeader title={isCoordinator ? 'My Equipment Requests' : 'Equipment Review Queue'}
      description={isCoordinator ? 'Track submitted requests and their review status.' : 'Review equipment requests submitted by event coordinators.'}
      actions={isCoordinator && <Link to={createTo} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-base font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
        <span aria-hidden="true">+</span> Create Equipment Request
      </Link>} />
    {error && <div className="mb-4" role="alert">{error}</div>}
    {confirmation && <EquipmentRequestConfirmationDialog
      action={confirmation.action}
      reference={confirmation.reference}
      onDismiss={dismissConfirmation}
    />}
    <section aria-label={isCoordinator ? 'My Equipment Requests' : 'Technical Support review queue'}>
      {loading ? <p role="status">Loading equipment requests…</p> : requests.length === 0 ? <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-gray-500">No equipment requests to display.</p> :
        <div className="space-y-3">{requests.map((record) => <Card key={record.id}><CardBody>
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-medium">{record.eventName}</h2>
            <p className="text-sm text-gray-500">{new Date(record.eventStart).toLocaleString()} · Expected attendance {record.expectedAttendance}</p>
            {record.coordinatorName && <p className="text-sm text-gray-500">Coordinator: {record.coordinatorName}</p>}
          </div><div className="flex items-center gap-2"><span className="rounded-full bg-warning-100 px-2.5 py-0.5 text-xs font-medium text-warning-800">{record.status}</span>
            {isCoordinator && record.status === 'Pending Review' && record.eventStatus !== 'Confirmed' && <Link to={`/equipment/requests/${encodeURIComponent(record.id)}/update`}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
              Update Event
            </Link>}
          </div></div>
          <p className="mt-2 text-sm">Request reference: <span className="font-mono">{record.reference}</span></p>
          <ul className="mt-2 space-y-1">{record.items.map((item) => <li key={item.id} className="text-sm">{item.equipmentName} · {item.equipmentType} × {item.quantity}</li>)}</ul>
        </CardBody></Card>)}</div>}
    </section>
  </div>;
}
