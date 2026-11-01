/*
 * SPM-135 AC5: the Organiser who submitted a Confirmed event sees its confirmed
 * arrangements. Reads the allowlist endpoint only; never the raw event row.
 */
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { fetchConfirmedArrangements, type ConfirmedArrangements } from "@/utils/arrangements";
import { sgtDateTimeParts } from "@/utils/sgtDate";

/** Slot shown in Singapore time (SPM-135 05-B), e.g. "5 Nov 2026 10:00 to 12:00 SGT". */
function formatSgtSlot(start: string, end: string): string {
  const from = sgtDateTimeParts(start);
  const to = sgtDateTimeParts(end);
  return `${from.date} ${from.time} to ${to.time} SGT`;
}

/**
 * Yellow: requested, checking, reserved or pending. Green: confirmed. Red: not requested, or refused or unavailable and
 * not in effect. The red title is the item's own status with its first letter capitalised and the rest as the server
 * wrote it (for example Released or Rejected); a group with nothing in it, or a blank state, reads "None requested".
 */
type Tone = "green" | "yellow" | "red";
const DOT_CLASS: Record<Tone, string> = { green: "bg-success-500", yellow: "bg-warning-500", red: "bg-danger-500" };
const TONE_LABEL: Record<"green" | "yellow", string> = { green: "Confirmed", yellow: "Reserved or pending" };
const NONE_REQUESTED = "None requested";
const TONE_RANK: Record<Tone, number> = { green: 0, yellow: 1, red: 2 };

function toneOfState(state: string): Tone {
  const s = state.trim().toLowerCase();
  if (s === "approved" || s === "confirmed") return "green";
  if (["pending", "reserved", "requested", "checking", "awaiting check", "changes requested"].includes(s)) return "yellow";
  return "red";
}

/** The first letter in capitals, the rest unchanged ("released" gives "Released", "Not Available" stays as written). */
function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface Dot {
  tone: Tone;
  title: string;
}

/** A group shows the worst state of its items; a group with no items is not requested. */
function dotFor(states: string[]): Dot {
  if (states.length === 0) return { tone: "red", title: NONE_REQUESTED };
  const items = states.map((state) => ({ state: state.trim(), tone: toneOfState(state) }));
  const worst = items.reduce((w, item) => (TONE_RANK[item.tone] > TONE_RANK[w.tone] ? item : w));
  return { tone: worst.tone, title: worst.tone === "red" ? capitalised(worst.state) || NONE_REQUESTED : TONE_LABEL[worst.tone] };
}

function ApprovalDot({ dot }: { dot: Dot }) {
  return (
    <span
      aria-hidden="true"
      title={dot.title}
      className={`mr-2 inline-block h-3 w-3 rounded-full align-middle ${DOT_CLASS[dot.tone]}`}
    />
  );
}

export function ConfirmedArrangementsPanel({ eventId }: { eventId: string }) {
  const [view, setView] = useState<ConfirmedArrangements | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchConfirmedArrangements(eventId)
      .then((result) => {
        if (!cancelled) setView(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load confirmed arrangements.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (error) {
    return (
      <div role="alert" className="mb-4 rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300">
        {error}
      </div>
    );
  }
  if (!view) return null;
  const venueDot = dotFor(view.venueBookings.map((booking) => booking.status));
  const equipmentDot = dotFor(view.equipment.map((line) => line.status));
  const safetyDot = dotFor([view.safety.state]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Confirmed Arrangements</h2>
      </CardHeader>
      <CardBody className="space-y-3 text-sm text-gray-800 dark:text-gray-200">
        <div>
          <h3 className="mb-2 border-b border-gray-200 pb-1 text-base font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100"><ApprovalDot dot={venueDot} />Venue</h3>
          {view.venueBookings.length === 0 ? (
            <p>{NONE_REQUESTED}</p>
          ) : (
            <ul className="list-disc pl-5">
              {view.venueBookings.map((booking) => (
                <li key={`${booking.venueName}-${booking.start}`}>
                  {booking.venueName}: {formatSgtSlot(booking.start, booking.end)} ({booking.status})
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 border-b border-gray-200 pb-1 text-base font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100"><ApprovalDot dot={equipmentDot} />Equipment</h3>
          {view.equipment.length === 0 ? (
            <p>{NONE_REQUESTED}</p>
          ) : (
            <ul className="list-disc pl-5">
              {view.equipment.map((line) => (
                <li key={line.name}>
                  {line.name} x{line.quantity} ({line.status})
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 border-b border-gray-200 pb-1 text-base font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100"><ApprovalDot dot={safetyDot} />Safety Officer Approval</h3>
          <p>{view.safety.state}</p>
        </div>
      </CardBody>
    </Card>
  );
}
