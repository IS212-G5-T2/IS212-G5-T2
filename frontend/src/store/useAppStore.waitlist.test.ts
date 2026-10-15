/*
 * Story: SPM-138 Join Waiting List When Event Is at Capacity (store action).
 * ACs: AC1 (join when full), AC3 (the attendee's own status is refreshed after a join).
 * Test cases: JOIN-WAITLIST-01-A-STORE (the POST and the refresh), 01-C-STORE (a refusal is raised, nothing changes),
 * 01-F-STORE (a non-attendee sends no request).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./useAppStore";
import { ApiError, api } from "@/utils/api";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const attendee = { id: "ATT-04", name: "Attendee Four", email: "att-04@example.com", role: "attendee" as const };
const waitlisted = {
  id: "REG-ATT-04",
  eventId: "EVT-701",
  attendeeId: "ATT-04",
  attendeeName: "Attendee Four",
  status: "waitlisted" as const,
  registeredAt: "2026-10-14T04:00:00.000Z",
  waitlistPosition: 1,
};

beforeEach(() => {
  apiMock.mockReset();
  useAppStore.setState({ isAuthenticated: true, currentUser: attendee, registrations: [] });
});

describe("SPM-138 joinWaitlist (store)", () => {
  // Oracle (01-A STORE): the join is a POST with an empty JSON body; the attendee's own entry is read back and kept in the
  // store, and the server's answer is returned to the caller.
  // Kills: F10 (no JSON body), F11 (own entry not refreshed)
  it("JOIN-WAITLIST-01-A-STORE: posts the join, refreshes the attendee's own entry, and returns the answer", async () => {
    const answer = { registrationId: "REG-ATT-04", status: "waitlisted", position: 1, message: "server text" };
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/events/EVT-701/waitlist") return answer;
      if (path === "/events/EVT-701/registrations/me") return { registration: waitlisted };
      throw new Error(`unexpected ${path} ${init?.method}`);
    });

    const result = await useAppStore.getState().joinWaitlist("EVT-701");

    expect(result).toEqual(answer);
    expect(apiMock).toHaveBeenNthCalledWith(1, "/events/EVT-701/waitlist", { method: "POST", body: "{}" });
    expect(useAppStore.getState().registrations).toEqual([waitlisted]);
  });

  // Oracle (01-C STORE): a refusal is raised to the caller as the server's error, and the store keeps its registrations.
  // Kills: F35 (refusal swallowed)
  it("JOIN-WAITLIST-01-C-STORE-ERR: a refused join raises the server error and changes nothing", async () => {
    apiMock.mockRejectedValueOnce(
      new ApiError("This event still has available spots. Please register directly.", undefined, "WAITLIST_NOT_AVAILABLE", 422),
    );

    await expect(useAppStore.getState().joinWaitlist("EVT-701")).rejects.toMatchObject({
      code: "WAITLIST_NOT_AVAILABLE",
      status: 422,
    });
    expect(useAppStore.getState().registrations).toEqual([]);
  });

  // Oracle (01-F STORE): a signed-out or non-attendee session sends no request at all.
  // Kills: F9 (role guard removed)
  it("JOIN-WAITLIST-01-F-STORE-ERR: a non-attendee is refused before any request is sent", async () => {
    useAppStore.setState({ currentUser: { ...attendee, role: "organiser" as never } });

    await expect(useAppStore.getState().joinWaitlist("EVT-701")).rejects.toThrow("Only signed-in attendees can join the waiting list.");
    expect(apiMock).not.toHaveBeenCalled();
  });
});
