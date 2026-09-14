import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { EventListPage } from "@/pages/EventListPage";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { EventCreatePage } from "@/pages/EventCreatePage";
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
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<EventListPage />} />

        <Route path="/planning" element={<EventListPage />} />
        <Route path="/events" element={<EventListPage />} />
        <Route path="/events/create" element={<EventCreatePage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/events/:id/edit" element={<EventEditPage />} />
        <Route path="/events/:id/change-requests" element={<EventChangeRequestsPage />} />

        <Route path="/venues" element={<VenuesPage />} />
        <Route path="/venues/availability" element={<VenueAvailabilityPage />} />
        <Route path="/venues/:id" element={<VenueDetailPage />} />

        <Route path="/bookings" element={<BookingsPage />} />

        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/equipment/requests" element={<EquipmentRequestsPage />} />
        <Route path="/equipment/availability" element={<EquipmentAvailabilityPage />} />

        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
