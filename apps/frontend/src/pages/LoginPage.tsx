import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/FormControls";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { useAppStore } from "@/store/useAppStore";

interface LocationState {
  from?: { pathname: string };
}

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginPage() {
  const login = useAppStore((s) => s.login);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const authLoading = useAppStore((s) => s.authLoading);
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? "/";

  // Already signed in (e.g. Firebase restored a session) and landed on
  // /login anyway — send them straight through instead of showing the form.
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirectTo]);

  if (authLoading || isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: FieldErrors = {};
    if (!email.trim()) nextErrors.email = "Email is required.";
    if (!password) nextErrors.password = "Password is required.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);

    if (result.success) {
      navigate(redirectTo, { replace: true });
    } else {
      setFormError(result.error ?? "We couldn't sign you in. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="text-3xl" aria-hidden="true">
            🌐
          </span>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">ConnectSphere</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sign in to manage events, venues, and bookings.
          </p>
        </div>

        <Card>
          <CardBody>
            <form noValidate autoComplete='off' onSubmit={handleSubmit}>
              {formError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800 dark:border-danger-800 dark:bg-danger-900/30 dark:text-danger-300"
                >
                  {formError}
                </div>
              )}

              <TextInput
                label="Email"
                name="email"
                type="email"
                autoComplete="off"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldErrors.email}
              />

              <TextInput
                label="Password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
              />

              <Button type="submit" className="mt-2 w-full" disabled={submitting}>
                {submitting ? "Signing in…" : "Log in"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
