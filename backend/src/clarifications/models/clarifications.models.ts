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
