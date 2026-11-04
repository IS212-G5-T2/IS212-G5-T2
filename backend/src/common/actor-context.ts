/*
 * SPM-157 AC5: who made a change. The authentication middleware runs the rest of each signed-in
 * request inside `runAsActor`, and DatabaseService passes the id to PostgreSQL as the
 * transaction-local setting `app.actor_id`, which the event_audit_log triggers read
 * (database/postgresql/init/032). Code outside a signed-in request has no actor, so the triggers
 * record its changes as made by the system.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

interface ActorStore {
  actorId: string;
}

const storage = new AsyncLocalStorage<ActorStore>();

/** Runs `work` (and everything it awaits) with `actorId` as the acting user. */
export function runAsActor<T>(actorId: string, work: () => T): T {
  return storage.run({ actorId }, work);
}

/** The signed-in user of the current request, or undefined outside one. */
export function currentActorId(): string | undefined {
  return storage.getStore()?.actorId;
}
