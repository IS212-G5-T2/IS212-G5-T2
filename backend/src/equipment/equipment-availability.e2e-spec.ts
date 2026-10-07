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

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
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
  async function createUser(role: string, emailPrefix: string) {
    const password = 'password123';
    const email = `${emailPrefix}-${randomUUID()}@example.test`;
    const created = await pool.query<{ id: string }>(
      "INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id",
      [email, role, password],
    );
    userIds.push(created.rows[0].id);
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
      [created.rows[0].id, role],
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
