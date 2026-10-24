/*
 * SPM-48 coordinator queue (backend/src/events/queue):
 *   GET /coordinator/queue[?status=planning,submitted]  the signed-in coordinator's assigned events, each with
 *                                                       its queue indicators; 403 for any other role; never cached.
 */
import type { EventRecord } from "@/types";
import { api } from "@/utils/api";

export function fetchCoordinatorQueue() {
  return api<EventRecord[]>("/coordinator/queue");
}
