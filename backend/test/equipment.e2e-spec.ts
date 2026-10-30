/*
 * SPM-111 integration coverage for the real Nest HTTP pipeline and PostgreSQL.
 * Unlike the equipment service unit tests, these cases prove the migration-backed
 * table, session middleware, controller status codes, SQL parameter mapping, and
 * create-then-list behaviour together.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const validEquipment = {
  name: 'SPM-111 Integration Projector',
  type: 'Visual',
  quantity: 5,
  maintenanceStatus: 'Active',
  location: 'Integration Test Store',
};

describe('Equipment records (SPM-111 e2e)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let createdEquipmentIds: string[];
  let createdUserIds: string[];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEquipmentIds = [];
    createdUserIds = [];
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    if (createdEquipmentIds.length) {
      await pool.query('DELETE FROM equipment WHERE id = ANY($1::uuid[])', [
        createdEquipmentIds,
      ]);
    }
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        createdUserIds,
      ]);
    }
  });

  // SPM-111 EQUIP-CRE-04-A/05-A: POST persists the exact record and GET returns it through real PostgreSQL.
  it('creates an equipment record and returns it from the inventory in newest-first order', async () => {
    // Arrange: authenticate a Technical Support account through the real session endpoint.
    const technicalSupport = await createDatabaseUser(
      'TECH_SUPPORT',
      'Equipment E2E Support',
    );

    // Act: create two records through the public API, in a known order.
    const first = await request(app.getHttpServer())
      .post('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .send({ ...validEquipment, name: 'SPM-111 First Equipment' })
      .expect(201);
    createdEquipmentIds.push(first.body.equipment.id);
    const second = await request(app.getHttpServer())
      .post('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .send({
        ...validEquipment,
        name: 'SPM-111 Second Equipment',
        location: 'Integration Test Store B',
      })
      .expect(201);
    createdEquipmentIds.push(second.body.equipment.id);
    const inventory = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .expect(200);

    // Assert: SQL columns, values, response mapping, and descending inventory ordering agree.
    expect(first.body).toMatchObject({
      equipment: {
        ...validEquipment,
        name: 'SPM-111 First Equipment',
        id: first.body.equipment.id,
      },
      message: 'Equipment record created.',
    });
    const returned = inventory.body.filter((record: { id: string }) =>
      createdEquipmentIds.includes(record.id),
    );
    expect(returned.map((record: { id: string }) => record.id)).toEqual([
      second.body.equipment.id,
      first.body.equipment.id,
    ]);
    expect(returned[0]).toMatchObject({
      name: 'SPM-111 Second Equipment',
      location: 'Integration Test Store B',
    });
  });

  // SPM-111 EQUIP-CRE-03-BND-1: the PostgreSQL integer maximum is accepted end-to-end.
  it('creates an equipment record at the maximum supported quantity', async () => {
    // Arrange: authenticate a Technical Support user through the live session flow.
    const technicalSupport = await createDatabaseUser(
      'TECH_SUPPORT',
      'Equipment Boundary Support',
    );

    // Act: submit the largest signed PostgreSQL integer through the public API.
    const response = await request(app.getHttpServer())
      .post('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .send({ ...validEquipment, quantity: 2_147_483_647 })
      .expect(201);
    createdEquipmentIds.push(response.body.equipment.id);

    // Assert: the API validation constant and database column agree at their inclusive boundary.
    expect(response.body.equipment.quantity).toBe(2_147_483_647);
  });

  /** EQUIP-AVAIL-08-A: HTTP create persists the three status counts and derives their total. */
  it('EQUIP-AVAIL-08-A creates inventory from the status quantity breakdown', async () => {
    const technicalSupport = await createDatabaseUser(
      'TECH_SUPPORT',
      'SPM-113 Breakdown Create Support',
    );
    const response = await request(app.getHttpServer())
      .post('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .send({
        name: 'SPM-113 Lighting Breakdown',
        type: 'Lighting',
        location: 'Integration Test Store',
        activeQuantity: 10,
        underMaintenanceQuantity: 30,
        retiredQuantity: 10,
      })
      .expect(201);
    createdEquipmentIds.push(response.body.equipment.id);
    const stored = await pool.query(
      `SELECT quantity, active_quantity, under_maintenance_quantity, retired_quantity
       FROM equipment WHERE id = $1`,
      [response.body.equipment.id],
    );

    expect(response.body.equipment).toMatchObject({
      quantity: 50,
      activeQuantity: 10,
      underMaintenanceQuantity: 30,
      retiredQuantity: 10,
      isAvailable: true,
      maintenanceStatus: null,
    });
    expect(stored.rows[0]).toEqual({
      quantity: 50,
      active_quantity: 10,
      under_maintenance_quantity: 30,
      retired_quantity: 10,
    });

    const defaultInventory = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .expect(200);
    expect(defaultInventory.body).toContainEqual(
      expect.objectContaining({
        id: response.body.equipment.id,
        quantity: 50,
        activeQuantity: 10,
        underMaintenanceQuantity: 30,
        retiredQuantity: 10,
        isAvailable: true,
      }),
    );

    await request(app.getHttpServer())
      .patch(`/api/equipment/${response.body.equipment.id}/availability`)
      .set('Cookie', technicalSupport.cookie)
      .send({ isAvailable: true })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/equipment/${response.body.equipment.id}/availability`)
      .set('Cookie', technicalSupport.cookie)
      .send({ isAvailable: false, reason: 'Temporarily withheld for inventory check' })
      .expect(200);
    const refreshedDefault = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .expect(200);
    const includeUnavailable = await request(app.getHttpServer())
      .get('/api/equipment?includeUnavailable=true')
      .set('Cookie', technicalSupport.cookie)
      .expect(200);
    expect(refreshedDefault.body.some((record: { id: string }) => record.id === response.body.equipment.id)).toBe(false);
    expect(includeUnavailable.body).toContainEqual(
      expect.objectContaining({
        id: response.body.equipment.id,
        quantity: 50,
        activeQuantity: 10,
        underMaintenanceQuantity: 30,
        retiredQuantity: 10,
        isAvailable: false,
      }),
    );
    await request(app.getHttpServer())
      .patch(`/api/equipment/${response.body.equipment.id}/availability`)
      .set('Cookie', technicalSupport.cookie)
      .send({ isAvailable: false, reason: 'Duplicate unavailable request' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/equipment/${response.body.equipment.id}/availability`)
      .set('Cookie', technicalSupport.cookie)
      .send({ isAvailable: true })
      .expect(200);
    const returnedAfterReactivation = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .expect(200);
    expect(returnedAfterReactivation.body).toContainEqual(
      expect.objectContaining({
        id: response.body.equipment.id,
        quantity: 50,
        activeQuantity: 10,
        underMaintenanceQuantity: 30,
        retiredQuantity: 10,
        isAvailable: true,
      }),
    );
    const transitions = await pool.query(
      `SELECT quantity, active_quantity, under_maintenance_quantity, retired_quantity,
              is_available, change_type, reason
       FROM equipment_audit_trail WHERE equipment_id = $1
       AND change_type IN ('Marked unavailable', 'Reactivated')
       ORDER BY CASE WHEN change_type = 'Marked unavailable' THEN 1 ELSE 2 END`,
      [response.body.equipment.id],
    );
    expect(transitions.rows).toEqual([
      { quantity: 50, active_quantity: 10, under_maintenance_quantity: 30, retired_quantity: 10, is_available: false, change_type: 'Marked unavailable', reason: 'Temporarily withheld for inventory check' },
      { quantity: 50, active_quantity: 10, under_maintenance_quantity: 30, retired_quantity: 10, is_available: true, change_type: 'Reactivated', reason: null },
    ]);
  });

  // SPM-111 EQUIP-CRE-02-C: the applied location migration supports distinct alphabetical location lookups.
  it('lists distinct saved locations alphabetically from the migrated equipment table', async () => {
    // Arrange: create two records with duplicate and alphabetically different locations.
    const technicalSupport = await createDatabaseUser(
      'TECH_SUPPORT',
      'Equipment Location Support',
    );
    const created = await Promise.all(
      [
        ['SPM-111 Location A', 'Zulu Store'],
        ['SPM-111 Location B', 'Alpha Store'],
        ['SPM-111 Location C', 'Alpha Store'],
      ].map(async ([name, location]) => {
        const response = await request(app.getHttpServer())
          .post('/api/equipment')
          .set('Cookie', technicalSupport.cookie)
          .send({ ...validEquipment, name, location })
          .expect(201);
        return response.body.equipment.id as string;
      }),
    );
    createdEquipmentIds.push(...created);

    // Act: retrieve the selectable locations through the public API.
    const response = await request(app.getHttpServer())
      .get('/api/equipment/locations')
      .set('Cookie', technicalSupport.cookie)
      .expect(200);

    // Assert: each new location appears once and in database ordering.
    const locations = response.body.filter((location: string) =>
      ['Alpha Store', 'Zulu Store'].includes(location),
    );
    expect(locations).toEqual(['Alpha Store', 'Zulu Store']);
  });

  // SPM-111 EQUIP-CRE-03-B/01-B: the HTTP boundary distinguishes invalid, anonymous, and unauthorised requests.
  it('returns 400, 401, and 403 for invalid, anonymous, and non-Technical-Support creation attempts', async () => {
    // Arrange: obtain both permitted and forbidden persisted sessions.
    const technicalSupport = await createDatabaseUser(
      'TECH_SUPPORT',
      'Equipment Validation Support',
    );
    const organiser = await createDatabaseUser(
      'ORGANISER',
      'Equipment Validation Organiser',
    );

    // Act and assert: validation is a client error, absence is unauthenticated, and another role is forbidden.
    await request(app.getHttpServer())
      .post('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .send({ ...validEquipment, quantity: 2_147_483_648 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/equipment')
      .send(validEquipment)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/equipment')
      .set('Cookie', organiser.cookie)
      .send(validEquipment)
      .expect(403);
  });

  // EQUIP-VIEW-01-F (AC1, HTTP boundary). Kills: an @Get() route handler missing
  // its guard, or a guard present only on POST. Only POST had HTTP-level 401/403
  // coverage before this case.
  it('EQUIP-VIEW-01-F returns 401 and 403 for anonymous and non-Technical-Support inventory reads', async () => {
    // Arrange: a session belonging to a role without equipment access.
    const organiser = await createDatabaseUser(
      'ORGANISER',
      'Equipment Read Organiser',
    );

    // Act and assert: no session is unauthenticated; another role is forbidden.
    await request(app.getHttpServer()).get('/api/equipment').expect(401);
    await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', organiser.cookie)
      .expect(403);
  });

  // EQUIP-VIEW-04-C (AC4, real SQL). Kills: a stray WHERE maintenance_status =
  // 'Active' (or equivalent) in the real list() query. This is the one case in
  // the whole suite that actually proves the inventory is not implicitly
  // Active-only: the frontend mocks the API, and EQUIP-VIEW-04-B mocks the
  // database, so neither touches the real SQL this test runs against.
  it('EQUIP-VIEW-04-C returns records of every maintenance status through the real inventory query', async () => {
    // Arrange: persist one record per status through the public API.
    const technicalSupport = await createDatabaseUser(
      'TECH_SUPPORT',
      'Equipment Status Support',
    );
    const created = await Promise.all(
      (['Active', 'Under Maintenance', 'Retired'] as const).map(
        async (maintenanceStatus) => {
          const response = await request(app.getHttpServer())
            .post('/api/equipment')
            .set('Cookie', technicalSupport.cookie)
            .send({
              ...validEquipment,
              name: `SPM-117 Status ${maintenanceStatus}`,
              maintenanceStatus,
            })
            .expect(201);
          return response.body.equipment.id as string;
        },
      ),
    );
    createdEquipmentIds.push(...created);

    // Act: retrieve the inventory through the public API.
    const inventory = await request(app.getHttpServer())
      .get('/api/equipment')
      .set('Cookie', technicalSupport.cookie)
      .expect(200);

    // Assert: all three statuses are present, not only Active.
    const returned = inventory.body.filter((record: { id: string }) =>
      created.includes(record.id),
    );
    expect(
      returned.map((record: { maintenanceStatus: string }) => record.maintenanceStatus).sort(),
    ).toEqual(['Active', 'Retired', 'Under Maintenance']);
  });

  // SPM-111 migration contract: live PostgreSQL rejects invalid equipment rows independently of API validation.
  it('rejects blank location, invalid type, and zero quantity at the database boundary', async () => {
    // Arrange: a direct SQL helper bypasses application validation to exercise database constraints.
    const insertDirectly = (overrides: Partial<typeof validEquipment>) =>
      pool.query(
        `INSERT INTO equipment (equipment_name, equipment_type, quantity, maintenance_status,
                                active_quantity, under_maintenance_quantity, retired_quantity, location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          'SPM-111 invalid record',
          overrides.type ?? validEquipment.type,
          overrides.quantity ?? validEquipment.quantity,
          overrides.maintenanceStatus ?? validEquipment.maintenanceStatus,
          (overrides.maintenanceStatus ?? validEquipment.maintenanceStatus) === 'Active'
            ? overrides.quantity ?? validEquipment.quantity
            : 0,
          (overrides.maintenanceStatus ?? validEquipment.maintenanceStatus) === 'Under Maintenance'
            ? overrides.quantity ?? validEquipment.quantity
            : 0,
          (overrides.maintenanceStatus ?? validEquipment.maintenanceStatus) === 'Retired'
            ? overrides.quantity ?? validEquipment.quantity
            : 0,
          overrides.location ?? validEquipment.location,
        ],
      );

    // Act and assert: PostgreSQL itself protects the table even if an API is bypassed.
    await expect(insertDirectly({ location: '   ' })).rejects.toThrow();
    await expect(insertDirectly({ type: 'Projector' })).rejects.toThrow();
    await expect(insertDirectly({ quantity: 0 })).rejects.toThrow();
  });

  // SPM-118 extends the Equipment resource's Technical Support permission to updates.
  it('has the Equipment resource and Technical Support update permission seeded', async () => {
    // Act: inspect the live RBAC seed rows created by the local database initialisers.
    const permission = await pool.query<{
      create: boolean;
      read: boolean;
      update: boolean;
      delete: boolean;
    }>(
      `SELECT rp.create, rp.read, rp.update, rp.delete
       FROM role_permissions rp
       JOIN roles role ON role.id = rp.role_id
       JOIN resources resource ON resource.id = rp.resource_id
       WHERE role.name = 'TECH_SUPPORT' AND resource.name = 'Equipment'`,
    );

    // Assert: the migration grants the create/read operations that equipment currently exposes.
    expect(permission.rows).toEqual([
      { create: true, read: true, update: true, delete: false },
    ]);
  });

  /** EQUIP-AVAIL-08-D: migration preserves each existing inventory and audit row and backfills its former single status bucket. */
  it('EQUIP-AVAIL-08-D migrates legacy equipment and audit rows without losing their quantity or history', async () => {
    const client = await pool.connect();
    const schema = `spm113_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE equipment (
          id uuid PRIMARY KEY,
          quantity integer NOT NULL,
          maintenance_status text NOT NULL
        );
        CREATE TABLE equipment_audit_trail (
          id uuid PRIMARY KEY,
          equipment_id uuid NOT NULL,
          quantity integer NOT NULL,
          maintenance_status text NOT NULL
        );
      `);
      const equipmentIds: string[] = [];
      const auditIds: string[] = [];
      for (const [maintenanceStatus, quantity] of [
        ['Active', 50],
        ['Under Maintenance', 40],
        ['Retired', 30],
      ] as const) {
        const equipmentId = `11111111-1111-4111-8111-${String(equipmentIds.length + 1).padStart(12, '0')}`;
        const auditId = `22222222-2222-4222-8222-${String(auditIds.length + 1).padStart(12, '0')}`;
        equipmentIds.push(equipmentId);
        auditIds.push(auditId);
        await client.query(
          `INSERT INTO equipment (id, quantity, maintenance_status) VALUES ($1, $2, $3)`,
          [equipmentId, quantity, maintenanceStatus],
        );
        await client.query(
          `INSERT INTO equipment_audit_trail (id, equipment_id, quantity, maintenance_status)
           VALUES ($1, $2, $3, $4)`,
          [auditId, equipmentId, quantity / 2, maintenanceStatus],
        );
      }

      const migration = await readFile(
        new URL('../migrations/015_spm113_equipment_status_quantities.sql', import.meta.url),
        'utf8',
      );
      await client.query(migration);

      const equipment = await client.query(
        `SELECT id, quantity, maintenance_status, active_quantity, under_maintenance_quantity, retired_quantity
         FROM equipment ORDER BY maintenance_status`,
      );
      const audit = await client.query(
        `SELECT id, quantity, maintenance_status, active_quantity, under_maintenance_quantity, retired_quantity
         FROM equipment_audit_trail ORDER BY maintenance_status`,
      );
      expect(equipment.rows).toEqual([
        { id: equipmentIds[0], quantity: 50, maintenance_status: 'Active', active_quantity: 50, under_maintenance_quantity: 0, retired_quantity: 0 },
        { id: equipmentIds[2], quantity: 30, maintenance_status: 'Retired', active_quantity: 0, under_maintenance_quantity: 0, retired_quantity: 30 },
        { id: equipmentIds[1], quantity: 40, maintenance_status: 'Under Maintenance', active_quantity: 0, under_maintenance_quantity: 40, retired_quantity: 0 },
      ]);
      expect(audit.rows).toEqual([
        { id: auditIds[0], quantity: 25, maintenance_status: 'Active', active_quantity: 25, under_maintenance_quantity: 0, retired_quantity: 0 },
        { id: auditIds[2], quantity: 15, maintenance_status: 'Retired', active_quantity: 0, under_maintenance_quantity: 0, retired_quantity: 15 },
        { id: auditIds[1], quantity: 20, maintenance_status: 'Under Maintenance', active_quantity: 0, under_maintenance_quantity: 20, retired_quantity: 0 },
      ]);
      const equipmentSnapshot = structuredClone(equipment.rows);
      const auditSnapshot = structuredClone(audit.rows);
      await client.query(migration);
      expect((await client.query(`SELECT id, quantity, maintenance_status, active_quantity, under_maintenance_quantity, retired_quantity FROM equipment ORDER BY maintenance_status`)).rows).toEqual(equipmentSnapshot);
      expect((await client.query(`SELECT id, quantity, maintenance_status, active_quantity, under_maintenance_quantity, retired_quantity FROM equipment_audit_trail ORDER BY maintenance_status`)).rows).toEqual(auditSnapshot);
      await expect(
        client.query(
          `UPDATE equipment SET active_quantity = -1 WHERE id = $1`,
          [equipmentIds[0]],
        ),
      ).rejects.toThrow();
    } finally {
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
    }
  });

  async function createDatabaseUser(
    role: string,
    name: string,
  ): Promise<{ cookie: string }> {
    const email = `equipment-e2e-${randomUUID()}@example.com`;
    const password = 'password123';
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id`,
      [email, name, password],
    );
    createdUserIds.push(created.rows[0].id);
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
    if (!cookie)
      throw new Error('Expected a PostgreSQL authentication session cookie');
    return { cookie: cookie.split(';', 1)[0] };
  }
});
