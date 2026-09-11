import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/FormControls";
import { useAppStore } from "@/store/useAppStore";

interface LocationState {
  from?: { pathname: string };
}

interface FieldErrors {
  username?: string;
  password?: string;
}

export function LoginPage() {
  const login = useAppStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? "/";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: FieldErrors = {};
    if (!username.trim()) nextErrors.username = "Username is required.";
    if (!password) nextErrors.password = "Password is required.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const success = login(username, password);
    setSubmitting(false);

    if (success) {
      navigate(redirectTo, { replace: true });
    } else {
      setFormError("We couldn't sign you in with those details. Please try again.");
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
            <form noValidate onSubmit={handleSubmit}>
              {formError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800 dark:border-danger-800 dark:bg-danger-900/30 dark:text-danger-300"
                >
                  {formError}
                </div>
              )}

              <TextInput
                label="Username"
                name="username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                error={fieldErrors.username}
                placeholder="e.g. jane.doe"
              />

              <TextInput
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                placeholder="••••••••"
              />

              <Button type="submit" className="mt-2 w-full" disabled={submitting}>
                {submitting ? "Signing in…" : "Log in"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
          Sign-in is not yet connected to a real identity provider. Any username and password will work.
        </p>
      </div>
    </div>
  );
}
