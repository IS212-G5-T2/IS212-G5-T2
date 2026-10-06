/*
 * SPM-63 test fixtures (test-only; never imported by the application). Ids and names are the labels used in the
 * Confluence cases (EVT-101, REG-9001, COO-01) so request paths in a test match the case's literal.
 * Suite clock T0 = 2026-09-29T12:00:00+08:00 (= 04:00Z).
 */
import type { RegistrationReport, ReportRow } from "@/utils/registrationReport";
import type { User } from "@/types";

export const T0 = new Date("2026-09-29T12:00:00+08:00");

export const COO_01: User = { id: "COO-01", name: "Daniel Koh", email: "daniel.koh@example.com", role: "coordinator" };
export const COO_02: User = { id: "COO-02", name: "Evelyn Goh", email: "evelyn.goh@example.com", role: "coordinator" };
export const ORG_01: User = { id: "ORG-01", name: "Farid Rahman", email: "farid@acme.example.com", role: "organiser" };
export const ATT_01: User = { id: "ATT-01", name: "Alice Tan", email: "alice.tan@example.com", role: "attendee" };

/** REG-9007: ATT-04 Dev Patel, registered 27 Sep 2026 15:00 SGT. */
export const DEV_PATEL: ReportRow = {
  registrationId: "REG-9007",
  fullName: "Dev Patel",
  email: "dev.patel@example.com",
  contactNumber: "87654321",
  registeredAt: "2026-09-27T07:00:00.000Z",
  status: "Confirmed",
};
/** REG-9001: ATT-01 Alice Tan, registered 28 Sep 2026 10:30 SGT. */
export const ALICE_TAN: ReportRow = {
  registrationId: "REG-9001",
  fullName: "Alice Tan",
  email: "alice.tan@example.com",
  contactNumber: "98765432",
  registeredAt: "2026-09-28T02:30:00.000Z",
  status: "Confirmed",
};
/** REG-EXTRA-01: ATT-03 Chloe Ng, registered 29 Sep 2026 09:00 SGT. */
export const CHLOE_NG: ReportRow = {
  registrationId: "REG-EXTRA-01",
  fullName: "Chloe Ng",
  email: "chloe.ng@example.com",
  contactNumber: "91234567",
  registeredAt: "2026-09-29T01:00:00.000Z",
  status: "Confirmed",
};
/** ATT-05 Farhan Rahman registers during the 06-A scenario. */
export const FARHAN_RAHMAN: ReportRow = {
  registrationId: "REG-9100",
  fullName: "Farhan Rahman",
  email: "farhan.rahman@example.com",
  contactNumber: "81234567",
  registeredAt: "2026-09-29T04:00:00.000Z",
  status: "Confirmed",
};

/** EVT-101 "Tech Talk: Cloud 101", capacity 50, with the three Confirmed rows in date order. */
export function buildReport(overrides: Partial<RegistrationReport> = {}): RegistrationReport {
  const registrations = overrides.registrations ?? [DEV_PATEL, ALICE_TAN, CHLOE_NG];
  return {
    event: {
      id: "EVT-101",
      name: "Tech Talk: Cloud 101",
      startDateTime: "2026-10-09T10:00:00.000Z",
      endDateTime: "2026-10-09T13:00:00.000Z",
      capacity: 50,
    },
    totalConfirmed: registrations.length,
    availableSpots: 50 - registrations.length,
    generatedAt: "2026-09-29T04:00:00.000Z",
    ...overrides,
    registrations,
  };
}
