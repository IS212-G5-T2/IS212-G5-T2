import { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";

/**
 * Gates its children behind sign-in. Unauthenticated visitors are redirected
 * to /login, preserving the page they were trying to reach so LoginPage can
 * send them back after a successful sign-in.
 */
export function RequireAuth({ children }: { children: ReactElement }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
