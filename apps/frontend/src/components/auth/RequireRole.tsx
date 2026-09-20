import { ReactElement } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { UserRole } from "@/types";
import { AuthLoadingScreen } from "./AuthLoadingScreen";
import { useAppStore } from "@/store/useAppStore";

/**
 * Restricts a route to users with one of the explicitly permitted roles.
 *
 * @param props - The guard configuration and child route element.
 * @param props.allowedRoles - Roles allowed to render the protected route.
 * @param props.children - An optional child route element. When omitted, the
 * guard renders the matching nested route through React Router's `Outlet`.
 * @returns A loading screen, redirect, or the authorized route content.
 */
export function RequireRole({
  allowedRoles,
  children,
}: {
  allowedRoles: readonly UserRole[];
  children?: ReactElement;
}) {
  const authLoading = useAppStore((state) => state.authLoading);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const role = useAppStore((state) => state.currentUser.role);
  const location = useLocation();

  if (authLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/events" replace />;
    const fallback =
      role === "venue_staff"
        ? "/venues"
        : role === "tech_support"
          ? "/equipment/requests"
          : "/events";
    return <Navigate to={fallback} replace />;
  }

  return children ?? <Outlet />;
}
// SPM-37 role guard
