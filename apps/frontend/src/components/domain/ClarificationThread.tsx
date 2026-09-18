import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/FormControls";
import { ApiError } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
import type { EventComment } from "@/types";

/**
 * SPM-39 chronological clarification/amendment thread on the event detail
 * page. Coordinators assigned to the event can open a clarification;
 * the event's organiser can reply, clearing the "awaiting reply" indicator.
 */
export function ClarificationThread({
  comments,
  canRequestClarification,
  onSubmitClarification,
  canReply,
  onSubmitReply,
}: {
  comments: EventComment[];
  canRequestClarification: boolean;
  onSubmitClarification: (message: string) => Promise<void>;
  canReply: boolean;
  onSubmitReply: (clarificationId: string, message: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyError, setReplyError] = useState("");
  const [replying, setReplying] = useState(false);

  if (!canRequestClarification && !canReply && comments.length === 0) {
    return null;
  }

  const submitClarification = async () => {
    if (!draft.trim()) {
      setDraftError("Clarification message cannot be blank.");
      return;
    }
    setDraftError("");
    setSubmitting(true);
    try {
      await onSubmitClarification(draft.trim());
      setDraft("");
    } catch (error) {
      setDraftError(error instanceof ApiError ? error.message : "Could not send clarification.");
    } finally {
      setSubmitting(false);
    }
  };

  const startReply = (clarificationId: string) => {
    setReplyTargetId(clarificationId);
    setReplyDraft("");
    setReplyError("");
  };

  const cancelReply = () => {
    setReplyTargetId(null);
    setReplyDraft("");
    setReplyError("");
  };

  const submitReply = async (clarificationId: string) => {
    if (!replyDraft.trim()) {
      setReplyError("Reply message cannot be blank.");
      return;
    }
    setReplyError("");
    setReplying(true);
    try {
      await onSubmitReply(clarificationId, replyDraft.trim());
      cancelReply();
    } catch (error) {
      setReplyError(error instanceof ApiError ? error.message : "Could not send reply.");
    } finally {
      setReplying(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Comments &amp; Clarifications</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No comments yet.</p>
        ) : (
          <ul className="space-y-4">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="border-b border-gray-100 dark:border-gray-800 pb-4 last:border-0 last:pb-0"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {comment.authorName}{" "}
                  <span className="font-normal text-gray-400 dark:text-gray-500">
                    ({comment.authorRole === "coordinator" ? "Coordinator" : "Organiser"}) ·{" "}
                    {formatDateTime(comment.createdAt)}
                  </span>
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">&ldquo;{comment.message}&rdquo;</p>

                {comment.type === "clarification" && comment.awaitingReply && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning-100 dark:bg-warning-900/30 px-2.5 py-0.5 text-xs font-medium text-warning-800 dark:text-warning-300">
                    ⏳ Awaiting Organiser&rsquo;s reply
                  </span>
                )}

                {canReply && comment.type === "clarification" && comment.awaitingReply && (
                  <div className="mt-3">
                    {replyTargetId === comment.id ? (
                      <div className="space-y-2">
                        <TextArea
                          label="Reply"
                          value={replyDraft}
                          onChange={(e) => setReplyDraft(e.target.value)}
                          error={replyError}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={replying} onClick={() => submitReply(comment.id)}>
                            {replying ? "Sending…" : "Send Reply"}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={cancelReply}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => startReply(comment.id)}>
                        Reply
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canRequestClarification && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <TextArea
              label="Request clarification or amendment"
              placeholder="Type a clarification or amendment request…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              error={draftError}
            />
            <Button disabled={submitting} onClick={submitClarification}>
              {submitting ? "Sending…" : "Send"}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
