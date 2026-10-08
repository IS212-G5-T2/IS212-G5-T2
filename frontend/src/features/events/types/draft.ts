import type { EventAttachment } from "@/types";

export interface DraftFields {
  formStep?: number;
  name: string;
  purpose: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  expectedAttendance: string;
  layout: string;
  facilities: string[];
  accessibility: string[];
  attachments: EventAttachment[];
  equipmentNeeds: string;
  registrationEnabled?: boolean;
}
export interface DraftRecord {
  id: string;
  fields: DraftFields;
  status: "Draft" | "Submitted";
  version: number;
  eventId: string | null;
  updatedAt: string;
}
