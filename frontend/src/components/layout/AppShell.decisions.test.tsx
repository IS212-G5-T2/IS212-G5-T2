/**
 * SPM-88 AC4 (29 Oct 2026 decision): the organiser's request decisions live in the notification bell in the top bar,
 * which shows on every page. No in-page panel remains, so opening a request lands on a clear event page.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { EventListPage } from "@/features/events/pages/list/EventListPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { Notification } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

// The organiser list also loads pending change requests; none are needed here.
vi.mock("@/features/events/api/change-requests-api", () => ({
  fetchMyChangeRequests: vi.fn(() => Promise.resolve([])),
  markChangeRequestNoticesRead: vi.fn(() => Promise.resolve()),
  fetchNewChangeRequestEventIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));

const apiMock = vi.mocked(api);

const decision: Notification = {
  id: "notif-1",
  audienceRole: "organiser",
  audienceUserId: "organiser-9",
  type: "rejection",
  message: 'Your event request "Welcome Evening" was rejected: Venue is not available',
  relatedEventId: "event-1",
  read: false,
  createdAt: "2026-10-28T12:00:00.000Z",
};

function EventMarker() {
  const { id } = useParams();
  return <p>Event detail page for {id}</p>;
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/events" element={<EventListPage />} />
          <Route path="/events/:id" element={<EventMarker />} />
          <Route path="/requests" element={<p>My drafts page</p>} />
          <Route path="/settings" element={<p>Settings page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(((path: string) =>
    Promise.resolve(path === "/notifications" ? [decision] : path.endsWith("/read") ? undefined : [])) as typeof api);
  useAppStore.setState({
    isAuthenticated: true,
    currentUser: { id: "organiser-9", name: "Org", email: "o@example.test", role: "organiser" },
  });
});
afterEach(cleanup);

describe("AppShell (SPM-88 AC4: where the request decisions appear)", () => {
  const banner = () => within(screen.getByRole("banner"));

  /**
   * DECISION-NOTIFY-04-E: the bell is in the top bar on /events, /requests, /settings and an event
   * page; no Request Decisions panel is on any page; View Request closes the dropdown and the event
   * page shows with no notification panel on it.
   * Kills: bell missing from the top bar or only on some pages; panel still on My Events (EventListPage)
   * or in AppShell; dropdown left open over the event page.
   */
  it("DECISION-NOTIFY-04-E: the bell is in the top bar on every page; View Request closes it and the event page has no panel", async () => {
    const view = renderApp("/events");
    expect(await banner().findByRole("button", { name: "Notifications, 1 unread" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Request decision notifications" })).toBeNull();
    expect(screen.queryByText("Request Decisions")).toBeNull();

    fireEvent.click(banner().getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(await screen.findByRole("link", { name: "View Request" }));
    expect(await screen.findByText("Event detail page for event-1")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Request decision notifications" })).toBeNull();
    // The bell is still in the top bar on the event page.
    expect(banner().getByRole("button", { name: /^Notifications/ })).toBeTruthy();
    view.unmount();

    for (const [path, text] of [
      ["/requests", "My drafts page"],
      ["/settings", "Settings page"],
      ["/events/event-1", "Event detail page for event-1"],
    ]) {
      const page = renderApp(path);
      expect(await screen.findByText(text)).toBeTruthy();
      expect(await banner().findByRole("button", { name: /^Notifications/ })).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Request decision notifications" })).toBeNull();
      page.unmount();
    }
  });
});
