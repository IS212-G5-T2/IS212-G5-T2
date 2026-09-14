import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useAppStore } from "@/store/useAppStore";
import { SEED_PASSWORD, SEED_USERS } from "@/test/fixtures/authUsers";
import { renderLoginPage } from "./testUtils";

// The store's `login` action calls Firebase directly, so we mock the SDK
// call at its source rather than the store action itself. This exercises
// the real client-side validation, the real store logic, and the real
// Firebase-error-to-message mapping in `@/lib/firebase` — only the network
// call is faked.
vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return {
    ...actual,
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  };
});

const mockSignIn = vi.mocked(signInWithEmailAndPassword);

function firebaseError(code: string) {
  return new FirebaseError(code, `Firebase: Error (${code}).`);
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText(/email/i), email);
  if (password) await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole("button", { name: /log in|signing in/i }));
  return user;
}

beforeEach(() => {
  mockSignIn.mockReset();
  // The store is a singleton, so each test starts from a known,
  // unauthenticated, "auth check finished" state instead of leaking
  // whatever the previous test left behind.
  useAppStore.setState({ isAuthenticated: false, authLoading: false });
});

describe("LoginPage — rendering", () => {
  it("renders the sign-in form", () => {
    renderLoginPage();

    expect(screen.getByRole("heading", { name: /connectsphere/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("shows a loading screen instead of the form while the initial auth check is in progress", () => {
    useAppStore.setState({ authLoading: true, isAuthenticated: false });
    renderLoginPage();

    expect(screen.getByText(/checking your sign-in status/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("redirects to / immediately if the user is already authenticated", async () => {
    useAppStore.setState({ authLoading: false, isAuthenticated: true });
    renderLoginPage();

    await waitFor(() => expect(screen.getByTestId("home-screen")).toBeInTheDocument());
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });
});

describe("LoginPage — client-side field validation", () => {
  it("requires both fields when the form is submitted empty", async () => {
    renderLoginPage();

    await userEvent.setup().click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("requires an email when only the password is filled in", async () => {
    renderLoginPage();
    await fillAndSubmit("", "some-password");

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.queryByText(/password is required/i)).not.toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("requires a password when only the email is filled in", async () => {
    renderLoginPage();
    await fillAndSubmit("attendee@connectsphere.sg", "");

    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
    expect(screen.queryByText(/email is required/i)).not.toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only email as missing", async () => {
    renderLoginPage();
    await fillAndSubmit("   ", "some-password");

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("marks invalid fields with aria-invalid for assistive tech", async () => {
    renderLoginPage();
    await userEvent.setup().click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("clears a field error on the next successful submission", async () => {
    mockSignIn.mockResolvedValueOnce({} as never);
    renderLoginPage();

    // First submit: no password yet.
    await fillAndSubmit("attendee@connectsphere.sg", "");
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();

    // Fix it and resubmit.
    await userEvent.setup().type(screen.getByLabelText(/password/i), SEED_PASSWORD);
    await userEvent.setup().click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.queryByText(/password is required/i)).not.toBeInTheDocument());
  });
});

describe("LoginPage — correct credentials", () => {
  it.each(SEED_USERS)(
    "signs in the $role account ($email) and redirects to /",
    async ({ email, password }) => {
      mockSignIn.mockResolvedValueOnce({} as never);
      renderLoginPage();

      await fillAndSubmit(email, password);

      await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
      expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), email, password);
      await waitFor(() => expect(screen.getByTestId("home-screen")).toBeInTheDocument());
    }
  );

  it("trims surrounding whitespace from the email before signing in", async () => {
    mockSignIn.mockResolvedValueOnce({} as never);
    renderLoginPage();

    await fillAndSubmit("  attendee@connectsphere.sg  ", SEED_PASSWORD);

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), "attendee@connectsphere.sg", SEED_PASSWORD)
    );
  });

  it("redirects back to the page the user originally tried to visit", async () => {
    mockSignIn.mockResolvedValueOnce({} as never);
    renderLoginPage({ from: "/events" });

    await fillAndSubmit("organiser@connectsphere.sg", SEED_PASSWORD);

    await waitFor(() => expect(screen.getByTestId("events-screen")).toBeInTheDocument());
  });

  it("disables the submit button and shows progress text while the request is in flight", async () => {
    let resolveSignIn!: () => void;
    mockSignIn.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignIn = () => resolve({} as never);
      })
    );
    renderLoginPage();

    await fillAndSubmit("attendee@connectsphere.sg", SEED_PASSWORD);

    const pendingButton = await screen.findByRole("button", { name: /signing in/i });
    expect(pendingButton).toBeDisabled();

    resolveSignIn();
    await waitFor(() => expect(screen.getByTestId("home-screen")).toBeInTheDocument());
  });
});

describe("LoginPage — incorrect credentials", () => {
  const cases: Array<{ description: string; code: string; expected: RegExp }> = [
    { description: "wrong password for an existing account", code: "auth/wrong-password", expected: /incorrect email or password/i },
    { description: "credential rejected (modern Firebase error for bad email/password)", code: "auth/invalid-credential", expected: /incorrect email or password/i },
    { description: "email with no matching account", code: "auth/user-not-found", expected: /couldn't find an account/i },
    { description: "malformed email address", code: "auth/invalid-email", expected: /email address doesn't look right/i },
    { description: "disabled account", code: "auth/user-disabled", expected: /account has been disabled/i },
    { description: "rate-limited after repeated bad attempts", code: "auth/too-many-requests", expected: /too many attempts/i },
    { description: "network failure while contacting Firebase", code: "auth/network-request-failed", expected: /network error/i },
    { description: "unrecognized Firebase error code", code: "auth/some-future-error-code", expected: /couldn't sign you in\. please try again/i },
  ];

  it.each(cases)("shows the right message for: $description", async ({ code, expected }) => {
    mockSignIn.mockRejectedValueOnce(firebaseError(code));
    renderLoginPage();

    await fillAndSubmit("attendee@connectsphere.sg", "wrong-password");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(expected);
    // Fields keep their entered values so the user can correct just the
    // password without retyping the email.
    expect(screen.getByLabelText(/email/i)).toHaveValue("attendee@connectsphere.sg");
    expect(screen.queryByTestId("home-screen")).not.toBeInTheDocument();
  });

  it("falls back to a generic message for a non-Firebase error", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("boom"));
    renderLoginPage();

    await fillAndSubmit("attendee@connectsphere.sg", "irrelevant");

    expect(await screen.findByText(/couldn't sign you in\. please try again/i)).toBeInTheDocument();
  });

  it("re-enables the submit button after a failed attempt so the user can retry", async () => {
    mockSignIn.mockRejectedValueOnce(firebaseError("auth/wrong-password"));
    renderLoginPage();

    await fillAndSubmit("attendee@connectsphere.sg", "wrong-password");

    await screen.findByText(/incorrect email or password/i);
    const button = screen.getByRole("button", { name: /^log in$/i });
    expect(button).toBeEnabled();
  });

  it("clears the previous error banner as soon as a new attempt is submitted", async () => {
    mockSignIn.mockRejectedValueOnce(firebaseError("auth/wrong-password"));
    mockSignIn.mockResolvedValueOnce({} as never);
    renderLoginPage();

    await fillAndSubmit("attendee@connectsphere.sg", "wrong-password");
    expect(await screen.findByText(/incorrect email or password/i)).toBeInTheDocument();

    // Correct the password and resubmit.
    const passwordInput = screen.getByLabelText(/password/i);
    await userEvent.setup().clear(passwordInput);
    await userEvent.setup().type(passwordInput, SEED_PASSWORD);
    await userEvent.setup().click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() => expect(screen.getByTestId("home-screen")).toBeInTheDocument());
  });

  it("does not call Firebase again while a previous request is still pending", async () => {
    let resolveSignIn!: () => void;
    mockSignIn.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignIn = () => resolve({} as never);
      })
    );
    renderLoginPage();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "attendee@connectsphere.sg");
    await user.type(screen.getByLabelText(/password/i), SEED_PASSWORD);
    await user.click(screen.getByRole("button", { name: /log in/i }));
    // Button is now disabled; a second click is a no-op.
    await user.click(await screen.findByRole("button", { name: /signing in/i }));

    expect(mockSignIn).toHaveBeenCalledTimes(1);
    resolveSignIn();
    await waitFor(() => expect(screen.getByTestId("home-screen")).toBeInTheDocument());
  });
});
