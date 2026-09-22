import { ReactElement } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { AuthLoadingScreen } from "./AuthLoadingScreen";
import { useAppStore } from "@/store/useAppStore";
import { hasRole } from "@/types";

/**
 * Restricts organiser event routes to the organiser responsible for the event.
 * The event ID is read from the current route's `:id` parameter.
 *
 * @param props - The protected route element.
 * @param props.children - An optional child route element. When omitted, the
 * guard renders the matching nested route through React Router's `Outlet`.
 * @returns A loading screen, redirect, or the authorized route content.
 */
export function RequireEventOwner({ children }: { children?: ReactElement }) {
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
  const isOwner = hasRole(currentUser, "organiser") && event?.organiserId === currentUser.id;

  if (!isOwner) {
    return <Navigate to="/events" replace />;
  }

  return children ?? <Outlet />;
}
