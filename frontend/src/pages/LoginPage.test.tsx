import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, login as authenticate } from "@/lib/auth";
import { useAppStore } from "@/store/useAppStore";
import type { User } from "@/types";
import { renderLoginPage } from "./testUtils";

// The store's login action calls the backend-auth client. Mock its HTTP-facing
// boundary rather than the store action so these tests exercise the real form
// validation, state transition, redirect, and safe error-display behavior.
// Only the network request is replaced.
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, login: vi.fn() };
});

const mockAuthenticate = vi.mocked(authenticate);
const storeLogin = useAppStore.getState().login;
const PASSWORD = "P@55w0rd";
const seedAccounts: ReadonlyArray<{ email: string; role: User["role"] }> = [
  { email: "organiser1@connectsphere.test", role: "organiser" },
  { email: "coordinator1@connectsphere.test", role: "coordinator" },
  { email: "venue_staff1@connectsphere.test", role: "venue_staff" },
  { email: "tech_support1@connectsphere.test", role: "tech_support" },
  { email: "attendee1@connectsphere.test", role: "attendee" },
];

/**
 * Creates the server-owned user shape returned after a successful session
 * login. Each role gets its own fixture so route-guard state is never tested
 * with an accidentally reused attendee identity.
 */
function userFor(email: string, role: User["role"]): User {
  return { id: `${role}-1`, email, name: role, role };
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText(/email/i), email);
  if (password) await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole("button", { name: /log in|signing in/i }));
  return user;
}

beforeEach(() => {
  mockAuthenticate.mockReset();
  // Zustand is a singleton. Reset authentication state and restore the real
  // action so no earlier test's session or one-off login double leaks here.
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: false,
    currentUser: { id: "current-user", name: "Current User", email: "", role: "attendee" },
    login: storeLogin,
  });
});

describe("LoginPage — PostgreSQL session authentication", () => {
  it("renders the sign-in form", () => {
    renderLoginPage();
    expect(screen.getByRole("heading", { name: /connectsphere/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  // USER-LOGIN-02-D: session restoration is resolved before the form is displayed.
  it("shows authentication loading during session restoration", () => {
    useAppStore.setState({ authLoading: true, isAuthenticated: false });
    renderLoginPage();
    expect(screen.getByText(/checking your sign-in status/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  // USER-LOGIN-02-C: an existing session redirects without exposing login fields.
  it("redirects an already authenticated user", async () => {
    useAppStore.setState({ isAuthenticated: true, currentUser: userFor("attendee1@connectsphere.test", "attendee") });
    renderLoginPage();
    expect(await screen.findByTestId("home-screen")).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  // USER-LOGIN-01-B: both blank fields are rejected before the backend is called.
  it("requires both fields and marks them invalid", async () => {
    renderLoginPage();
    await userEvent.setup().click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("aria-invalid", "true");
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  // USER-LOGIN-01-B: each missing field receives only its own validation message.
  it.each([
    ["email", "", PASSWORD, /email is required/i, /password is required/i],
    ["password", "attendee1@connectsphere.test", "", /password is required/i, /email is required/i],
  ])("requires the %s field independently", async (_, email, password, expected, absent) => {
    renderLoginPage();
    await fillAndSubmit(email, password);
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(absent)).not.toBeInTheDocument();
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  // USER-LOGIN-01-B: whitespace-only emails are not valid credentials.
  it("treats a whitespace-only email as missing", async () => {
    renderLoginPage();
    await fillAndSubmit("   ", PASSWORD);
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  // USER-LOGIN-01-B: correcting a field removes its old validation error.
  it("clears a validation error after corrected credentials are submitted", async () => {
    mockAuthenticate.mockResolvedValueOnce(userFor("attendee1@connectsphere.test", "attendee"));
    renderLoginPage();
    // First submit: no password yet.
    await fillAndSubmit("attendee1@connectsphere.test", "");
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
    const user = userEvent.setup();
    // Fix the field and resubmit with a seeded development credential.
    await user.type(screen.getByLabelText(/password/i), PASSWORD);
    await user.click(screen.getByRole("button", { name: /log in/i }));
    await waitFor(() => expect(screen.queryByText(/password is required/i)).not.toBeInTheDocument());
  });

  // USER-LOGIN-01-A and USER-LOGIN-02-A: every seeded role reaches the dashboard with its server role.
  it.each(seedAccounts)("signs in the $role seed account", async ({ email, role }) => {
    mockAuthenticate.mockResolvedValueOnce(userFor(email, role));
    renderLoginPage();
    await fillAndSubmit(email, PASSWORD);
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledWith(email, PASSWORD));
    expect(await screen.findByTestId("home-screen")).toBeInTheDocument();
    expect(useAppStore.getState().currentUser.role).toBe(role);
  });

  // USER-LOGIN-01-A: normalization occurs before credentials are sent to the backend.
  it("trims surrounding email whitespace before login", async () => {
    mockAuthenticate.mockResolvedValueOnce(userFor("attendee1@connectsphere.test", "attendee"));
    renderLoginPage();
    await fillAndSubmit(" attendee1@connectsphere.test ", PASSWORD);
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledWith("attendee1@connectsphere.test", PASSWORD));
  });

  // USER-LOGIN-01-C: a pending request disables the button and a second click is a no-op.
  it("prevents duplicate login while a request is pending", async () => {
    let resolveLogin!: (account: User) => void;
    mockAuthenticate.mockReturnValueOnce(new Promise<User>((resolve) => { resolveLogin = resolve; }));
    renderLoginPage();
    const user = await fillAndSubmit("attendee1@connectsphere.test", PASSWORD);
    const button = await screen.findByRole("button", { name: /signing in/i });
    expect(button).toBeDisabled();
    // A disabled browser control cannot cause another login request.
    await user.click(button);
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    resolveLogin(userFor("attendee1@connectsphere.test", "attendee"));
    expect(await screen.findByTestId("home-screen")).toBeInTheDocument();
  });

  // USER-LOGIN-02-B: the original protected route is restored after login.
  it("returns the user to the requested route", async () => {
    mockAuthenticate.mockResolvedValueOnce(userFor("organiser1@connectsphere.test", "organiser"));
    renderLoginPage({ from: "/events" });
    await fillAndSubmit("organiser1@connectsphere.test", PASSWORD);
    expect(await screen.findByTestId("events-screen")).toBeInTheDocument();
  });

  // USER-LOGIN-03-A: invalid credentials receive the generic server-safe error and retain the email.
  it("shows an invalid-credential error without creating a session", async () => {
    mockAuthenticate.mockRejectedValueOnce(new AuthError(401, "Invalid email or password"));
    renderLoginPage();
    await fillAndSubmit("attendee1@connectsphere.test", "wrong-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    // Retain the email so the user needs to correct only the password.
    expect(screen.getByLabelText(/email/i)).toHaveValue("attendee1@connectsphere.test");
    expect(screen.queryByTestId("home-screen")).not.toBeInTheDocument();
  });

  // USER-LOGIN-03-B: unexpected failures and missing error details never expose raw errors.
  it.each([
    ["an unexpected error", () => mockAuthenticate.mockRejectedValueOnce(new Error("database unavailable"))],
    ["a failed result without detail", () => useAppStore.setState({ login: vi.fn().mockResolvedValue({ success: false }) })],
  ])("shows a generic error for %s", async (_, arrange) => {
    arrange();
    renderLoginPage();
    await fillAndSubmit("attendee1@connectsphere.test", "wrong-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't sign you in. Please try again.");
  });

  // USER-LOGIN-03-C: the user can correct credentials after a failed attempt.
  it("re-enables the submit button after login fails", async () => {
    mockAuthenticate.mockRejectedValueOnce(new AuthError(401, "Invalid email or password"));
    renderLoginPage();
    await fillAndSubmit("attendee1@connectsphere.test", "wrong-password");
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /^log in$/i })).toBeEnabled();
  });

  // USER-LOGIN-03-D: a successful retry clears the stale error and opens the dashboard.
  it("clears an earlier error after a corrected retry", async () => {
    mockAuthenticate.mockRejectedValueOnce(new AuthError(401, "Invalid email or password"));
    mockAuthenticate.mockResolvedValueOnce(userFor("attendee1@connectsphere.test", "attendee"));
    renderLoginPage();
    await fillAndSubmit("attendee1@connectsphere.test", "wrong-password");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const user = userEvent.setup();
    // Correct the password and resubmit the same form instance.
    await user.clear(screen.getByLabelText(/password/i));
    await user.type(screen.getByLabelText(/password/i), PASSWORD);
    await user.click(screen.getByRole("button", { name: /^log in$/i }));
    expect(await screen.findByTestId("home-screen")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
