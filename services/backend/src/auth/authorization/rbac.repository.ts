/*
 * Reads RBAC permissions from the shared database tables seeded for local
 * development and later production-aligned authorization checks.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { PermissionAction, UserRole } from '../models/auth.models.js';

@Injectable()
export class RbacRepository {
  constructor(private readonly database: DatabaseService) { }

  /**
   * Builds a permission predicate for embedding in a resource query.
   * The returned SQL does not execute a database query.
   *
   * @param action - CRUD permission column to require.
   *
   * The calling query must reserve `$1` for the user's roles array and `$2`
   * for the resource name. Its own parameters should begin at `$3`.
   * 
   * @returns A parameterized SQL `EXISTS` predicate that allows the action
   * when at least one supplied role has permission for the resource. The
   * predicate is not executed until it is embedded in a database query.
   */
  buildPermissionPredicate(action: PermissionAction): string {
    const permissionColumn = {
      create: '"create"',
      read: '"read"',
      update: '"update"',
      delete: '"delete"',
    }[action];

    if (!permissionColumn) {
      throw new Error(`Unsupported permission action: ${String(action)}`);
    }

    return `
      EXISTS (
        SELECT 1
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN resources res ON res.id = rp.resource_id
        WHERE r.name = ANY($1::text[])
          AND lower(res.name) = lower($2)
          AND rp.${permissionColumn} = true
      )
    `;
  }

  /**
   * Reads whether a role has permission for a resource/action pair.
   *
   * @param role - Verified RBAC role from Firebase custom claims.
   * @param resource - Resource name matching the seeded `resources` table.
   * @param action - CRUD action column to inspect in `role_permissions`.
   * @returns True when the role permission row explicitly allows the action.
   */
  async hasPermission(
    role: UserRole,
    resource: string,
    action: PermissionAction,
  ): Promise<boolean> {
    const result = await this.database.query<{ allowed: boolean }>(
      `
        SELECT \
        CASE \
          WHEN $1 = 'create' THEN rp.create \
          WHEN $1 = 'read' THEN rp.read \
          WHEN $1 = 'update' THEN rp.update \
          WHEN $1 = 'delete' THEN rp.delete \
          ELSE false
        END AS allowed
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN resources res ON res.id = rp.resource_id
        WHERE r.name = $2 AND lower(res.name) = lower($3)
        LIMIT 1
      `,
      [action, role, resource],
    );

    return result.rows[0]?.allowed === true;
  }
}
