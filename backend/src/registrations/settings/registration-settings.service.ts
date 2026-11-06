/*
 * SPM-139: the assigned Event Coordinator reads and saves an event's registration period and capacity.
 *
 * One save is one transaction under the event row lock, the same first step as registration, the waiting list and
 * withdrawal, so a save and a registration on the same event are serialised (SPM-139 07-E, 08-G):
 *   lock the event -> assignment and status -> strict body -> version (409 if stale) -> settle the OLD window (an
 *   extension cannot resurrect entries that were removed) -> validate -> write -> settle the NEW window (a shortened
 *   closing time or a disable removes the waiting list, D3) -> promote when capacity rose (SPM-138 fillFreeSpots).
 * Any refusal throws before the write is committed, so the whole transaction rolls back with it.
 */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import type pg from 'pg';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CLOCK, systemClock, type Clock } from '../../common/clock.js';
import { DatabaseService } from '../../database/database.service.js';
import { fillFreeSpots } from '../waitlist/promotion.js';
import { settleLocked } from '../waitlist/settle.js';
import {
  SETTINGS_ERROR_CODES,
  SETTINGS_MESSAGES,
} from './registration-settings.messages.js';
import {
  parseRegistrationSettingsBody,
  validateRegistrationSettings,
  type SavedSettings,
} from './registration-settings.validation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SPM-139 AC4 (v2.0): registration details can be set only while the event is Approved, Planning or Confirmed. */
const CONFIGURABLE_STATUSES = new Set(['Approved', 'Planning', 'Confirmed']);

export interface RegistrationSettingsResponse {
  eventId: string;
  registrationEnabled: boolean;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  capacity: number;
  confirmedCount: number;
  version: number;
}

/** Either the pool (outside a transaction) or the transaction's client; both run one statement. */
type Query = <T extends pg.QueryResultRow>(text: string, params: unknown[]) => Promise<pg.QueryResult<T>>;

interface SettingsRow extends pg.QueryResultRow {
  id: string;
  coordinator_id: string | null;
  status: string;
  start_date_time: Date;
  registration_enabled: boolean;
  registration_opens_at: Date | null;
  registration_closes_at: Date | null;
  registration_limit: number;
  registration_settings_version: number;
}

@Injectable()
export class RegistrationSettingsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async get(identity: AuthenticatedUser | undefined, eventId: string): Promise<RegistrationSettingsResponse> {
    const coordinator = this.requireCoordinator(identity);
    this.requireEventId(eventId);
    const query: Query = (text, params) => this.database.query(text, params);
    const row = await this.findEvent(query, eventId, '');
    this.requireAssigned(row, coordinator);
    const confirmed = await this.countConfirmed(query, eventId);
    return this.toResponse(eventId, toSaved(row), confirmed, row.registration_settings_version);
  }

  async update(
    identity: AuthenticatedUser | undefined,
    eventId: string,
    body: unknown,
  ): Promise<RegistrationSettingsResponse & { message: string }> {
    const coordinator = this.requireCoordinator(identity);
    this.requireEventId(eventId);

    return this.database.transaction(async (client) => {
      const query: Query = (text, params) => client.query(text, params);
      const row = await this.findEvent(query, eventId, ' FOR UPDATE');
      this.requireAssigned(row, coordinator);
      if (!CONFIGURABLE_STATUSES.has(row.status))
        throw new ConflictException({
          statusCode: 409,
          code: SETTINGS_ERROR_CODES.notConfigurable,
          message: SETTINGS_MESSAGES.notConfigurable,
        });

      const parsed = parseRegistrationSettingsBody(body);
      if (!parsed.ok)
        throw new BadRequestException({
          statusCode: 400,
          code: parsed.violation.code,
          message: parsed.violation.message,
          errors: { [parsed.violation.field]: parsed.violation.message },
        });
      if (parsed.version !== row.registration_settings_version)
        throw new ConflictException({
          statusCode: 409,
          code: SETTINGS_ERROR_CODES.conflict,
          message: SETTINGS_MESSAGES.conflict,
        });

      const now = this.clock.now();
      // The old window first: whatever the previous settings had already removed stays removed (06-E).
      await settleLocked(client, eventId, now);

      const confirmed = await this.countConfirmed(query, eventId);
      const saved = toSaved(row);
      const decision = validateRegistrationSettings(
        saved,
        parsed.patch,
        { startsAt: row.start_date_time },
        confirmed,
      );
      if (!decision.ok)
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: decision.violation.code,
          message: decision.violation.message,
          errors: { [decision.violation.field]: decision.violation.message },
        });

      const next = decision.settings;
      await client.query(
        `UPDATE events
            SET registration_enabled = $2,
                registration_opens_at = $3,
                registration_closes_at = $4,
                registration_limit = $5,
                registration_settings_version = registration_settings_version + 1,
                updated_at = $6
          WHERE id = $1`,
        [eventId, next.registrationEnabled, next.opensAt, next.closesAt, next.capacity, now],
      );

      // The new window: a shortened closing time or a disable removes the waiting list (D3).
      await settleLocked(client, eventId, now);
      // Capacity rose: the earliest waiting entries take the new places in this same transaction (BR10).
      const promoted = next.capacity > saved.capacity ? await fillFreeSpots(client, eventId, now) : 0;

      return {
        ...this.toResponse(eventId, next, confirmed + promoted, row.registration_settings_version + 1),
        message: SETTINGS_MESSAGES.saved,
      };
    });
  }

  private requireCoordinator(identity: AuthenticatedUser | undefined): AuthenticatedUser {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    if (!identity.roles.includes('COORDINATOR'))
      throw new ForbiddenException({ statusCode: 403, message: SETTINGS_MESSAGES.forbidden });
    return identity;
  }

  private requireEventId(eventId: string): void {
    if (!UUID.test(eventId)) throw new NotFoundException(SETTINGS_MESSAGES.eventNotFound);
  }

  private async findEvent(query: Query, eventId: string, lock: string): Promise<SettingsRow> {
    const result = await query<SettingsRow>(
      `SELECT id, coordinator_id, status, start_date_time, registration_enabled, registration_opens_at,
              registration_closes_at, registration_limit, registration_settings_version
         FROM events WHERE id = $1${lock}`,
      [eventId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException(SETTINGS_MESSAGES.eventNotFound);
    return row;
  }

  /** Only the assigned coordinator may read or change the settings (BR1): anyone else gets 403 with no data. */
  private requireAssigned(row: SettingsRow, coordinator: AuthenticatedUser): void {
    if (row.coordinator_id !== coordinator.uid)
      throw new ForbiddenException({ statusCode: 403, message: SETTINGS_MESSAGES.forbidden });
  }

  private async countConfirmed(query: Query, eventId: string): Promise<number> {
    const result = await query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count FROM event_registrations WHERE event_id = $1 AND status = 'Registered'`,
      [eventId],
    );
    return result.rows[0].count;
  }

  private toResponse(
    eventId: string,
    settings: SavedSettings,
    confirmedCount: number,
    version: number,
  ): RegistrationSettingsResponse {
    return {
      eventId,
      registrationEnabled: settings.registrationEnabled,
      registrationOpensAt: settings.opensAt?.toISOString() ?? null,
      registrationClosesAt: settings.closesAt?.toISOString() ?? null,
      capacity: settings.capacity,
      confirmedCount,
      version,
    };
  }
}

function toSaved(row: SettingsRow): SavedSettings {
  return {
    registrationEnabled: row.registration_enabled,
    opensAt: row.registration_opens_at ?? null,
    closesAt: row.registration_closes_at ?? null,
    capacity: row.registration_limit,
  };
}
