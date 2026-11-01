import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompleteEventPanel } from "@/features/events/pages/detail/planning/CompleteEventPanel";
import { ApiError, api } from "@/utils/api";

/*
 * SPM-153 Mark as Completed, frontend. The HTTP layer is the boundary (mocked); the action, its states and its texts
 * are real. Literals are the catalogue wording (MSG-CP-01, MSG-CP-02) and the completed line. The clock is faked:
 * the button enables itself at the end instant without a reload (BR10).
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000301";
const END = "2026-10-10T04:00:00.000Z"; // ended before the suite clock below
const BEFORE_END = new Date("2026-10-10T03:59:59.000Z");
const AT_END = new Date("2026-10-10T04:00:00.000Z");

const MSG_TOO_EARLY = "An event can only be marked as Completed after its event date has passed.";
const MSG_COMPLETED = "This event has been marked as completed.";

function renderPanel(overrides: Partial<Parameters<typeof CompleteEventPanel>[0]> = {}) {
  const onCompleted = vi.fn();
  render(
    <CompleteEventPanel
      eventId={EVENT_ID}
      status="confirmed"
      endDateTime={END}
      isAssignedCoordinator
      onCompleted={onCompleted}
      {...overrides}
    />,
  );
  return { onCompleted };
}

describe("SPM-153 Mark as Completed (action)", () => {
  beforeEach(() => {
    // The clock moves on its own so that async waits (findBy, userEvent) can progress.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // COMPLETE-EVENT-01-B (FE): before the end instant the button is disabled and says why.
  it("COMPLETE-EVENT-01-B: shows the reason and disables the button before the event has ended", () => {
    vi.setSystemTime(BEFORE_END);
    renderPanel();

    expect(screen.getByRole("button", { name: "Mark as Completed" })).toBeDisabled();
    expect(screen.getByText(MSG_TOO_EARLY)).toBeInTheDocument();
  });

  // COMPLETE-EVENT-01-C (FE): the button becomes available at the end instant, without a reload.
  it("COMPLETE-EVENT-01-C: enables the button at the end instant with no reload", () => {
    vi.setSystemTime(BEFORE_END);
    renderPanel();

    act(() => {
      vi.setSystemTime(AT_END);
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByRole("button", { name: "Mark as Completed" })).toBeEnabled();
    expect(screen.queryByText(MSG_TOO_EARLY)).not.toBeInTheDocument();
  });

  // COMPLETE-EVENT-01-A (FE): the click sends the status change; the button is replaced by the completed line.
  it("COMPLETE-EVENT-01-A: marks the event Completed and states it in place of the button", async () => {
    vi.setSystemTime(AT_END);
    apiMock.mockResolvedValue({
      eventId: EVENT_ID,
      status: "Completed",
      message: "Product Launch Mixer has been marked as Completed.",
    });
    const user = userEvent.setup();
    const { onCompleted } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Mark as Completed" }));

    expect(apiMock).toHaveBeenCalledWith(
      `/events/${EVENT_ID}/status-change`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ targetStatus: "Completed" }) }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(MSG_COMPLETED);
    expect(screen.queryByRole("button", { name: "Mark as Completed" })).not.toBeInTheDocument();
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  // COMPLETE-EVENT-01-B (added, FE): the client clock says ended but the server refuses; the server wins.
  it("COMPLETE-EVENT-01-B: shows the server's refusal and keeps the button disabled when the client clock is ahead", async () => {
    vi.setSystemTime(AT_END);
    apiMock.mockRejectedValue(
      new ApiError("An event can only be marked as Completed after its event date has passed.", undefined, "EVENT_NOT_ENDED", 422),
    );
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Mark as Completed" }));

    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Mark as Completed" })).toBeDisabled();
    // The standing reason carries the server's sentence; it is not repeated as an alert.
    expect(screen.getByText(MSG_TOO_EARLY)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // COMPLETE-EVENT-02-B (FE) and 01-D (FE): the button is not shown for other statuses or other users.
  it.each([
    ["a Planning event", { status: "planning" }],
    ["a Cancelled event", { status: "cancelled" }],
    ["an event not assigned to this coordinator", { isAssignedCoordinator: false }],
  ])("COMPLETE-EVENT-02-B: does not render the button for %s", (_label, overrides) => {
    vi.setSystemTime(AT_END);
    renderPanel(overrides);

    expect(screen.queryByRole("button", { name: "Mark as Completed" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // The completed line is shown to any viewer of a Completed event, and no button is offered.
  it("SPM-153 AC2/AC3: a Completed event states it to any viewer and offers no button", () => {
    renderPanel({ status: "completed", isAssignedCoordinator: false });

    expect(screen.getByRole("status")).toHaveTextContent(MSG_COMPLETED);
    expect(screen.queryByRole("button", { name: "Mark as Completed" })).not.toBeInTheDocument();
  });

  // COMPLETE-EVENT-02-E (FE): a double click sends one request.
  it("COMPLETE-EVENT-02-E: a double click sends one request", async () => {
    vi.setSystemTime(AT_END);
    apiMock.mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    renderPanel();

    const button = screen.getByRole("button", { name: "Mark as Completed" });
    await user.dblClick(button);

    expect(apiMock).toHaveBeenCalledTimes(1);
  });
});
