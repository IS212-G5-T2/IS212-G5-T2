import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { eventRequests } from '@/api/eventRequests';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { EventRequest } from '@/types/eventRequest';

export function MyRequestsPage() {
  const location = useLocation();
  const [requests, setRequests] = useState<EventRequest[]>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRequests(undefined); setError('');
    eventRequests.list(controller.signal).then(result => {
      if (!controller.signal.aborted) setRequests(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load requests.');
    });
    return () => controller.abort();
  }, [attempt]);
  return <div>
    <PageHeader title="My Requests" description="Event requests for your organisation." actions={<Link to="/events/create"><Button>+ Create event request</Button></Link>} />
    {error ? <p role="alert">{error} <button className="underline" onClick={() => setAttempt(n => n + 1)}>Retry</button></p>
      : !requests ? <p role="status">Loading requests…</p>
      : requests.length === 0 ? <p>No requests yet. Create an event request to get started.</p>
      : <div className="grid gap-4 sm:grid-cols-2">{requests.map(request => <Link key={request.id} to={`/requests/${request.id}`} state={location.state?.savedRequestId === request.id ? { saved: true } : undefined}>
        <Card><CardBody><div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold">{request.fields.name || 'Untitled event request'}</h2><StatusBadge status={request.status} />
        </div><p className="mt-2 text-sm text-gray-500">{request.fields.purpose || 'Purpose not yet specified'}</p>
        <p className="mt-3 text-xs text-gray-500">Last saved {new Date(request.updatedAt).toLocaleString()}</p>
        </CardBody></Card>
      </Link>)}</div>}
  </div>;
}
