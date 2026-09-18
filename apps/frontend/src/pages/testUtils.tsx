import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";

interface RenderLoginPageOptions {
  /** Path the user tried to visit before being redirected to /login. */
  from?: string;
  /** Initial history entry. Defaults to "/login". */
  initialPath?: string;
}

/**
 * Renders <LoginPage /> inside a router with a dummy "/" destination and,
 * optionally, the redirect-source location state RequireAuth attaches in
 * the real app. Successful sign-in navigates away from /login, so tests
 * assert on the destination screen instead of reaching into router
 * internals.
 */
export function renderLoginPage({ from, initialPath = "/login" }: RenderLoginPageOptions = {}) {
  const entry = from
    ? { pathname: initialPath, state: { from: { pathname: from } } }
    : initialPath;

  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div data-testid="home-screen">Home</div>} />
        <Route path="/events" element={<div data-testid="events-screen">Events</div>} />
      </Routes>
    </MemoryRouter>
  );
}
