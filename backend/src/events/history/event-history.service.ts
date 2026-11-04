/*
 * SPM-157 Audit History of Important Actions: who may read an event's history and which sections.
 *
 *   assigned Coordinator (now)  event, venue bookings, equipment and registrations   (AC1 to AC4, AC7)
 *   owning Organiser            event and registrations                                (AC8)
 *   anyone else                 403, including a previous Coordinator                 (AC9, SPM-47 AC6)
 *   unknown or malformed id     404
 *
 * The same rule as SPM-148's status history (StatusService.statusHistory). Read-only: the history
 * cannot be changed through the API (AC10, the controller answers 405) or in the database (append-only
 * trigger).
 */
import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { UUID_PATTERN } from '../../common/uuid.js';
import { buildSections } from './event-history.mapper.js';
import { EventHistoryRepository, type AuditSections } from './event-history.repository.js';
import { HISTORY_MESSAGES } from './event-history.messages.js';
import type { EventHistoryResponse, HistoryViewer } from './event-history.types.js';

const COORDINATOR_SECTIONS: AuditSections = ['event', 'venue_booking', 'equipment', 'registration'];
const ORGANISER_SECTIONS: AuditSections = ['event', 'registration'];

@Injectable()
export class EventHistoryService {
  constructor(
    private readonly repository: EventHistoryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async history(identity: AuthenticatedUser | undefined, eventId: string): Promise<EventHistoryResponse> {
    if (!identity) throw new UnauthorizedException(HISTORY_MESSAGES.signIn);
    if (!UUID_PATTERN.test(eventId)) throw new NotFoundException(HISTORY_MESSAGES.notFound);
    const event = await this.repository.findEvent(eventId);
    if (!event) throw new NotFoundException(HISTORY_MESSAGES.notFound);

    const viewer = viewerOf(identity, event);
    if (!viewer) throw new ForbiddenException({ code: 'FORBIDDEN', message: HISTORY_MESSAGES.notAllowed });

    const sources = await this.repository.readSources(
      eventId,
      viewer === 'coordinator' ? COORDINATOR_SECTIONS : ORGANISER_SECTIONS,
      this.clock.now(),
    );
    const sections = buildSections(sources);
    return {
      eventId: event.id,
      eventName: event.event_name,
      eventStatus: event.status,
      viewer,
      sections: viewer === 'coordinator'
        ? sections
        : { event: sections.event, registrations: sections.registrations },
    };
  }
}

/** The assigned Coordinator's view wins for a user who is also the owning Organiser. */
export function viewerOf(
  identity: AuthenticatedUser,
  event: { organiser_id: string; coordinator_id: string | null },
): HistoryViewer | undefined {
  if (identity.roles.includes('COORDINATOR') && event.coordinator_id === identity.uid) return 'coordinator';
  if (identity.roles.includes('ORGANISER') && event.organiser_id === identity.uid) return 'organiser';
  return undefined;
}
