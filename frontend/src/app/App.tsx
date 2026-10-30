import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireEventOwner } from "@/components/auth/RequireEventOwner";
import { RequireRole } from "@/components/auth/RequireRole";
import { LoginPage } from "@/features/account/pages/login/LoginPage";
import { EventListPage } from "@/features/events/pages/list/EventListPage";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { RegistrationReportPage } from "@/features/registrations/pages/report/RegistrationReportPage";
import { EventCreatePage } from "@/features/events/pages/create/EventCreatePage";
import { MyRequestsPage } from "@/features/events/pages/drafts/MyRequestsPage";
import { EventEditPage } from "@/features/events/pages/edit/EventEditPage";
import { EventChangeRequestsPage } from "@/features/events/pages/EventChangeRequestsPage";
import { VenuesPage } from "@/features/venues/pages/catalogue/VenuesPage";
import { VenueDetailPage } from "@/features/venues/pages/detail/VenueDetailPage";
import { VenueRecordsPage } from "@/features/venues/pages/records/catalogue/VenueRecordsPage";
import { VenueRecordDetailPage } from "@/features/venues/pages/records/detail/VenueRecordDetailPage";
import { BookingsPage } from "@/features/bookings/pages/requests/BookingsPage";
import { EquipmentPage } from "@/features/equipment/pages/EquipmentPage";
import { EquipmentRequestsPage } from "@/features/equipment/pages/requests/EquipmentRequestsPage";
import { EquipmentRequestEditorPage } from "@/features/equipment/pages/requests/EquipmentRequestEditorPage";
import { EquipmentInventoryPage } from "@/features/equipment/pages/inventory/EquipmentInventoryPage";
import { EquipmentAvailabilityCheckPage } from "@/features/equipment/pages/availability-check/EquipmentAvailabilityCheckPage";
import { AuditTrailPage } from "@/features/equipment/pages/audit-trail/AuditTrailPage";
import { EquipmentCreatePage } from "@/features/equipment/pages/create/EquipmentCreatePage";
import { EquipmentEditPage } from "@/features/equipment/pages/edit/EquipmentEditPage";
import { SettingsPage } from "@/features/account/pages/settings/SettingsPage";
import { VenueCreatePage } from "@/features/venues/pages/create/VenueCreatePage";
import { AssignmentQueuePage } from "@/features/lead/pages/assignment-queue/AssignmentQueuePage";
import { ReassignmentPage } from "@/features/lead/pages/reassignment/ReassignmentPage";
import { SafetyEventsPage } from "@/features/safety/pages/SafetyEventsPage";
import { dashboardPathByRole } from "@/components/layout/navConfig";

function RootRedirect() {
  const role = useAppStore((state) => state.currentUser.role);
  return <Navigate to={dashboardPathByRole[role]} replace />;
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

        {/* SPM-33 and SPM-34 AC2: Venue Staff and Technical Support land on the Events Dashboard. */}
        <Route element={<RequireRole allowedRoles={["coordinator", "organiser", "attendee", "venue_staff", "tech_support"]} />}>
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
        {/* SPM-63: access is decided by the server (MSG-08 on refusal), so no client role redirect here. */}
        <Route path="/events/:id/registrations/report" element={<RegistrationReportPage />} />
        {/* SPM-64: the owning organiser and the assigned coordinator; the server decides ownership (404 otherwise). */}
        <Route element={<RequireRole allowedRoles={["organiser", "coordinator"]} />}>
          <Route path="/events/:id/change-requests" element={<EventChangeRequestsPage />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["coordinator"]} />}>
          <Route path="/venues" element={<VenuesPage />} />
          <Route path="/venues/:id" element={<VenueDetailPage />} />
        </Route>
        <Route element={<RequireRole allowedRoles={["coordinator", "venue_staff"]} />}>
          {/* Retire the old summary URL without letting /venues/:id misread it as a venue id. */}
          <Route path="/venues/availability" element={<Navigate to="/venue-records" replace />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/venue-records" element={<VenueRecordsPage />} />
          <Route path="/venue-records/:id" element={<VenueRecordDetailPage />} />
        </Route>
        <Route element={<RequireRole allowedRoles={["venue_staff"]} />}>
          <Route path="/venues/create" element={<VenueCreatePage />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["tech_support"]} />}>
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/equipment/inventory" element={<EquipmentInventoryPage />} />
          <Route path="/equipment/availability" element={<EquipmentAvailabilityCheckPage />} />
          <Route path="/equipment/audit-trail" element={<AuditTrailPage />} />
          <Route path="/equipment/create" element={<EquipmentCreatePage />} />
          <Route path="/equipment/:id/edit" element={<EquipmentEditPage />} />
        </Route>
        <Route element={<RequireRole allowedRoles={["coordinator", "tech_support"]} />}>
          <Route path="/equipment/requests" element={<EquipmentRequestsPage />} />
        </Route>
        <Route element={<RequireRole allowedRoles={["coordinator"]} />}>
          <Route path="/equipment/requests/create" element={<EquipmentRequestEditorPage />} />
          <Route path="/equipment/requests/:requestId/update" element={<EquipmentRequestEditorPage />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["coordinator_lead"]} />}>
          <Route path="/lead/queue" element={<AssignmentQueuePage />} />
          <Route path="/lead/reassign" element={<ReassignmentPage />} />
        </Route>

        <Route element={<RequireRole allowedRoles={["safety_officer"]} />}>
          <Route path="/safety/events" element={<SafetyEventsPage />} />
        </Route>

        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
