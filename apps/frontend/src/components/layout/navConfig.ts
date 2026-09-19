import type { UserRole } from "@/types";

export interface NavItem {
  label: string;
  to: string;
  icon: string;
  feature: string;
}

export const navByRole: Record<UserRole, NavItem[]> = {
  organiser: [
    { label: "Event Planning", to: "/planning", icon: "🗓️", feature: "Feature 1" },
    { label: "My Events", to: "/events", icon: "📅", feature: "Feature 5, 6" },
    { label: "My Requests", to: "/requests", icon: "📝", feature: "Feature 1" },
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
};

export const roleLabels: Record<UserRole, string> = {
  organiser: "Event Organiser",
  coordinator: "Event Coordinator",
  venue_staff: "Venue Staff",
  tech_support: "Technical Support Staff",
  attendee: "Attendee",
};
