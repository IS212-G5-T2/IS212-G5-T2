import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { AppModule } from '../app.module.js';
import { anonymousDraftWorkspace } from './draft-workspace.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('SPM-37 real PostgreSQL API integration', () => {
  let app: INestApplication;
  let pool: Pool;
  const createdIds: string[] = [];
  const start = async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  };
  const body = (fields: object = {}, version = 0) => ({ fields, version, operationId: randomUUID() });
  const save = (id: string, data: object) => {
    if (!createdIds.includes(id)) createdIds.push(id);
    return request(app.getHttpServer()).put('/event-requests/' + id + '/draft').send(data);
  };
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query(await readFile(new URL('../../migrations/001_event_requests.sql', import.meta.url), 'utf8'));
    await start();
  });
  afterAll(async () => {
    await app?.close();
    await pool?.query('DELETE FROM event_requests WHERE id = ANY($1::uuid[])', [createdIds]);
    await pool?.end();
  });
  // An organiser can store a completely unfinished request and it is recorded with Draft status.
  it('AC1/2 saves an entirely incomplete request as draft', async () => {
    // Send an empty request through the real API into PostgreSQL.
    const response = await save(randomUUID(), body()).expect(200);
    expect(response.body).toMatchObject({ status: 'draft', version: 1, organisationId: anonymousDraftWorkspace.organisationId, organiserId: 'anonymous' });
    expect(response.body.fields.expectedAttendance).toBeNull();
    expect(response.body.fields.startDateTime).toBe('');
  });
  // All entered values survive reopening, and later saves update the same database record with the newest values.
  it('AC3/4 preserves every field and updates one record repeatedly', async () => {
    // Create one request containing every supported draft field.
    const id = randomUUID();
    const fields = { name: 'Workshop', purpose: 'Training', description: 'Line one\nLine two',
      startDateTime: '2026-10-01T10:00', endDateTime: '2026-10-01T12:00', expectedAttendance: 20,
      venueRequirements: 'Projector', accessibilityNeeds: 'Wheelchair', equipmentRequirements: 'Microphone',
      layout: 'Classroom', registrationEnabled: false };
    await save(id, body(fields)).expect(200);
    for (let version = 1; version <= 3; version++) {
      await save(id, body({ ...fields, name: 'Revision ' + version }, version)).expect(200);
    }
    const result = await request(app.getHttpServer()).get('/event-requests/' + id).expect(200);
    expect(result.body.fields).toEqual({ ...fields, name: 'Revision 3' });
    expect((await pool.query('SELECT count(*)::int AS count FROM event_requests WHERE id = $1', [id])).rows[0].count).toBe(1);
  });
  // Retrying a save after a lost response returns the original result without creating a duplicate or extra revision.
  it('AC4/6 replays a lost response without duplicates or extra revisions', async () => {
    // Send the exact same create operation twice to imitate retrying after a lost response.
    const id = randomUUID(), operation = body({ name: 'Replay' });
    const first = await save(id, operation).expect(200);
    const retry = await save(id, operation).expect(200);
    expect(retry.body).toEqual(first.body);
    const update = body({ name: 'Updated' }, 1);
    const saved = await save(id, update).expect(200);
    expect((await save(id, update).expect(200)).body).toEqual(saved.body);
    await save(id, { ...update, fields: { name: 'Different' } }).expect(409);
  });
  // When two people edit the same draft, an older copy cannot silently overwrite a newer successful save.
  it('AC4 prevents silent overwrites from concurrent editors', async () => {
    // Create a draft, then send two different edits based on the same version at the same time.
    const id = randomUUID();
    await save(id, body()).expect(200);
    const results = await Promise.all([save(id, body({ name: 'A' }, 1)), save(id, body({ name: 'B' }, 1))]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  });
  // A saved draft remains available after the application restarts and the organiser begins a new session.
  it('AC5 survives application restart without authentication', async () => {
    // Save a draft and restart the application while keeping the same database.
    const id = randomUUID();
    await save(id, body({ name: 'Persistent' })).expect(200);
    await app.close(); await start();
    const result = await request(app.getHttpServer()).get('/event-requests/' + id).expect(200);
    expect(result.body.fields.name).toBe('Persistent');
  });
  // Login is deferred, so a second anonymous caller can reopen and update the same draft.
  it('supports anonymous list, reopen and update without identity headers', async () => {
    // Create a request with no session cookie or bearer token.
    const id = randomUUID();
    await save(id, body({ name: 'Anonymous draft' })).expect(200);
    // List it and update it through the public draft endpoints.
    const list = await request(app.getHttpServer()).get('/event-requests').expect(200);
    expect(list.body.some((row: { id: string }) => row.id === id)).toBe(true);
    await save(id, body({ name: 'Anonymous update' }, 1)).expect(200);
    // Reopen the draft and verify the latest saved values.
    const result = await request(app.getHttpServer()).get('/event-requests/' + id).expect(200);
    expect(result.body.fields.name).toBe('Anonymous update');
  });
  // Once submitted, neither a new edit nor a repeated save can alter the values already stored for the request.
  it('AC8 rejects edits and retries once submitted, preserving stored values', async () => {
    // Save the original draft and simulate the separate submission workflow changing its status.
    const id = randomUUID(), original = body({ name: 'Submitted name' });
    await save(id, original).expect(200);
    // Submission belongs to SPM-36; simulate its persisted state transition.
    await pool.query("UPDATE event_requests SET status = 'submitted' WHERE id = $1", [id]);
    await save(id, body({ name: 'Bypass' }, 1)).expect(409);
    await save(id, original).expect(409);
    expect((await pool.query('SELECT fields FROM event_requests WHERE id = $1', [id])).rows[0].fields.name).toBe('Submitted name');
  });
});
