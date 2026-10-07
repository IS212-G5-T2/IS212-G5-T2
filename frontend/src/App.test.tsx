import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useAppStore } from "./store/useAppStore";

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
    ["venue_staff", "Venue Catalogue"],
    ["tech_support", "Equipment Requests"],
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
