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
