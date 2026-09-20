import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
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

export default function App() {
  const setAuthUser = useAppStore((s) => s.setAuthUser);
  const currentUserId = useAppStore((s) => s.currentUser.id);

  useEffect(() => {
    // Subscribes once for the lifetime of the app; keeps currentUser/
    // isAuthenticated in sync with Firebase, including restoring a session
    // that was already active when the page loads.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthUser(firebaseUser);
    });
    return unsubscribe;
  }, [setAuthUser]);

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
        <Route path="/" element={<EventListPage />} />

        <Route path="/events" element={<EventListPage />} />
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
