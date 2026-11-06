/*
 * SPM-155: loads an event's cancellation requests (newest first). Every mount reads the server (no cache), and
 * `reload` re-reads after a request or a decision. Only the newest load may set the state, so a slow earlier reply
 * never overwrites a later one. A load that cannot complete is reported, not hidden.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEventCancellationRequests } from "@/features/events/api/cancellation-requests-api";
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";

export function useCancellationRequests(eventId: string, enabled: boolean) {
  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const list = await fetchEventCancellationRequests(eventId);
      if (mine !== latest.current) return;
      setRequests(Array.isArray(list) ? list : []);
      setError("");
    } catch (e) {
      if (mine !== latest.current) return;
      setError(`Could not load the cancellation request.${e instanceof Error && e.message ? ` ${e.message}` : ""}`);
    }
    setLoaded(true);
  }, [eventId]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    return () => {
      // A reply that arrives after unmount or after the event changed is ignored.
      latest.current += 1;
    };
  }, [enabled, reload]);

  return { requests, loaded, error, reload };
}
