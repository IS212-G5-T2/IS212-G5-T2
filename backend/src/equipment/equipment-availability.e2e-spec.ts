/* SPM-119 RED integration tests for database-backed availability behaviour. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../app.module.js';

describe('SPM-119 equipment availability (e2e)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let userIds: string[];
  let equipmentIds: string[];
  let auditFailureTriggerInstalled: boolean;
  let testCreatedCoordinatorLeadRole: boolean;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    // Fresh SPM-119 databases may predate the SPM-123 Lead migration; create
    // the role only for this test and remove it after the suite if we created it.
    const result = await pool.query(
      "INSERT INTO roles (id, name, description) VALUES (6, 'COORDINATOR_LEAD', 'SPM-119 integration-test role') ON CONFLICT DO NOTHING",
    );
    testCreatedCoordinatorLeadRole = result.rowCount === 1;
  });
  afterAll(async () => {
    if (testCreatedCoordinatorLeadRole) {
      await pool.query('DELETE FROM roles WHERE id = 6');
    }
    await pool.end();
  });
  beforeEach(async () => {
    userIds = [];
    equipmentIds = [];
    auditFailureTriggerInstalled = false;
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    if (auditFailureTriggerInstalled) {
      await pool.query(
        'DROP TRIGGER IF EXISTS spm119_reject_audit_insert ON equipment_audit_trail',
      );
      await pool.query('DROP FUNCTION IF EXISTS spm119_reject_audit_insert()');
    }
    if (equipmentIds.length)
      await pool.query('DELETE FROM equipment WHERE id = ANY($1::uuid[])', [
        equipmentIds,
      ]);
    if (userIds.length)
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        userIds,
      ]);
  });

  // EQUIP-UNAVAIL-04-A: the default HTTP list returns only available equipment.
  it('EQUIP-UNAVAIL-04-A excludes unavailable equipment from the default API list', async () => {
    // Arrange: two available records and two unavailable records exist.
    const actor = await createUser('TECH_SUPPORT', 'default-list');
    const availableIds = await Promise.all(
      ['Light bulbs', 'Harini'].map((name) => createEquipment(true, name)),
    );
    const unavailableIds = await Promise.all(
      ['Broken projector', 'Old PA system'].map((name) =>
        createEquipment(false, name),
      ),
    );

    // Act: request the default inventory list.
    const response = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', actor.cookie)
      .expect(200);

    // Assert: all available fixture rows appear and no unavailable fixture row leaks into discovery.
    const returnedIds = response.body.map((item: { id: string }) => item.id);
    expect(returnedIds).toEqual(expect.arrayContaining(availableIds));
    expect(returnedIds).not.toEqual(expect.arrayContaining(unavailableIds));
  });

  // EQUIP-UNAVAIL-04-B: availability filtering applies before type filtering.
  it('EQUIP-UNAVAIL-04-B excludes an unavailable Visual record from API type search', async () => {
    // Arrange: the matching Visual rows differ only by availability.
    const actor = await createUser('TECH_SUPPORT', 'type-filter');
    const availableId = await createEquipment(true, 'Harini');
    const unavailableId = await createEquipment(false, 'Broken projector');

    // Act: search the backend for Visual equipment without the unavailable opt-in.
    const response = await request(app.getHttpServer())
      .get('/api/equipment?type=Visual')
      .set('Cookie', actor.cookie)
      .expect(200);

    // Assert: the available match is returned and the unavailable match remains hidden.
    const returnedIds = response.body.map((item: { id: string }) => item.id);
    expect(returnedIds).toContain(availableId);
    expect(returnedIds).not.toContain(unavailableId);
  });

  // EQUIP-UNAVAIL-01-A: the public PATCH endpoint marks the selected available record unavailable.
  it('EQUIP-UNAVAIL-01-A marks Light bulbs unavailable through the HTTP boundary', async () => {
    // Arrange: seed the exact Confluence-specified record and authenticate a Technical Support user.
    const actor = await createUser('TECH_SUPPORT', 'techsupport1');
    const equipmentId = await createEquipment(true, 'Light bulbs', {
      type: 'Lighting',
      quantity: 50,
    });

    // Act: submit the specified reason through the HTTP contract.
    const response = await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Damaged during transport' })
      .expect(200);

    // Assert: the update, default discovery filter, and audit trail all expose the approved literals.
    expect(response.body.equipment).toMatchObject({
      id: equipmentId,
      isAvailable: false,
    });
    const defaultList = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', actor.cookie)
      .expect(200);
    expect(
      defaultList.body.map((item: { id: string }) => item.id),
    ).not.toContain(equipmentId);
    const audit = await request(app.getHttpServer())
      .get('/api/equipment/audit-trail')
      .set('Cookie', actor.cookie)
      .expect(200);
    expect(audit.body).toContainEqual(
      expect.objectContaining({
        equipmentId,
        equipmentName: 'Light bulbs',
        changeType: 'Marked unavailable',
        reason: 'Damaged during transport',
        changedBy: actor.email,
      }),
    );
  });

  // EQUIP-UNAVAIL-02-B: invalid unavailability reasons return HTTP 400 without changing equipment or history.
  it('EQUIP-UNAVAIL-02-B rejects an empty reason without persisting an equipment or audit change', async () => {
    // Arrange: record the persisted state before an invalid Technical Support request.
    const actor = await createUser('TECH_SUPPORT', 'empty-reason');
    const equipmentId = await createEquipment(
      true,
      'Reason validation projector',
    );

    // Act: omit the required reason while marking the equipment unavailable.
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: '' })
      .expect(400);

    // Assert: the failed input leaves both tables unchanged.
    const equipment = await pool.query<{ is_available: boolean }>(
      'SELECT is_available FROM equipment WHERE id = $1',
      [equipmentId],
    );
    const audit = await pool.query(
      'SELECT id FROM equipment_audit_trail WHERE equipment_id = $1',
      [equipmentId],
    );
    expect(equipment.rows).toEqual([{ is_available: true }]);
    expect(audit.rows).toEqual([]);
  });

  // EQUIP-UNAVAIL-04-C: opting in with includeUnavailable reveals unavailable equipment.
  it('EQUIP-UNAVAIL-04-C reveals unavailable equipment with includeUnavailable', async () => {
    // Arrange: an unavailable record exists alongside an authenticated Technical Support user.
    const actor = await createUser('TECH_SUPPORT', 'availability-viewer');
    const equipmentId = await createEquipment(false, 'Broken projector');

    // Act: read the default and opt-in lists.
    const hidden = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', actor.cookie)
      .expect(200);
    const shown = await request(app.getHttpServer())
      .get('/api/equipment?includeUnavailable=true')
      .set('Cookie', actor.cookie)
      .expect(200);

    // Assert: the opt-in response includes the otherwise hidden record.
    expect(hidden.body.map((item: { id: string }) => item.id)).not.toContain(
      equipmentId,
    );
    expect(shown.body).toContainEqual(
      expect.objectContaining({ id: equipmentId, isAvailable: false }),
    );
  });

  // EQUIP-UNAVAIL-05-C: any Technical Support user can read audit history created by another.
  it('EQUIP-UNAVAIL-05-C shares audit history with another Technical Support user', async () => {
    // Arrange: one technician creates history and another technician inspects it.
    const author = await createUser('TECH_SUPPORT', 'techsupport1');
    const reader = await createUser('TECH_SUPPORT', 'techsupport2');
    const equipmentId = await createEquipment(true, 'Shared audit projector');
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', author.cookie)
      .send({ isAvailable: false, reason: 'Screen cracked' })
      .expect(200);

    // Act: read as the second technician.
    const history = await request(app.getHttpServer())
      .get('/api/equipment/audit-trail')
      .set('Cookie', reader.cookie)
      .expect(200);

    // Assert: shared history retains its original actor.
    expect(history.body).toContainEqual(
      expect.objectContaining({
        equipmentId,
        changedBy: author.email,
        reason: 'Screen cracked',
      }),
    );
  });

  // EQUIP-UNAVAIL-05-A: the mark-unavailable audit row captures the equipment snapshot and a current timestamp.
  it('EQUIP-UNAVAIL-05-A records the complete mark-unavailable audit snapshot with a current timestamp', async () => {
    // Arrange: freeze the observable action window around a known availability change.
    const actor = await createUser('TECH_SUPPORT', 'techsupport1');
    const equipmentId = await createEquipment(true, 'Light bulbs', {
      type: 'Lighting',
      quantity: 50,
    });
    const actionStartedAt = Date.now();

    // Act: mark the record unavailable using the audit-case reason.
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Under repair' })
      .expect(200);

    // Assert: ASSUMPTION: the audit API serialises its database timestamp as `timestamp`.
    const audit = await request(app.getHttpServer())
      .get('/api/equipment/audit-trail')
      .set('Cookie', actor.cookie)
      .expect(200);
    const entry = audit.body.find(
      (item: { equipmentId: string }) => item.equipmentId === equipmentId,
    );
    expect(entry).toMatchObject({
      equipmentId,
      equipmentName: 'Light bulbs',
      equipmentType: 'Lighting',
      location: 'Tampines',
      maintenanceStatus: 'Active',
      quantity: 50,
      isAvailable: false,
      changeType: 'Marked unavailable',
      reason: 'Under repair',
      changedBy: actor.email,
    });
    expect(new Date(entry.timestamp).getTime()).toBeGreaterThanOrEqual(
      actionStartedAt - 5_000,
    );
    expect(new Date(entry.timestamp).getTime()).toBeLessThanOrEqual(
      Date.now() + 5_000,
    );
  });

  // EQUIP-UNAVAIL-ASSUMP-03: same-state requests are conflicts and are not audit events.
  it('EQUIP-UNAVAIL-ASSUMP-03 returns 409 for repeated availability states without duplicate audit rows', async () => {
    // Arrange: one record starts available and another starts unavailable.
    const actor = await createUser('TECH_SUPPORT', 'same-state');
    const availableId = await createEquipment(
      true,
      'Already available projector',
    );
    const unavailableId = await createEquipment(
      false,
      'Already unavailable projector',
    );

    // Act and assert: neither same-state request is accepted as a change.
    await request(app.getHttpServer())
      .patch(`/api/equipment/${availableId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: true })
      .expect(409)
      .expect(({ body }) =>
        expect(body.message).toBe('Equipment is already available.'),
      );
    await request(app.getHttpServer())
      .patch(`/api/equipment/${unavailableId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Repeated request' })
      .expect(409)
      .expect(({ body }) =>
        expect(body.message).toBe('Equipment is already unavailable.'),
      );

    // Assert: rejected repeats do not create misleading audit history.
    const audit = await pool.query(
      'SELECT id FROM equipment_audit_trail WHERE equipment_id = ANY($1::uuid[])',
      [[availableId, unavailableId]],
    );
    expect(audit.rows).toEqual([]);
  });

  // EQUIP-UNAVAIL-05-B: reactivation appends a distinct event after the original mark-unavailable event.
  it('EQUIP-UNAVAIL-05-B appends a Reactivated audit entry after Marked unavailable', async () => {
    // Arrange: create a record and mark it unavailable first.
    const actor = await createUser('TECH_SUPPORT', 'reactivation-audit');
    const equipmentId = await createEquipment(true, 'Broken projector');
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Under repair' })
      .expect(200);

    // Act: reactivate the same equipment.
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: true })
      .expect(200);

    // Assert: most-recent-first history contains both distinct changes in chronological order.
    const audit = await request(app.getHttpServer())
      .get('/api/equipment/audit-trail')
      .set('Cookie', actor.cookie)
      .expect(200);
    const changes = audit.body
      .filter(
        (item: { equipmentId: string }) => item.equipmentId === equipmentId,
      )
      .map((item: { changeType: string }) => item.changeType);
    expect(changes).toEqual(['Reactivated', 'Marked unavailable']);
  });

  // EQUIP-UNAVAIL-07-A: a failed audit insert rolls the availability update back with it.
  it('EQUIP-UNAVAIL-07-A rolls back the equipment update when the audit insert fails', async () => {
    // Arrange: force every audit insert to fail after the route begins its transaction.
    const actor = await createUser('TECH_SUPPORT', 'rollback');
    const equipmentId = await createEquipment(true, 'Rollback projector');
    await pool.query(
      "CREATE FUNCTION spm119_reject_audit_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SPM-119 audit failure'; END; $$",
    );
    await pool.query(
      'CREATE TRIGGER spm119_reject_audit_insert BEFORE INSERT ON equipment_audit_trail FOR EACH ROW EXECUTE FUNCTION spm119_reject_audit_insert()',
    );
    auditFailureTriggerInstalled = true;

    // Act: attempt the change whose audit insert is forced to fail.
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Faulty wiring detected' })
      .expect(500);

    // Assert: no partial availability change persists after rollback.
    const row = await pool.query<{ is_available: boolean }>(
      'SELECT is_available FROM equipment WHERE id = $1',
      [equipmentId],
    );
    expect(row.rows).toEqual([{ is_available: true }]);
  });

  // EQUIP-UNAVAIL-07-B: the three AC7 audit fields are present and have the specified values.
  it('EQUIP-UNAVAIL-07-B records timestamp, Screen cracked, and the JWT user email', async () => {
    // Arrange: a known user changes a known equipment record.
    const actor = await createUser('TECH_SUPPORT', 'techsupport1');
    const equipmentId = await createEquipment(true, 'Screen projector');
    const actionStartedAt = Date.now();

    // Act: submit the exact reason named by the case.
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Screen cracked' })
      .expect(200);

    // Assert: ASSUMPTION: `timestamp` is the audit API's timestamp field name.
    const audit = await request(app.getHttpServer())
      .get('/api/equipment/audit-trail')
      .set('Cookie', actor.cookie)
      .expect(200);
    const entry = audit.body.find(
      (item: { equipmentId: string }) => item.equipmentId === equipmentId,
    );
    expect(entry).toMatchObject({
      reason: 'Screen cracked',
      changedBy: actor.email,
    });
    expect(new Date(entry.timestamp).getTime()).toBeGreaterThanOrEqual(
      actionStartedAt - 5_000,
    );
    expect(new Date(entry.timestamp).getTime()).toBeLessThanOrEqual(
      Date.now() + 5_000,
    );
  });

  // EQUIP-UNAVAIL-07-SEC-1: the public PATCH route returns HTTP 403 to both forbidden roles and creates no audit record.
  it.each(['ATTENDEE', 'ORGANISER'] as const)(
    'EQUIP-UNAVAIL-07-SEC-1 returns 403 to %s without an audit entry',
    async (role) => {
      // Arrange: a forbidden actor targets an available record.
      const actor = await createUser(role, role.toLowerCase());
      const reader = await createUser('TECH_SUPPORT', 'audit-reader');
      const equipmentId = await createEquipment(true, `${role} projector`);

      // Act: send the forbidden update request.
      await request(app.getHttpServer())
        .patch(`/api/equipment/${equipmentId}/availability`)
        .set('Cookie', actor.cookie)
        .send({ isAvailable: false, reason: 'test' })
        .expect(403);

      // Assert: equipment and shared audit history are unchanged.
      const row = await pool.query<{ is_available: boolean }>(
        'SELECT is_available FROM equipment WHERE id = $1',
        [equipmentId],
      );
      const audit = await request(app.getHttpServer())
        .get('/api/equipment/audit-trail')
        .set('Cookie', reader.cookie)
        .expect(200);
      expect(row.rows).toEqual([{ is_available: true }]);
      expect(
        audit.body.some(
          (item: { equipmentId: string }) => item.equipmentId === equipmentId,
        ),
      ).toBe(false);
    },
  );

  // M1: Reactivation always writes false -> Stored availability after reactivating
  it('EQUIP-UNAVAIL-01-C stores true when reactivating', async () => {
    const actor = await createUser('TECH_SUPPORT', 'm1-test');
    const equipmentId = await createEquipment(false, 'M1 Test');
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: true })
      .expect(200);
    const state = await pool.query(
      'SELECT is_available FROM equipment WHERE id = $1',
      [equipmentId],
    );
    expect(state.rows[0].is_available).toBe(true);
  });

  // M2: Audit is_available column always true -> The API doesn't expose the column, and nothing queries it
  it('EQUIP-UNAVAIL-01-D stores false in the audit trail when marking unavailable', async () => {
    const actor = await createUser('TECH_SUPPORT', 'm2-test');
    const equipmentId = await createEquipment(true, 'M2 Test');
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Test' })
      .expect(200);
    const audit = await pool.query(
      'SELECT is_available FROM equipment_audit_trail WHERE equipment_id = $1',
      [equipmentId],
    );
    expect(audit.rows[0].is_available).toBe(false);
  });

  // M6: Reason saved untrimmed -> A padded reason such as "  Under repair  "
  it('EQUIP-UNAVAIL-02-B trims a padded reason before saving', async () => {
    const actor = await createUser('TECH_SUPPORT', 'm6-test');
    const equipmentId = await createEquipment(true, 'M6 Test');
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: '  Under repair  ' })
      .expect(200);
    const audit = await pool.query(
      'SELECT reason FROM equipment_audit_trail WHERE equipment_id = $1',
      [equipmentId],
    );
    expect(audit.rows[0].reason).toBe('Under repair');
  });

  // M9: Reactivation stores a submitted reason -> Reactivation audit has a null reason
  it('EQUIP-UNAVAIL-02-C stores a null reason when reactivating even if one was submitted', async () => {
    const actor = await createUser('TECH_SUPPORT', 'm9-test');
    const equipmentId = await createEquipment(false, 'M9 Test');
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: true, reason: 'Should be ignored' })
      .expect(200);
    const audit = await pool.query(
      'SELECT reason FROM equipment_audit_trail WHERE equipment_id = $1',
      [equipmentId],
    );
    expect(audit.rows[0].reason).toBeNull();
  });

  // M11: Missing reason field accepted -> Missing or non-string reason
  it('EQUIP-UNAVAIL-02-D rejects a missing or non-string reason when marking unavailable', async () => {
    const actor = await createUser('TECH_SUPPORT', 'm11-test');
    const equipmentId = await createEquipment(true, 'M11 Test');
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 123 })
      .expect(400);
  });

  // Retired records can be marked unavailable -> no test pins it
  it('EQUIP-UNAVAIL-03-A allows marking a Retired record as unavailable', async () => {
    const actor = await createUser('TECH_SUPPORT', 'retired-test');
    const equipmentId = await createEquipment(true, 'Retired Test', {
      maintenanceStatus: 'Retired',
    });
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Retired item broken' })
      .expect(200);
  });

  // M5: Validate before authorise -> Forbidden user sending an invalid body gets 403, not 400
  // M7: Unknown-ID check removed -> 404 for an unknown ID
  it('EQUIP-UNAVAIL-07-SEC-07 returns 403 for a forbidden user sending a malformed ID', async () => {
    const forbidden = await createUser('COORDINATOR', 'm5-id-test');
    await request(app.getHttpServer())
      .patch(`/api/equipment/not-a-uuid/availability`)
      .set('Cookie', forbidden.cookie)
      .send({ isAvailable: false, reason: 'test' })
      .expect(403);
  });

  // EQUIP-UNAVAIL-07-SEC-02: every non-Technical-Support role is denied before state changes.
  // Extra timeout: about a dozen bcrypt cost-12 hash/verify calls now run sequentially.
  it('EQUIP-UNAVAIL-07-SEC-02 denies every other defined role', async () => {
    // Arrange: each forbidden account targets its own available record.
    const roles = [
      'ATTENDEE',
      'ORGANISER',
      'COORDINATOR',
      'VENUE_STAFF',
      'COORDINATOR_LEAD',
    ] as const;
    // Logins and PATCHes run sequentially: supertest binds a non-listening
    // server to an ephemeral port per request and closes it when that request
    // ends, so concurrent requests against app.getHttpServer() can have their
    // sockets reset (ECONNRESET) by whichever request finishes first.
    const actors: Awaited<ReturnType<typeof createUser>>[] = [];
    for (const [index, role] of roles.entries()) {
      actors.push(await createUser(role, `forbidden-${index}`));
    }
    const equipment = await Promise.all(
      actors.map((_, index) =>
        createEquipment(true, `Forbidden role ${index}`),
      ),
    );

    // Act: each non-Technical-Support account attempts the protected mutation.
    for (const [index, actor] of actors.entries()) {
      await request(app.getHttpServer())
        .patch(`/api/equipment/${equipment[index]}/availability`)
        .set('Cookie', actor.cookie)
        .send({ isAvailable: false, reason: 'test' })
        .expect(403);
    }

    // Assert: no rejected request changes availability or creates audit history.
    const state = await pool.query<{ id: string; is_available: boolean }>(
      'SELECT id, is_available FROM equipment WHERE id = ANY($1::uuid[]) ORDER BY id',
      [equipment],
    );
    const audit = await pool.query(
      'SELECT id FROM equipment_audit_trail WHERE equipment_id = ANY($1::uuid[])',
      [equipment],
    );
    expect(state.rows).toHaveLength(equipment.length);
    expect(state.rows.every((row) => row.is_available)).toBe(true);
    expect(audit.rows).toEqual([]);

    // Assert: a role-less account cannot obtain a session for the protected route.
    const password = 'password123';
    const email = `no-role-${randomUUID()}@example.test`;
    const created = await pool.query<{ id: string }>(
      "INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id",
      [email, 'No role', password],
    );
    userIds.push(created.rows[0].id);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(401);
  }, 15_000);

  // EQUIP-UNAVAIL-07-SEC-03: audit history requires the same Technical Support authorization as mutation routes.
  it('EQUIP-UNAVAIL-07-SEC-03 rejects unauthenticated and forbidden audit-trail reads', async () => {
    // Arrange: a non-Technical-Support user has a valid session.
    const forbidden = await createUser('COORDINATOR', 'audit-forbidden');

    // Act and assert: absent and insufficient credentials receive distinct HTTP responses.
    await request(app.getHttpServer())
      .get('/api/equipment/audit-trail')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/equipment/audit-trail')
      .set('Cookie', forbidden.cookie)
      .expect(403);
  });

  // EQUIP-UNAVAIL-07-SEC-04: authorization is evaluated before malformed input is disclosed.
  it('EQUIP-UNAVAIL-07-SEC-04 returns authorization errors before validation errors', async () => {
    // Arrange: one forbidden session and one unauthenticated request target valid equipment.
    const forbidden = await createUser('COORDINATOR', 'authorization-order');
    const equipmentId = await createEquipment(
      true,
      'Authorization order projector',
    );

    // Act and assert: the invalid payload cannot turn an authorization failure into a 400.
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', forbidden.cookie)
      .send({ isAvailable: 'not-a-boolean' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .send({ isAvailable: 'not-a-boolean' })
      .expect(401);
  });

  // EQUIP-UNAVAIL-07-SEC-05: client-controlled audit actor fields cannot forge the stored actor.
  it('EQUIP-UNAVAIL-07-SEC-05 ignores a forged changedBy field and records the session user', async () => {
    // Arrange: a valid Technical Support session targets available equipment.
    const actor = await createUser('TECH_SUPPORT', 'forged-actor');
    const equipmentId = await createEquipment(true, 'Forged actor projector');

    // Act: submit a request body containing an untrusted actor value.
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({
        isAvailable: false,
        reason: 'Damaged during transport',
        changedBy: 'attacker@example.test',
      })
      .expect(200);

    // Assert: the persisted entry is attributed only to the authenticated session.
    const audit = await pool.query<{ changed_by: string }>(
      'SELECT changed_by FROM equipment_audit_trail WHERE equipment_id = $1',
      [equipmentId],
    );
    expect(audit.rows).toEqual([{ changed_by: actor.email }]);
  });

  // EQUIP-UNAVAIL-07-SEC-06: malformed and unknown IDs have deliberate client-facing errors.
  it('EQUIP-UNAVAIL-07-SEC-06 returns 400 for a malformed ID and 404 for an unknown UUID', async () => {
    // Arrange: an authorized actor targets nonexistent identifiers.
    const actor = await createUser('TECH_SUPPORT', 'missing-equipment');

    // Act and assert: neither invalid target is forwarded to an availability write.
    await request(app.getHttpServer())
      .patch('/api/equipment/not-a-uuid/availability')
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Damaged during transport' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/equipment/${randomUUID()}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Damaged during transport' })
      .expect(404);
  });

  async function createEquipment(
    isAvailable: boolean,
    name: string,
    overrides: {
      type?: string;
      location?: string;
      maintenanceStatus?: string;
      quantity?: number;
    } = {},
  ) {
    const {
      type = 'Visual',
      location = 'Tampines',
      maintenanceStatus = 'Active',
      quantity = 1,
    } = overrides;
    const result = await pool.query<{ id: string }>(
      `INSERT INTO equipment (equipment_name, equipment_type, quantity, maintenance_status, location, is_available) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [name, type, quantity, maintenanceStatus, location, isAvailable],
    );
    equipmentIds.push(result.rows[0].id);
    return result.rows[0].id;
  }
  // The email is generated here, upfront, and returned for callers to assert
  // against — not derived by mangling a caller-supplied literal after the
  // fact, which would make the account's real email diverge from whatever
  // the caller later hard-codes in an assertion. Matches the pattern already
  // used by every other `*.e2e-spec.ts` helper in this codebase.
  async function createUser(role: string | string[], emailPrefix: string) {
    const password = 'password123';
    const email = `${emailPrefix}-${randomUUID()}@example.test`;
    const created = await pool.query<{ id: string }>(
      "INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id",
      [email, role, password],
    );
    userIds.push(created.rows[0].id);
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = ANY($2::text[])',
      [created.rows[0].id, Array.isArray(role) ? role : [role]],
    );
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const cookie = login.headers['set-cookie']?.find((value) =>
      value.startsWith('connectsphere_session='),
    );
    if (!cookie) throw new Error('Expected session cookie');
    return { cookie: cookie.split(';', 1)[0], email };
  }
});
