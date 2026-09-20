/*
 * Raw SQL for the clarification/reply thread and its related event and
 * notification rows. Callers are responsible for wrapping multi-statement
 * writes in a DatabaseService.transaction().
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { DatabaseService } from '../database/database.service.js';

export interface EventForReview {
  id: string;
  event_name: string;
  status: string;
  organiser_id: string;
  coordinator_id: string | null;
}

export interface CommentRow {
  id: string;
  event_id: string;
  parent_id: string | null;
  type: 'clarification' | 'reply';
  author_id: string;
  author_name: string;
  author_role: 'coordinator' | 'organiser';
  message: string;
  awaiting_reply: boolean;
  resolved: boolean;
  created_at: Date;
}

export interface InsertCommentInput {
  eventId: string;
  parentId: string | null;
  type: 'clarification' | 'reply';
  authorId: string;
  authorName: string;
  authorRole: 'coordinator' | 'organiser';
  message: string;
  awaitingReply: boolean;
}

export interface InsertNotificationInput {
  recipientId: string;
  type: string;
  message: string;
  relatedEventId: string;
}

type Queryable = Pick<pg.PoolClient, 'query'>;

@Injectable()
export class ClarificationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async findEvent(eventId: string): Promise<EventForReview | undefined> {
    const result = await this.database.query<EventForReview>(
      `SELECT id, event_name, status, organiser_id, coordinator_id
       FROM events WHERE id = $1`,
      [eventId],
    );
    return result.rows[0];
  }

  async findEventForUpdate(
    client: Queryable,
    eventId: string,
  ): Promise<EventForReview | undefined> {
    const result = await client.query<EventForReview>(
      `SELECT id, event_name, status, organiser_id, coordinator_id
       FROM events WHERE id = $1 FOR UPDATE`,
      [eventId],
    );
    return result.rows[0];
  }

  async findClarificationForUpdate(
    client: Queryable,
    eventId: string,
    clarificationId: string,
  ): Promise<Pick<CommentRow, 'id' | 'resolved'> | undefined> {
    const result = await client.query<Pick<CommentRow, 'id' | 'resolved'>>(
      `SELECT id, resolved FROM event_comments
       WHERE id = $1 AND event_id = $2 AND type = 'clarification' FOR UPDATE`,
      [clarificationId, eventId],
    );
    return result.rows[0];
  }

  async insertComment(
    client: Queryable,
    input: InsertCommentInput,
  ): Promise<CommentRow> {
    const result = await client.query<CommentRow>(
      `INSERT INTO event_comments
       (id, event_id, parent_id, type, author_id, author_name, author_role, message, awaiting_reply)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        randomUUID(),
        input.eventId,
        input.parentId,
        input.type,
        input.authorId,
        input.authorName,
        input.authorRole,
        input.message,
        input.awaitingReply,
      ],
    );
    return result.rows[0];
  }

  async updateEventStatus(
    client: Queryable,
    eventId: string,
    status: string,
  ): Promise<void> {
    await client.query('UPDATE events SET status = $2, updated_at = now() WHERE id = $1', [
      eventId,
      status,
    ]);
  }

  async resolveClarification(
    client: Queryable,
    clarificationId: string,
  ): Promise<CommentRow> {
    const result = await client.query<CommentRow>(
      `UPDATE event_comments SET resolved = true, awaiting_reply = false
       WHERE id = $1 RETURNING *`,
      [clarificationId],
    );
    return result.rows[0];
  }

  async insertNotification(
    client: Queryable,
    input: InsertNotificationInput,
  ): Promise<void> {
    await client.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), input.recipientId, input.type, input.message, input.relatedEventId],
    );
  }

  async listComments(eventId: string): Promise<CommentRow[]> {
    const result = await this.database.query<CommentRow>(
      'SELECT * FROM event_comments WHERE event_id = $1 ORDER BY created_at ASC',
      [eventId],
    );
    return result.rows;
  }
}
