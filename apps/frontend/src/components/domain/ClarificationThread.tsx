import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/FormControls";
import { ApiError } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
import type { EventComment } from "@/types";

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

  const [filterMode, setFilterMode] = useState<"all" | "pending">("all");

  if (!canRequestClarification && !canReply && comments.length === 0) {
    return null;
  }

  const clarifications = comments.filter((c) => c.type === "clarification");
  const pendingCount = clarifications.filter((c) => c.awaitingReply).length;

  const getThreadReplies = (clarificationId: string) => {
    return comments.filter((c) => c.parentId === clarificationId);
  };

  const getVisibleClarifications = () => {
    if (filterMode === "pending") {
      return clarifications.filter((c) => c.awaitingReply);
    }
    return clarifications;
  };

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

  const visibleThreads = getVisibleClarifications();

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Comments &amp; Clarifications</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              filterMode === "all"
                ? "bg-blue-600 text-white"
                : "bg-transparent border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterMode("pending")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              filterMode === "pending"
                ? "bg-blue-600 text-white"
                : "bg-transparent border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
          >
            Pending ({pendingCount})
          </button>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {visibleThreads.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filterMode === "pending" ? "No pending clarifications." : "No clarifications yet."}
          </p>
        ) : (
          <div className="space-y-4">
            {visibleThreads.map((clarification) => {
              const replies = getThreadReplies(clarification.id);
              const hasReplies = replies.length > 0;
              const status = clarification.awaitingReply ? "pending" : "answered";

              return (
                <div
                  key={clarification.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden dark:bg-gray-800/50"
                >
                  {/* Thread Header */}
                  <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-lg flex-shrink-0">
                        {status === "pending" ? "❓" : "✓"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {clarification.message}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {clarification.authorRole === "coordinator" ? "Coordinator" : "Organiser"} • {formatDateTime(clarification.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`ml-2 px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 flex-shrink-0 ${
                        status === "pending"
                          ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
                          : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      <span>{status === "pending" ? "⏳" : "✓"}</span>
                      {status === "pending" ? "Pending" : "Answered"}
                    </span>
                  </div>

                  {/* Thread Messages */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {/* Initial clarification message */}
                    <div className="px-4 py-3 flex gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 ${
                          clarification.authorRole === "coordinator"
                            ? "bg-blue-600"
                            : "bg-green-700"
                        }`}
                      >
                        {clarification.authorRole === "coordinator" ? "C" : "O"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {clarification.authorName}
                          </p>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                            {clarification.authorRole === "coordinator"
                              ? "Coordinator"
                              : "Organiser"}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-500 ml-auto">
                            {formatDateTime(clarification.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                          {clarification.message}
                        </p>
                      </div>
                    </div>

                    {/* Replies */}
                    {replies.map((reply) => (
                      <div
                        key={reply.id}
                        className="px-4 py-3 flex gap-3 bg-gray-50/50 dark:bg-gray-700/20"
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 ${
                            reply.authorRole === "coordinator"
                              ? "bg-blue-600"
                              : "bg-green-700"
                          }`}
                        >
                          {reply.authorRole === "coordinator" ? "C" : "O"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {reply.authorName}
                            </p>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                              {reply.authorRole === "coordinator"
                                ? "Coordinator"
                                : "Organiser"}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-500 ml-auto">
                              {formatDateTime(reply.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                            {reply.message}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Reply input */}
                    {canReply && clarification.awaitingReply && (
                      <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-700/20">
                        {replyTargetId === clarification.id ? (
                          <div className="space-y-2">
                            <TextArea
                              label="Reply"
                              value={replyDraft}
                              onChange={(e) => setReplyDraft(e.target.value)}
                              error={replyError}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={replying}
                                onClick={() => submitReply(clarification.id)}
                              >
                                {replying ? "Sending…" : "Send Reply"}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={cancelReply}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => startReply(clarification.id)}
                          >
                            Reply
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {canRequestClarification && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 mt-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Request clarification or amendment
            </label>
            <div className="space-y-2">
              <textarea
                placeholder="Type a question or clarification…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
              {draftError && (
                <p className="text-xs text-red-600 dark:text-red-400">{draftError}</p>
              )}
            </div>
            <div className="flex justify-end mt-2">
              <Button disabled={submitting} onClick={submitClarification}>
                {submitting ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
