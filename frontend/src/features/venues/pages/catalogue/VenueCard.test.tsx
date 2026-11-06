import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function renderCard(value: Venue, onBook?: () => void) {
  return render(
    <MemoryRouter>
      <VenueCard venue={value} onCheckAvailability={onBook} />
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
});

describe("VenueCard search results (SPM-52)", () => {
  /** SPM-52 AC6: each result lists its room layouts and key facilities. */
  it("VEN-SRCH-06-D lists every room layout offered by the venue", () => {
    render(
      <MemoryRouter>
        <VenueCard venue={{ ...venue, layouts: ["Classroom", "Boardroom"] }} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Layouts: Classroom, Boardroom")).toBeTruthy();
    expect(screen.getByText("AV System")).toBeTruthy();
    expect(screen.getByText("Wi-Fi")).toBeTruthy();
  });

  /** SPM-52 AC6: a venue with no recorded layouts says so instead of showing an empty list. */
  it("VEN-SRCH-06-E says when no room layout is recorded for the venue", () => {
    render(
      <MemoryRouter>
        <VenueCard venue={{ ...venue, layouts: [] }} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Layouts: None listed")).toBeTruthy();
  });

  /** SPM-52 AC6: each result offers exactly one "Check Availability" button and no separate availability link; the button invokes the availability action. */
  it("VEN-SRCH-06-F offers one Check Availability button per card and no separate availability link", async () => {
    const user = userEvent.setup();
    const onCheck = vi.fn();
    render(
      <MemoryRouter>
        <VenueCard venue={venue} onCheckAvailability={onCheck} />
      </MemoryRouter>,
    );

    const buttons = screen.getAllByRole("button", { name: "Check Availability" });
    expect(buttons).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /availability/i })).toBeNull();
    await user.click(buttons[0]);
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  /** SPM-52 AC6: each result shows the venue's location and capacity. */
  it("VEN-SRCH-06-G shows the venue's location and capacity on its card", () => {
    render(
      <MemoryRouter>
        <VenueCard venue={venue} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Test Building, Level 3")).toBeTruthy();
    expect(screen.getByText("Capacity: 120")).toBeTruthy();
  });
});
