import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { getEquipmentRequestQueue, getMyEquipmentRequests, reserveEquipmentRequest, type EquipmentRequestRecord } from '../../api/equipment-requests-api';
import { EquipmentRequestConfirmationDialog } from './EquipmentRequestConfirmationDialog';

const updatableEventStatuses = new Set(['Approved', 'Planning']);

export function EquipmentRequestsPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get('eventId');
  const [requests, setRequests] = useState<EquipmentRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
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
      setRequests([]);
      setError(e instanceof Error ? e.message : 'Could not load equipment requests.');
    } finally { setLoading(false); }
  }, [isCoordinator]);

  useEffect(() => { void refresh(); }, [refresh]);

  const approveRequest = async (requestId: string) => {
    setError('');
    try {
      await reserveEquipmentRequest(requestId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reserve equipment for this event.');
    }
  };

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
            <p className="text-sm text-gray-500">Start: {new Date(record.eventStart).toLocaleString()}</p>
            <p className="text-sm text-gray-500">End: {new Date(record.eventEnd).toLocaleString()}</p>
            <p className="text-sm text-gray-500">Expected attendance {record.expectedAttendance}</p>
            {record.coordinatorName && <p className="text-sm text-gray-500">Coordinator: {record.coordinatorName}</p>}
          </div><div className="flex items-center gap-2"><span className="rounded-full bg-warning-100 px-2.5 py-0.5 text-xs font-medium text-warning-800">{record.status}</span>
            {isCoordinator && updatableEventStatuses.has(record.eventStatus) && <Link to={`/equipment/requests/${encodeURIComponent(record.id)}/update`}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
              Update Event
            </Link>}
          </div></div>
          <p className="mt-2 text-sm">Request reference: <span className="font-mono">{record.reference}</span></p>
          {!isCoordinator && <div className="mt-3">
            {record.eventStatus !== 'Confirmed' && record.status === 'Pending Review' && <button type="button" onClick={() => setExpandedRequestId(expandedRequestId === record.id ? null : record.id)}
              aria-expanded={expandedRequestId === record.id} aria-controls={`review-details-${record.id}`}
              className="rounded-md border border-primary-600 px-3 py-1.5 font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600">
              {expandedRequestId === record.id ? 'Close review' : 'Review request'}
            </button>}
          </div>}
          {(!isCoordinator && expandedRequestId === record.id) && <div id={`review-details-${record.id}`} className="mt-3 rounded-md border border-gray-200 p-3">
            <h3 className="font-medium">Equipment requested</h3>
          <ul className="mt-2 space-y-3">{record.items.map((item) => {
            const availableQuantity = item.availableQuantity ?? item.quantity;
            const sufficient = item.sufficient ?? availableQuantity >= item.quantity;
            return <li key={item.id} className="text-sm">
            <div>{item.equipmentName} · {item.equipmentType} × {item.quantity}</div>
            {!isCoordinator && <p className={sufficient ? 'text-green-700' : 'text-red-700'}>
              {availableQuantity} available for this event period; {item.quantity} requested.
            </p>}
          </li>})}</ul>
            <button type="button" disabled={record.items.some((item) => !(item.sufficient ?? (item.availableQuantity ?? item.quantity) >= item.quantity))} onClick={() => void approveRequest(record.id)}
              className="mt-4 rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">Approve &amp; reserve</button>
          </div>}
          {isCoordinator && <ul className="mt-2 space-y-1">{record.items.map((item) => <li key={item.id} className="text-sm">{item.equipmentName} · {item.equipmentType} × {item.quantity}</li>)}</ul>}
        </CardBody></Card>)}</div>}
    </section>
  </div>;
}
