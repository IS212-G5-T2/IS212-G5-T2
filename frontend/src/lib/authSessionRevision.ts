type SessionExpiredListener = (requestRevision: number) => void;

let revision = 0;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/** Marks a login, restore, logout, or expiry boundary for in-flight requests. */
export function advanceAuthSessionRevision(): number {
  revision += 1;
  return revision;
}

/** Captured when an API call starts so a stale 401 cannot end a newer session. */
export function getAuthSessionRevision(): number {
  return revision;
}

export function onAuthSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

/** Notifies the store only for a 401 tied to the session that started the request. */
export function reportAuthSessionExpired(requestRevision: number): void {
  if (requestRevision !== revision) return;
  for (const listener of sessionExpiredListeners) listener(requestRevision);
}
