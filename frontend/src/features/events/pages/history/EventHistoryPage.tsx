/*
 * SPM-157 Audit History of Important Actions (/events/:id/history).
 *
 * - The assigned Coordinator sees four histories: event changes, venue bookings, equipment
 *   reservations and registrations (AC1 to AC4); the owning Organiser sees event changes and
 *   registrations (AC8). The server decides which sections are returned and who may read them
 *   (AC9; anyone else gets the server's message).
 * - Entries sit on a timeline grouped by Singapore day, oldest first as the server orders them (AC6). Each
 *   shows what happened, the time, who (a person, "System" or "Not recorded"), each change as one line
 *   ("Status: Submitted → Approved", a new value alone, free text as a quote, a new slot as one time range)
 *   and the reason (AC5).
 * - Read-only: there is no control that edits or deletes an entry (AC10).
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { fetchEventHistory } from "@/features/events/api/event-history-api";
import { SECTION_TITLES, changeLines, groupByDay, visibleSections, type ChangeLine } from "@/features/events/lib/eventHistory";
import type { EventHistory, HistoryEntry } from "@/features/events/types/eventHistory";
import { formatSgtTime } from "@/utils/sgtDate";

export function EventHistoryPage() {
  const { id } = useParams();
  const [history, setHistory] = useState<EventHistory | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setHistory(null);
    setError("");
    fetchEventHistory(id!)
      .then((loaded) => {
        if (active) setHistory(loaded);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Could not load the event history.");
      });
    return () => {
      active = false;
    };
  }, [id]);

  const backLink = (
    <Link to={`/events/${id}`} className="text-sm text-primary-700 underline dark:text-primary-300">
      Back To Event
    </Link>
  );

  if (error)
    return (
      <div>
        <p role="alert" className="mb-4 text-sm text-danger-600 dark:text-danger-400">
          {error}
        </p>
        {backLink}
      </div>
    );
  if (!history) return <p role="status">Loading event history…</p>;

  return (
    <div>
      <div className="mb-4">{backLink}</div>
      <PageHeader title={`History: ${history.eventName}`} description={`Current status: ${history.eventStatus}`} />
      {visibleSections(history).map((section) => (
        <Card key={section} className="mb-6">
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{SECTION_TITLES[section]}</h2>
          </CardHeader>
          <CardBody>
            <HistoryList entries={history.sections[section]!} label={SECTION_TITLES[section]} />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function HistoryList({ entries, label }: { entries: HistoryEntry[]; label: string }) {
  if (!entries.length) return <p className="text-sm text-gray-500 dark:text-gray-400">Nothing recorded yet.</p>;
  return (
    <div aria-label={label} role="group" className="space-y-5">
      {groupByDay(entries).map((group) => (
        <section key={group.day} aria-label={`${label}, ${group.day}`}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{group.day}</h3>
          <ol className="relative space-y-4 border-l border-gray-200 pl-5 text-sm dark:border-gray-700">
            {group.entries.map((entry) => (
              <HistoryItem key={entry.id} entry={entry} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const lines = changeLines(entry.changes);
  const person = entry.actor.kind === "user";
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-gray-900 ${
          person ? "bg-primary-600" : "bg-gray-400"
        }`}
      />
      <p className="text-gray-900 dark:text-gray-100">
        <span className="font-semibold">{entry.summary}</span>
        {entry.subject && <span className="text-gray-700 dark:text-gray-300"> · {entry.subject}</span>}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        <time dateTime={entry.occurredAt}>{formatSgtTime(entry.occurredAt)}</time>
        {" · "}
        <span className={person ? "" : "italic"}>{person ? `by ${entry.actor.name}` : entry.actor.name}</span>
      </p>
      {lines.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-gray-800 dark:text-gray-200">
          {lines.map((line, index) => (
            <li key={`${line.label}-${index}`}>
              <ChangeLineView line={line} />
            </li>
          ))}
        </ul>
      )}
      {entry.reason && (
        <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
          <span className="font-medium">Reason:</span> {entry.reason}
        </p>
      )}
    </li>
  );
}

function ChangeLineView({ line }: { line: ChangeLine }) {
  const label = <span className="text-gray-500 dark:text-gray-400">{line.label}:</span>;
  switch (line.kind) {
    case "change":
      return (
        <>
          {label} <span className="text-gray-500 line-through decoration-gray-400 dark:text-gray-400">{line.from}</span>
          <span aria-label="changed to"> → </span>
          <span className="font-medium">{line.to}</span>
        </>
      );
    case "cleared":
      return (
        <>
          {label} <span className="text-gray-500 line-through decoration-gray-400 dark:text-gray-400">{line.from}</span>{" "}
          <span className="italic">removed</span>
        </>
      );
    case "quote":
      return (
        <figure>
          <figcaption className="sr-only">{line.label}</figcaption>
          <blockquote className="whitespace-pre-wrap border-l-2 border-gray-300 pl-3 italic text-gray-700 dark:border-gray-600 dark:text-gray-300">
            “{line.value}”
          </blockquote>
        </figure>
      );
    default:
      return (
        <>
          {label} <span className="font-medium">{line.value}</span>
        </>
      );
  }
}
