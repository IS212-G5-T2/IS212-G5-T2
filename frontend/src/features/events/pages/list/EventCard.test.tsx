import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { EventCard } from "@/features/events/pages/list/EventCard";
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("EventCard", () => {
  // An assigned coordinator's email is long and unbroken, which
  // previously overflowed the card's fixed-width grid cell.
  // Kills: the coordinator value without its truncate class, title attribute or min-w-0 wrapper, so a long email overflows the card.
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

  // Kills: an event with no coordinator showing a blank cell or a name instead of 'Unassigned'.
  it("shows Unassigned when no coordinator has been assigned yet", () => {
    render(
      <MemoryRouter>
        <EventCard event={baseEvent({ coordinatorId: undefined, coordinatorName: undefined })} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  // Kills: a long venue name without the truncate class, title or min-w-0 wrapper, so it overflows the card.
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

  // Kills: the card altering the server venue text (pending label stripped) or replacing it with 'Not booked'.
  /** The card shows the venue text the server sends, including its "(pending)" label, unchanged. */
  it("shows the server venue text, including a pending label, on the card", () => {
    render(
      <MemoryRouter>
        <EventCard event={baseEvent({ venueName: "Breakout Room 1 (pending)" })} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Breakout Room 1 (pending)")).toBeTruthy();
    expect(screen.queryByText("Not booked")).toBeNull();
  });

  // Kills: an event with no venue showing a blank cell instead of 'Not booked'.
  it("shows Not booked when no venue has been booked yet", () => {
    render(
      <MemoryRouter>
        <EventCard event={baseEvent({ venueName: undefined })} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Not booked")).toBeTruthy();
  });

  // SPM-46 AC2: a reassigned event is labelled in the coordinator's list, with who it came from.
  // Kills: F1 ("Reassigned" label on every card).
  it("REASN-VIEW-02-F labels a reassigned event \"Reassigned\" with the coordinator it came from, and nothing else", () => {
    // Arrange + Act: one reassigned event and one that never was.
    render(
      <MemoryRouter>
        <EventCard event={baseEvent({ id: "reassigned", name: "Moved event", coordinatorName: "Coordinator 2", reassignedFrom: { coordinatorName: "Coordinator 1", reassignedAt: "2026-10-07T06:05:00.000Z" } })} />
        <EventCard event={baseEvent({ id: "original", name: "Untouched event", coordinatorName: "Coordinator 2" })} />
      </MemoryRouter>,
    );

    // Assert: only the moved event shows the label and where it came from.
    const moved = screen.getByText("Moved event").closest("a, article, div[class]") as HTMLElement;
    expect(screen.getAllByText("Reassigned")).toHaveLength(1);
    expect(screen.getByText("from Coordinator 1")).toBeInTheDocument();
    expect(moved.textContent).toContain("Reassigned");
    expect((screen.getByText("Untouched event").closest("a, article, div[class]") as HTMLElement).textContent).not.toContain("Reassigned");
  });
});

// SPM-94: a planning event whose venue and equipment are reserved shows the combined label, then the safety check.
describe("EventCard reserved planning labels", () => {
  // Kills: the awaiting safety label placed before the combined reserved label, or the combined label missing for reserved venue and equipment.
  it("TRACK-EVENT-STATUS-01-A CARD: venue and equipment reserved show the combined label, then the awaiting safety check", () => {
    render(
      <MemoryRouter>
        <EventCard
          event={{ ...baseEvent(), status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"], safetyIndicator: "AWAITING_CHECK" }}
        />
      </MemoryRouter>,
    );
    const combined = screen.getByText("Equipment & Venue Reserved");
    const safety = screen.getByText("Awaiting Safety Officer Check");
    expect(combined).toBeInTheDocument();
    expect(combined.compareDocumentPosition(safety) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
