import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { deferred } from "@/test/deferred";
import { VenueBookingHistory } from "./VenueBookingHistory";
import { bookingHistoryStatus, type VenueBookingHistoryEntry } from "./bookingHistory";

/*
 * SPM-125 AC5: the venue's booking history card. Frontend unit tests with the API stubbed and the clock fixed; no live
 * login (the card is only rendered for Venue Staff by the venue record page).
 */

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);
const venueId = "00000000-0000-4000-8000-000000000125";
const NOW = Date.parse("2030-01-10T12:00:00.000Z");

function entry(overrides: Partial<VenueBookingHistoryEntry> = {}): VenueBookingHistoryEntry {
  return {
    id: "b-1",
    bookingReference: "VB-B1000001",
    eventId: "event-1",
    eventName: "Welcome Evening",
    coordinatorName: "Coordinator 1",
    start: "2030-01-12T04:00:00.000Z",
    end: "2030-01-12T05:00:00.000Z",
    status: "approved",
    requestKind: "booking",
    affectedByUnavailablePeriod: false,
    requestedAt: "2029-12-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  apiMock.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openHistory(refreshKey = 0) {
  const user = userEvent.setup();
  const view = render(<VenueBookingHistory venueId={venueId} refreshKey={refreshKey} />);
  await user.click(screen.getByRole("button", { name: "Show booking history" }));
  return { user, view };
}

describe("SPM-125 venue booking history", () => {
  /**
   * VEN-IMPACT-05-C (AC5): every booking and hold the API returns is shown, past and future, with its event,
   * reference, kind, status, period, Coordinator and whether it overlaps an unavailable period.
   * Kills: the history dropping past or inactive bookings, or hiding the unavailable-period overlap.
   */
  it("VEN-IMPACT-05-C lists past and future bookings of every status with their details", async () => {
    apiMock.mockResolvedValue([
      entry({ affectedByUnavailablePeriod: true }),
      entry({
        id: "b-2", eventName: "Spring Gala", requestKind: "tentative_hold", holdExpiresAt: "2030-01-11T00:00:00.000Z",
        coordinatorName: null,
      }),
      entry({ id: "b-3", eventName: "Old Seminar", status: "cancelled", start: "2029-06-01T01:00:00.000Z", end: "2029-06-01T03:00:00.000Z" }),
    ] as never);

    await openHistory();

    expect(apiMock).toHaveBeenCalledWith(`/venues/${venueId}/booking-history`);
    const items = within(await screen.findByRole("list", { name: "Booking history" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Welcome Evening");
    expect(items[0]).toHaveTextContent("Reference VB-B1000001 · Booking");
    expect(items[0]).toHaveTextContent("Confirmed");
    expect(items[0]).toHaveTextContent("12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 SGT");
    expect(items[0]).toHaveTextContent("Coordinator: Coordinator 1");
    expect(items[0]).toHaveTextContent("Overlaps an unavailable period");
    expect(items[1]).toHaveTextContent("Tentative hold");
    expect(items[1]).toHaveTextContent("Hold expires 11 Jan 2030, 08:00 SGT");
    expect(items[1]).toHaveTextContent("Coordinator: Not assigned");
    expect(items[1]).not.toHaveTextContent("Overlaps an unavailable period");
    expect(items[2]).toHaveTextContent("Old Seminar");
    expect(items[2]).toHaveTextContent("Cancelled");
  });

  /** VEN-IMPACT-05-D (AC5): each stored status has its own label; an approved hold is never shown as Confirmed. */
  it.each([
    ["a pending booking", { status: "pending" as const }, "Pending"],
    ["a pending hold request", { status: "pending" as const, requestKind: "tentative_hold" as const }, "Hold requested"],
    ["an approved booking", { status: "approved" as const }, "Confirmed"],
    ["an approved hold before expiry", { status: "approved" as const, requestKind: "tentative_hold" as const, holdExpiresAt: "2030-01-11T00:00:00.000Z" }, "Tentative hold"],
    ["an approved hold with no expiry", { status: "approved" as const, requestKind: "tentative_hold" as const }, "Tentative hold"],
    ["an approved hold at its expiry instant", { status: "approved" as const, requestKind: "tentative_hold" as const, holdExpiresAt: "2030-01-10T12:00:00.000Z" }, "Hold expired"],
    ["a rejected booking", { status: "rejected" as const }, "Rejected"],
    ["a released booking", { status: "released" as const }, "Released"],
    ["a cancelled booking", { status: "cancelled" as const }, "Cancelled"],
  ])("VEN-IMPACT-05-D labels %s as %s", (_name, overrides, label) => {
    expect(bookingHistoryStatus(entry(overrides), NOW)).toBe(label);
  });

  /** VEN-IMPACT-05-E (AC5): read only when opened; says when the venue has had no bookings; can be hidden. */
  it("VEN-IMPACT-05-E loads only when opened and says when there are no bookings", async () => {
    const pending = deferred<never>();
    apiMock.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(<VenueBookingHistory venueId={venueId} refreshKey={0} />);
    expect(apiMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Show booking history" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading the booking history…");
    await act(async () => pending.resolve([] as never));
    expect(await screen.findByText("No bookings or tentative holds have been made at this venue.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hide booking history" }));
    expect(screen.queryByText("No bookings or tentative holds have been made at this venue.")).toBeNull();
  });

  /** VEN-IMPACT-05-F (AC5): a failed read says so and Retry reads again; a page change reads it again. */
  it("VEN-IMPACT-05-F shows a load error, retries, and reloads after a change on the page", async () => {
    apiMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([entry()] as never)
      .mockResolvedValueOnce([entry(), entry({ id: "b-2", eventName: "Spring Gala" })] as never);
    const { user, view } = await openHistory();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the booking history.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Welcome Evening")).toBeTruthy();

    view.rerender(<VenueBookingHistory venueId={venueId} refreshKey={1} />);
    expect(await screen.findByText("Spring Gala")).toBeTruthy();
  });

  /** VEN-IMPACT-05-G (AC5): a response or failure arriving after the card closed is ignored. */
  it("VEN-IMPACT-05-G ignores a late response or late failure after the card closed", async () => {
    const late = deferred<never>();
    const lateFailure = deferred<never>();
    apiMock
      .mockReturnValueOnce(late.promise)
      .mockReturnValueOnce(lateFailure.promise)
      .mockReturnValueOnce(deferred<never>().promise);
    const { user } = await openHistory();
    await user.click(screen.getByRole("button", { name: "Hide booking history" }));
    await user.click(screen.getByRole("button", { name: "Show booking history" }));
    await user.click(screen.getByRole("button", { name: "Hide booking history" }));

    await act(async () => {
      late.resolve([entry()] as never);
      lateFailure.reject(new Error("offline"));
    });
    await user.click(screen.getByRole("button", { name: "Show booking history" }));

    expect(screen.queryByText("Welcome Evening")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
