import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { eventRequests } from '@/api/eventRequests';
import { DraftRequestForm } from '@/components/domain/DraftRequestForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { EventRequest } from '@/types/eventRequest';

export function DraftRequestPage() {
  const { id } = useParams();
  const [request, setRequest] = useState<EventRequest>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRequest(undefined); setError('');
    if (!id) return () => controller.abort();
    eventRequests.get(id, controller.signal).then(result => {
      if (!controller.signal.aborted) setRequest(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load request.');
    });
    return () => controller.abort();
  }, [id, attempt]);
  if (id && error) return <div role="alert">{error} <button className="underline" onClick={() => setAttempt(n => n + 1)}>Retry</button> <Link to="/events">My Requests</Link></div>;
  if (id && (!request || request.id !== id)) return <p role="status">Loading request…</p>;
  if (request && request.status !== 'draft') return <div>
    <PageHeader title={request.fields.name || 'Event request'} />
    <StatusBadge status={request.status} />
    <p className="my-4">This request is no longer a draft. Further changes must follow the Event Change Requests workflow through your coordinator.</p>
    <Link to="/events" className="underline">My Requests</Link>
  </div>;
  return <div className="mx-auto max-w-2xl">
    <PageHeader title={id ? 'Edit draft request' : 'Create event request'} description="Save your progress and return when you are ready." />
    <div className="mb-4"><StatusBadge status="draft" /></div>
    <DraftRequestForm key={id ?? 'new'} initial={request} />
  </div>;
}
