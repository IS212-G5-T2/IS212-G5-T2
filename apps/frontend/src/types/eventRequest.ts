import type { EventStatus } from './index';

export interface DraftFields {
  name: string; purpose: string; description: string; startDateTime: string; endDateTime: string;
  expectedAttendance: number | null; venueRequirements: string; accessibilityNeeds: string;
  equipmentRequirements: string; layout: string; registrationEnabled: boolean | null;
}
export interface EventRequest {
  id: string; organisationId: string; organiserId: string; status: EventStatus;
  fields: DraftFields; version: number; createdAt: string; updatedAt: string;
}
export const emptyDraft: DraftFields = {
  name: '', purpose: '', description: '', startDateTime: '', endDateTime: '',
  expectedAttendance: null, venueRequirements: '', accessibilityNeeds: '',
  equipmentRequirements: '', layout: '', registrationEnabled: null,
};
