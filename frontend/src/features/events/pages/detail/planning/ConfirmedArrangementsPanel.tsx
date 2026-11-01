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

/** Yellow: requested, checking, reserved or pending. Green: confirmed. Red: not requested, or refused or unavailable and not in effect. */
type Tone = "green" | "yellow" | "red";
const DOT_CLASS: Record<Tone, string> = { green: "bg-success-500", yellow: "bg-warning-500", red: "bg-danger-500" };
const TONE_LABEL: Record<Tone, string> = { green: "Confirmed", yellow: "Reserved or pending", red: "Not requested" };
const TONE_RANK: Record<Tone, number> = { green: 0, yellow: 1, red: 2 };

function toneOfState(state: string): Tone {
  const s = state.trim().toLowerCase();
  if (s === "approved" || s === "confirmed") return "green";
  if (["pending", "reserved", "requested", "checking", "awaiting check", "changes requested"].includes(s)) return "yellow";
  return "red";
}

/** A group shows the worst state of its items; a group with no items is not requested. */
function worstTone(tones: Tone[]): Tone {
  if (tones.length === 0) return "red";
  return tones.reduce((worst, tone) => (TONE_RANK[tone] > TONE_RANK[worst] ? tone : worst));
}

function ApprovalDot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      title={TONE_LABEL[tone]}
      className={`mr-2 inline-block h-3 w-3 rounded-full align-middle ${DOT_CLASS[tone]}`}
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
  const venueTone = worstTone(view.venueBookings.map((booking) => toneOfState(booking.status)));
  const equipmentTone = worstTone(view.equipment.map((line) => toneOfState(line.status)));
  const safetyTone = toneOfState(view.safety.state);

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Confirmed Arrangements</h2>
      </CardHeader>
      <CardBody className="space-y-3 text-sm text-gray-800 dark:text-gray-200">
        <div>
          <h3 className="mb-2 border-b border-gray-200 pb-1 text-base font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100"><ApprovalDot tone={venueTone} />Venue</h3>
          <ul className="list-disc pl-5">
            {view.venueBookings.map((booking) => (
              <li key={`${booking.venueName}-${booking.start}`}>
                {booking.venueName}: {formatSgtSlot(booking.start, booking.end)} ({booking.status})
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 border-b border-gray-200 pb-1 text-base font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100"><ApprovalDot tone={equipmentTone} />Equipment</h3>
          <ul className="list-disc pl-5">
            {view.equipment.map((line) => (
              <li key={line.name}>
                {line.name} x{line.quantity} ({line.status})
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 border-b border-gray-200 pb-1 text-base font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100"><ApprovalDot tone={safetyTone} />Safety Officer Approval</h3>
          <p>{view.safety.state}</p>
        </div>
      </CardBody>
    </Card>
  );
}
