import type { User, UserRole } from "@/types";

export interface NavItem {
  label: string;
  to: string;
  icon: string;
  feature: string;
}

export const navByRole: Record<UserRole, NavItem[]> = {
  organiser: [
    { label: "My Events", to: "/events", icon: "📅", feature: "Feature 5, 6" },
    { label: "My Drafts", to: "/requests", icon: "📝", feature: "Feature 1" },
    { label: "Create Event", to: "/events/create", icon: "➕", feature: "Feature 1, 2" },
  ],
  coordinator: [
    { label: "Events", to: "/events", icon: "📅", feature: "Feature 3, 4, 5, 6" },
    { label: "Venues", to: "/venues", icon: "🏛️", feature: "Feature 7, 8" },
    { label: "Venue Availability", to: "/venues/availability", icon: "🗓️", feature: "Feature 8" },
    { label: "Bookings", to: "/bookings", icon: "📝", feature: "Feature 9, 11" },
    { label: "Equipment", to: "/equipment/requests", icon: "🎛️", feature: "Feature 12" },
  ],
  venue_staff: [
    { label: "Venue Catalogue", to: "/venues", icon: "🏛️", feature: "Feature 7" },
    { label: "Create Venue", to: "/venues/create", icon: "➕", feature: "SPM-50" },
    { label: "Availability Calendar", to: "/venues/availability", icon: "🗓️", feature: "Feature 8" },
    { label: "Booking Requests", to: "/bookings", icon: "📝", feature: "Feature 10, 11" },
  ],
  tech_support: [
    { label: "Equipment Requests", to: "/equipment/requests", icon: "🎛️", feature: "Feature 12" },
    { label: "Equipment Availability", to: "/equipment/availability", icon: "🗓️", feature: "Feature 13" },
    { label: "Reservations", to: "/equipment", icon: "📦", feature: "Feature 14" },
  ],
  attendee: [
    { label: "Browse Events", to: "/events", icon: "📅", feature: "Feature 6" },
  ],
  coordinator_lead: [
    { label: "Assignment Queue", to: "/lead/queue", icon: "🗂️", feature: "Feature 3" },
  ],
};

/** Where each role lands after sign-in, and when sent away from a route it can't use. */
export const homePathByRole: Record<UserRole, string> = {
  organiser: "/events",
  coordinator: "/events",
  attendee: "/events",
  venue_staff: "/venues",
  tech_support: "/equipment/requests",
  coordinator_lead: "/lead/queue",
};

export const roleLabels: Record<UserRole, string> = {
  organiser: "Event Organiser",
  coordinator: "Event Coordinator",
  venue_staff: "Venue Staff",
  tech_support: "Technical Support Staff",
  attendee: "Attendee",
  coordinator_lead: "Event Coordinator Lead",
};

/**
 * Builds a sidebar from every role the server granted to the signed-in user.
 * Shared destinations are kept once, using the first role's label and order.
 */
export function navigationFor(user: Pick<User, "role" | "roles">): NavItem[] {
  const grantedRoles = user.roles ?? [user.role];
  const destinations = new Set<string>();

  return grantedRoles.flatMap((role) =>
    navByRole[role].filter((item) => {
      if (destinations.has(item.to)) return false;
      destinations.add(item.to);
      return true;
    }),
  );
}
