import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireAssignedCoordinator } from "@/components/auth/RequireAssignedCoordinator";
import { RequireEventOwner } from "@/components/auth/RequireEventOwner";
import { RequireRole } from "@/components/auth/RequireRole";
import { LoginPage } from "@/pages/account/LoginPage/LoginPage";
import { EventListPage } from "@/pages/events/EventListPage/EventListPage";
import { EventDetailPage } from "@/pages/events/EventDetailPage/EventDetailPage";
import { EventCreatePage } from "@/pages/events/EventCreatePage/EventCreatePage";
import { MyRequestsPage } from "@/pages/events/MyRequestsPage/MyRequestsPage";
import { EventEditPage } from "@/pages/events/EventEditPage/EventEditPage";
import { EventChangeRequestsPage } from "@/pages/events/EventChangeRequestsPage/EventChangeRequestsPage";
import { VenuesPage } from "@/pages/venues/VenuesPage/VenuesPage";
import { VenueDetailPage } from "@/pages/venues/VenueDetailPage/VenueDetailPage";
import { VenueAvailabilityPage } from "@/pages/venues/VenueAvailabilityPage/VenueAvailabilityPage";
import { BookingsPage } from "@/pages/bookings/BookingsPage/BookingsPage";
import { EquipmentPage } from "@/pages/equipment/EquipmentPage/EquipmentPage";
import { EquipmentRequestsPage } from "@/pages/equipment/EquipmentRequestsPage/EquipmentRequestsPage";
import { EquipmentAvailabilityPage } from "@/pages/equipment/EquipmentAvailabilityPage/EquipmentAvailabilityPage";
import { SettingsPage } from "@/pages/settings/SettingsPage/SettingsPage";

function RootRedirect() {
  const role = useAppStore((state) => state.currentUser.role);
  if (role === "venue_staff") {
    return <Navigate to="/venues" replace />;
  }
  if (role === "tech_support") {
    return <Navigate to="/equipment/requests" replace />;
  }
  return <Navigate to="/events" replace />;
}

export default function App() {
  const restoreAuthSession = useAppStore((s) => s.restoreAuthSession);
  const currentUserId = useAppStore((s) => s.currentUser.id);

  useEffect(() => {
    void restoreAuthSession();
  }, [restoreAuthSession]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell key={currentUserId} />
          </RequireAuth>
        }
      >
        <Route path="/" element={<RootRedirect />} />

        <Route element={<RequireRole allowedRoles={["coordinator", "organiser", "attendee"]} />}>
          <Route path="/events" element={<EventListPage />} />
        </Route>
        <Route element={<RequireRole allowedRoles={["organiser"]} />}>
          <Route path="/events/create" element={<EventCreatePage />} />
          <Route path="/requests" element={<MyRequestsPage />} />
          <Route path="/requests/:id" element={<EventCreatePage />} />
          <Route element={<RequireEventOwner />}>
            <Route path="/events/:id/edit" element={<EventEditPage />} />
          </Route>
        </Route>
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route element={<RequireAssignedCoordinator />}>
          <Route path="/events/:id/change-requests" element={<EventChangeRequestsPage />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["coordinator", "venue_staff"]} />}>
          <Route path="/venues" element={<VenuesPage />} />
          <Route path="/venues/availability" element={<VenueAvailabilityPage />} />
          <Route path="/venues/:id" element={<VenueDetailPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["coordinator", "tech_support"]} />}>
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/equipment/requests" element={<EquipmentRequestsPage />} />
          <Route path="/equipment/availability" element={<EquipmentAvailabilityPage />} />
        </Route>

        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
