import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { EventEditForm } from "@/components/EventEditForm";

export function EventEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const events = useAppStore((s) => s.events);
  const updateEvent = useAppStore((s) => s.updateEvent);
  const [isLoading, setIsLoading] = useState(false);

  const event = events.find((e) => e.id === id);

  if (!event) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Event not found.</p>;
  }

  const handleSave = async (updates: Partial<typeof event>) => {
    setIsLoading(true);
    try {
      updateEvent(event.id, updates);
      navigate(`/events/${event.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Event"
        description="Update event details. Changes are saved immediately."
      />

      <EventEditForm
        event={event}
        onSave={handleSave}
        onCancel={() => navigate(-1)}
        isLoading={isLoading}
      />
    </div>
  );
}
