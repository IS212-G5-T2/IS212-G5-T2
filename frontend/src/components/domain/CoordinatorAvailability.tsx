import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { RadioGroup } from "@/components/ui/FormControls";
import { getMyAvailability, saveMyAvailability } from "@/utils/availability-api";

type Choice = "available" | "unavailable";

const options = [
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
];

const toChoice = (available: boolean): Choice => (available ? "available" : "unavailable");

// SPM-80: lets a coordinator see and change whether they can take new event
// assignments. Being unavailable never changes events already assigned to them.
export function CoordinatorAvailability() {
  // The last value the server confirmed; null until it has loaded.
  const [saved, setSaved] = useState<boolean | null>(null);
  const [choice, setChoice] = useState<Choice>("available");
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    getMyAvailability()
      .then(({ available }) => {
        if (!active) return;
        setSaved(available);
        setChoice(toChoice(available));
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  const save = async () => {
    setSaving(true);
    setSaveError(false);
    setConfirmation("");
    try {
      const { available } = await saveMyAvailability(choice === "available");
      setSaved(available);
      setChoice(toChoice(available));
      setConfirmation(
        `Availability saved. You are now ${available ? "available" : "unavailable"} for new event assignments.`,
      );
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Availability</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Marking yourself unavailable stops new event assignments. Events already assigned to you stay with you.
        </p>
      </CardHeader>
      <CardBody>
        {loadError && (
          <p role="alert" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-danger-700 dark:text-danger-300">
            Could not load your availability.
            <Button variant="ghost" size="sm" onClick={() => setRetry((r) => r + 1)}>
              Retry
            </Button>
          </p>
        )}
        {saved === null && !loadError && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Loading your availability…</p>
        )}
        {saved !== null && (
          <>
            <p className="mb-4 text-sm font-medium text-gray-900 dark:text-gray-100">
              {`Current status: ${saved ? "Available" : "Unavailable"}`}
            </p>
            <RadioGroup
              label="Availability for new events"
              name="availability"
              options={options}
              value={choice}
              onChange={(value) => setChoice(value as Choice)}
            />
          </>
        )}
        {saveError && (
          <p role="alert" className="mb-4 text-sm text-danger-700 dark:text-danger-300">
            Could not save your availability. Please try again.
          </p>
        )}
        {confirmation && (
          <p role="status" className="mb-4 text-sm text-teal-800 dark:text-teal-300">
            {confirmation}
          </p>
        )}
        <Button onClick={save} disabled={saved === null || saving}>
          {saving ? "Saving…" : "Save availability"}
        </Button>
      </CardBody>
    </Card>
  );
}
