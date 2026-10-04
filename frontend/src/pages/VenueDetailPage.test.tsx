import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Venue } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import { VenueDetailPage } from "./VenueDetailPage";

const venue: Venue = {
  id: "venue-1",
  name: "Orchid Hall",
  location: "Test Building, Level 3",
  capacity: 120,
  facilities: ["AV System"],
  accessibility: ["Wheelchair access"],
  layouts: ["Classroom"],
  operatingHours: "08:00–22:00",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};

function renderDetail(id = venue.id) {
  return render(
    <MemoryRouter initialEntries={[`/venues/${id}`]}>
      <Routes>
        <Route path="/venues/:id" element={<VenueDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VenueDetailPage", () => {
  beforeEach(() => {
    useAppStore.setState({ venues: [venue], bookings: [] });
  });

  // Saved setup and turnaround values must be presented on the venue detail page.
  it("renders venue details and durations when no image is saved", () => {
    renderDetail();

    expect(screen.getByRole("heading", { name: "Orchid Hall" })).toBeTruthy();
    expect(screen.getByText("30 minutes")).toBeTruthy();
    expect(screen.getByText("45 minutes")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("No bookings recorded.")).toBeTruthy();
  });

  // A persisted optional image must render with meaningful alternative text.
  it("renders a saved venue image", () => {
    useAppStore.setState({
      venues: [
        {
          ...venue,
          image: {
            name: "orchid.png",
            type: "image/png",
            size: 4,
            dataUrl: "data:image/png;base64,dGVzdA==",
          },
        },
      ],
    });
    renderDetail();

    expect(screen.getByRole("img", { name: "Orchid Hall venue" }).getAttribute("src")).toBe(
      "data:image/png;base64,dGVzdA==",
    );
  });

  // Bookings linked to this venue must remain visible while unrelated venue bookings stay filtered out.
  it("renders only bookings associated with the displayed venue", () => {
    useAppStore.setState({
      bookings: [
        {
          id: "booking-1",
          eventId: "event-1",
          eventName: "Planning Workshop",
          venueId: venue.id,
          venueName: venue.name,
          requestedBy: "staff-1",
          start: "2030-01-10T18:00:00.000Z",
          end: "2030-01-10T21:00:00.000Z",
          status: "approved",
          createdAt: "2030-01-01T00:00:00.000Z",
        },
        {
          id: "booking-2",
          eventId: "event-2",
          eventName: "Other Venue Meeting",
          venueId: "other-venue",
          venueName: "Other Venue",
          requestedBy: "staff-2",
          start: "2030-01-11T18:00:00.000Z",
          end: "2030-01-11T20:00:00.000Z",
          status: "pending",
          createdAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    renderDetail();

    expect(screen.getByText("Planning Workshop")).toBeTruthy();
    expect(screen.queryByText("Other Venue Meeting")).toBeNull();
    expect(screen.queryByText("No bookings recorded.")).toBeNull();
  });

  // Unknown identifiers must keep the existing not-found behavior.
  it("reports when the requested venue does not exist", () => {
    renderDetail("missing");

    expect(screen.getByText("Venue not found.")).toBeTruthy();
  });
});
