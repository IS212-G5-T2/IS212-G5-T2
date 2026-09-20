import { useState } from "react";
import {
  TextInput,
  TextArea,
  Select,
  CheckboxGroup,
} from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import type { EventRecord } from "@/types";

interface EventEditFormProps {
  event: EventRecord;
  onSave: (updates: Partial<EventRecord>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const FACILITY_OPTIONS = [
  "Catering",
  "AV System",
  "Stage",
  "Projector",
];

const ACCESSIBILITY_OPTIONS = [
  "Accessible restrooms",
  "Elevator access",
];

const ROOM_LAYOUT_OPTIONS = [
  { value: "banquet", label: "Banquet" },
  { value: "theater", label: "Theater" },
  { value: "classroom", label: "Classroom" },
  { value: "u-shape", label: "U-Shape" },
  { value: "boardroom", label: "Boardroom" },
];

export function EventEditForm({ event, onSave, onCancel, isLoading }: EventEditFormProps) {
  const [name, setName] = useState(event.name || "");
  const [description, setDescription] = useState(event.description || "");
  const [facilities, setFacilities] = useState<string[]>(event.venueRequirements?.facilities || []);
  const [accessibility, setAccessibility] = useState<string[]>(event.venueRequirements?.accessibility || []);
  const [startDateTime, setStartDateTime] = useState(event.startDateTime || "");
  const [endDateTime, setEndDateTime] = useState(event.endDateTime || "");
  const [expectedAttendance, setExpectedAttendance] = useState(String(event.expectedAttendance || ""));
  const [venue, setVenue] = useState(event.venueName || "");
  const [layout, setLayout] = useState(event.venueRequirements?.layout || "");
  const [equipmentNeeds, setEquipmentNeeds] = useState(event.equipmentNeeds || "");

  const handleSave = () => {
    onSave({
      name,
      description,
      venueRequirements: {
        minCapacity: event.venueRequirements?.minCapacity || 0,
        facilities,
        accessibility,
        layout,
      },
      startDateTime,
      endDateTime,
      expectedAttendance: expectedAttendance ? parseInt(expectedAttendance) : 0,
      equipmentNeeds,
    });
  };

  const isValid = name.trim() && startDateTime;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Status Bar */}
      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-4 dark:border-gray-700">
        {["Draft", "Submitted", "Under review", "Approved", "Planning", "Confirmed", "Completed"].map(
          (status) => (
            <button
              key={status}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                event.status === status.toLowerCase().replace(" ", "-")
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
              disabled
            >
              {status}
            </button>
          )
        )}
      </div>

      {/* Main Form Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-10 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {/* Section 1: Event Details */}
        <div className="mb-8">
          <div className="mb-6 flex items-center gap-2 border-b border-gray-100 pb-4 dark:border-gray-700">
            <span className="text-lg">ℹ️</span>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Event details
            </h2>
          </div>
          <TextInput
            label="Event name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter event name"
            required
          />
          <TextArea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter event description"
          />
        </div>

        {/* Section 2: Required Facilities */}
        <div className="mb-8">
          <div className="mb-6 flex items-center gap-2 border-b border-gray-100 pb-4 dark:border-gray-700">
            <span className="text-lg">✓</span>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Required facilities
            </h2>
          </div>
          <CheckboxGroup
            label=""
            options={FACILITY_OPTIONS}
            values={facilities}
            onChange={setFacilities}
          />
        </div>

        {/* Section 3: Accessibility Requirements */}
        <div className="mb-8">
          <div className="mb-6 flex items-center gap-2 border-b border-gray-100 pb-4 dark:border-gray-700">
            <span className="text-lg">♿</span>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Accessibility requirements
            </h2>
          </div>
          <CheckboxGroup
            label=""
            options={ACCESSIBILITY_OPTIONS}
            values={accessibility}
            onChange={setAccessibility}
          />
        </div>

        {/* Section 4: Date & Logistics */}
        <div className="mb-8">
          <div className="mb-6 flex items-center gap-2 border-b border-gray-100 pb-4 dark:border-gray-700">
            <span className="text-lg">📅</span>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Date & logistics
            </h2>
          </div>

          {/* Date & Time Row */}
          <div className="mb-4 grid grid-cols-2 gap-4">
            <TextInput
              label="Start date & time"
              type="datetime-local"
              value={startDateTime}
              onChange={(e) => setStartDateTime(e.target.value)}
              required
            />
            <TextInput
              label="End date & time"
              type="datetime-local"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
            />
          </div>

          {/* Attendance & Venue Row */}
          <div className="mb-4 grid grid-cols-2 gap-4">
            <TextInput
              label="Expected attendance"
              type="number"
              value={expectedAttendance}
              onChange={(e) => setExpectedAttendance(e.target.value)}
              min="0"
              placeholder="0"
            />
            <TextInput
              label="Venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Enter venue name"
            />
          </div>

          {/* Room Layout & Equipment Row */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Room layout"
              options={ROOM_LAYOUT_OPTIONS}
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
            />
            <TextInput
              label="Equipment needs"
              value={equipmentNeeds}
              onChange={(e) => setEquipmentNeeds(e.target.value)}
              placeholder="e.g., Microphone, stands"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-6 dark:border-gray-700">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
