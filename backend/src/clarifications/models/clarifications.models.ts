/** Event columns needed to authorize and process clarification workflows. */
export interface EventForReview {
  id: string;
  event_name: string;
  status: string;
  organiser_id: string;
  coordinator_id: string | null;
}

/** Database row shape returned for a clarification or reply. */
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

/** Values used to insert a clarification or reply row. */
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

/** Values used to enqueue an event notification. */
export interface InsertNotificationInput {
  recipientId: string;
  type: string;
  message: string;
  relatedEventId: string;
}
