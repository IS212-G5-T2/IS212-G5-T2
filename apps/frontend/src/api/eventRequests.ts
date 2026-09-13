import type { DraftFields, EventRequest } from '@/types/eventRequest';
export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/event-requests${path}`, {
      ...init, credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new Error('Cannot reach the event request service. Start the backend and try again.');
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: 'Some draft values are invalid. Check your entries and try again.',
      404: 'Request not found.',
      409: 'This request has changed or been submitted. Reopen it before editing.',
    };
    throw new RequestError(response.status, messages[response.status] ?? 'The request could not be completed. Please retry.');
  }
  return response.json() as Promise<T>;
}
export const eventRequests = {
  list: (signal?: AbortSignal) => api<EventRequest[]>('', { signal }),
  get: (id: string, signal?: AbortSignal) => api<EventRequest>(`/${encodeURIComponent(id)}`, { signal }),
  save: (id: string, fields: DraftFields, version: number, operationId: string) =>
    api<EventRequest>(`/${encodeURIComponent(id)}/draft`, { method: 'PUT', body: JSON.stringify({ fields, version, operationId }) }),
};
