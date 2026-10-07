import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { validateEquipmentInput } from './equipment-input.js';
import {
  validateAvailabilityInput,
  validateEquipmentAvailabilityId,
} from './equipment-availability-input.js';

type EquipmentRow = {
  id: string;
  equipment_name: string;
  equipment_type: string;
  quantity: number;
  maintenance_status: string;
  location: string;
  is_available: boolean;
  created_at: Date;
  updated_at: Date;
};

type AuditTrailRow = {
  id: string;
  equipment_id: string;
  equipment_name: string;
  equipment_type: string;
  location: string;
  maintenance_status: string;
  quantity: number;
  change_type: string;
  reason: string | null;
  changed_by: string;
  changed_at: Date;
};

function requireTechnicalSupport(
  user: AuthenticatedUser | undefined,
): AuthenticatedUser {
  if (!user) throw new UnauthorizedException();
  if (!user.roles.includes('TECH_SUPPORT')) throw new ForbiddenException();
  return user;
}

function toEquipment(row: EquipmentRow) {
  return {
    id: row.id,
    name: row.equipment_name,
    type: row.equipment_type,
    quantity: row.quantity,
    maintenanceStatus: row.maintenance_status,
    location: row.location,
    isAvailable: row.is_available,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toAuditEntry(row: AuditTrailRow) {
  return {
    id: row.id,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment_name,
    equipmentType: row.equipment_type,
    location: row.location,
    maintenanceStatus: row.maintenance_status,
    quantity: row.quantity,
    changeType: row.change_type,
    reason: row.reason,
    changedBy: row.changed_by,
    timestamp: row.changed_at.toISOString(),
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
      `INSERT INTO equipment (equipment_name, equipment_type, quantity, maintenance_status, location)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, equipment_name, equipment_type, quantity, maintenance_status, location, is_available, created_at, updated_at`,
      [input.name, input.type, input.quantity, input.maintenanceStatus, input.location],
    );
    return { equipment: toEquipment(result.rows[0]), message: 'Equipment record created.' };
  }

  async list(user: AuthenticatedUser | undefined, options?: { includeUnavailable?: boolean }) {
    requireTechnicalSupport(user);
    const availabilityClause = options?.includeUnavailable ? '' : 'WHERE is_available = true';
    const result = await this.database.query<EquipmentRow>(
      `SELECT id, equipment_name, equipment_type, quantity, maintenance_status, location, is_available, created_at, updated_at
       FROM equipment ${availabilityClause} ORDER BY created_at DESC`,
    );
    return result.rows.map(toEquipment);
  }

  async listLocations(user: AuthenticatedUser | undefined) {
    requireTechnicalSupport(user);
    const result = await this.database.query<{ location: string }>(
      `SELECT DISTINCT location FROM equipment ORDER BY location ASC`,
    );
    return result.rows.map((row) => row.location);
  }

  /**
   * SPM-119 AC1/AC2/AC6/AC7: changes availability and writes its audit entry
   * atomically, so a failed audit write can never leave a silent, unrecorded
   * availability change.
   */
  async updateAvailability(
    user: AuthenticatedUser | undefined,
    equipmentId: string,
    body: unknown,
  ) {
    // Authorization deliberately precedes input validation so rejected roles
    // cannot use validation responses to probe this protected route.
    const actor = requireTechnicalSupport(user);
    const input = validateAvailabilityInput(body);
    validateEquipmentAvailabilityId(equipmentId);

    return this.database.transaction(async (client) => {
      const current = await client.query<EquipmentRow>(
        `SELECT id, equipment_name, equipment_type, quantity, maintenance_status, location, is_available, created_at, updated_at
         FROM equipment WHERE id = $1 FOR UPDATE`,
        [equipmentId],
      );
      const before = current.rows[0];
      if (!before) throw new NotFoundException('Equipment record not found.');

      const updated = await client.query<EquipmentRow>(
        `UPDATE equipment SET is_available = $2, updated_at = now()
         WHERE id = $1
         RETURNING id, equipment_name, equipment_type, quantity, maintenance_status, location, is_available, created_at, updated_at`,
        [equipmentId, input.isAvailable],
      );

      const changeType = input.isAvailable ? 'Reactivated' : 'Marked unavailable';
      await client.query(
        `INSERT INTO equipment_audit_trail
           (equipment_id, equipment_name, equipment_type, location, maintenance_status, quantity, is_available, change_type, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          equipmentId,
          before.equipment_name,
          before.equipment_type,
          before.location,
          before.maintenance_status,
          before.quantity,
          input.isAvailable,
          changeType,
          input.reason ?? null,
          actor.email,
        ],
      );

      return { equipment: toEquipment(updated.rows[0]) };
    });
  }

  /** SPM-119 AC5: the shared, un-filtered history every tech_support user can read. */
  async getAuditTrail(user: AuthenticatedUser | undefined) {
    requireTechnicalSupport(user);
    const result = await this.database.query<AuditTrailRow>(
      `SELECT id, equipment_id, equipment_name, equipment_type, location, maintenance_status, quantity, change_type, reason, changed_by, changed_at
       FROM equipment_audit_trail ORDER BY changed_at DESC`,
    );
    return result.rows.map(toAuditEntry);
  }
}
