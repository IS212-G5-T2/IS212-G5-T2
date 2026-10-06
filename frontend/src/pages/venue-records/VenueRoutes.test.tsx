// frontend/src/pages/venue-records/VenueRoutes.test.tsx
// SPM-124: AC1/7; VEN-VIEW-01-A/B and staff detail-route access.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "@/App";
import { useAppStore } from "@/store/useAppStore";
import type { UserRole } from "@/types";

vi.mock("@/components/layout/AppShell", async () => {
  const { Outlet } = await import("react-router-dom");
  return { AppShell: () => <Outlet /> };
});
vi.mock("@/pages/LoginPage", () => ({
  LoginPage: () => <p>Sign in</p>,
}));
vi.mock("@/pages/venue-records/VenueRecordsPage", () => ({
  VenueRecordsPage: () => <p>Persistent staff catalogue</p>,
}));
vi.mock("@/pages/venue-records/VenueRecordDetailPage", () => ({
  VenueRecordDetailPage: () => <p>Persistent staff detail</p>,
}));
vi.mock("@/pages/VenuesPage", () => ({
  VenuesPage: () => <p>Coordinator planning catalogue</p>,
}));
vi.mock("@/pages/VenueDetailPage", () => ({
  VenueDetailPage: () => <p>Coordinator planning detail</p>,
}));

const initialAuthState = useAppStore.getState();

afterEach(() => {
  cleanup();
  useAppStore.setState({
    currentUser: initialAuthState.currentUser,
    isAuthenticated: initialAuthState.isAuthenticated,
    authLoading: initialAuthState.authLoading,
    restoreAuthSession: initialAuthState.restoreAuthSession,
  });
});

function renderRoute(role: UserRole, path: string) {
  useAppStore.setState({
    isAuthenticated: true,
    authLoading: false,
    currentUser: {
      id: `test-${role}`,
      name: role,
      email: `${role}@example.test`,
      role,
    },
    restoreAuthSession: vi.fn().mockResolvedValue(undefined),
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("venue routes (SPM-124)", () => {
  // AC1: Venue Staff reach the persistent catalogue on the existing venue route.
  it("VEN-VIEW-01-A: opens the persisted catalogue for Venue Staff", () => {
    // Arrange and act: enter the protected catalogue as a signed-in staff member.
    renderRoute("venue_staff", "/venues");

    // Assert: the staff read view is the route content.
    expect(screen.getByText("Persistent staff catalogue")).toBeInTheDocument();
  });

  // VEN-VIEW-01-B (AC1): signed-out visitors cannot view catalogue records.
  it("VEN-VIEW-01-B: redirects an anonymous visitor to sign in", () => {
    // Arrange: no authenticated session exists.
    useAppStore.setState({
      isAuthenticated: false,
      authLoading: false,
      restoreAuthSession: vi.fn().mockResolvedValue(undefined),
    });

    // Act: navigate directly to the catalogue URL.
    render(
      <MemoryRouter initialEntries={["/venues"]}>
        <App />
      </MemoryRouter>,
    );

    // Assert: venue content stays behind authentication.
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(
      screen.queryByText("Persistent staff catalogue"),
    ).not.toBeInTheDocument();
  });

  // AC7 supplementary route-access check: Venue Staff detail links resolve.
  it("opens the persisted detail route for Venue Staff", () => {
    // Arrange and act: enter a venue detail URL as signed-in staff.
    renderRoute("venue_staff", "/venues/00000000-0000-4000-8000-000000000124");

    // Assert: the detail API page owns this route.
    expect(screen.getByText("Persistent staff detail")).toBeInTheDocument();
  });

  // Existing coordinator planning remains reachable for its permitted role.
  it("keeps the coordinator planning catalogue on the same path", () => {
    // Arrange and act: enter the venue route as a Coordinator.
    renderRoute("coordinator", "/venues");

    // Assert: the Coordinator sees its established planning page.
    expect(
      screen.getByText("Coordinator planning catalogue"),
    ).toBeInTheDocument();
  });

  // AC1 security: roles outside the venue read policy cannot render staff records.
  it.each(["organiser", "attendee"] as const)(
    "denies %s access to the persisted venue catalogue",
    (role) => {
      // Arrange and act: a signed-in non-venue role opens the protected route.
      renderRoute(role, "/venues");

      // Assert: no staff catalogue data is mounted after the route guard redirects.
      expect(screen.queryByText("Persistent staff catalogue")).not.toBeInTheDocument();
    },
  );
});
