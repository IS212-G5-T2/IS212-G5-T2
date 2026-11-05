// SPM-187: the shared Playwright fixture. Import `test` and `expect` from here, not from @playwright/test.
//
// Every test starts from a database reset to reference data (the seeded accounts and roles), and then builds
// exactly the state it needs through `db`. The reset is an auto fixture, so it runs before the test body. It clears
// auth_sessions, which is why the saved logins are re-created by the reset itself (see "Signing in" below).
//
// Signing in (SPM-187 stage 2): a test declares who it is in one line, `test.use({ as: "coordinator" })`, and starts
// already logged in; there is no UI login in a spec body. `as` takes a role (its default account) or a specific
// account such as "organiser2". The saved logins come from the `setup` project (auth.setup.ts), and the reset below
// re-creates their auth_sessions rows after truncating, so a saved login is valid from the first assertion and a
// logout in one test cannot break the next. A test that needs a SECOND user uses `pageAs`.
//
// Design: this talks to the database by running backend/scripts/testing/browser-fixtures.mjs as a child process
// rather than importing `pg`. frontend/ has no database dependency and keeps none; the cost is one node start
// (about a quarter of a second) per reset and per seeding call. The builders live in that one backend module,
// shared with run-browser.mjs; nothing is implemented twice here.
import { test as base, expect, type Page } from "@playwright/test";
import { type As, stateFile } from "./accounts";
import { resetToReferenceData, run } from "./db-cli";

export type { Account, As, Role } from "./accounts";

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

export const test = base.extend<{ db: TestDatabase; resetDatabase: void; as: As | undefined; pageAs: (who: As) => Promise<Page> }>({
  /** The role or account this test is signed in as. Unset means an anonymous browser (the login test, stubbed specs). */
  as: [undefined, { option: true }],
  // Feeds the built-in storageState option, so `as` composes with the page/context fixtures with no further wiring.
  storageState: async ({ as, storageState }, use) => {
    await use(as ? stateFile(as) : storageState);
  },
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
      await resetToReferenceData();
      await use();
    },
    { auto: true },
  ],
  db: async ({ resetDatabase }, use) => {
    void resetDatabase;
    await use(new TestDatabase());
  },
  // A page signed in as another user, in its own browser context (cookies are not shared with `page`). For tests that
  // genuinely involve two users; closed automatically when the test ends.
  pageAs: async ({ browser, baseURL, locale, timezoneId, viewport }, use) => {
    const contexts: Array<{ close(): Promise<void> }> = [];
    await use(async (who) => {
      const context = await browser.newContext({ baseURL, locale, timezoneId, viewport, storageState: stateFile(who) });
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
});

export { expect };
