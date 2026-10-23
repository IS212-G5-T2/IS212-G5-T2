/** SPM-118 integration cases exercise the authenticated HTTP route, PostgreSQL writes, and audit history. */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const initial = {
  name: 'SPM-118 Projector',
  type: 'Visual',
  location: 'Equipment Store A',
  quantity: 5,
  maintenanceStatus: 'Active',
};

describe('Equipment record updates (SPM-118 e2e)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let equipmentIds: string[];
  let userIds: string[];
  let auditFailureTriggerInstalled: boolean;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    equipmentIds = [];
    userIds = [];
    auditFailureTriggerInstalled = false;
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    if (auditFailureTriggerInstalled) {
      await pool.query('DROP TRIGGER IF EXISTS spm118_reject_audit_insert ON equipment_audit_trail');
      await pool.query('DROP FUNCTION IF EXISTS spm118_reject_audit_insert()');
    }
    if (equipmentIds.length) {
      await pool.query('DELETE FROM equipment WHERE id = ANY($1::uuid[])', [equipmentIds]);
    }
    if (userIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    }
  });

  /** Confluence EQUIP-UPDATE-06-A; SPM-118 AC6: a complete edit persists all permitted fields and is visible in inventory and audit history. Kills: BE-118-08 (writes the wrong audit event type). */
  it('EQUIP-UPDATE-06-A persists editable values and records the change with the authenticated actor', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const equipmentId = await createEquipment(actor.cookie);
    const updated = {
      name: 'Updated projector',
      type: 'Audio',
      location: 'Main Hall',
      quantity: 7,
      maintenanceStatus: 'Under Maintenance',
    };

    const response = await request(app.getHttpServer())
      .put(`/api/equipment/${equipmentId}`)
      .set('Cookie', actor.cookie)
      .send(updated)
      .expect(200);
    const inventory = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', actor.cookie)
      .expect(200);
    const audit = await request(app.getHttpServer())
      .get('/api/equipment/audit-trail')
      .set('Cookie', actor.cookie)
      .expect(200);

    expect(response.body).toMatchObject({
      equipment: { id: equipmentId, ...updated, isAvailable: true },
      message: 'Equipment record updated.',
    });
    expect(inventory.body.find((item: { id: string }) => item.id === equipmentId)).toMatchObject(updated);
    expect(audit.body.filter((entry: { equipmentId: string }) => entry.equipmentId === equipmentId)).toEqual([
      expect.objectContaining({
        equipmentId,
        equipmentName: 'Updated projector',
        equipmentType: 'Audio',
        location: 'Main Hall',
        maintenanceStatus: 'Under Maintenance',
        quantity: 7,
        activeQuantity: 0,
        underMaintenanceQuantity: 7,
        retiredQuantity: 0,
        isAvailable: true,
        changeType: 'Equipment record updated',
        reason: 'Updated fields: Equipment name, Equipment type, Location, Active quantity, Under Maintenance quantity.',
        changedBy: actor.email,
      }),
    ]);
  });

  /** EQUIP-AVAIL-08-C: editing the three counts persists their derived total and audit snapshot while preserving SPM-119's manual unavailable override. */
  it('EQUIP-AVAIL-08-C updates status quantities without reactivating manually unavailable equipment', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const equipmentId = await createEquipment(actor.cookie);
    await request(app.getHttpServer())
      .patch(`/api/equipment/${equipmentId}/availability`)
      .set('Cookie', actor.cookie)
      .send({ isAvailable: false, reason: 'Temporarily unavailable' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .put(`/api/equipment/${equipmentId}`)
      .set('Cookie', actor.cookie)
      .send({
        name: 'SPM-113 Mixed Equipment',
        type: 'Lighting',
        location: 'Equipment Store B',
        activeQuantity: 10,
        underMaintenanceQuantity: 30,
        retiredQuantity: 10,
      })
      .expect(200);
    const stored = await pool.query(
      `SELECT quantity, active_quantity, under_maintenance_quantity, retired_quantity, is_available
       FROM equipment WHERE id = $1`,
      [equipmentId],
    );
    const audit = await pool.query(
      `SELECT quantity, active_quantity, under_maintenance_quantity, retired_quantity, is_available
       FROM equipment_audit_trail WHERE equipment_id = $1 AND change_type = 'Equipment record updated'`,
      [equipmentId],
    );

    expect(response.body.equipment).toMatchObject({
      quantity: 50,
      activeQuantity: 10,
      underMaintenanceQuantity: 30,
      retiredQuantity: 10,
      isAvailable: false,
      maintenanceStatus: null,
    });
    expect(stored.rows[0]).toEqual({
      quantity: 50,
      active_quantity: 10,
      under_maintenance_quantity: 30,
      retired_quantity: 10,
      is_available: false,
    });
    expect(audit.rows[0]).toEqual({
      quantity: 50,
      active_quantity: 10,
      under_maintenance_quantity: 30,
      retired_quantity: 10,
      is_available: false,
    });
  });

  /** EQUIP-AVAIL-08-BND-1: an aggregate above PostgreSQL's integer limit is refused before inventory or audit writes. */
  it('EQUIP-AVAIL-08-BND-1 refuses an oversized status breakdown without changing the record', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const equipmentId = await createEquipment(actor.cookie);
    const response = await request(app.getHttpServer())
      .put(`/api/equipment/${equipmentId}`)
      .set('Cookie', actor.cookie)
      .send({
        name: 'Harini',
        type: 'Lighting',
        location: 'Store A',
        activeQuantity: 2_147_483_647,
        underMaintenanceQuantity: 1,
        retiredQuantity: 0,
      })
      .expect(400);
    const stored = await pool.query(
      `SELECT quantity, active_quantity, under_maintenance_quantity, retired_quantity
       FROM equipment WHERE id = $1`,
      [equipmentId],
    );
    const audit = await pool.query(
      `SELECT id FROM equipment_audit_trail WHERE equipment_id = $1`,
      [equipmentId],
    );

    expect(response.body.errors.activeQuantity).toContain('must not exceed');
    expect(stored.rows[0]).toEqual({
      quantity: 5,
      active_quantity: 5,
      under_maintenance_quantity: 0,
      retired_quantity: 0,
    });
    expect(audit.rows).toEqual([]);
  });

  /** Confluence EQUIP-UPDATE-05-A; SPM-118 AC5: a saved edit is present in PostgreSQL and returned by the inventory API. Kills: BE-118-14 (name), BE-118-15 (type), BE-118-16 (location), BE-118-17 (maintenance), BE-118-18 (quantity mis-mapped). */
  it('EQUIP-UPDATE-05-A returns the updated record from the subsequent inventory read', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const equipmentId = await createEquipment(actor.cookie);
    const updated = {
      name: 'SPM-118 Updated Projector',
      type: 'Furniture',
      location: 'Main Hall',
      quantity: 12,
      maintenanceStatus: 'Retired',
    };

    await request(app.getHttpServer())
      .put(`/api/equipment/${equipmentId}`)
      .set('Cookie', actor.cookie)
      .send(updated)
      .expect(200);
    const stored = await pool.query(
      `SELECT equipment_name, equipment_type, location, quantity, maintenance_status
       FROM equipment WHERE id = $1`,
      [equipmentId],
    );
    const inventory = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', actor.cookie)
      .expect(200);

    expect(stored.rows[0]).toEqual({
      equipment_name: updated.name,
      equipment_type: updated.type,
      location: updated.location,
      quantity: updated.quantity,
      maintenance_status: updated.maintenanceStatus,
    });
    expect(inventory.body.find((item: { id: string }) => item.id === equipmentId)).toMatchObject(updated);
  });

  /** Confluence EQUIP-UPDATE-02-B; SPM-118 AC2: the HTTP and persistence boundary ignores retired Description and Specifications properties. Kills: BE-118-19 (Description persisted), BE-118-20 (Specifications persisted). */
  it('EQUIP-UPDATE-02-B ignores retired Description and Specifications properties', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const equipmentId = await createEquipment(actor.cookie);
    const updated = { ...initial, name: 'Updated through the supported fields' };

    const response = await request(app.getHttpServer())
      .put(`/api/equipment/${equipmentId}`)
      .set('Cookie', actor.cookie)
      .send({ ...updated, description: 'must not persist', specifications: 'must not persist' })
      .expect(200);
    const stored = await pool.query('SELECT to_jsonb(equipment) AS record FROM equipment WHERE id = $1', [equipmentId]);

    expect(response.body.equipment).toMatchObject(updated);
    expect(response.body.equipment).not.toHaveProperty('description');
    expect(response.body.equipment).not.toHaveProperty('specifications');
    expect(stored.rows[0].record).toMatchObject({ equipment_name: updated.name });
    expect(stored.rows[0].record).not.toHaveProperty('description');
    expect(stored.rows[0].record).not.toHaveProperty('specifications');
  });

  /** Confluence EQUIP-UPDATE-03-B; SPM-118 AC3: invalid required values return 400 and leave the equipment row and audit history unchanged. Kills: BE-118-09 (type), BE-118-10 (location), BE-118-11 (maintenance), BE-118-12 (quantity), BE-118-13 (name accepted empty). */
  it('EQUIP-UPDATE-03-B rejects every empty required field without changing inventory or audit history', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const equipmentId = await createEquipment(actor.cookie);
    const cases = [
      ['name', { name: '  ' }, 'Equipment name is required.'],
      ['type', { type: '' }, 'Equipment type is required.'],
      ['location', { location: '  ' }, 'Location is required.'],
      ['quantity', { quantity: null }, 'Quantity is required.'],
      ['maintenanceStatus', { maintenanceStatus: '' }, 'Maintenance status is required.'],
    ] as const;

    for (const [field, invalid, message] of cases) {
      const response = await request(app.getHttpServer())
        .put(`/api/equipment/${equipmentId}`)
        .set('Cookie', actor.cookie)
        .send({ ...initial, ...invalid })
        .expect(400);
      expect(response.body.errors).toEqual({ [field]: message });
      const row = await pool.query('SELECT equipment_name, location, quantity FROM equipment WHERE id = $1', [equipmentId]);
      const audit = await pool.query('SELECT id FROM equipment_audit_trail WHERE equipment_id = $1', [equipmentId]);
      expect(row.rows[0]).toEqual({ equipment_name: initial.name, location: initial.location, quantity: initial.quantity });
      expect(audit.rows).toEqual([]);
    }
  });

  /** Confluence EQUIP-UPDATE-03-C; SPM-118 AC3: the HTTP update path accepts both inclusive PostgreSQL integer quantity boundaries. Kills: BE-118-25 (rejects the inclusive minimum), BE-118-26 (rejects the inclusive maximum). */
  it('EQUIP-UPDATE-03-C accepts the inclusive minimum and maximum quantities', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const equipmentId = await createEquipment(actor.cookie);

    for (const quantity of [1, 2_147_483_647]) {
      const response = await request(app.getHttpServer())
        .put(`/api/equipment/${equipmentId}`)
        .set('Cookie', actor.cookie)
        .send({ ...initial, quantity })
        .expect(200);
      expect(response.body.equipment).toMatchObject({ id: equipmentId, quantity });
    }
  });

  /** Confluence EQUIP-UPDATE-01-B; SPM-118 AC1: an unknown selected record returns 404 and malformed identifiers return 400. Kills: BE-118-06 (allows a missing record to update). */
  it('EQUIP-UPDATE-01-B distinguishes missing and malformed equipment ids', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const missing = await request(app.getHttpServer())
      .put('/api/equipment/11111111-1111-4111-8111-111111111118')
      .set('Cookie', actor.cookie)
      .send(initial)
      .expect(404);
    expect(missing.body.message).toBe('Equipment record not found.');
    await request(app.getHttpServer())
      .put('/api/equipment/not-a-uuid')
      .set('Cookie', actor.cookie)
      .send(initial)
      .expect(400);
  });

  /** Confluence EQUIP-UPDATE-01-C; SPM-118 AC1: the update route requires a session and the Technical Support role. Kills: BE-118-21 (skips Technical Support authorization). */
  it('EQUIP-UPDATE-01-C returns 401 for anonymous callers and 403 for another role', async () => {
    const organiser = await createUser('ORGANISER');
    await request(app.getHttpServer()).put('/api/equipment/11111111-1111-4111-8111-111111111118').send(initial).expect(401);
    await request(app.getHttpServer())
      .put('/api/equipment/11111111-1111-4111-8111-111111111118')
      .set('Cookie', organiser.cookie)
      .send(initial)
      .expect(403);
  });

  /** Confluence EQUIP-UPDATE-06-B; SPM-118 AC6: if the audit insert fails, the enclosing transaction rolls back the inventory update. Kills: BE-118-22 (commits despite audit failure). */
  it('EQUIP-UPDATE-06-B leaves inventory unchanged when audit persistence fails', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const equipmentId = await createEquipment(actor.cookie);
    await pool.query(`
      CREATE FUNCTION spm118_reject_audit_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'SPM-118 simulated audit failure'; END;
      $$;
      CREATE TRIGGER spm118_reject_audit_insert BEFORE INSERT ON equipment_audit_trail
      FOR EACH ROW EXECUTE FUNCTION spm118_reject_audit_insert();
    `);
    auditFailureTriggerInstalled = true;

    await request(app.getHttpServer())
      .put(`/api/equipment/${equipmentId}`)
      .set('Cookie', actor.cookie)
      .send({ ...initial, name: 'Must roll back' })
      .expect(500);

    const row = await pool.query('SELECT equipment_name FROM equipment WHERE id = $1', [equipmentId]);
    const audit = await pool.query('SELECT id FROM equipment_audit_trail WHERE equipment_id = $1', [equipmentId]);
    expect(row.rows[0].equipment_name).toBe(initial.name);
    expect(audit.rows).toEqual([]);
  });

  /** Confluence EQUIP-UPDATE-06-C; SPM-118 AC6: submitting identical values is not a state change and adds no duplicate audit entry. ASSUMPTION: PO-confirmed SPM-119 rule — unchanged requested state is not audited. Kills: BE-118-01 (writes a duplicate audit entry). */
  it('EQUIP-UPDATE-06-C does not write an audit row for unchanged values', async () => {
    const actor = await createUser('TECH_SUPPORT');
    const equipmentId = await createEquipment(actor.cookie);

    const response = await request(app.getHttpServer())
      .put(`/api/equipment/${equipmentId}`)
      .set('Cookie', actor.cookie)
      .send(initial)
      .expect(200);
    const audit = await pool.query('SELECT id FROM equipment_audit_trail WHERE equipment_id = $1', [equipmentId]);

    expect(response.body.message).toBe('No changes were made.');
    expect(audit.rows).toEqual([]);
  });

  async function createUser(role: 'TECH_SUPPORT' | 'ORGANISER') {
    const email = `spm118-${randomUUID()}@example.test`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, 'SPM-118 test user', crypt('password123', gen_salt('bf', 12))) RETURNING id`,
      [email],
    );
    userIds.push(created.rows[0].id);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [created.rows[0].id, role]);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = login.headers['set-cookie']?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected an authenticated SPM-118 test session.');
    return { cookie: cookie.split(';', 1)[0], email };
  }

  async function createEquipment(cookie: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/equipment')
      .set('Cookie', cookie)
      .send(initial)
      .expect(201);
    equipmentIds.push(response.body.equipment.id);
    return response.body.equipment.id;
  }
});
