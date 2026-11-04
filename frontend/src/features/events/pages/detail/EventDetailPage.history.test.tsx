// Story: SPM-157 Audit History of Important Actions
// ACs: AC1 (assigned coordinator), AC8 (owning organiser), AC9 (no link for anyone else)
// Test cases: AUDIT-HISTORY-01-G, 08-B, 09-C (the event page's View History button)
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, User } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

function eventWith(status: EventRecord["status"]): EventRecord {
  return {
    id: "event-1",
    name: "Innovation Showcase",
    purpose: "",
    description: "",
    organiserId: "organiser-1",
    organiserName: "Priya Nair",
    coordinatorId: "coordinator-1",
    coordinatorName: "Marcus Lee",
    status,
    startDateTime: "2026-12-12T18:00:00.000Z",
    endDateTime: "2026-12-12T21:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };
}

const users: Record<string, User> = {
  owner: { id: "organiser-1", name: "Priya Nair", email: "priya@example.test", role: "organiser" },
  assigned: { id: "coordinator-1", name: "Marcus Lee", email: "marcus@example.test", role: "coordinator" },
  otherCoordinator: { id: "coordinator-2", name: "Ana Tan", email: "ana@example.test", role: "coordinator" },
  attendee: { id: "attendee-1", name: "Sam Lim", email: "sam@example.test", role: "attendee" },
};

function renderAs(user: User, event: EventRecord) {
  apiMock.mockImplementation((path: string) => {
    if (path === `/events/${event.id}`) return Promise.resolve(event);
    if (path === `/events/${event.id}/planning`) return Promise.reject(new Error("no planning view in this test"));
    // The page's other panels (comments, status history, requests) are empty here.
    return Promise.resolve([]);
  });
  useAppStore.setState({ currentUser: user, events: [event] });
  return render(
    <MemoryRouter initialEntries={[`/events/${event.id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SPM-157: the View History button on the event page", () => {
  beforeEach(() => apiMock.mockReset());
  afterEach(cleanup);

  /** AUDIT-HISTORY-01-G: the assigned coordinator opens the history from the event page, whatever its status. */
  it.each(["planning", "completed", "cancelled"] as const)(
    "AUDIT-HISTORY-01-G shows View History to the assigned coordinator of a %s event",
    async (status) => {
      renderAs(users.assigned, eventWith(status));
      const link = await screen.findByRole("link", { name: "View History" });
      expect(link).toHaveAttribute("href", "/events/event-1/history");
    },
  );

  /** AUDIT-HISTORY-08-B: the owner sees it once the request is submitted; a draft has no history yet. */
  it("AUDIT-HISTORY-08-B shows View History to the owner of a submitted event but not of a draft", async () => {
    renderAs(users.owner, eventWith("submitted"));
    expect(await screen.findByRole("link", { name: "View History" })).toHaveAttribute("href", "/events/event-1/history");
    cleanup();
    renderAs(users.owner, eventWith("draft"));
    await screen.findByText("Innovation Showcase");
    expect(screen.queryByRole("link", { name: "View History" })).not.toBeInTheDocument();
  });

  /** AUDIT-HISTORY-09-C: no button for another coordinator or an attendee (the server refuses them too). */
  it.each([["another coordinator", "otherCoordinator"], ["an attendee", "attendee"]])(
    "AUDIT-HISTORY-09-C hides View History from %s",
    async (_label, key) => {
      renderAs(users[key], eventWith("confirmed"));
      await screen.findAllByText("Innovation Showcase");
      expect(screen.queryByRole("link", { name: "View History" })).not.toBeInTheDocument();
    },
  );
});
