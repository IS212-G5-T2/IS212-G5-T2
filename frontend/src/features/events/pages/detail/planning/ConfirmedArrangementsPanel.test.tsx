import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmedArrangementsPanel } from "@/features/events/pages/detail/planning/ConfirmedArrangementsPanel";
import { api } from "@/utils/api";

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
