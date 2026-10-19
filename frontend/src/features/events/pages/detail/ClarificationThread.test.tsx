/*
 * SPM-39 clarification thread, component level. Props are passed directly, so each branch of the component is
 * reached without the page around it. The page-level behaviour is in EventDetailPage.clarifications.test.tsx.
 *   REQ-CLAR-01-B (AC2): a blank clarification or reply is refused with an error, and nothing is sent.
 *   REQ-CLAR-02-A (AC3, AC4): the thread shows the author's role and can be filtered.
 *   REQ-CLAR-02-B (AC5): an open clarification is shown as Pending and can be resolved.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClarificationThread } from "@/features/events/pages/detail/ClarificationThread";
import { ApiError } from "@/utils/api";
import type { EventComment } from "@/types";

function comment(overrides: Partial<EventComment> = {}): EventComment {
  return {
    id: "comment-1",
    eventId: "event-1",
    parentId: null,
    type: "clarification",
    authorId: "coordinator-1",
    authorName: "Marcus Lee",
    authorRole: "coordinator",
    message: "Please confirm whether livestream needs a second camera angle.",
    awaitingReply: true,
    resolved: false,
    createdAt: "2026-09-18T13:05:00.000Z",
    ...overrides,
  };
}

function renderThread(props: Partial<Parameters<typeof ClarificationThread>[0]> = {}) {
  const handlers = {
    onSubmitClarification: vi.fn().mockResolvedValue(undefined),
    onSubmitReply: vi.fn().mockResolvedValue(undefined),
    onResolve: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <ClarificationThread
      comments={[]}
      canRequestClarification={true}
      canReply={false}
      canResolve={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

afterEach(() => {
  cleanup();
});

describe("ClarificationThread: sending a clarification (SPM-39 AC2)", () => {
  // REQ-CLAR-01-B. Kills: a blank draft sent to the server, or the error text changed.
  it("REQ-CLAR-01-B: a blank draft shows the required-message error and sends nothing", async () => {
    const user = userEvent.setup({ delay: null });
    const { onSubmitClarification } = renderThread();

    await user.type(screen.getByPlaceholderText("Type a question or clarification…"), "   ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Clarification message is required")).toBeInTheDocument();
    expect(onSubmitClarification).not.toHaveBeenCalled();
  });

  // Kills: a server error message replaced by the generic text.
  it("shows the server's message when the clarification is rejected with an ApiError", async () => {
    const user = userEvent.setup({ delay: null });
    const rejected = vi.fn().mockRejectedValue(new ApiError("This event is not open for clarifications."));
    renderThread({ onSubmitClarification: rejected });

    await user.type(screen.getByPlaceholderText("Type a question or clarification…"), "Please confirm.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("This event is not open for clarifications.")).toBeInTheDocument();
    expect(rejected).toHaveBeenCalledWith("Please confirm.");
  });

  // Kills: an unexpected failure shown as the server's text, or no fallback text at all.
  it("shows the fallback text when the clarification fails with a non-API error", async () => {
    const user = userEvent.setup({ delay: null });
    renderThread({ onSubmitClarification: vi.fn().mockRejectedValue(new Error("network down")) });

    await user.type(screen.getByPlaceholderText("Type a question or clarification…"), "Please confirm.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Could not send clarification.")).toBeInTheDocument();
  });
});

describe("ClarificationThread: replying (SPM-39 AC2, AC5)", () => {
  // Kills: a blank reply sent, or the reply error text changed.
  it("a blank reply shows the reply error and sends nothing", async () => {
    const user = userEvent.setup({ delay: null });
    const { onSubmitReply } = renderThread({ comments: [comment()], canReply: true });

    await user.click(screen.getByRole("button", { name: "Reply" }));
    await user.click(screen.getByRole("button", { name: "Send Reply" }));

    expect(await screen.findByText("Reply message cannot be blank.")).toBeInTheDocument();
    expect(onSubmitReply).not.toHaveBeenCalled();
  });

  // Kills: a reply failure with an API message not shown, or the fallback missing.
  it("shows the server's message for a rejected reply, and the fallback for any other failure", async () => {
    const user = userEvent.setup({ delay: null });
    renderThread({
      comments: [comment()],
      canReply: true,
      onSubmitReply: vi.fn().mockRejectedValue(new ApiError("This clarification is already resolved.")),
    });

    await user.click(screen.getByRole("button", { name: "Reply" }));
    await user.type(screen.getByLabelText("Reply"), "Yes.");
    await user.click(screen.getByRole("button", { name: "Send Reply" }));

    expect(await screen.findByText("This clarification is already resolved.")).toBeInTheDocument();
  });

  it("shows the reply fallback text when a reply fails with a non-API error", async () => {
    const user = userEvent.setup({ delay: null });
    renderThread({
      comments: [comment()],
      canReply: true,
      onSubmitReply: vi.fn().mockRejectedValue(new Error("timeout")),
    });

    await user.click(screen.getByRole("button", { name: "Reply" }));
    await user.type(screen.getByLabelText("Reply"), "Yes.");
    await user.click(screen.getByRole("button", { name: "Send Reply" }));

    expect(await screen.findByText("Could not send reply.")).toBeInTheDocument();
  });
});

describe("ClarificationThread: resolving (SPM-39 AC5)", () => {
  // Kills: the resolve error not shown, or the button stuck in "Resolving…" after a failure.
  it("shows the server's message when resolving fails with an ApiError, and the button recovers", async () => {
    const user = userEvent.setup({ delay: null });
    renderThread({
      comments: [comment()],
      canResolve: true,
      onResolve: vi.fn().mockRejectedValue(new ApiError("Only the organiser or assigned coordinator can resolve this.")),
    });

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(
      await screen.findByText("Only the organiser or assigned coordinator can resolve this."),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Resolve" })).toBeEnabled());
  });

  it("shows the resolve fallback text when resolving fails with a non-API error", async () => {
    const user = userEvent.setup({ delay: null });
    renderThread({
      comments: [comment()],
      canResolve: true,
      onResolve: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(await screen.findByText("Could not resolve clarification.")).toBeInTheDocument();
  });
});

describe("ClarificationThread: filtering and labels (SPM-39 AC4, AC5)", () => {
  const open = comment({ id: "open-1", message: "Open question about layout." });
  const closed = comment({
    id: "closed-1",
    message: "Closed question about parking.",
    resolved: true,
    awaitingReply: false,
  });

  // Kills: the Pending filter showing resolved clarifications, or All hiding them.
  it("the Pending filter hides resolved clarifications and All shows them again", async () => {
    const user = userEvent.setup({ delay: null });
    renderThread({ comments: [open, closed] });

    expect(screen.getAllByText("Closed question about parking.").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /^Pending/ }));
    expect(screen.getAllByText("Open question about layout.").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Closed question about parking.")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByText("Closed question about parking.").length).toBeGreaterThan(0);
  });

  // Kills: the empty message for the Pending filter missing, or the wrong empty message shown.
  it("shows the pending empty message when nothing is pending, and the general one when there are no clarifications", async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(
      <ClarificationThread
        comments={[closed]}
        canRequestClarification={true}
        canReply={false}
        canResolve={false}
        onSubmitClarification={vi.fn()}
        onSubmitReply={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^Pending/ }));
    expect(screen.getByText("No pending clarifications.")).toBeInTheDocument();
    unmount();

    renderThread({ comments: [] });
    expect(screen.getByText("No clarifications yet.")).toBeInTheDocument();
  });

  // Kills: the role label swapped, so a Coordinator's question reads as the Organiser's.
  it("labels each clarification with its author's role", () => {
    renderThread({ comments: [open] });
    expect(screen.getByText(/^Coordinator •/)).toBeInTheDocument();
    expect(screen.queryByText(/^Organiser •/)).not.toBeInTheDocument();
  });

  // Kills: the thread rendered for a user with no permission and no comments.
  it("renders nothing for a user who cannot ask or reply and there is no thread", () => {
    const { container } = render(
      <ClarificationThread
        comments={[]}
        canRequestClarification={false}
        canReply={false}
        canResolve={false}
        onSubmitClarification={vi.fn()}
        onSubmitReply={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ClarificationThread: a Coordinator's reply", () => {
  // REQ-CLAR-02-A (AC4): a reply is labelled with its author's role. Kills: the Coordinator label replaced by
  // Organiser on a reply, or the reply hidden from the thread.
  it("labels a reply written by the Coordinator as Coordinator", () => {
    const reply = comment({
      id: "reply-2",
      parentId: "comment-1",
      type: "reply",
      authorId: "coordinator-1",
      authorName: "Marcus Lee",
      authorRole: "coordinator",
      message: "Thanks, I will check the camera.",
      awaitingReply: false,
    });
    renderThread({ comments: [comment(), reply], canReply: true });
    expect(screen.getByText("Thanks, I will check the camera.")).toBeInTheDocument();
    // One role label for the clarification header and one for the reply; neither says Organiser.
    expect(screen.getAllByText("Coordinator", { selector: "span" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText("Organiser", { selector: "span" })).toHaveLength(0);
  });

  /** SPM-39 AC2: an organiser's comment is labelled as the organiser, with the organiser avatar. */
  it("labels an organiser comment as the organiser and shows the organiser avatar", () => {
    renderThread({ comments: [comment({ authorRole: "organiser", authorName: "Priya Nair" })] });
    expect(screen.getByText("O")).toBeTruthy();
    expect(screen.getByText("Organiser", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Priya Nair")).toBeTruthy();
  });

  /** SPM-39 AC2: a coordinator's comment is labelled as the coordinator, with the coordinator avatar. */
  it("labels a coordinator comment as the coordinator and shows the coordinator avatar", () => {
    renderThread({ comments: [comment()] });
    expect(screen.getByText("C")).toBeTruthy();
    expect(screen.getByText("Coordinator", { selector: "span" })).toBeTruthy();
  });
});
