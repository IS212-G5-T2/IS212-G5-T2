import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

interface QueueEvent {
  id: string;
  name: string;
  startDateTime: string;
  expectedAttendance: number;
  venueRequirements: { layout: string; facilities: string[]; accessibility: string[] };
}
interface SafetyDetails extends QueueEvent {
  endDateTime: string;
  equipmentNeeds: string;
  venues: Array<{ name: string; location: string; capacity: number; restrictions: string; facilities: string[]; accessibility: string[]; layouts: string[] }>;
  equipment: Array<{ name: string; quantity: number }>;
}

const dateTime = (value: string) => new Date(value).toLocaleString("en-SG", { timeZone: "Asia/Singapore" });

export function SafetyCheckQueuePage() {
  const [events, setEvents] = useState<QueueEvent[]>([]);
  const [selected, setSelected] = useState<SafetyDetails | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await api<QueueEvent[]>("/safety-officer/queue"));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to load the safety check queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function open(event: QueueEvent) {
    setError(null);
    try {
      setSelected(await api<SafetyDetails>(`/safety-officer/queue/${event.id}`));
      setReason("");
    } catch (cause) {
      await refresh();
      setError(cause instanceof ApiError ? cause.message : "Unable to load event details.");
    }
  }

  async function respond(decision: "approved" | "rejected" | "changes_needed") {
    setSubmitting(true);
    setError(null);
    try {
      await api(`/safety-officer/queue/${selected!.id}/decision`, { method: "POST", body: JSON.stringify({ decision, reason }) });
      setSelected(null);
      setReason("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to submit the safety decision.");
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="space-y-5">
    <header><h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Events Awaiting Safety Check</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Review confirmed event arrangements and record your decision.</p></header>
    {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300">{error}</p>}
    {selected ? <Card><CardBody className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{selected.name}</h2><Button variant="secondary" onClick={() => setSelected(null)}>Back to queue</Button></div>
      <p>{dateTime(selected.startDateTime)} – {dateTime(selected.endDateTime)}</p>
      <h3 className="font-semibold">Event requirements</h3>
      <p>Expected attendance: {selected.expectedAttendance}</p>
      <p>Requested layout: {selected.venueRequirements.layout || "None specified"}</p>
      <p>Accessibility requirements: {selected.venueRequirements.accessibility.join(", ") || "None specified"}</p>
      <p>Required facilities: {selected.venueRequirements.facilities.join(", ") || "None specified"}</p>
      <h3 className="font-semibold">Venue and known restrictions</h3>
      {selected.venues.map((venue) => <div key={`${venue.name}-${venue.location}`} className="rounded border p-3">
        <p className="font-medium">{venue.name} · {venue.location}</p><p>Capacity: {venue.capacity}</p>
        <p>Restrictions: {venue.restrictions}</p><p>Facilities: {venue.facilities.join(", ") || "None listed"}</p>
        <p>Accessibility: {venue.accessibility.join(", ") || "None listed"}</p><p>Layouts: {venue.layouts.join(", ") || "None listed"}</p>
      </div>)}
      <h3 className="font-semibold">Equipment and technical arrangements</h3>
      <p>Technical requirements: {selected.equipmentNeeds || "None specified"}</p>
      {selected.equipment.length ? <ul>{selected.equipment.map((item) => <li key={item.name}>{item.name}: {item.quantity}</li>)}</ul> : <p>No equipment requested.</p>}
      <label className="block">Reason for rejection or requested changes
        <textarea className="mt-1 block w-full rounded border p-2" value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={submitting} onClick={() => void respond("approved")}>Approve arrangement</Button>
        <Button variant="danger" disabled={submitting || !reason.trim()} onClick={() => void respond("rejected")}>Reject arrangement</Button>
        <Button variant="secondary" disabled={submitting || !reason.trim()} onClick={() => void respond("changes_needed")}>Request changes</Button>
      </div>
    </CardBody></Card> : loading ? <p role="status">Loading safety check queue…</p> : events.length === 0 ? <p>No events are awaiting a safety check.</p> : <div className="grid gap-3">{events.map((event) => <Card key={event.id}><CardBody className="flex items-center justify-between gap-4">
      <div><h2 className="font-semibold">{event.name}</h2><p>{dateTime(event.startDateTime)} · Expected attendance: {event.expectedAttendance}</p></div>
      <Button onClick={() => void open(event)}>Review arrangements</Button>
    </CardBody></Card>)}</div>}
  </section>;
}
