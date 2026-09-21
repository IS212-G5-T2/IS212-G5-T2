import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { EventCard } from "@/components/domain/EventCard";
import type { EventRecord } from "@/types";

function baseEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setHours(21, 0, 0, 0);

  return {
    id: "00000000-0000-4000-8000-000000000036",
    name: "test 1",
    purpose: "d",
    description: "",
    organiserId: "organiser-1",
    organiserName: "Demo Organiser",
    status: "submitted",
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    expectedAttendance: 1,
    venueRequirements: {
      minCapacity: 1,
      layout: "Boardroom",
      facilities: [],
      accessibility: [],
    },
    attachments: [],
    equipmentNeeds: "",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("EventCard", () => {
  // A round-robin-assigned coordinator's email is long and unbroken, which
  // previously overflowed the card's fixed-width grid cell.
  it("truncates a long coordinator email instead of overflowing the card", () => {
    render(
      <MemoryRouter>
        <EventCard
          event={baseEvent({ coordinatorId: "coord-9", coordinatorName: "coordinator@connectsphere.sg" })}
        />
      </MemoryRouter>,
    );

    const coordinatorValue = screen.getByText("coordinator@connectsphere.sg");
    expect(coordinatorValue.className).toContain("truncate");
    expect(coordinatorValue).toHaveProperty("title", "coordinator@connectsphere.sg");
    expect(coordinatorValue.parentElement?.className).toContain("min-w-0");
  });

  it("shows Unassigned when no coordinator has been assigned yet", () => {
    render(
      <MemoryRouter>
        <EventCard event={baseEvent({ coordinatorId: undefined, coordinatorName: undefined })} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  it("truncates a long venue name the same way as a long coordinator email", () => {
    const longVenueName = "The Grand Ballroom at the Downtown Convention and Exhibition Centre";
    render(
      <MemoryRouter>
        <EventCard event={baseEvent({ venueName: longVenueName })} />
      </MemoryRouter>,
    );

    const venueValue = screen.getByText(longVenueName);
    expect(venueValue.className).toContain("truncate");
    expect(venueValue).toHaveProperty("title", longVenueName);
    expect(venueValue.parentElement?.className).toContain("min-w-0");
  });

  it("shows Not booked when no venue has been booked yet", () => {
    render(
      <MemoryRouter>
        <EventCard event={baseEvent({ venueName: undefined })} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Not booked")).toBeTruthy();
  });
});
