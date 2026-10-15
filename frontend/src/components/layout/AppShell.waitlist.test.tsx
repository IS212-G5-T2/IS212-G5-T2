/*
 * Story: SPM-138 Join Waiting List (attendee notices, mounted in the app shell).
 * ACs: AC9 (the attendee is notified of a promotion, in the app) and AC12 (a cancelled waiting entry is notified).
 * Test cases: JOIN-WAITLIST-09-C-FE-MOUNT (a)  the promotion notice renders inside AppShell for an attendee,
 *             JOIN-WAITLIST-09-C-FE-READ (b)   a read notice is not shown,
 *             JOIN-WAITLIST-09-C-FE-MARK (c)   Mark As Read posts to the server and hides the notice,
 *             JOIN-WAITLIST-09-C-FE-LOAD (d)   a failed load shows the alert (mutant Y5).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { Notification } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const MSG_WL_05 = "A spot opened up. You are now registered for Gala Waitlist Night.";

const promoted = (overrides: Partial<Notification> = {}): Notification => ({
  id: "n-1",
  audienceRole: "attendee",
  audienceUserId: "attendee-1",
  type: "WaitlistPromoted",
  message: MSG_WL_05,
  relatedEventId: "EVT-701",
  read: false,
  createdAt: "2026-10-14T04:00:00.000Z",
  ...overrides,
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/home" element={<p>Home page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  useAppStore.setState({
    isAuthenticated: true,
    currentUser: { id: "attendee-1", name: "Alice", email: "alice@example.com", role: "attendee" },
  });
});
afterEach(() => cleanup());

describe("JOIN-WAITLIST-09-C-FE (mounted): the attendee's promotion notice inside the app shell (AC9)", () => {
  // Kills: F18 (feed disabled), Y4 (notice removed from the shell)
  it("JOIN-WAITLIST-09-C-FE-MOUNT: an attendee sees the promotion notice in AppShell", async () => {
    apiMock.mockImplementation(async (path: string) => (path === "/notifications" ? [promoted()] : {}));

    renderShell();

    expect(await screen.findByText(MSG_WL_05)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Event" })).toHaveAttribute("href", "/events/EVT-701");
  });

  // Kills: F18, Y4, Y1 (read notices shown)
  it("JOIN-WAITLIST-09-C-FE-STATE-READ: a notice already read is not shown", async () => {
    apiMock.mockImplementation(async (path: string) => (path === "/notifications" ? [promoted({ read: true })] : {}));

    renderShell();

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/notifications"));
    expect(screen.queryByText(MSG_WL_05)).not.toBeInTheDocument();
  });

  // Kills: F18, Y4, Y1, Y2 (Mark As Read does nothing)
  it("JOIN-WAITLIST-09-C-FE-STATE-MARK: Mark As Read posts to the server and hides the notice", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path === "/notifications") return [promoted()];
      if (path === "/notifications/n-1/read") return { success: true };
      return {};
    });

    renderShell();
    fireEvent.click(await screen.findByRole("button", { name: "Mark As Read" }));

    await waitFor(() => expect(screen.queryByText(MSG_WL_05)).not.toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledWith("/notifications/n-1/read", { method: "POST" });
  });

  // Kills: F18, Y4, Y5 (failed load not announced)
  it("JOIN-WAITLIST-09-C-FE-ERR-LOAD: a failed load shows the alert", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path === "/notifications") throw new Error("down");
      return {};
    });

    renderShell();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load waiting list notices.");
  });
});
