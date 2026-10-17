import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select, TextArea, TextInput } from "@/components/ui/FormControls";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord } from "@/types";

export function EquipmentReservationForm({
  open,
  onClose,
  events,
}: {
  open: boolean;
  onClose: () => void;
  events: EventRecord[];
}) {
  const equipment = useAppStore((s) => s.equipment);
  const requestEquipment = useAppStore((s) => s.requestEquipment);

  const [eventId, setEventId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const reset = () => {
    setEventId("");
    setEquipmentId("");
    setQuantity(1);
    setNotes("");
  };

  const submit = () => {
    const event = events.find((e) => e.id === eventId);
    const item = equipment.find((eq) => eq.id === equipmentId);
    if (!event || !item) return;
    requestEquipment({
      eventId: event.id,
      eventName: event.name,
      equipmentId: item.id,
      equipmentName: item.name,
      quantity,
      technicalRequirements: notes,
      start: event.startDateTime,
      end: event.endDateTime,
    });
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Request Equipment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!eventId || !equipmentId || quantity < 1}>
            Submit Request
          </Button>
        </>
      }
    >
      <Select
        label="Event"
        required
        value={eventId}
        onChange={(e) => setEventId(e.target.value)}
        options={events.map((e) => ({ value: e.id, label: e.name }))}
      />
      <Select
        label="Equipment type"
        required
        value={equipmentId}
        onChange={(e) => setEquipmentId(e.target.value)}
        options={equipment.map((eq) => ({
          value: eq.id,
          label: `${eq.name} (${eq.totalQuantity} total)`,
        }))}
      />
      <TextInput
        label="Quantity"
        type="number"
        min={1}
        required
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />
      <TextArea
        label="Technical requirements"
        placeholder="e.g. Needs XLR inputs, warm-tone lighting…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </Modal>
  );
}
