// Story: SPM-94 Track My Event Status (Organiser)
// ACs: AC2 (awaiting assignment), AC3 (one safety indicator)
// Test cases: TRACK-EVENT-STATUS-02-A, 03-A, 03-B (component level)
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AssignmentIndicator, SafetyIndicator } from "@/features/events/components/StatusIndicators";
import { EventCard } from "@/features/events/pages/list/EventCard";
import type { EventRecord } from "@/types";

afterEach(cleanup);

function card(overrides: Partial<EventRecord> = {}): EventRecord {
  const start = new Date("2026-10-20T10:00:00+08:00");
  const end = new Date("2026-10-20T12:00:00+08:00");
  return {
    id: "00000000-0000-4000-8000-000000000501",
    name: "Student Mixer",
    purpose: "Mixer",
    description: "",
    organiserId: "ORG-01",
    organiserName: "Organiser One",
    status: "submitted",
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    expectedAttendance: 20,
    venueRequirements: { minCapacity: 20, layout: "Boardroom", facilities: [], accessibility: [] },
    attachments: [],
    equipmentNeeds: "",
    registrationEnabled: false,
    createdAt: "2026-10-12T04:00:00.000Z",
    updatedAt: "2026-10-12T04:00:00.000Z",
    ...overrides,
  };
}

describe("SPM-94 AC2: awaiting Coordinator assignment indicator", () => {
  // Kills: X4 (assignment indicator shown without the server flag), and the indicator text changing
  it("TRACK-EVENT-STATUS-02-A: shows the exact text when the event is awaiting assignment", () => {
    render(<AssignmentIndicator event={{ awaitingCoordinatorAssignment: true }} />);
    expect(screen.getByText("Awaiting Coordinator Assignment")).toBeInTheDocument();
  });

  // Kills: AssignmentIndicator rendering a label for an assigned event (awaitingCoordinatorAssignment false).
  it("TRACK-EVENT-STATUS-02-B: renders nothing once the event is assigned", () => {
    const { container } = render(<AssignmentIndicator event={{ awaitingCoordinatorAssignment: false }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SPM-94 AC3: one safety indicator from the safety state", () => {
  // Owner decision (18 Oct 2026): no safety label until the venue and all equipment are reserved.
  // Kills: SafetyIndicator showing a label before the venue and equipment are reserved.
  it("TRACK-EVENT-STATUS-03-B: a changes-requested label waits until the venue and equipment are reserved", () => {
    const { container } = render(
      <SafetyIndicator event={{ safetyIndicator: "CHANGES_REQUESTED", status: "planning", venueRequestStatus: "pending", equipmentStatuses: ["Requested"] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // Kills: M9 (two indicators at once), and the three indicator texts swapped
  it.each([
    ["AWAITING_CHECK", "Awaiting Safety Officer Check"],
    ["CHANGES_REQUESTED", "Safety Changes Requested"],
    ["CLEARED", "Safety Check Cleared"],
  ] as const)("TRACK-EVENT-STATUS-03-B: %s shows exactly '%s'", (indicator, text) => {
    render(<SafetyIndicator event={{ safetyIndicator: indicator, status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"] }} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getAllByText(/Safety /)).toHaveLength(1);
  });

  // Kills: SafetyIndicator rendering a label when safetyIndicator is null.
  it("TRACK-EVENT-STATUS-03-B: renders nothing when there is no safety indicator", () => {
    const { container } = render(<SafetyIndicator event={{ safetyIndicator: null, status: "planning", venueRequestStatus: null, equipmentStatuses: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  // Owner decision (18 Oct 2026): empty equipmentStatuses means no equipment is needed, so a reserved venue alone completes the check.
  // Kills: SafetyIndicator hiding AWAITING_CHECK when equipment is empty (the readiness rule inverted).
  it("TRACK-EVENT-STATUS-03-B: a planning event with an approved venue and no equipment shows Awaiting Safety Officer Check", () => {
    render(<SafetyIndicator event={{ safetyIndicator: "AWAITING_CHECK", status: "planning", venueRequestStatus: "approved", equipmentStatuses: [] }} />);
    expect(screen.getByText("Awaiting Safety Officer Check")).toBeInTheDocument();
  });
});

describe("SPM-94 AC3 on the organiser list card", () => {
  // Kills: EventCard rendering the assignment or safety indicator on the organiser card.
  it("TRACK-EVENT-STATUS-01-A: the organiser card does not show assignment indicator (redundant with Coordinator field)", () => {
    render(
      <MemoryRouter>
        <EventCard
          event={card({ awaitingCoordinatorAssignment: true, safetyIndicator: "AWAITING_CHECK" })}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Awaiting Coordinator Assignment")).not.toBeInTheDocument();
    // A submitted event shows no safety check label; the check is a planning-phase state (owner, 18 Oct 2026).
    expect(screen.queryByText("Awaiting Safety Officer Check")).not.toBeInTheDocument();
  });

  // Kills: EventCard showing organiser indicators to the attendee view.
  it("TRACK-EVENT-STATUS-01-A: the attendee card never shows organiser indicators", () => {
    render(
      <MemoryRouter>
        <EventCard
          attendeeView
          event={card({ awaitingCoordinatorAssignment: true, safetyIndicator: "CLEARED" })}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Awaiting Coordinator Assignment")).not.toBeInTheDocument();
    expect(screen.queryByText("Safety Check Cleared")).not.toBeInTheDocument();
  });
});
