import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAssignedEvents, getEquipmentRequestQueue, getMyEquipmentRequests } from "@/features/equipment/api/equipment-requests-api";
import App from "./App";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/features/equipment/api/equipment-requests-api", () => ({
  getAssignedEvents: vi.fn(), getMyEquipmentRequests: vi.fn(),
  getEquipmentRequestQueue: vi.fn(), submitEquipmentRequest: vi.fn(), updateEquipmentRequest: vi.fn(),
}));

describe("App venue creation route", () => {
  beforeEach(() => {
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: {
        id: "staff-1",
        name: "Venue Staff 1",
        email: "staff@example.test",
        role: "venue_staff",
      },
      restoreAuthSession: vi.fn(),
    });
  });

  // SPM-50 / VEN-CRE-01-A: the protected app route exposes the venue creation form to Venue Staff.
  it("renders the venue creation route for Venue Staff", () => {
    // Arrange the app at its protected venue creation URL.
    render(
      <MemoryRouter initialEntries={["/venues/create"]}>
        <App />
      </MemoryRouter>,
    );
    // Assert the route is wired to the form users can enter data into.
    expect(screen.getByRole("heading", { name: "Create Venue" })).toBeTruthy();
  });

  // SPM-50 / AC1 security regression: only Venue Staff may enter the creation flow.
  it("redirects a Coordinator away from the venue creation route", () => {
    useAppStore.setState({
      currentUser: {
        id: "coordinator-1",
        name: "Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
    });
    render(
      <MemoryRouter initialEntries={["/venues/create"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("heading", { name: "Create Venue" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Pending Requests" })).toBeTruthy();
  });

  // SPM-50 / AC1 regression: venue creation routing preserves the app's role-aware root destinations.
  it.each([
    ["venue_staff", "All Events"],
    ["tech_support", "All Events"],
    ["coordinator", "Pending Requests"],
  ] as const)("redirects %s from the root to %s", (role, destination) => {
    // Arrange a role-specific signed-in user at the root route.
    useAppStore.setState({
      currentUser: {
        id: `${role}-1`,
        name: role,
        email: `${role}@example.test`,
        role,
      },
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    // Assert the existing role redirect remains reachable after route wiring changes.
    expect(screen.getByRole("heading", { name: destination })).toBeTruthy();
  });
});

describe("SPM-54 venue availability workflow routing", () => {
  /** SPM54-ROUTE-RETIRE-01: the user-confirmed disconnected local-store route is retired; event-linked Venue Records remains discoverable. */
  it("SPM54-ROUTE-RETIRE-01 redirects the retired venue availability route to Venue Records", () => {
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: {
        id: "coordinator-1",
        name: "Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
      restoreAuthSession: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={["/venues/availability"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("heading", { name: "Venue Availability" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Venue Availability" })).toBeNull();
    expect(screen.getByRole("link", { name: "Venue Records" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Venue Catalogue" })).toBeTruthy();
  });
});

// Traceability: AC1 (access the equipment inventory list) -> EQUIP-VIEW-01-A..D.
// EQUIP-VIEW-01-A/B live here because they exercise App.tsx's real route tree;
// see RouteAccess.test.tsx for the faster, non-authoritative isolated-table check,
// and navConfig.test.ts for EQUIP-VIEW-01-C (sidebar link discoverability).
describe("App equipment availability route", () => {
  // EQUIP-VIEW-01-A. Kills: a RequireRole allowedRoles list missing "tech_support",
  // or a wrong path/element wiring for /equipment/availability in App.tsx.
  it("EQUIP-VIEW-01-A renders the equipment inventory for Technical Support", () => {
    // Arrange a signed-in Technical Support user at the protected route.
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: {
        id: "tech-support-1",
        name: "Technical Support",
        email: "support@example.test",
        role: "tech_support",
      },
      restoreAuthSession: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/equipment/availability"]}>
        <App />
      </MemoryRouter>,
    );

    // Assert the real route tree renders the inventory page, not a redirect.
    expect(
      screen.getByRole("heading", { name: "Equipment Availability" }),
    ).toBeTruthy();
  });

  // EQUIP-VIEW-01-B. Kills: App.tsx's RequireRole allowedRoles list for
  // /equipment/availability gaining any role beyond "tech_support" (e.g. a copy-paste
  // that adds "coordinator", as found by review mutation testing on this branch).
  // Every non-Technical-Support role is checked, not just one, so a mutation that
  // only widens access for a single role cannot hide behind the others still failing.
  it.each([
    ["attendee", "attendee-1", "Attendee"],
    ["coordinator", "coordinator-1", "Coordinator"],
    ["organiser", "organiser-1", "Organiser"],
    ["venue_staff", "venue-staff-1", "Venue Staff"],
  ] as const)(
    "EQUIP-VIEW-01-B blocks %s from the equipment inventory route",
    (role, id, name) => {
      // Arrange a signed-in user of a role with no equipment access, at the protected URL.
      useAppStore.setState({
        authLoading: false,
        isAuthenticated: true,
        currentUser: {
          id,
          name,
          email: `${role}@example.test`,
          role,
        },
        restoreAuthSession: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/equipment/availability"]}>
          <App />
        </MemoryRouter>,
      );

      // Assert the guard redirects away instead of rendering the inventory page.
      // Deliberately does not assert which page each role lands on: venue_staff's
      // redirect target (/events) is itself role-gated to
      // ["coordinator", "organiser", "attendee"], so venue_staff lands on a blank
      // AppShell rather than a titled page. That is a pre-existing gap in App.tsx's
      // single hardcoded RequireRole fallback target, unrelated to SPM-117 and out
      // of scope here; this test only needs to prove the equipment page is unreachable.
      expect(
        screen.queryByRole("heading", { name: "Equipment Availability" }),
      ).toBeNull();
    },
  );

  // EQUIP-VIEW-01-D. Kills: RequireRole's fallback Navigate target changing away
  // from "/events" for a role that can actually reach it.
  it("EQUIP-VIEW-01-D redirects a blocked Attendee specifically to Browse Events", () => {
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: {
        id: "attendee-1",
        name: "Attendee",
        email: "attendee@example.test",
        role: "attendee",
      },
      restoreAuthSession: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/equipment/availability"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Browse Events" })).toBeTruthy();
  });
});

describe("App equipment request editor routes", () => {
  beforeEach(() => {
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: { id: "coordinator-1", name: "Coordinator", email: "coordinator@example.test", role: "coordinator" },
      restoreAuthSession: vi.fn(),
    });
    vi.mocked(getAssignedEvents).mockResolvedValue([]);
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([]);
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([]);
  });

  /** EQUIP-REQUEST-05-A: after starting a request, the coordinator reaches the dedicated editor. */
  it("routes coordinators to a dedicated create form page", async () => {
    render(<MemoryRouter initialEntries={["/equipment/requests/create"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Create Equipment Request" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "My Equipment Requests" })).toBeNull();
  });

  /** EQUIP-REQUEST-10-A: the request-specific route renders the separate update editor. */
  it("routes coordinators to a request-specific update form page", async () => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([{
      id: "request-57", reference: "ER-12345678", eventId: "event-57", eventName: "Showcase",
      eventStart: "2030-02-03T10:00:00.000Z", eventEnd: "2030-02-03T12:00:00.000Z", expectedAttendance: 120,
      status: "Pending Review", eventStatus: "Planning", requestedBy: "coordinator-1", coordinatorName: "Coordinator",
      createdAt: "2030-02-03T10:00:00.000Z", items: [{ id: "item-57", equipmentName: "Microphone", equipmentType: "Audio", quantity: 1 }],
    }]);
    vi.mocked(getAssignedEvents).mockResolvedValue([{
      id: "event-57", name: "Showcase", status: "planning", startDateTime: "2030-02-03T10:00:00.000Z",
      endDateTime: "2030-02-03T12:00:00.000Z", expectedAttendance: 120,
    }]);
    render(<MemoryRouter initialEntries={["/equipment/requests/request-57/update"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Update Equipment Request" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Equipment name/ })).toHaveValue("Microphone");
  });

  /** EQUIP-REQUEST-10-SUP-ACCESS: a user without coordinator authorization is kept out of request editors. */
  it("keeps create and update editor routes restricted to coordinators", async () => {
    useAppStore.setState({
      currentUser: { id: "support-1", name: "Support", email: "support@example.test", role: "tech_support" },
    });
    render(<MemoryRouter initialEntries={["/equipment/requests/create"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Equipment Review Queue" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Create Equipment Request" })).toBeNull();
  });

  /** EQUIP-REQUEST-10-SUP-ACCESS: Technical Support remains on its own home route and never reaches coordinator equipment request editors. */
  it("keeps Technical Support out of coordinator editors after the root redirect", async () => {
    useAppStore.setState({
      currentUser: { id: "support-1", name: "Support", email: "support@example.test", role: "tech_support" },
    });
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "All Events" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Create Equipment Request" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Update Equipment Request" })).toBeNull();
  });
});

// SPM-30 to SPM-34 AC2: after login, each role is redirected to the Events Dashboard. Each row
// names the heading that the dashboard shows for that role's default filter.
describe("SPM-30 to SPM-34 AC2: post-login landing on the Events Dashboard", () => {
  beforeEach(() => {
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      eventListFilters: {},
      restoreAuthSession: vi.fn(),
    });
  });

  it.each([
    ["attendee", "attendee-1", "Browse Events"],
    ["organiser", "organiser-1", "My Events"],
    ["coordinator", "coordinator-1", "Pending Requests"],
    ["venue_staff", "venue-staff-1", "All Events"],
    ["tech_support", "tech-support-1", "All Events"],
  ] as const)(
    "SPM-30 to SPM-34 AC2 sends %s from the root route to the Events Dashboard",
    async (role, id, heading) => {
      useAppStore.setState({
        currentUser: { id, name: role, email: `${role}@example.test`, role },
      });

      render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);

      expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    },
  );
});
