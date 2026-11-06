import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { deferred } from "@/test/deferred";
import { VenueUnavailabilityHistory, type VenueUnavailabilityHistoryEntry } from "./VenueUnavailabilityHistory";

/*
 * SPM-125 AC1: the venue's unavailability history card. Frontend unit tests with the API stubbed; no live login
 * (the card itself is only rendered for Venue Staff by the venue record page).
 */

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);
const venueId = "00000000-0000-4000-8000-000000000125";

const created: VenueUnavailabilityHistoryEntry = {
  id: "h-1",
  periodId: "period-1",
  action: "created",
  start: "2026-10-08T03:00:00.000Z",
  end: "2026-10-08T05:00:00.000Z",
  reason: "Maintenance",
  changedBy: "Venue Staff 1",
  changedAt: "2026-10-01T02:30:00.000Z",
};
const endedEarly: VenueUnavailabilityHistoryEntry = {
  ...created,
  id: "h-2",
  action: "ended_early",
  end: "2026-10-08T04:00:00.000Z",
  previousEnd: "2026-10-08T05:00:00.000Z",
  changedBy: "Venue Staff 2",
  changedAt: "2026-10-08T04:00:00.000Z",
};

beforeEach(() => apiMock.mockReset());
afterEach(cleanup);

async function openHistory(refreshKey = 0) {
  const user = userEvent.setup();
  const view = render(<VenueUnavailabilityHistory venueId={venueId} refreshKey={refreshKey} />);
  await user.click(screen.getByRole("button", { name: "Show unavailability history" }));
  return { user, view };
}

describe("SPM-125 venue unavailability history", () => {
  /**
   * VEN-IMPACT-01-E (AC1): each entry shows what happened (marked unavailable or ended early), the period in
   * Singapore time, the reason, who made the change and when, newest first as the API returns them; an early end
   * also shows the end it replaced.
   * Kills: an entry missing the person, the time, the reason or the period.
   */
  it("VEN-IMPACT-01-E lists each change with its period, reason, person and time", async () => {
    apiMock.mockResolvedValue([endedEarly, created] as never);

    await openHistory();

    expect(apiMock).toHaveBeenCalledWith(`/venues/${venueId}/unavailability-history`);
    const items = within(await screen.findByRole("list", { name: "Unavailability history" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Ended early");
    expect(items[0]).toHaveTextContent("08 Oct 2026, 11:00 – 08 Oct 2026, 12:00 SGT");
    expect(items[0]).toHaveTextContent("Was due to end 08 Oct 2026, 13:00 SGT");
    expect(items[0]).toHaveTextContent("Reason: Maintenance");
    expect(items[0]).toHaveTextContent("By Venue Staff 2");
    expect(items[0].querySelector('time[datetime="2026-10-08T04:00:00.000Z"]')).toHaveTextContent("08 Oct 2026, 12:00 SGT");
    expect(items[1]).toHaveTextContent("Marked unavailable");
    expect(items[1]).toHaveTextContent("By Venue Staff 1");
    expect(items[1]).not.toHaveTextContent("Was due to end");
  });

  /** VEN-IMPACT-01-BND-2 (AC1): a period saved before the history recorded people shows "Not recorded". */
  it("VEN-IMPACT-01-BND-2 shows Not recorded for an entry without a person", async () => {
    apiMock.mockResolvedValue([{ ...created, changedBy: null }] as never);

    await openHistory();

    expect(await screen.findByText(/By Not recorded/)).toBeTruthy();
  });

  /** VEN-IMPACT-01-F (AC1): the history is read only when opened, can be hidden, and says when it is empty. */
  it("VEN-IMPACT-01-F loads only when opened and says when there is no history", async () => {
    const pending = deferred<never>();
    apiMock.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(<VenueUnavailabilityHistory venueId={venueId} refreshKey={0} />);
    expect(apiMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Show unavailability history" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading the unavailability history…");
    await act(async () => pending.resolve([] as never));
    expect(await screen.findByText("No unavailable periods have been recorded for this venue.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Hide unavailability history" }));
    expect(screen.queryByText("No unavailable periods have been recorded for this venue.")).toBeNull();
  });

  /** VEN-IMPACT-01-G (AC1): a failed read says so and Retry reads again. */
  it("VEN-IMPACT-01-G shows a load error and retries", async () => {
    apiMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([created] as never);
    const { user } = await openHistory();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the unavailability history.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Marked unavailable")).toBeTruthy();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /** VEN-IMPACT-01-H (AC1): saving or ending a period on the page (a new refreshKey) reads the history again. */
  it("VEN-IMPACT-01-H reads the history again after a change on the page", async () => {
    apiMock.mockResolvedValueOnce([created] as never).mockResolvedValueOnce([endedEarly, created] as never);
    const { view } = await openHistory(0);
    expect(await screen.findByText("Marked unavailable")).toBeTruthy();

    view.rerender(<VenueUnavailabilityHistory venueId={venueId} refreshKey={1} />);

    expect(await screen.findByText("Ended early")).toBeTruthy();
  });

  /** VEN-IMPACT-01-I (AC1): a response arriving after the card closed or the venue changed is ignored. */
  it("VEN-IMPACT-01-I ignores a late response or late failure after the card closed", async () => {
    const late = deferred<never>();
    const lateFailure = deferred<never>();
    apiMock
      .mockReturnValueOnce(late.promise)
      .mockReturnValueOnce(lateFailure.promise)
      .mockReturnValueOnce(deferred<never>().promise);
    const { user } = await openHistory();
    await user.click(screen.getByRole("button", { name: "Hide unavailability history" }));
    await user.click(screen.getByRole("button", { name: "Show unavailability history" }));
    await user.click(screen.getByRole("button", { name: "Hide unavailability history" }));

    // The card is open again (a third read is pending) when the two earlier reads settle, so a stale response or
    // failure that is not ignored would show on the open card.
    await user.click(screen.getByRole("button", { name: "Show unavailability history" }));
    await act(async () => {
      late.resolve([created] as never);
      lateFailure.reject(new Error("offline"));
    });

    expect(screen.queryByText("Marked unavailable")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
