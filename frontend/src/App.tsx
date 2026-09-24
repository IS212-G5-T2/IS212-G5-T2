import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireAssignedCoordinator } from "@/components/auth/RequireAssignedCoordinator";
import { RequireEventOwner } from "@/components/auth/RequireEventOwner";
import { RequireRole } from "@/components/auth/RequireRole";
import { LoginPage } from "@/pages/LoginPage";
import { EventListPage } from "@/pages/EventListPage";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { EventCreatePage } from "@/pages/EventCreatePage";
import { MyRequestsPage } from "@/pages/MyRequestsPage";
import { EventEditPage } from "@/pages/EventEditPage";
import { EventChangeRequestsPage } from "@/pages/EventChangeRequestsPage";
import { VenuesPage } from "@/pages/VenuesPage";
import { VenueDetailPage } from "@/pages/VenueDetailPage";
import { VenueAvailabilityPage } from "@/pages/VenueAvailabilityPage";
import { BookingsPage } from "@/pages/BookingsPage";
import { EquipmentPage } from "@/pages/EquipmentPage";
import { EquipmentRequestsPage } from "@/pages/EquipmentRequestsPage";
import { EquipmentAvailabilityPage } from "@/pages/EquipmentAvailabilityPage";
import { SettingsPage } from "@/pages/SettingsPage";

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
