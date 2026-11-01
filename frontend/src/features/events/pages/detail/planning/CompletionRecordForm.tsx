/*
 * SPM-153 AC5: the completion record (attendance, operational notes, issues) of a Completed event. Shown only to the
 * assigned coordinator. Entered values are kept after an error; the server's message names what to fix (MSG-CP-07).
 * Each save sends all three items as entered.
 */
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/FormControls";
import { ApiError } from "@/utils/api";
import {
  fetchCompletionRecord,
  saveCompletionRecord,
  type CompletionRecordInput,
} from "@/utils/completion";

interface CompletionRecordFormProps {
  eventId: string;
  /** Lower-case status as the page holds it. */
  status: string;
  isAssignedCoordinator: boolean;
}

export function CompletionRecordForm({ eventId, status, isAssignedCoordinator }: CompletionRecordFormProps) {
  const [attendance, setAttendance] = useState("");
  const [notes, setNotes] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const visible = isAssignedCoordinator && status === "completed";

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    fetchCompletionRecord(eventId)
      .then((record) => {
        if (cancelled) return;
        setAttendance(record.attendanceCount === null ? "" : String(record.attendanceCount));
        setNotes(record.operationalNotes ?? "");
        setIssues(record.issues.map((issue) => issue.description));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage("Completion details could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, visible]);

  if (!visible) return null;

  const handleSave = async () => {
    if (pending) return;
    setPending(true);
    setErrorMessage("");
    setSuccessMessage("");
    const trimmed = attendance.trim();
    // A whole number is sent as a number; anything else is sent as typed so the server refuses it (MSG-CP-07).
    const attendanceCount = trimmed === "" ? null : /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
    const input: CompletionRecordInput = {
      attendanceCount,
      operationalNotes: notes,
      issues: issues.map((description) => ({ description })),
    };
    try {
      const saved = await saveCompletionRecord(eventId, input);
      setSuccessMessage(saved.message);
    } catch (error) {
      setErrorMessage(error instanceof ApiError || error instanceof Error ? error.message : "Could not save the completion details.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Completion Record</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        {successMessage && (
          <p role="status" className="text-sm text-success-900 dark:text-success-300">
            {successMessage}
          </p>
        )}
        {errorMessage && (
          <div role="alert" className="rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300">
            {errorMessage}
          </div>
        )}
        <TextInput
          label="Attendance"
          inputMode="numeric"
          value={attendance}
          onChange={(event) => setAttendance(event.target.value)}
          disabled={!loaded}
        />
        <TextArea
          label="Operational notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={!loaded}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Issues</legend>
          {issues.map((issue, index) => (
            <div key={index} className="flex items-end gap-2">
              <TextInput
                label={`Issue ${index + 1}`}
                value={issue}
                onChange={(event) =>
                  setIssues(issues.map((value, position) => (position === index ? event.target.value : value)))
                }
                className="flex-1"
              />
              <Button
                variant="secondary"
                aria-label={`Remove issue ${index + 1}`}
                onClick={() => setIssues(issues.filter((_, position) => position !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setIssues([...issues, ""])} disabled={!loaded}>
            Add issue
          </Button>
        </fieldset>
        <Button onClick={handleSave} disabled={pending || !loaded} aria-busy={pending}>
          Save completion details
        </Button>
      </CardBody>
    </Card>
  );
}
