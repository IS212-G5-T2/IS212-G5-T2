import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CheckboxGroup, TextArea, TextInput } from "@/components/ui/FormControls";
import type { ChangeRequest } from "@/types";

const CHANGE_FIELD_OPTIONS: { value: ChangeRequest["fields"][number]; label: string }[] = [
  { value: "date_time", label: "Date / time" },
  { value: "attendance", label: "Expected attendance" },
  { value: "venue", label: "Venue requirements" },
  { value: "equipment", label: "Equipment needs" },
  { value: "other", label: "Other" },
];

export function EventEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useAppStore((s) => s.currentUser);
  const events = useAppStore((s) => s.events);
  const updateEvent = useAppStore((s) => s.updateEvent);
  const requestEventChange = useAppStore((s) => s.requestEventChange);

  const event = events.find((e) => e.id === id);

  const [name, setName] = useState(event?.name ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [fields, setFields] = useState<ChangeRequest["fields"]>([]);
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");

  if (!event) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Event not found.</p>;
  }

  const isDraft = event.status === "draft";

  const saveDirectEdit = () => {
    updateEvent(event.id, { name, description });
    navigate(`/events/${event.id}`);
  };

  const submitChangeRequest = () => {
    if (fields.length === 0 || !summary.trim()) return;
    requestEventChange(event.id, {
      requestedBy: currentUser.name,
      summary,
      fields,
      reason,
    });
    if (name !== event.name || description !== event.description) {
      updateEvent(event.id, { name, description });
    }
    navigate(`/events/${event.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={isDraft ? "Edit Event" : "Request Event Change"}
        description={
          isDraft
            ? "This event is still a draft — edits are saved immediately."
            : "This event has already been submitted. Name and description update immediately; changes to date/time, attendance, venue, or equipment go through coordinator review because they may cascade to venue and equipment bookings."
        }
      />

      <Card>
        <CardBody>
          <TextInput label="Event name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextArea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {!isDraft && (
            <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">Important change request</h3>
              <CheckboxGroup
                label="What needs to change?"
                options={CHANGE_FIELD_OPTIONS.map((o) => o.label)}
                values={fields.map((f) => CHANGE_FIELD_OPTIONS.find((o) => o.value === f)?.label ?? f)}
                onChange={(labels) =>
                  setFields(
                    labels
                      .map((l) => CHANGE_FIELD_OPTIONS.find((o) => o.label === l)?.value)
                      .filter((v): v is ChangeRequest["fields"][number] => !!v)
                  )
                }
              />
              <TextInput
                label="Summary"
                required
                placeholder="e.g. Move start time to 7pm, increase attendance to 220"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
              <TextArea
                label="Reason"
                placeholder="Why is this change needed?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        {isDraft ? (
          <Button onClick={saveDirectEdit}>Save Changes</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={saveDirectEdit}>
              Save Name/Description Only
            </Button>
            <Button onClick={submitChangeRequest} disabled={fields.length === 0 || !summary.trim()}>
              Submit Change Request
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
