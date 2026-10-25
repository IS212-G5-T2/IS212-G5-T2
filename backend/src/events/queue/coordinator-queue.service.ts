/*
 * SPM-48 Monitor Workspace Queue & Status. The coordinator's queue: every event assigned to the
 * signed-in coordinator (AC1, AC3), each with its status (AC2) and the queue indicators (AC5 to AC9).
 *
 * The event list itself comes from EventsService.list, which already scopes a coordinator to
 * `coordinator_id = uid` (SPM-38, SPM-123): unassigned requests, drafts (stored in event_drafts) and
 * events reassigned away (SPM-47 AC6) are never in it. This service adds the queue facts in two batch
 * queries and leaves the event records unchanged.
 */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CLOCK, systemClock, type Clock } from '../../common/clock.js';
import { DatabaseService } from '../../database/database.service.js';
import { EventsService } from '../events.service.js';
import { VENUE_UNAVAILABLE_SQL } from '../venue-unavailable.js';
import { buildQueueIndicators, parseStatusFilter, queueStatusOf, type QueueBookingFact } from './queue-indicators.js';

interface SafetyRow {
  id: string;
  safety_state: string | null;
  safety_reset: boolean;
}

interface BookingRow {
  event_id: string;
  venue_id: string;
  venue_name: string;
  venue_location: string;
  status: 'pending' | 'approved';
  hold_expires_at: Date | null;
  venue_unavailable: boolean;
}

// The one venue-unavailable rule (venue-unavailable.ts), shared with the venue summary and Confirm readiness,
// so the queue flag and the card's "(unavailable)" venue agree.
const QUEUE_BOOKINGS_SQL = `SELECT b.event_id, v.id AS venue_id, v.name AS venue_name, v.location AS venue_location, b.status, b.hold_expires_at,
         ${VENUE_UNAVAILABLE_SQL} AS venue_unavailable
    FROM venue_bookings b
    JOIN venues v ON v.id = b.venue_id
   WHERE b.event_id = ANY($1::uuid[]) AND b.status IN ('pending', 'approved')
   ORDER BY b.start_at, v.name, v.location, b.id`;

const QUEUE_SAFETY_SQL = `SELECT e.id, s.status AS safety_state, (r.event_id IS NOT NULL) AS safety_reset
    FROM events e
    LEFT JOIN event_safety_checks s ON s.event_id = e.id
    LEFT JOIN event_safety_resets r ON r.event_id = e.id
   WHERE e.id = ANY($1::uuid[]) AND e.coordinator_id = $2`;

@Injectable()
export class CoordinatorQueueService {
  constructor(
    private readonly events: EventsService,
    private readonly database: DatabaseService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async queue(identity: AuthenticatedUser | undefined, rawStatus?: unknown) {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    // MONITOR-QUEUE-01-D: the queue is the coordinator's own; every other role is refused.
    if (!identity.roles.includes('COORDINATOR'))
      throw new ForbiddenException('Coordinator access required.');
    const filter = parseStatusFilter(rawStatus);
    if (!filter.ok) throw new BadRequestException(`Unknown status filter: ${filter.unknown}.`);

    const records = await this.events.list(identity);
    const wanted = filter.statuses?.map((status) => status.toLowerCase());
    const listed = wanted ? records.filter((record) => wanted.includes(record.status)) : records;
    if (listed.length === 0) return [];

    const ids = listed.map((record) => record.id as string);
    const [safety, bookings] = await Promise.all([
      this.database.query<SafetyRow>(QUEUE_SAFETY_SQL, [ids, identity.uid]),
      this.database.query<BookingRow>(QUEUE_BOOKINGS_SQL, [ids]),
    ]);
    const safetyById = new Map(safety.rows.map((row) => [row.id, row]));
    const bookingsById = new Map<string, QueueBookingFact[]>();
    for (const row of bookings.rows) {
      const list = bookingsById.get(row.event_id) ?? [];
      list.push({
        venueId: row.venue_id,
        venueName: row.venue_name,
        venueLocation: row.venue_location,
        status: row.status,
        holdExpiresAt: row.hold_expires_at,
        venueUnavailable: row.venue_unavailable,
      });
      bookingsById.set(row.event_id, list);
    }

    const now = this.clock.now();
    return listed.flatMap((record) => {
      const facts = safetyById.get(record.id as string);
      // An event reassigned away between the two reads is no longer this coordinator's: leave it out.
      if (!facts) return [];
      return [
        {
          ...record,
          queue: buildQueueIndicators(
            {
              // The status shown on the card (first read), so its indicators never disagree with it.
              status: queueStatusOf(record.status as string),
              safetyState: facts.safety_state,
              safetyReset: facts.safety_reset,
              bookings: bookingsById.get(record.id as string) ?? [],
            },
            now,
          ),
        },
      ];
    });
  }
}
