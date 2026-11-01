import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import { RequireAuth } from "./RequireAuth";

function LoadProtectedData() {
  useEffect(() => {
    void api("/notifications").catch(() => undefined);
  }, []);
  return <p>Protected events</p>;
}

describe("RequireAuth shared API session recovery", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The route stays in its startup state while the cookie session is being checked. */
  it("shows the auth loading screen while the initial session lookup is pending", () => {
    useAppStore.setState({ authLoading: true, isAuthenticated: false });

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<RequireAuth><p>Protected events</p></RequireAuth>} />
          <Route path="/login" element={<h1>Sign in</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Checking your sign-in status…")).toBeInTheDocument();
  });

  /** A protected route redirects once the shared API reports that the cookie is no longer valid. */
  it("redirects to login when a protected page's shared API call reports a missing session", async () => {
    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: { id: "coordinator-1", name: "Coordinator", email: "coord@example.test", role: "coordinator" },
      events: [{ id: "cached-event" } as never],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<RequireAuth><LoadProtectedData /></RequireAuth>} />
          <Route path="/login" element={<h1>Sign in</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(useAppStore.getState()).toMatchObject({ isAuthenticated: false, events: [] });
  });
});
