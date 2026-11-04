/* SPM-157 client for the event history: one read, no call that changes it (AC10). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { fetchEventHistory } from "@/features/events/api/event-history-api";

vi.mock("@/utils/api", () => ({ api: vi.fn().mockResolvedValue("ok") }));
const apiMock = vi.mocked(api);

describe("SPM-157 event history API client", () => {
  beforeEach(() => apiMock.mockClear());

  /** AUDIT-HISTORY-01-G: the page reads GET /events/:id/history, with the id encoded. */
  it("AUDIT-HISTORY-01-G reads the history of one event", async () => {
    await expect(fetchEventHistory("event 1/x")).resolves.toBe("ok");
    expect(apiMock).toHaveBeenCalledWith("/events/event%201%2Fx/history");
  });
});
