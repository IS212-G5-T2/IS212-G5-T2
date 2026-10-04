import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { validateEquipmentInput } from './equipment-input.js';

type EquipmentRow = {
  id: string;
  equipment_name: string;
  equipment_type: string;
  quantity: number;
  maintenance_status: string;
  created_at: Date;
  updated_at: Date;
};

function requireTechnicalSupport(user: AuthenticatedUser | undefined) {
  if (!user) throw new UnauthorizedException();
  if (!user.roles.includes('TECH_SUPPORT')) throw new ForbiddenException();
}

function toEquipment(row: EquipmentRow) {
  return {
    id: row.id,
    name: row.equipment_name,
    type: row.equipment_type,
    quantity: row.quantity,
    maintenanceStatus: row.maintenance_status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/* v8 ignore start -- Nest decorator metadata is not executable in unit tests. */
@Injectable()
/* v8 ignore stop */
export class EquipmentService {
  constructor(private readonly database: DatabaseService) {}

  async create(user: AuthenticatedUser | undefined, body: unknown) {
    requireTechnicalSupport(user);
    const input = validateEquipmentInput(body);
    const result = await this.database.query<EquipmentRow>(
      `INSERT INTO equipment (equipment_name, equipment_type, quantity, maintenance_status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, equipment_name, equipment_type, quantity, maintenance_status, created_at, updated_at`,
      [input.name, input.type, input.quantity, input.maintenanceStatus],
    );
    return { equipment: toEquipment(result.rows[0]), message: 'Equipment record created.' };
  }

  async list(user: AuthenticatedUser | undefined) {
    requireTechnicalSupport(user);
    const result = await this.database.query<EquipmentRow>(
      `SELECT id, equipment_name, equipment_type, quantity, maintenance_status, created_at, updated_at
       FROM equipment ORDER BY created_at DESC`,
    );
    return result.rows.map(toEquipment);
  }
}
