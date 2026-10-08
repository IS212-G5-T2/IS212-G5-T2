import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/FormControls";
import { ApiError, api } from "@/utils/api";
import { formatDateTimeRange } from "@/utils/format";
import type { VenueReservation, VenueUnavailablePeriod } from "./venue-records";

interface Props {
  venueId: string;
  periods: VenueUnavailablePeriod[];
  canManage: boolean;
  onSaved: () => void;
}

interface SavedPeriod {
  period: VenueUnavailablePeriod;
  affectedBookings: VenueReservation[];
}

export function VenueUnavailabilityPanel({ venueId, periods, canManage, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SavedPeriod>();
  const [endingPeriodId, setEndingPeriodId] = useState<string>();
  const [endedPeriod, setEndedPeriod] = useState<VenueUnavailablePeriod>();

  function cancel() {
    setEditing(false);
    setConfirming(false);
    setStart("");
    setEnd("");
    setReason("");
    setErrors({});
  }

  function review() {
    const next: Record<string, string> = {};
    if (!start || Number.isNaN(new Date(start).getTime())) next.start = "Enter a valid start date and time.";
    if (!end || Number.isNaN(new Date(end).getTime())) next.end = "Enter a valid end date and time.";
    else if (start && new Date(end) <= new Date(start)) next.end = "End date and time must be after start date and time.";
    else if (new Date(end) <= new Date()) next.end = "End date and time must be in the future.";
    if (!reason.trim()) next.reason = "A reason is required.";
    setErrors(next);
    if (!Object.keys(next).length) setConfirming(true);
  }

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const saved = await api<SavedPeriod>(`/venues/${venueId}/unavailable-periods`, {
        method: "POST",
        body: JSON.stringify({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), reason }),
      });
      setResult(saved);
      cancel();
      onSaved();
    } catch (error) {
      setConfirming(false);
      if (error instanceof ApiError) {
        const fieldErrors = Object.fromEntries(
          Object.entries(error.errors ?? {}).filter(([key]) => ["start", "end", "reason"].includes(key)),
        );
        setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: error.message });
      } else setErrors({ form: "Unable to save the unavailable period." });
    } finally {
      setBusy(false);
    }
  }

  async function endEarly(periodId: string) {
    setBusy(true);
    setErrors({});
    try {
      const ended = await api<{ period: VenueUnavailablePeriod }>(`/venues/${venueId}/unavailable-periods/${periodId}/end`, { method: "POST" });
      setResult(undefined);
      setEndedPeriod(ended.period);
      setEndingPeriodId(undefined);
      onSaved();
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "Unable to end the unavailable period." });
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-5">
    {periods.length === 0 ? <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">No current or scheduled unavailable periods.</p> : <ul className="space-y-3">
      {periods.map((period) => <li key={period.id} className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${period.current ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>{period.current ? "Active now" : "Scheduled"}</span>
          <p className="text-sm font-semibold">{formatDateTimeRange(period.start, period.end)}</p>
          <p className="break-words text-sm text-gray-600 dark:text-gray-300">{period.reason}</p>
        </div>
        {canManage && period.current && (endingPeriodId === period.id ?
          <div className="space-y-3 sm:max-w-xs">
            <p className="text-sm font-medium">End this period now?</p>
            <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => endEarly(period.id)}>Confirm early end</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setEndingPeriodId(undefined)}>Cancel early end</Button>
            </div>
          </div> :
          <Button className="shrink-0 self-start" variant="secondary" disabled={busy} onClick={() => setEndingPeriodId(period.id)}>End early</Button>)}
      </li>)}
    </ul>}
    {endedPeriod && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm leading-relaxed text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">Ended early: {formatDateTimeRange(endedPeriod.start, endedPeriod.end)} — {endedPeriod.reason}</p>}
    {errors.form && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{errors.form}</p>}
    {canManage && !editing && <Button onClick={() => { setResult(undefined); setEditing(true); }}>Mark unavailable</Button>}
    {canManage && editing && <section aria-label="New unavailable period" className="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-700">
      <div>
        <h3 className="text-sm font-semibold">New unavailable period</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose the dates and times, then add a reason.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
      <TextInput label="Unavailable start" type="datetime-local" required disabled={confirming} value={start} error={errors.start} onChange={(event) => setStart(event.target.value)} />
      <TextInput label="Unavailable end" type="datetime-local" required disabled={confirming} value={end} error={errors.end} onChange={(event) => setEnd(event.target.value)} />
      </div>
      <TextArea label="Reason" placeholder="e.g. Audio system maintenance" rows={3} required disabled={confirming} value={reason} error={errors.reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
      {confirming ? <p className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm leading-relaxed dark:border-gray-600 dark:bg-gray-800">Confirm unavailability for this venue from {formatDateTimeRange(start, end)}. Reason: {reason.trim()}</p> : null}
      <div className="flex flex-wrap gap-3 pt-1">
      <Button disabled={busy} onClick={confirming ? save : review}>{confirming ? "Confirm unavailability" : "Review unavailability"}</Button>
      <Button variant="secondary" disabled={busy} onClick={cancel}>Cancel</Button>
      </div>
    </section>}
    {result && <section aria-label="Affected bookings" className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-800">
      <h3 className="font-semibold">Affected bookings</h3>
      {result.affectedBookings.length === 0 ? <p>No existing bookings are affected.</p> :
        <ul>{result.affectedBookings.map((booking) => <li key={booking.id}>{booking.eventName} — {formatDateTimeRange(booking.start, booking.end)}</li>)}</ul>}
    </section>}
  </div>;
}
