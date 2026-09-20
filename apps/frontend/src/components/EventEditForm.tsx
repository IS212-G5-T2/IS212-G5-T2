import { useState } from "react";
import {
  TextInput,
  TextArea,
  Select,
  CheckboxGroup,
} from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import type { EventRecord, EventAttachment } from "@/types";

interface EventEditFormProps {
  event: EventRecord;
  onSave: (updates: Partial<EventRecord>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const FACILITY_OPTIONS = [
  "Catering",
  "AV System",
  "Parking",
  "Stage",
  "Projector",
  "Whiteboard",
];

const ACCESSIBILITY_OPTIONS = [
  "Wheelchair ramps",
  "Accessible restrooms",
  "Hearing loop",
  "Elevator access",
];

const ROOM_LAYOUT_OPTIONS = [
  { value: "Banquet", label: "Banquet" },
  { value: "Theater", label: "Theater" },
  { value: "Classroom", label: "Classroom" },
  { value: "U-Shape", label: "U-Shape" },
  { value: "Boardroom", label: "Boardroom" },
];

function toDateTimeLocal(isoString: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function readAttachment(file: File): Promise<EventAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: String(reader.result),
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function EventEditForm({ event, onSave, onCancel, isLoading }: EventEditFormProps) {
  const [name, setName] = useState(event.name || "");
  const [description, setDescription] = useState(event.description || "");
  const [facilities, setFacilities] = useState<string[]>(event.venueRequirements?.facilities || []);
  const [accessibility, setAccessibility] = useState<string[]>(event.venueRequirements?.accessibility || []);
  const [startDateTime, setStartDateTime] = useState(toDateTimeLocal(event.startDateTime));
  const [endDateTime, setEndDateTime] = useState(toDateTimeLocal(event.endDateTime));
  const [expectedAttendance, setExpectedAttendance] = useState(String(event.expectedAttendance || ""));
  const [venue, setVenue] = useState(event.venueName || "");
  const [layout, setLayout] = useState(event.venueRequirements?.layout || "");
  const [equipmentNeeds, setEquipmentNeeds] = useState(event.equipmentNeeds || "");
  const [attachments, setAttachments] = useState<EventAttachment[]>(event.attachments || []);
  const [uploadFailure, setUploadFailure] = useState("");

  const addFiles = async (files: File[] | null) => {
    if (!files?.length) return;
    setUploadFailure("");
    if (attachments.length + files.length > 5) {
      setUploadFailure("Use up to five files.");
      return;
    }
    const existingBytes = attachments.reduce((total, attachment) => total + attachment.size, 0);
    const incomingBytes = Array.from(files).reduce((total, file) => total + file.size, 0);
    if (existingBytes + incomingBytes > 50 * 1024 * 1024) {
      setUploadFailure("Use up to five files, 50 MB total.");
      return;
    }
    try {
      const newAttachments = await Promise.all(Array.from(files).map(readAttachment));
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch {
      setUploadFailure("Unable to read the selected file. Please try again.");
    }
  };

  const removeFile = (id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  };

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
      startDateTime: fromDateTimeLocal(startDateTime),
      endDateTime: fromDateTimeLocal(endDateTime),
      expectedAttendance: expectedAttendance ? parseInt(expectedAttendance) : 0,
      equipmentNeeds,
      attachments,
    });
  };

  const isValid = name.trim() && startDateTime;

  return (
    <div className="mx-auto max-w-4xl">

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
          </div>
        </div>

        {/* Section 5: Equipment Needs */}
        <div className="mb-8">
          <div className="mb-6 flex items-center gap-2 border-b border-gray-100 pb-4 dark:border-gray-700">
            <span className="text-lg">🔧</span>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Equipment needs
            </h2>
          </div>
          <TextArea
            label="Equipment needs"
            value={equipmentNeeds}
            onChange={(e) => setEquipmentNeeds(e.target.value)}
            placeholder="e.g., Two wireless microphones and a portable speaker"
          />
        </div>

        {/* Section 6: Attached Files */}
        <div className="mb-8">
          <div className="mb-6 flex items-center gap-2 border-b border-gray-100 pb-4 dark:border-gray-700">
            <span className="text-lg">📎</span>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Supporting files
            </h2>
          </div>
          <div className="mb-4">
            <label
              htmlFor="supporting-files"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Supporting files
            </label>
            <input
              id="supporting-files"
              type="file"
              multiple
              onChange={(event) => {
                const input = event.target;
                const selected = input.files ? Array.from(input.files) : [];
                input.value = "";
                void addFiles(selected);
              }}
              className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-700 dark:text-gray-300"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Optional. Upload up to five supporting files (50 MB total) for the coordinator to review.
            </p>
            {uploadFailure && (
              <p className="mt-1 text-xs text-danger-600" role="alert">
                {uploadFailure}
              </p>
            )}
            {attachments.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
                  >
                    <span className="truncate">{attachment.name}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => removeFile(attachment.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
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
