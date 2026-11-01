import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CLOCK, systemClock, type Clock } from '../../common/clock.js';
import { DatabaseService } from '../../database/database.service.js';
import { ArrangementsReader, type Queryable } from '../status/arrangements.reader.js';
import { buildChecklist } from '../status/checklist.js';

const PENDING_EVENTS_SQL = `
  SELECT e.id, e.event_name, e.start_date_time, e.end_date_time, e.expected_attendance,
         e.preferred_room_layout, e.required_facilities, e.accessibility_needs,
         e.equipment_needs, e.equipment_confirmed_at, s.requested_at
    FROM events e
    JOIN event_safety_checks s ON s.event_id = e.id AND s.status = 'pending'
   WHERE e.status = 'Planning'`;

const DETAILS_SQL = `
  SELECT e.id, e.event_name, e.start_date_time, e.end_date_time, e.expected_attendance,
         e.preferred_room_layout, e.required_facilities, e.accessibility_needs, e.equipment_needs,
         COALESCE((SELECT json_agg(json_build_object(
           'id', b.id, 'name', v.name, 'location', v.location, 'capacity', v.capacity,
           'restrictions', v.operating_information,
           'facilities', COALESCE((SELECT json_agg(f.name ORDER BY f.name) FROM venue_facilities vf JOIN facilities f ON f.id = vf.facility_id WHERE vf.venue_id = v.id), '[]'::json),
           'accessibility', COALESCE((SELECT json_agg(a.label ORDER BY a.label) FROM venue_accessibility va JOIN accessibility_features a ON a.id = va.accessibility_id WHERE va.venue_id = v.id), '[]'::json),
           'layouts', COALESCE((SELECT json_agg(l.name ORDER BY l.name) FROM venue_layouts vl JOIN room_layouts l ON l.id = vl.layout_id WHERE vl.venue_id = v.id), '[]'::json)
         ) ORDER BY b.start_at, b.id)
           FROM venue_bookings b JOIN venues v ON v.id = b.venue_id
          WHERE b.event_id = e.id AND b.status = 'approved' AND b.request_kind = 'booking'), '[]'::json) AS venues,
         COALESCE((SELECT json_agg(json_build_object('id', r.id, 'name', r.equipment_name, 'quantity', r.quantity) ORDER BY r.id)
                     FROM equipment_reservations r WHERE r.event_id = e.id AND r.status = 'Reserved'), '[]'::json) AS equipment
    FROM events e
   WHERE e.id = $1 AND e.status = 'Planning'`;

interface EventSummaryRow extends pg.QueryResultRow {
  id: string;
  event_name: string;
  start_date_time: Date;
  end_date_time: Date;
  expected_attendance: number;
  preferred_room_layout: string;
  required_facilities: string[];
  accessibility_needs: string[];
}

interface PendingEventRow extends EventSummaryRow {
  equipment_needs: string;
  equipment_confirmed_at: Date | null;
  requested_at: Date;
}

interface DetailRow extends EventSummaryRow {
  equipment_needs: string;
  venues: unknown[];
  equipment: Array<{ id: string; name: string; quantity: number }>;
}

function eventSummary(row: EventSummaryRow) {
  return {
    id: row.id,
    name: row.event_name,
    startDateTime: row.start_date_time.toISOString(),
    endDateTime: row.end_date_time.toISOString(),
    expectedAttendance: row.expected_attendance,
    venueRequirements: {
      layout: row.preferred_room_layout,
      facilities: row.required_facilities,
      accessibility: row.accessibility_needs,
    },
  };
}

@Injectable()
export class SafetyOfficerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly arrangements: ArrangementsReader,
    @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async queue(identity: AuthenticatedUser | undefined) {
    this.requireSafetyOfficer(identity);
    const candidates = await this.database.query<PendingEventRow>(`${PENDING_EVENTS_SQL} ORDER BY s.requested_at, e.id`);
    // Each candidate is an independent read-only arrangement check; run them concurrently while preserving query order.
    const eligibility = await Promise.all(candidates.rows.map((candidate) => this.hasConfirmedArrangements(this.database, candidate)));
    const eligible = candidates.rows.filter((_candidate, index) => eligibility[index]);
    return eligible.map((row) => ({
      ...eventSummary(row),
      requestedAt: row.requested_at.toISOString(),
    }));
  }

  async details(identity: AuthenticatedUser | undefined, eventId: string) {
    this.requireSafetyOfficer(identity);
    const candidate = await this.pendingCandidate(this.database, eventId);
    if (!candidate || !(await this.hasConfirmedArrangements(this.database, candidate)))
      throw new NotFoundException('This event is not awaiting a safety check.');
    const result = await this.database.query<DetailRow>(DETAILS_SQL, [eventId]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('This event is not awaiting a safety check.');
    return {
      ...eventSummary(row),
      equipmentNeeds: row.equipment_needs,
      venues: row.venues,
      equipment: row.equipment,
    };
  }

  async respond(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    const user = this.requireSafetyOfficer(identity);
    const input = body && typeof body === 'object' && !Array.isArray(body)
      ? body as { decision?: unknown; reason?: unknown; changes?: unknown }
      : null;
    const decision = input?.decision;
    if (decision !== 'approved' && decision !== 'rejected' && decision !== 'changes_needed')
      throw new BadRequestException('Decision must be approved, rejected, or changes_needed.');

    let feedbackItems: Array<{
      text: string;
      reviewArrangements: { venueIds: string[]; equipmentIds: string[] };
    }> = [];
    if (decision === 'rejected') {
      const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
      if (!reason) throw new BadRequestException('A reason is required for rejection.');
      feedbackItems = [{ text: reason, reviewArrangements: { venueIds: [], equipmentIds: [] } }];
    } else if (decision === 'changes_needed') {
      const hasChanges = !!input && Object.prototype.hasOwnProperty.call(input, 'changes');
      const hasReason = !!input && Object.prototype.hasOwnProperty.call(input, 'reason');
      if (hasChanges && hasReason)
        throw new BadRequestException('Send changes as rows, not a legacy reason.');
      if (hasReason)
        throw new BadRequestException('Each requested change must identify at least one arrangement for review.');

      if (hasChanges) {
        if (!Array.isArray(input?.changes))
          throw new BadRequestException('Changes must be a non-empty array of descriptions.');
        if (input.changes.length === 0)
          throw new BadRequestException('Add at least one change.');
        feedbackItems = input.changes.map((change, index) => {
          if (!change || typeof change !== 'object' || Array.isArray(change))
            throw new BadRequestException(`Change ${index + 1} must include a description and arrangement selections.`);
          const row = change as { text?: unknown; venueIds?: unknown; equipmentIds?: unknown };
          if (typeof row.text !== 'string' || !row.text.trim())
            throw new BadRequestException(`Change ${index + 1} must include a nonblank description.`);
          const venueIds = row.venueIds ?? [];
          const equipmentIds = row.equipmentIds ?? [];
          if (!Array.isArray(venueIds) || !venueIds.every((id) => typeof id === 'string') ||
              !Array.isArray(equipmentIds) || !equipmentIds.every((id) => typeof id === 'string'))
            throw new BadRequestException(`Change ${index + 1} has invalid arrangement selections.`);
          if (venueIds.length + equipmentIds.length === 0)
            throw new BadRequestException(`Change ${index + 1} must select at least one arrangement for review.`);
          return { text: row.text, reviewArrangements: { venueIds, equipmentIds } };
        });
      } else {
        throw new BadRequestException('Add at least one change and select arrangements for review.');
      }
    }

    return this.database.transaction(async (client) => {
      // Match requestSafetyCheck's event -> arrangement rows -> safety-check lock order.
      const event = await client.query<Pick<PendingEventRow, 'id' | 'event_name' | 'equipment_needs' | 'equipment_confirmed_at'> & { coordinator_id: string | null }>(
        `SELECT id, event_name, equipment_needs, equipment_confirmed_at, coordinator_id FROM events
          WHERE id = $1 AND status = 'Planning' FOR UPDATE`, [eventId],
      );
      if (!event.rows[0]) throw new ConflictException('This event is no longer awaiting a safety check.');
      const snapshot = await this.arrangements.read(client, eventId, { lock: true });
      if (!this.hasConfirmedChecklist(event.rows[0], snapshot))
        throw new ConflictException('This event is no longer awaiting a safety check.');
      const pending = await client.query<{ event_id: string }>(
        `SELECT event_id FROM event_safety_checks WHERE event_id = $1 AND status = 'pending' FOR UPDATE`, [eventId],
      );
      if (!pending.rows[0]) throw new ConflictException('This event is no longer awaiting a safety check.');

      const name = user.name?.trim() || user.email?.trim() || 'Safety Officer';
      const selectedArrangements = decision === 'rejected'
        ? {
            venueIds: snapshot.venueBookings.filter((item) => item.status === 'approved' && item.requestKind === 'booking').map((item) => item.id),
            equipmentIds: snapshot.equipment.filter((item) => item.status === 'Reserved').map((item) => item.id),
          }
        : { venueIds: [] as string[], equipmentIds: [] as string[] };
      const venueIds = new Set(snapshot.venueBookings.filter((item) => item.status === 'approved' && item.requestKind === 'booking').map((item) => item.id));
      const equipmentIds = new Set(snapshot.equipment.filter((item) => item.status === 'Reserved').map((item) => item.id));
      if (decision === 'changes_needed') {
        for (const item of feedbackItems) {
          if (item.reviewArrangements.venueIds.some((id) => !venueIds.has(id)) ||
              item.reviewArrangements.equipmentIds.some((id) => !equipmentIds.has(id)))
            throw new ConflictException('A selected arrangement is no longer part of this event.');
        }
      }
      // Keep the legacy summary column populated with the first item; coordinators resolve each child row separately.
      const feedback = feedbackItems[0]?.text ?? null;
      await client.query(
        `UPDATE event_safety_checks SET status = $2, approver_name = $3, feedback = $4, decided_at = now() WHERE event_id = $1`,
        [eventId, decision, name, feedback],
      );
      for (const feedbackItem of feedbackItems) {
        const reviewArrangements = decision === 'rejected' ? selectedArrangements : feedbackItem.reviewArrangements;
        await client.query(
          `INSERT INTO safety_check_feedback_items (event_id, feedback_text, review_arrangements) VALUES ($1, $2, $3::jsonb)`,
          [eventId, feedbackItem.text, JSON.stringify(reviewArrangements)],
        );
      }
      if (event.rows[0].coordinator_id) {
        await client.query(
          `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)
           VALUES ($1, $2, 'coordinator_safety_response', $3, $4)`,
          [randomUUID(), event.rows[0].coordinator_id, `The Safety Officer responded to the safety check for ${event.rows[0].event_name}.`, eventId],
        );
      }
      return { eventId, status: decision };
    });
  }

  private async pendingCandidate(db: Queryable, eventId: string) {
    const result = await db.query<PendingEventRow>(`${PENDING_EVENTS_SQL} AND e.id = $1`, [eventId]);
    return result.rows[0];
  }

  private async hasConfirmedArrangements(db: Queryable, event: PendingEventRow) {
    const snapshot = await this.arrangements.read(db, event.id, { lock: false });
    return this.hasConfirmedChecklist(event, snapshot);
  }

  private hasConfirmedChecklist(event: Pick<PendingEventRow, 'equipment_needs' | 'equipment_confirmed_at'>, snapshot: Awaited<ReturnType<ArrangementsReader['read']>>) {
    const checklist = buildChecklist({
      snapshot,
      equipmentNeeds: event.equipment_needs,
      equipmentConfirmedAt: event.equipment_confirmed_at,
      safety: { status: 'pending' },
      now: this.clock.now(),
    });
    return checklist.canRequestSafetyCheck;
  }

  private requireSafetyOfficer(identity: AuthenticatedUser | undefined) {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    if (!identity.roles.includes('SAFETY_OFFICER')) throw new ForbiddenException('Safety Officer access required.');
    return identity;
  }
}
