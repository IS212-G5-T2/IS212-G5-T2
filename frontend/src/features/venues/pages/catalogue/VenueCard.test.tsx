import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Venue } from "@/types";
import { VenueCard } from "./VenueCard";

const venue: Venue = {
  id: "venue-1",
  name: "Orchid Hall",
  location: "Test Building, Level 3",
  capacity: 120,
  facilities: ["AV System", "Wi-Fi"],
  accessibility: ["Wheelchair access"],
  layouts: ["Classroom"],
  operatingInformation: "Closed on public holidays",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};

function renderCard(
  value: Venue,
  onBook?: () => void,
  highlightSuitable = true,
) {
  return render(
    <MemoryRouter>
      <VenueCard venue={value} highlightSuitable={highlightSuitable} onCheckAvailability={onBook} />
    </MemoryRouter>,
  );
}

describe("VenueCard", () => {
  // Operating information remains visible; deprecated hours never appear on a catalogue card.
  it("renders operating information and durations without an image", () => {
    renderCard(venue);

    expect(screen.getByRole("heading", { name: "Orchid Hall" })).toBeTruthy();
    expect(screen.queryByText(/Hours:/i)).toBeNull();
    expect(screen.getByText("Info: Closed on public holidays")).toBeTruthy();
    expect(screen.getByText("Setup: 30 min · Turnaround: 45 min")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link", { name: /view details/i }).getAttribute("href")).toBe(
      "/venues/venue-1",
    );
    expect(screen.getByText("Suitable")).toBeTruthy();
  });

  // Optional saved images and availability navigation must remain connected to the card UI.
  it("shows the venue image and invokes the availability action", () => {
    const onBook = vi.fn();
    renderCard(
      {
        ...venue,
        image: {
          name: "orchid.png",
          type: "image/png",
          size: 4,
          dataUrl: "data:image/png;base64,dGVzdA==",
        },
      },
      onBook,
    );

    expect(screen.getByRole("img", { name: "Orchid Hall venue" }).getAttribute("src")).toBe(
      "data:image/png;base64,dGVzdA==",
    );
    screen.getByRole("button", { name: "Check Availability" }).click();
    expect(onBook).toHaveBeenCalledOnce();
  });

  // Cards without suitability emphasis must omit the suitability badge.
  it("omits the Suitable badge when the venue is not highlighted", () => {
    renderCard(venue, undefined, false);

    expect(screen.queryByText("Suitable")).toBeNull();
  });
});
