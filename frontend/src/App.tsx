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
import { VenueRecordsPage } from "@/pages/venue-records/VenueRecordsPage";
import { VenueRecordDetailPage } from "@/pages/venue-records/VenueRecordDetailPage";
import { VenueAvailabilityPage } from "@/pages/VenueAvailabilityPage";
import { BookingsPage } from "@/pages/BookingsPage";
import { EquipmentPage } from "@/pages/EquipmentPage";
import { EquipmentRequestsPage } from "@/pages/EquipmentRequestsPage";
import { EquipmentAvailabilityPage } from "@/pages/EquipmentAvailabilityPage";
import { EquipmentCreatePage } from "@/pages/EquipmentCreatePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { VenueCreatePage } from "@/pages/venues/VenueCreatePage/VenueCreatePage";
import { AssignmentQueuePage } from "@/pages/AssignmentQueuePage";
import { homePathByRole } from "@/components/layout/navConfig";

function RootRedirect() {
  const role = useAppStore((state) => state.currentUser.role);
  return <Navigate to={homePathByRole[role]} replace />;
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

        <Route element={<RequireRole allowedRoles={["coordinator"]} />}>
          <Route path="/venues" element={<VenuesPage />} />
          <Route path="/venues/:id" element={<VenueDetailPage />} />
        </Route>
        <Route element={<RequireRole allowedRoles={["coordinator", "venue_staff"]} />}>
          <Route path="/venues/availability" element={<VenueAvailabilityPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/venue-records" element={<VenueRecordsPage />} />
          <Route path="/venue-records/:id" element={<VenueRecordDetailPage />} />
        </Route>
        <Route element={<RequireRole allowedRoles={["venue_staff"]} />}>
          <Route path="/venues/create" element={<VenueCreatePage />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["tech_support"]} />}>
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/equipment/availability" element={<EquipmentAvailabilityPage />} />
          <Route path="/equipment/create" element={<EquipmentCreatePage />} />
        </Route>
        <Route element={<RequireRole allowedRoles={["coordinator", "tech_support"]} />}>
          <Route path="/equipment/requests" element={<EquipmentRequestsPage />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["coordinator_lead"]} />}>
          <Route path="/lead/queue" element={<AssignmentQueuePage />} />
        </Route>

        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
