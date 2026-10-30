/*
 * SPM-139 registration settings (backend/src/registrations/settings):
 *   GET /events/:id/registration-settings  the assigned coordinator's saved settings
 *   PUT /events/:id/registration-settings  a partial save with the version the form loaded
 */
import { api } from "@/utils/api";
import type { SettingsRequest } from "@/features/events/lib/registrationSettings";

export interface RegistrationSettings {
  eventId: string;
  registrationEnabled: boolean;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  capacity: number;
  confirmedCount: number;
  version: number;
}

export interface RegistrationSettingsSaved extends RegistrationSettings {
  message: string;
}

export function fetchRegistrationSettings(eventId: string) {
  return api<RegistrationSettings>(`/events/${eventId}/registration-settings`);
}

export function saveRegistrationSettings(eventId: string, body: SettingsRequest) {
  return api<RegistrationSettingsSaved>(`/events/${eventId}/registration-settings`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
