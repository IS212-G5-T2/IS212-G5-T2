import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    // SPM-48 AC1: the coordinator's events page now opens on All statuses (decided 23 Oct 2026), headed "All Events".
    expect(screen.getByRole("heading", { name: "All Events" })).toBeTruthy();
  });

  // SPM-50 / AC1 regression: venue creation routing preserves the app's role-aware root destinations.
  it.each([
    // SPM-124: the root redirect uses dashboardPathByRole, so venue staff and technical support land on the events dashboard.
    ["venue_staff", "All Events"],
    ["tech_support", "All Events"],
    // SPM-48 AC1: the coordinator lands on every assigned event (All statuses), headed "All Events".
    ["coordinator", "All Events"],
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
  it("EQUIP-AVAIL-01 renders the equipment availability checker for Technical Support", () => {
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

    // Assert the real route tree renders the event-window checker, not a redirect.
    expect(
      screen.getByRole("heading", { name: "Equipment Availability" }),
    ).toBeTruthy();
  });

  /** EQUIP-AVAIL-01: inventory management remains separately reachable by Technical Support. */
  it("renders Equipment Inventory at its dedicated route for Technical Support", () => {
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: {
        id: "tech-support-1", name: "Technical Support", email: "support@example.test", role: "tech_support",
      },
      restoreAuthSession: vi.fn(),
    });

    render(<MemoryRouter initialEntries={["/equipment/inventory"]}><App /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Equipment Inventory" })).toBeTruthy();
  });

  // EQUIP-AVAIL-07. Kills: App.tsx's RequireRole allowedRoles list for
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
      eventListFilters: {} as { attendee: string; status: string | null },
      restoreAuthSession: vi.fn(),
    });
  });

  it.each([
    ["attendee", "attendee-1", "Browse Events"],
    ["organiser", "organiser-1", "My Events"],
    // SPM-48 AC1: the coordinator opens on All statuses, so the default heading is "All Events" (not Pending Requests).
    ["coordinator", "coordinator-1", "All Events"],
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

// SPM-128: Safety Officer login and role-gated view (Confluence matrix 36896780).
describe("SPM-128 Safety Officer login routing", () => {
  beforeEach(() => {
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: {
        id: "safety-1",
        name: "Safety Officer 1",
        email: "safety_officer1@connectsphere.test",
        role: "safety_officer",
      },
      restoreAuthSession: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** SAFETY-LOGIN-02-A: An authenticated Safety Officer visiting root is automatically redirected to the safety review page. */
  it("SAFETY-LOGIN-02-A redirects a Safety Officer from root to the safety review page", () => {
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Events Awaiting Safety Check" })).toBeTruthy();
  });

  /** SAFETY-LOGIN-02-B: An authenticated Safety Officer visiting login is automatically redirected to the safety review page. */
  it("SAFETY-LOGIN-02-B redirects an authenticated Safety Officer from login to the safety review page", () => {
    render(<MemoryRouter initialEntries={["/login"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Events Awaiting Safety Check" })).toBeTruthy();
  });

  /** SAFETY-LOGIN-03-A: Wrong password surfaces the server's exact error message on the login screen. */
  it("SAFETY-LOGIN-03-A wrong password displays the server error message on the login screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ));
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: false,
      currentUser: { id: "", name: "", email: "", role: "attendee" },
      restoreAuthSession: vi.fn(),
    });

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/login"]}><App /></MemoryRouter>);

    await user.type(screen.getByLabelText(/email/i), "safety_officer1@connectsphere.test");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid email or password.");
    expect(screen.getByRole("button", { name: /log in/i })).toBeTruthy();
  });

  /** SAFETY-LOGIN-03-B: Non-JSON error body shows generic fallback message on the login screen. */
  it("SAFETY-LOGIN-03-B non-JSON error body displays generic fallback message on the login screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Service Unavailable", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      }),
    ));
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: false,
      currentUser: { id: "", name: "", email: "", role: "attendee" },
      restoreAuthSession: vi.fn(),
    });

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/login"]}><App /></MemoryRouter>);

    await user.type(screen.getByLabelText(/email/i), "safety_officer1@connectsphere.test");
    await user.type(screen.getByLabelText(/password/i), "P@55w0rd");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("We couldn't sign you in. Please try again.");
    expect(screen.getByRole("button", { name: /log in/i })).toBeTruthy();
  });

  /** SAFETY-LOGIN-04-A: Positive baseline confirming a Safety Officer can access /safety/events before negative cases. */
  it("SAFETY-LOGIN-04-A Safety Officer at own route renders the safety review page", () => {
    render(<MemoryRouter initialEntries={["/safety/events"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Events Awaiting Safety Check" })).toBeTruthy();
  });

  /** SAFETY-LOGIN-04-B: A Safety Officer navigating to /events is redirected away to their own safety review page. */
  it("SAFETY-LOGIN-04-B Safety Officer at /events is redirected to own page", () => {
    render(<MemoryRouter initialEntries={["/events"]}><App /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "All Events" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Events Awaiting Safety Check" })).toBeTruthy();
  });

  /** SAFETY-LOGIN-04-C: An authenticated Coordinator navigating to /safety/events is blocked and redirected to their home page. */
  it("SAFETY-LOGIN-04-C blocks coordinator from the safety events route", () => {
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator 1", email: "coordinator@example.test", role: "coordinator" },
    });
    render(<MemoryRouter initialEntries={["/safety/events"]}><App /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Events Awaiting Safety Check" })).toBeNull();
    expect(screen.getByRole("heading", { name: "All Events" })).toBeTruthy();
  });

  /** SAFETY-LOGIN-04-D: An authenticated Organiser navigating to /safety/events is blocked and redirected to their home page. */
  it("SAFETY-LOGIN-04-D blocks organiser from the safety events route", () => {
    useAppStore.setState({
      currentUser: { id: "organiser-1", name: "Organiser 1", email: "organiser@example.test", role: "organiser" },
    });
    render(<MemoryRouter initialEntries={["/safety/events"]}><App /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Events Awaiting Safety Check" })).toBeNull();
    expect(screen.getByRole("heading", { name: "My Events" })).toBeTruthy();
  });

  /** SAFETY-LOGIN-04-E: An authenticated Attendee navigating to /safety/events is blocked and redirected to their home page. */
  it("SAFETY-LOGIN-04-E blocks attendee from the safety events route", () => {
    useAppStore.setState({
      currentUser: { id: "attendee-1", name: "Attendee 1", email: "attendee@example.test", role: "attendee" },
    });
    render(<MemoryRouter initialEntries={["/safety/events"]}><App /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Events Awaiting Safety Check" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Browse Events" })).toBeTruthy();
  });
});
