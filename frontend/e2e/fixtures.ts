// SPM-187: the shared Playwright fixture. Import `test` and `expect` from here, not from @playwright/test.
//
// Every test starts from a database reset to reference data (the seeded accounts and roles), and then builds
// exactly the state it needs through `db`. The reset is an auto fixture, so it runs before the test body and
// therefore before the test logs in: it clears auth_sessions, and a login made first would be wiped.
//
// Design: this talks to the database by running backend/scripts/testing/browser-fixtures.mjs as a child process
// rather than importing `pg`. frontend/ has no database dependency and keeps none; the cost is one node start
// (about a quarter of a second) per reset and per seeding call. The builders live in that one backend module,
// shared with run-browser.mjs; nothing is implemented twice here.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";

const script = fileURLToPath(new URL("../../backend/scripts/testing/browser-fixtures.mjs", import.meta.url));

function run(args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [script, ...args], { env: process.env, maxBuffer: 10_000_000, timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`browser-fixtures ${args.join(" ")} failed: ${stderr.trim() || error.message}`));
      else resolve(stdout);
    });
    child.stdin?.end(stdin ?? "");
  });
}

export interface VenueOptions { name?: string; location?: string; capacity?: number; setupMinutes?: number; turnaroundMinutes?: number; ownerEmail?: string }
export interface EventOptions {
  name?: string; status?: "Submitted" | "Approved" | "Rejected" | "Planning" | "Confirmed" | "Completed" | "Cancelled";
  purpose?: string; expectedAttendance?: number; startInDays?: number; durationHours?: number;
  /** Turns registration on with this limit. */
  capacity?: number; organiserEmail?: string; coordinatorEmail?: string;
  /** Scene key of a venue to book (approved) for the event's window. */
  venue?: string;
}
export interface EquipmentOptions { name?: string; quantity?: number; type?: "Audio" | "Visual" | "Furniture" | "Lighting" | "Other"; location?: string }
export interface RegistrationOptions { event: string; attendee?: string; status?: "Registered" | "Withdrawn" }
export interface Scene {
  venues?: Record<string, VenueOptions>;
  events?: Record<string, EventOptions>;
  equipment?: Record<string, EquipmentOptions>;
  registrations?: RegistrationOptions[];
}
export interface Venue { id: string; name: string; setupMinutes: number; turnaroundMinutes: number }
export interface EventRow { id: string; name: string; status: string; startAt: string; endAt: string }
export interface Equipment { id: string; name: string; quantity: number; location: string; type: string }
export interface Registration { id: string; eventId: string; attendeeEmail: string; status: string }
export interface BuiltScene {
  venues: Record<string, Venue>; events: Record<string, EventRow>; equipment: Record<string, Equipment>; registrations: Registration[];
}

export interface WithdrawalPreset { eventName: string; eventId: string }
export interface AuditTrailPreset { equipmentName: string }
export interface HoldExpiryPreset {
  eventName: string; reminderVenue: string; expiredVenue: string; releaseVenue: string;
  reminderHoldId: string; releaseHoldId: string; reminderExpiresIso: string; expiredExpiresIso: string;
}
export interface Presets { withdrawal: WithdrawalPreset; auditTrail: AuditTrailPreset; holdExpiry: HoldExpiryPreset }

/** Builds the state a test needs, after the automatic reset. One call is one node start; compose with `scene`. */
export class TestDatabase {
  /** Build venues, events, equipment and registrations together; references between them use the scene keys. */
  async scene(scene: Scene): Promise<BuiltScene> {
    return JSON.parse(await run(["seed"], JSON.stringify(scene))) as BuiltScene;
  }
  async venue(options: VenueOptions = {}): Promise<Venue> {
    return (await this.scene({ venues: { v: options } })).venues.v;
  }
  async event(options: EventOptions = {}): Promise<EventRow> {
    const { venue, ...rest } = options;
    if (venue) throw new Error("db.event() cannot book a venue by key; use db.scene({ venues, events }).");
    return (await this.scene({ events: { e: rest } })).events.e;
  }
  async equipment(options: EquipmentOptions = {}): Promise<Equipment> {
    return (await this.scene({ equipment: { q: options } })).equipment.q;
  }
  /** A named preset for the specs whose state is more than a builder call (see PRESETS in browser-fixtures.mjs). */
  async preset<K extends keyof Presets>(name: K): Promise<Presets[K]> {
    return JSON.parse(await run(["preset", name])) as Presets[K];
  }
}

export const test = base.extend<{ db: TestDatabase; resetDatabase: void }>({
  resetDatabase: [
    async ({}, use, testInfo) => {
      // One shared database truncated before every test means parallelism is not a tuning choice: a
      // second worker would wipe this test's rows and session mid-run, and the fixtures' fixed names
      // would collide. Fail with the cause rather than leave someone debugging the symptom.
      if (testInfo.config.workers !== 1)
        throw new Error(
          `This suite resets one shared database before every test, so it must run with workers: 1 (got ${testInfo.config.workers}). ` +
            `Parallel workers would truncate each other's fixtures mid-test. See frontend/playwright.config.ts.`,
        );
      await run(["reset"]);
      await use();
    },
    { auto: true },
  ],
  db: async ({ resetDatabase }, use) => {
    void resetDatabase;
    await use(new TestDatabase());
  },
});

export { expect };
