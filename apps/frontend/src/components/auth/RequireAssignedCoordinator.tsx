import { ReactElement } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { AuthLoadingScreen } from "./AuthLoadingScreen";
import { useAppStore } from "@/store/useAppStore";
import { hasRole } from "@/types";

/**
 * Restricts event-change reviews to the coordinator assigned to that event.
 * The event ID is read from the current route's `:id` parameter.
 *
 * @param props - The protected route element.
 * @param props.children - An optional child route element. When omitted, the
 * guard renders the matching nested route through React Router's `Outlet`.
 * @returns A loading screen, redirect, or the authorized route content.
 */
export function RequireAssignedCoordinator({ children }: { children?: ReactElement }) {
  const authLoading = useAppStore((state) => state.authLoading);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const currentUser = useAppStore((state) => state.currentUser);
  const events = useAppStore((state) => state.events);
  const { id } = useParams();
  const location = useLocation();

  if (authLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const event = events.find((candidate) => candidate.id === id);
  const isAssignedCoordinator =
    hasRole(currentUser, "coordinator") && event?.coordinatorId === currentUser.id;

  if (!isAssignedCoordinator) {
    return <Navigate to="/events" replace />;
  }

  return children ?? <Outlet />;
}
