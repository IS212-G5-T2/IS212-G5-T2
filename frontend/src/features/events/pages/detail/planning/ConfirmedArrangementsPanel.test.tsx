import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmedArrangementsPanel } from "@/features/events/pages/detail/planning/ConfirmedArrangementsPanel";
import { api } from "@/utils/api";
import { deferred } from "@/test/deferred";

/*
 * SPM-135 AC5 (05-B, FE): the organiser's view of a Confirmed event shows the
 * confirmed venue (Singapore time), equipment and safety approval, from the
 * allowlist endpoint. The HTTP layer is mocked; the response literal is the
 * fixture EVT-201 (VB-201 Main Hall 10:00 to 12:00 SGT on 5 Nov 2026).
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000201";

describe("SPM-135 AC5: the organiser sees the confirmed arrangements", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it("CONFIRM-EVENT-05-B (FE): venue in SGT, equipment lines and Approved safety are shown from the allowlist response", async () => {
    // Arrange: the allowlist response for EVT-201
    apiMock.mockResolvedValue({
      eventId: EVENT_ID,
      status: "Confirmed",
      venueBookings: [{ venueName: "Main Hall", start: "2026-11-05T02:00:00.000Z", end: "2026-11-05T04:00:00.000Z", status: "Approved" }],
      equipment: [
        { name: "Microphone", quantity: 2, status: "Reserved" },
        { name: "Projector", quantity: 1, status: "Reserved" },
      ],
      safety: { state: "Approved" },
    });

    // Act
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);

    // Assert: the request, the venue slot in SGT (02:00Z is 10:00 SGT), and the lines
    expect(apiMock).toHaveBeenCalledWith(`/events/${EVENT_ID}/confirmed-arrangements`);
    expect(await screen.findByText("Main Hall: 5 Nov 2026 10:00 to 12:00 SGT (Approved)")).toBeInTheDocument();
    const equipment = within(screen.getByRole("heading", { name: "Equipment" }).parentElement as HTMLElement);
    expect(equipment.getByText("Microphone x2 (Reserved)")).toBeInTheDocument();
    expect(equipment.getByText("Projector x1 (Reserved)")).toBeInTheDocument();
    expect(screen.getByText("Approved", { exact: true })).toBeInTheDocument();
  });
});

/** An allowlist response for one event, with one venue booking so the rendered text identifies the event. */
function arrangementsFor(eventId: string, venueName: string) {
  return {
    eventId,
    status: "Confirmed",
    venueBookings: [{ venueName, start: "2026-11-05T02:00:00.000Z", end: "2026-11-05T04:00:00.000Z", status: "Approved" }],
    equipment: [],
    safety: { state: "Approved" },
  };
}

describe("SPM-135 TR-13: the confirmed-arrangements panel's remaining branches", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it("CONFIRM-EVENT-SUP-28 SPM-135 AC5 (FE, unmount): a response that arrives after unmount is dropped without an error", async () => {
    // Arrange: the allowlist request is still open when the panel unmounts
    const late = deferred<unknown>();
    apiMock.mockReturnValue(late.promise as never);
    const { container, unmount } = render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    unmount();

    // Act: the response arrives after unmount
    await act(async () => {
      late.resolve(arrangementsFor(EVENT_ID, "Main Hall"));
    });

    // Assert: nothing is rendered into the container and nothing throws
    expect(container).toBeEmptyDOMElement();
  });

  it("CONFIRM-EVENT-SUP-29 SPM-135 AC5 (FE, stale response): a response for the previous event is ignored once the event changes", async () => {
    // Arrange: EVT-201's request is held open; the other event answers at once
    const OTHER_EVENT_ID = "00000000-0000-4000-8000-000000000202";
    const previous = deferred<unknown>();
    apiMock.mockImplementation((path: string) =>
      path === `/events/${EVENT_ID}/confirmed-arrangements`
        ? previous.promise
        : Promise.resolve(arrangementsFor(OTHER_EVENT_ID, "Breakout Room 1")),
    );
    const { rerender } = render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    rerender(<ConfirmedArrangementsPanel eventId={OTHER_EVENT_ID} />);
    expect(await screen.findByText(/Breakout Room 1:/)).toBeInTheDocument();

    // Act: the late answer for EVT-201 arrives
    await act(async () => {
      previous.resolve(arrangementsFor(EVENT_ID, "Main Hall"));
    });

    // Assert: EVT-202's venue stays; EVT-201's venue is never shown
    expect(screen.queryByText(/Main Hall:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Breakout Room 1:/)).toBeInTheDocument();
  });

  it("CONFIRM-EVENT-SUP-30 SPM-135 AC5 (FE, stale error): a failure for the previous event does not replace the current arrangements", async () => {
    // Arrange: EVT-201's request is held open; the other event loads
    const OTHER_EVENT_ID = "00000000-0000-4000-8000-000000000202";
    const previous = deferred<unknown>();
    apiMock.mockImplementation((path: string) =>
      path === `/events/${EVENT_ID}/confirmed-arrangements`
        ? previous.promise
        : Promise.resolve(arrangementsFor(OTHER_EVENT_ID, "Breakout Room 1")),
    );
    const { rerender } = render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    rerender(<ConfirmedArrangementsPanel eventId={OTHER_EVENT_ID} />);
    expect(await screen.findByText(/Breakout Room 1:/)).toBeInTheDocument();

    // Act: the late failure for EVT-201 arrives
    await act(async () => {
      previous.reject(new Error("Old event unavailable"));
    });

    // Assert: no alert; EVT-202's arrangements remain
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Breakout Room 1:/)).toBeInTheDocument();
  });

  it("CONFIRM-EVENT-SUP-31 SPM-135 AC5 (FE, failure): an Error from the load is shown as the alert text", async () => {
    // Arrange: the allowlist request fails with an Error
    apiMock.mockRejectedValue(new Error("Venue service unavailable"));

    // Act
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);

    // Assert
    expect((await screen.findByRole("alert")).textContent).toBe("Venue service unavailable");
  });

  it("CONFIRM-EVENT-SUP-32 SPM-135 AC5 (FE, fallback): a non-Error failure shows the fallback text in an alert", async () => {
    // Arrange: the allowlist request rejects with a value that is not an Error
    apiMock.mockRejectedValue("socket closed");

    // Act
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);

    // Assert
    expect((await screen.findByRole("alert")).textContent).toBe("Could not load confirmed arrangements.");
  });
});
