import { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";

/**
 * Gates its children behind sign-in. Unauthenticated visitors are redirected
 * to /login, preserving the page they were trying to reach so LoginPage can
 * send them back after a successful sign-in. Shows a brief loading state
 * while the backend resolves whether a local session already exists.
 */
export function RequireAuth({ children }: { children: ReactElement }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const authLoading = useAppStore((s) => s.authLoading);
  const location = useLocation();

  if (authLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
