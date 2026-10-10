import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/api";
import {
  REPORT_POLL_INTERVAL_MS,
  fetchRegistrationReport,
  type RegistrationReport,
} from "@/features/registrations/lib/registrationReport";

export type ReportState =
  | { status: "loading" }
  | { status: "ready"; report: RegistrationReport }
  | { status: "forbidden" }
  | { status: "error"; message: string };

/**
 * SPM-63 AC6: loads the report and refreshes it every REPORT_POLL_INTERVAL_MS without user action. Each refresh
 * REPLACES the report (never appends). Polling is keyed to the event and dies with the page: it stops on unmount, on
 * event change, on 401 (session over, user sent to login) and on 403 (access revoked, rows cleared). A transient
 * failure after the first load keeps the rows on screen and polling continues. A response for an event that is no
 * longer displayed is ignored, and a new request is not started while one is outstanding.
 */
export function useRegistrationReport(eventId: string) {
  const [state, setState] = useState<ReportState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    setState({ status: "loading" });

    const stop = () => {
      active = false;
      clearInterval(timer);
    };
    const load = async (first: boolean) => {
      if (inFlight) return;
      inFlight = true;
      try {
        const report = await fetchRegistrationReport(eventId);
        if (active) setState({ status: "ready", report });
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 403) {
          stop();
          setState({ status: "forbidden" });
        } else if (error instanceof ApiError && error.status === 401) {
          stop();
          useAppStore.setState({ isAuthenticated: false });
        } else if (first) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "We couldn't load the registration report.",
          });
        }
        // After the first load, any other failure keeps the rows and the next poll tries again.
      } finally {
        inFlight = false;
      }
    };

    const timer = setInterval(() => void load(false), REPORT_POLL_INTERVAL_MS);
    void load(true);
    return stop;
  }, [eventId, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}
