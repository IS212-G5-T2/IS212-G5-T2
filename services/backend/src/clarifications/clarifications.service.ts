/*
 * SPM-39: Coordinator clarification/amendment requests. Coordinators open a
 * clarification thread on an event assigned to them; the event's Organiser
 * replies. See services/backend/HANDOVER.md for the known limits of the
 * ownership checks here (they depend on events.organiser_id/coordinator_id
 * holding real Firebase uids, which EventsService's demo identity does not
 * yet guarantee).
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { validateMessage } from './clarification-input.js';
import {
  ClarificationsRepository,
  type CommentRow,
  type EventForReview,
} from './clarifications.repository.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Statuses a clarification request may be opened from; submitting one always
// force-sets the event to Under_Review regardless of which of these it came from.
const CLARIFIABLE_STATUSES = ['Submitted', 'Under_Review', 'Approved'];

export interface CommentDto {
  id: string;
  eventId: string;
  parentId: string | null;
  type: 'clarification' | 'reply';
  authorId: string;
  authorName: string;
  authorRole: 'coordinator' | 'organiser';
  message: string;
  awaitingReply: boolean;
  createdAt: string;
}

@Injectable()
export class ClarificationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: ClarificationsRepository,
  ) {}

  async createClarification(
    eventId: string,
    user: AuthenticatedUser,
    body: unknown,
  ): Promise<CommentDto> {
    this.requireValidEventId(eventId);
    const message = validateMessage(body, 'Clarification message cannot be blank.');

    return this.database.transaction(async (client) => {
      const event = await this.repository.findEventForUpdate(client, eventId);
      if (!event) throw new NotFoundException('Event not found.');

      this.requireAssignedCoordinator(event, user);

      if (!CLARIFIABLE_STATUSES.includes(event.status)) {
        throw new BadRequestException(
          "Clarification requests aren't allowed while the event is in its current status.",
        );
      }

      const comment = await this.repository.insertComment(client, {
        eventId,
        parentId: null,
        type: 'clarification',
        authorId: user.uid,
        authorName: this.displayName(user),
        authorRole: 'coordinator',
        message,
        awaitingReply: true,
      });

      await this.repository.updateEventStatus(client, eventId, 'Under_Review');

      await this.repository.insertNotification(client, {
        recipientId: event.organiser_id,
        type: 'clarification',
        message: `Clarification requested on "${event.event_name}".`,
        relatedEventId: eventId,
      });

      return this.toDto(comment);
    });
  }

  async reply(
    eventId: string,
    clarificationId: string,
    user: AuthenticatedUser,
    body: unknown,
  ): Promise<CommentDto> {
    this.requireValidEventId(eventId);
    if (!UUID_PATTERN.test(clarificationId)) {
      throw new NotFoundException('Clarification request not found.');
    }
    const message = validateMessage(body, 'Reply message cannot be blank.');

    return this.database.transaction(async (client) => {
      const event = await this.repository.findEventForUpdate(client, eventId);
      if (!event) throw new NotFoundException('Event not found.');

      this.requireOrganiser(event, user);

      const clarification = await this.repository.findClarificationForUpdate(
        client,
        eventId,
        clarificationId,
      );
      if (!clarification) {
        throw new NotFoundException('Clarification request not found.');
      }

      const reply = await this.repository.insertComment(client, {
        eventId,
        parentId: clarificationId,
        type: 'reply',
        authorId: user.uid,
        authorName: this.displayName(user),
        authorRole: 'organiser',
        message,
        awaitingReply: false,
      });

      await this.repository.clearAwaitingReply(client, clarificationId);

      if (event.coordinator_id) {
        await this.repository.insertNotification(client, {
          recipientId: event.coordinator_id,
          type: 'clarification_reply',
          message: `The organiser replied on "${event.event_name}".`,
          relatedEventId: eventId,
        });
      }

      return this.toDto(reply);
    });
  }

  async listComments(eventId: string, user: AuthenticatedUser): Promise<CommentDto[]> {
    this.requireValidEventId(eventId);
    const event = await this.repository.findEvent(eventId);
    if (!event) throw new NotFoundException('Event not found.');

    const isOrganiser =
      user.roles.includes('ORGANISER') && event.organiser_id === user.uid;
    const isAssignedCoordinator =
      user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid;

    if (!isOrganiser && !isAssignedCoordinator) {
      throw new ForbiddenException(
        "You don't have access to this event's comment history.",
      );
    }

    const rows = await this.repository.listComments(eventId);
    return rows.map((row) => this.toDto(row));
  }

  private requireValidEventId(eventId: string): void {
    if (!UUID_PATTERN.test(eventId)) {
      throw new NotFoundException('Event not found.');
    }
  }

  // AC9: a coordinator may only act on an event assigned to them. Ownership
  // is checked directly against events.coordinator_id rather than through
  // RbacRepository's predicate builder, matching the 'Event Review' resource's
  // create permission (COORDINATOR-only) that RBAC already grants.
  private requireAssignedCoordinator(
    event: EventForReview,
    user: AuthenticatedUser,
  ): void {
    if (!user.roles.includes('COORDINATOR') || event.coordinator_id !== user.uid) {
      throw new ForbiddenException(
        'Only the coordinator assigned to this event can request clarification.',
      );
    }
  }

  // The RBAC seed only grants ORGANISER "read" on the Event Review resource,
  // not "update" (that action is COORDINATOR-only) - see 002_rbac.sql. A
  // reply is authored by the organiser, not a coordinator-side review
  // action, so it's authorized directly against events.organiser_id instead
  // of going through RbacRepository's predicate, per the fallback documented
  // in RbacRepository's usage notes.
  private requireOrganiser(event: EventForReview, user: AuthenticatedUser): void {
    if (!user.roles.includes('ORGANISER') || event.organiser_id !== user.uid) {
      throw new ForbiddenException(
        "Only this event's organiser can reply to a clarification request.",
      );
    }
  }

  private displayName(user: AuthenticatedUser): string {
    return user.name ?? user.email ?? user.uid;
  }

  private toDto(row: CommentRow): CommentDto {
    return {
      id: row.id,
      eventId: row.event_id,
      parentId: row.parent_id,
      type: row.type,
      authorId: row.author_id,
      authorName: row.author_name,
      authorRole: row.author_role,
      message: row.message,
      awaitingReply: row.awaiting_reply,
      createdAt: row.created_at.toISOString(),
    };
  }
}
