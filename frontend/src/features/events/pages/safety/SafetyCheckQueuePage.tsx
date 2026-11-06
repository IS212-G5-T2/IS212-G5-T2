import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";

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
  venues: Array<{ id: string; name: string; location: string; capacity: number; restrictions: string; facilities: string[]; accessibility: string[]; layouts: string[] }>;
  equipment: Array<{ id: string; name: string; quantity: number }>;
}
type FeedbackDecision = "rejected" | "changes_needed";
interface ChangeRow { id: number; text: string; venueIds: string[]; equipmentIds: string[] }
type SafetyModal =
  | { type: "feedback"; decision: FeedbackDecision }
  | { type: "confirmation"; message: string }
  | null;

const dateTime = (value: string) => new Date(value).toLocaleString("en-SG", { timeZone: "Asia/Singapore" });

export function SafetyCheckQueuePage() {
  const [events, setEvents] = useState<QueueEvent[]>([]);
  const [selected, setSelected] = useState<SafetyDetails | null>(null);
  const [reason, setReason] = useState("");
  const [changeRows, setChangeRows] = useState<ChangeRow[]>([]);
  const nextChangeId = useRef(1);
  const [modal, setModal] = useState<SafetyModal>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

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
      setChangeRows([]);
      setModal(null);
    } catch (cause) {
      await refresh();
      setError(cause instanceof ApiError ? cause.message : "Unable to load event details.");
    }
  }

  function openFeedbackModal(decision: FeedbackDecision) {
    setError(null);
    setReason("");
    setChangeRows(decision === "changes_needed" ? [{ id: nextChangeId.current++, text: "", venueIds: [], equipmentIds: [] }] : []);
    setModal({ type: "feedback", decision });
  }

  function closeFeedbackModal() {
    if (submittingRef.current) return;
    setModal(null);
    setReason("");
    setChangeRows([]);
    setError(null);
  }

  async function respond(decision: "approved" | FeedbackDecision) {
    if (submittingRef.current) return;
    const feedback = reason.trim();
    const blankChangeIndex = changeRows.findIndex((row) => !row.text.trim());
    if (decision === "rejected" && !feedback) {
      setError("Enter a reason for rejection.");
      return;
    }
    if (decision === "changes_needed" && blankChangeIndex !== -1) {
      setError(`Change ${blankChangeIndex + 1} cannot be blank. Enter a description of the change.`);
      return;
    }
    const unassignedReviewIndex = changeRows.findIndex((row) => row.venueIds.length + row.equipmentIds.length === 0);
    if (decision === "changes_needed" && unassignedReviewIndex !== -1) {
      setError(`Change ${unassignedReviewIndex + 1} must select at least one arrangement for review.`);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const payload = decision === "approved" ? { decision }
        : decision === "rejected" ? { decision, reason: feedback }
          : { decision, changes: changeRows.map(({ text, venueIds, equipmentIds }) => ({ text, venueIds, equipmentIds })) };
      await api(`/safety-officer/queue/${selected!.id}/decision`, { method: "POST", body: JSON.stringify(payload) });
      setReason("");
      setChangeRows([]);
      setModal({ type: "confirmation", message: "Your safety decision has been submitted." });
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) {
        setSelected(null);
        setReason("");
        setChangeRows([]);
        setModal(null);
        await refresh();
      }
      setError(cause instanceof ApiError ? cause.message : "Unable to submit the safety decision.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function backToQueue() {
    setSelected(null);
    setReason("");
    setChangeRows([]);
    setModal(null);
    await refresh();
  }

  async function closeConfirmation() {
    setModal(null);
    setSelected(null);
    setReason("");
    setChangeRows([]);
    await refresh();
  }

  return <section className="space-y-5">
    <header><h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Events Awaiting Safety Check</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Review confirmed event arrangements and record your decision.</p></header>
    {error && modal?.type !== "feedback" && <p id="safety-decision-error" role="alert" className="rounded-lg bg-danger-50 p-3 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300">{error}</p>}
    {selected ? <Card><CardBody className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{selected.name}</h2><Button variant="secondary" disabled={submitting || modal !== null} onClick={() => void backToQueue()}>Back to queue</Button></div>
      <p>{dateTime(selected.startDateTime)} – {dateTime(selected.endDateTime)}</p>
      <h3 className="font-semibold">Event requirements</h3>
      <p>Expected attendance: {selected.expectedAttendance}</p>
      <p>Requested layout: {selected.venueRequirements.layout || "None specified"}</p>
      <p>Accessibility requirements: {selected.venueRequirements.accessibility.join(", ") || "None specified"}</p>
      <p>Required facilities: {selected.venueRequirements.facilities.join(", ") || "None specified"}</p>
      <h3 className="font-semibold">Venue and known restrictions</h3>
      {selected.venues.map((venue) => <div key={venue.id} className="rounded border p-3">
        <p className="font-medium">{venue.name} · {venue.location}</p><p>Capacity: {venue.capacity}</p>
        <p>Restrictions: {venue.restrictions}</p><p>Facilities: {venue.facilities.join(", ") || "None listed"}</p>
        <p>Accessibility: {venue.accessibility.join(", ") || "None listed"}</p><p>Layouts: {venue.layouts.join(", ") || "None listed"}</p>
      </div>)}
      <h3 className="font-semibold">Equipment and technical arrangements</h3>
      <p>Technical requirements: {selected.equipmentNeeds || "None specified"}</p>
      {selected.equipment.length ? <ul>{selected.equipment.map((item) => <li key={item.id}>{item.name}: {item.quantity}</li>)}</ul> : <p>No equipment requested.</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={submitting || modal !== null} onClick={() => void respond("approved")}>Approve arrangement</Button>
        <Button variant="danger" disabled={submitting || modal !== null} onClick={() => openFeedbackModal("rejected")}>Reject arrangement</Button>
        <Button variant="secondary" disabled={submitting || modal !== null} onClick={() => openFeedbackModal("changes_needed")}>Request changes</Button>
      </div>
    </CardBody></Card> : loading ? <p role="status">Loading safety check queue…</p> : events.length === 0 ? <p>No events are awaiting a safety check.</p> : <div className="grid gap-3">{events.map((event) => <Card key={event.id}><CardBody className="flex items-center justify-between gap-4">
      <div><h2 className="font-semibold">{event.name}</h2><p>{dateTime(event.startDateTime)} · Expected attendance: {event.expectedAttendance}</p></div>
      <Button onClick={() => void open(event)}>Review arrangements</Button>
    </CardBody></Card>)}</div>}
    {modal?.type === "feedback" && <Modal
      open
      onClose={closeFeedbackModal}
      title={modal.decision === "rejected" ? "Reject arrangement" : "Request changes"}
      footer={<>
        <Button variant="secondary" disabled={submitting} onClick={closeFeedbackModal}>Cancel</Button>
        <Button variant={modal.decision === "rejected" ? "danger" : "primary"} disabled={submitting} onClick={() => void respond(modal.decision)}>
          {submitting ? "Submitting…" : modal.decision === "rejected" ? "Submit rejection" : "Submit change request"}
        </Button>
      </>}
    >
      {error && <p id="safety-decision-error" role="alert" className="mb-3 rounded-lg bg-danger-50 p-3 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300">{error}</p>}
      {modal.decision === "rejected" ? <label htmlFor="safety-decision-feedback" className="block">
        Reason for rejection
        <textarea
          id="safety-decision-feedback"
          className="mt-1 block w-full rounded border p-2"
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "safety-decision-error" : undefined}
          value={reason}
          onChange={(event) => { setReason(event.target.value); if (event.target.value.trim()) setError(null); }}
          disabled={submitting}
        />
      </label> : <div className="space-y-3">
        {changeRows.map((row, index) => <div key={row.id} className="space-y-2 rounded border p-3">
          <label htmlFor={`safety-decision-change-${row.id}`} className="font-medium">Change {index + 1}</label>
          <div className="mt-1 flex items-center gap-2">
            <textarea
              id={`safety-decision-change-${row.id}`}
              className="block min-w-0 flex-1 rounded border p-2"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "safety-decision-error" : undefined}
              value={row.text}
              onChange={(event) => {
                setChangeRows((rows) => rows.map((item) => item.id === row.id ? { ...item, text: event.target.value } : item));
                if (event.target.value.trim()) setError(null);
              }}
              disabled={submitting}
            />
            <Button variant="secondary" className="shrink-0" disabled={submitting || changeRows.length === 1} aria-label={`Remove change ${index + 1}`} onClick={() => {
              setChangeRows((rows) => rows.filter((item) => item.id !== row.id));
              setError(null);
            }}>Remove</Button>
          </div>
          <fieldset disabled={submitting} className="space-y-1">
            <legend className="text-sm font-medium">Arrangements to mark Pending review</legend>
            {selected?.venues.map((venue) => <label key={venue.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={row.venueIds.includes(venue.id)} onChange={(event) => setChangeRows((rows) => rows.map((item) => item.id === row.id ? {
                ...item,
                venueIds: event.target.checked ? [...item.venueIds, venue.id] : item.venueIds.filter((id) => id !== venue.id),
              } : item))} />
              {venue.name} (venue)
            </label>)}
            {selected?.equipment.map((equipment) => <label key={equipment.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={row.equipmentIds.includes(equipment.id)} onChange={(event) => setChangeRows((rows) => rows.map((item) => item.id === row.id ? {
                ...item,
                equipmentIds: event.target.checked ? [...item.equipmentIds, equipment.id] : item.equipmentIds.filter((id) => id !== equipment.id),
              } : item))} />
              {equipment.name} (equipment)
            </label>)}
          </fieldset>
        </div>)}
        <Button variant="secondary" disabled={submitting} onClick={() => {
          setChangeRows((rows) => [...rows, { id: nextChangeId.current++, text: "", venueIds: [], equipmentIds: [] }]);
          setError(null);
        }} aria-label="Add change" title="Add change">+</Button>
      </div>}
    </Modal>}
    {modal?.type === "confirmation" && <Modal
      open
      onClose={() => void closeConfirmation()}
      title="Decision submitted"
      footer={<Button disabled={submitting} onClick={() => void closeConfirmation()}>Return to queue</Button>}
    >
      <p role="status">{modal.message}</p>
    </Modal>}
  </section>;
}
