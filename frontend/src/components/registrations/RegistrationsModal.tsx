import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useRegistrationReport } from "@/components/registrations/useRegistrationReport";
import { useReportExport } from "@/components/registrations/useReportExport";
import {
  REPORT_MESSAGES,
  formatReportDateSgt,
  formatReportDateTimeSgt,
  filterRegistrations,
  type FilterType,
  type RegistrationReport,
  type ReportRow,
} from "@/utils/registrationReport";

const SEARCH_DEBOUNCE_MS = 150;
const NO_MATCH = "No registrations match your criteria";

interface RegistrationsModalProps {
  eventId: string;
  registrationOpensAt?: string;
  registrationClosesAt?: string;
  onClose: () => void;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${expanded ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

function Summary({
  report,
  registrationOpensAt,
  registrationClosesAt,
}: {
  report: RegistrationReport;
  registrationOpensAt?: string;
  registrationClosesAt?: string;
}) {
  const { event, totalConfirmed, availableSpots } = report;
  return (
    <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
      <p className="font-medium text-gray-900 dark:text-gray-100">
        {totalConfirmed} of {event.capacity} spots registered · {availableSpots} available
      </p>
      {(registrationOpensAt || registrationClosesAt) && (
        <p className="text-gray-600 dark:text-gray-400">
          Opens: {registrationOpensAt ? formatReportDateTimeSgt(registrationOpensAt) : "—"} · Closes:{" "}
          {registrationClosesAt ? formatReportDateTimeSgt(registrationClosesAt) : "—"}
        </p>
      )}
      <p className="text-gray-600 dark:text-gray-400">No waitlist</p>
      <p className="text-gray-600 dark:text-gray-400">
        Event: {formatReportDateTimeSgt(event.startDateTime)} – {formatReportDateTimeSgt(event.endDateTime)}
      </p>
    </div>
  );
}

function RegistrationCard({ row, expanded, onToggle }: { row: ReportRow; expanded: boolean; onToggle: () => void }) {
  const panelId = useId();
  return (
    <li className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 dark:hover:bg-gray-700/50"
      >
        <ChevronIcon expanded={expanded} />
        <span className="min-w-0 flex-1 break-words text-sm">
          <span className="font-medium text-gray-900 dark:text-gray-100">{row.fullName}</span>{" "}
          <span className="text-gray-500 dark:text-gray-400">({row.email})</span>
        </span>
        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{formatReportDateSgt(row.registeredAt)}</span>
      </button>
      {expanded && (
        <div id={panelId} className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium text-gray-500 dark:text-gray-400">Full name</dt>
            <dd className="break-words text-gray-900 dark:text-gray-100">{row.fullName}</dd>
            <dt className="font-medium text-gray-500 dark:text-gray-400">Email</dt>
            <dd className="break-words text-gray-900 dark:text-gray-100">{row.email}</dd>
            <dt className="font-medium text-gray-500 dark:text-gray-400">Contact number</dt>
            <dd className="break-words text-gray-900 dark:text-gray-100">
              {row.contactNumber || <span className="text-gray-400 dark:text-gray-500">—</span>}
            </dd>
            <dt className="font-medium text-gray-500 dark:text-gray-400">Registered at</dt>
            <dd className="text-gray-900 dark:text-gray-100">{formatReportDateTimeSgt(row.registeredAt)}</dd>
            <dt className="font-medium text-gray-500 dark:text-gray-400">Status</dt>
            <dd className="text-gray-900 dark:text-gray-100">{row.status}</dd>
          </dl>
        </div>
      )}
    </li>
  );
}

/**
 * Registrations overlay opened from the People card on the event detail page. It is mounted only while open, so the
 * report (and its 5 s refresh) loads on open and stops on close. Access is decided by the server: a 403 shows MSG-08.
 * CSV/PDF are the server's exports of the full report; they are not narrowed by the search or filter.
 */
export function RegistrationsModal({ eventId, registrationOpensAt, registrationClosesAt, onClose }: RegistrationsModalProps) {
  const { state, retry } = useRegistrationReport(eventId);
  const { downloading, exportError, exportAs } = useReportExport(eventId);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const searchId = useId();
  const filterId = useId();

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const rows = useMemo(() => (state.status === "ready" ? state.report.registrations : []), [state]);
  const visible = useMemo(() => filterRegistrations(rows, search, filter), [rows, search, filter]);
  const title = state.status === "ready" ? `Registrations (${state.report.totalConfirmed})` : "Registrations";

  const footer =
    state.status === "ready" ? (
      <div className="flex w-full flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={downloading !== null} onClick={() => void exportAs("csv")}>
          Export as CSV
        </Button>
        <Button variant="secondary" disabled={downloading !== null} onClick={() => void exportAs("pdf")}>
          Export as PDF
        </Button>
      </div>
    ) : undefined;

  return (
    <Modal open onClose={onClose} title={title} size="lg" footer={footer}>
      {state.status === "loading" && <p role="status" className="text-sm text-gray-500 dark:text-gray-400">Loading registrations…</p>}
      {state.status === "forbidden" && <div role="alert" className="text-sm text-danger-700 dark:text-danger-300">{REPORT_MESSAGES.forbidden}</div>}
      {state.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{state.message}</span>
          <Button variant="secondary" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      )}
      {state.status === "ready" && (
        <div className="space-y-4">
          <Summary report={state.report} registrationOpensAt={registrationOpensAt} registrationClosesAt={registrationClosesAt} />

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[12rem] flex-1">
              <label htmlFor={searchId} className="sr-only">
                Search registrations
              </label>
              <SearchIcon />
              <input
                id={searchId}
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, email, or phone..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor={filterId} className="text-gray-600 dark:text-gray-400">
                Filter:
              </label>
              <select
                id={filterId}
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterType)}
                className="min-w-[7.5rem] rounded-lg border border-gray-300 bg-white py-2 pl-2 pr-6 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="all">All</option>
                <option value="today">Registered today</option>
                <option value="special-requirements">Indicated special requirements</option>
              </select>
            </div>
          </div>

          {exportError && (
            <div role="alert" className="text-sm text-danger-700 dark:text-danger-300">
              {exportError}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              {REPORT_MESSAGES.empty}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              {NO_MATCH}
            </div>
          ) : (
            <ul className="max-h-[min(25rem,40vh)] space-y-3 overflow-y-auto pr-1">
              {visible.map((row) => (
                <RegistrationCard
                  key={row.registrationId}
                  row={row}
                  expanded={expandedId === row.registrationId}
                  onToggle={() => setExpandedId(expandedId === row.registrationId ? null : row.registrationId)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
