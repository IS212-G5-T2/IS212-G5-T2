import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmEvent,
  fetchArrangementsStatus,
  fetchConfirmedArrangements,
  outstandingText,
} from "@/utils/arrangements";
import { api } from "@/utils/api";

/*
 * SPM-135 client helpers (utils/arrangements.ts). The HTTP layer is mocked; the
 * helpers' contract checks and wording are real. Literals are the catalogue
 * wording (matrix 03-A and 03-C) and the request contract (backend status).
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000201";

beforeEach(() => {
  apiMock.mockReset();
});

describe("SPM-135 AC3: the outstanding item text is the label, a colon and the detail", () => {
  it("SPM-135 AC3 (FE helper): a venue item reads 'Venue booking approval: Main Hall (Pending)'", () => {
    expect(
      outstandingText({ type: "venue", label: "Venue booking approval", detail: "Main Hall (Pending)", state: "Pending" }),
    ).toBe("Venue booking approval: Main Hall (Pending)");
  });

  it("SPM-135 AC3 (FE helper): the safety item reads 'Safety Officer approval: Changes requested'", () => {
    expect(
      outstandingText({ type: "safety", label: "Safety Officer approval", detail: "Changes requested", state: "Changes Requested" }),
    ).toBe("Safety Officer approval: Changes requested");
  });
});

describe("SPM-135 AC1 and AC3: the readiness and confirm helpers read the server contract", () => {
  it("SPM-135 AC3 (FE helper): a well-formed readiness answer is returned as it is", async () => {
    // Arrange
    const view = { eventId: EVENT_ID, ready: false, outstanding: [] };
    apiMock.mockResolvedValue(view);

    // Act / Assert
    await expect(fetchArrangementsStatus(EVENT_ID)).resolves.toEqual(view);
    expect(apiMock).toHaveBeenCalledWith(`/events/${EVENT_ID}/arrangements-status`);
  });

  it("SPM-135 AC3 (FE helper): a readiness answer without a ready flag is refused with the literal message", async () => {
    // Arrange: the answer lacks the boolean ready flag
    apiMock.mockResolvedValue({ eventId: EVENT_ID, outstanding: [] });

    // Act / Assert
    await expect(fetchArrangementsStatus(EVENT_ID)).rejects.toThrow("Arrangements could not be read.");
  });

  it("SPM-135 AC1 (FE helper): confirm posts targetStatus Confirmed to the status-change route", async () => {
    // Arrange
    apiMock.mockResolvedValue({ eventId: EVENT_ID, status: "Confirmed", message: "Product Launch Mixer has been confirmed." });

    // Act
    await confirmEvent(EVENT_ID);

    // Assert: the literal path, method and body
    expect(apiMock).toHaveBeenCalledWith(`/events/${EVENT_ID}/status-change`, {
      method: "POST",
      body: JSON.stringify({ targetStatus: "Confirmed" }),
    });
  });
});

describe("SPM-135 AC5: the confirmed-arrangements helper refuses a response without its parts", () => {
  it("SPM-135 AC5 (FE helper): a complete response is returned as it is", async () => {
    // Arrange
    const view = { eventId: EVENT_ID, status: "Confirmed", venueBookings: [], equipment: [], safety: { state: "Approved" } };
    apiMock.mockResolvedValue(view);

    // Act / Assert
    await expect(fetchConfirmedArrangements(EVENT_ID)).resolves.toEqual(view);
  });

  it("SPM-135 AC5 (FE helper): a response without the safety part is refused with the literal message", async () => {
    // Arrange: the safety part is missing
    apiMock.mockResolvedValue({ eventId: EVENT_ID, status: "Confirmed", venueBookings: [], equipment: [] });

    // Act / Assert
    await expect(fetchConfirmedArrangements(EVENT_ID)).rejects.toThrow("Confirmed arrangements could not be read.");
  });
});
