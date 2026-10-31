import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ApiError } from "@/utils/api";
import { SafetyCheckChangesNeeded } from "@/features/events/pages/detail/planning/SafetyCheckChangesNeeded";
import { requestSafetyCheck, resolveFeedbackItem, unresolveFeedbackItem } from "@/utils/arrangements";

vi.mock("@/utils/arrangements", async (load) => {
  const original = await load<typeof import("@/utils/arrangements")>();
  return {
    ...original,
    requestSafetyCheck: vi.fn(),
    resolveFeedbackItem: vi.fn(),
    unresolveFeedbackItem: vi.fn(),
  };
});

const feedback = [
  { id: "feedback-1", text: "Provide a fire exit layout", requestedAt: "2026-10-01T00:00:00Z" },
];

function renderFeedback(overrides: Partial<ComponentProps<typeof SafetyCheckChangesNeeded>> = {}) {
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  render(
    <SafetyCheckChangesNeeded
      eventId="event-1"
      status="rejected"
      feedback={feedback}
      canRequestSafetyCheck
      onRefresh={onRefresh}
      pending={false}
      onError={onError}
      {...overrides}
    />,
  );
  return { onRefresh, onError };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SafetyCheckChangesNeeded", () => {
  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: a rejected decision and unresolved reason remain visible until coordinator resolution. */
  it("shows rejection feedback and disables another request until all feedback is resolved", () => {
    renderFeedback();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Provide a fire exit layout")).toBeInTheDocument();
    expect(screen.getByText("0 of 1 items resolved. Complete all before re-requesting.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-Request Safety Check" })).toBeDisabled();
  });

  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: changes-needed feedback retains its existing status label. */
  it("keeps the changes-needed state label", () => {
    renderFeedback({ status: "changes_needed" });
    expect(screen.getByText("Changes needed")).toBeInTheDocument();
  });

  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: resolving feedback refreshes the coordinator's safety state. */
  it("resolves feedback and refreshes the page", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderFeedback();
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(resolveFeedbackItem).toHaveBeenCalledWith("event-1", "feedback-1"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: an already resolved item can be unchecked again. */
  it("unresolves a checked item", async () => {
    const user = userEvent.setup();
    renderFeedback({ feedback: [{ ...feedback[0], resolvedByCoordinatorAt: "2026-10-02T00:00:00Z" }] });
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(unresolveFeedbackItem).toHaveBeenCalledWith("event-1", "feedback-1"));
  });

  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: once resolved, the coordinator may re-request and receives a refreshed state. */
  it("allows re-request when all feedback is resolved", async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderFeedback({ feedback: [{ ...feedback[0], resolvedByCoordinatorAt: "2026-10-02T00:00:00Z" }] });
    expect(screen.getByText("All items resolved. Safety Officer will review your changes.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Re-Request Safety Check" }));
    await waitFor(() => expect(requestSafetyCheck).toHaveBeenCalledWith("event-1"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: API refusals retain feedback and report the server message. */
  it("reports API failures while resolving feedback", async () => {
    const user = userEvent.setup();
    vi.mocked(resolveFeedbackItem).mockRejectedValueOnce(new ApiError("Feedback could not be resolved."));
    const { onError, onRefresh } = renderFeedback();
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Feedback could not be resolved."));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: generic resolution failures use the feedback fallback message. */
  it("reports generic resolution failures", async () => {
    const user = userEvent.setup();
    vi.mocked(resolveFeedbackItem).mockRejectedValueOnce(new Error("offline"));
    const { onError } = renderFeedback();
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Could not update feedback resolution."));
  });

  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: generic failures use the component fallback message. */
  it("reports generic re-request failures and respects readiness gating", async () => {
    const user = userEvent.setup();
    vi.mocked(requestSafetyCheck).mockRejectedValueOnce(new Error("offline"));
    const { onError } = renderFeedback({
      feedback: [{ ...feedback[0], resolvedByCoordinatorAt: "2026-10-02T00:00:00Z" }],
      canRequestSafetyCheck: false,
    });
    expect(screen.getByRole("button", { name: "Re-Request Safety Check" })).toBeDisabled();
    const ready = renderFeedback({ feedback: [{ ...feedback[0], resolvedByCoordinatorAt: "2026-10-02T00:00:00Z" }] });
    await user.click(screen.getAllByRole("button", { name: "Re-Request Safety Check" })[1]);
    await waitFor(() => expect(ready.onError).toHaveBeenCalledWith("Could not request the safety check."));
    expect(onError).not.toHaveBeenCalled();
  });

  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: API refusals report the server message when requesting again. */
  it("reports API re-request failures", async () => {
    const user = userEvent.setup();
    vi.mocked(requestSafetyCheck).mockRejectedValueOnce(new ApiError("Resolve all items first."));
    const { onError } = renderFeedback({ feedback: [{ ...feedback[0], resolvedByCoordinatorAt: "2026-10-02T00:00:00Z" }] });
    await user.click(screen.getByRole("button", { name: "Re-Request Safety Check" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Resolve all items first."));
  });
});
