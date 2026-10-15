/*
 * Story: SPM-138 Join Waitlist When Event Is at Capacity (the attendee dashboard card).
 * AC: AC3 (the status reads Waitlisted on the dashboard as well as in the details).
 * Test cases: JOIN-WAITLIST-03-A-FE-DASH, JOIN-WAITLIST-03-A-FE-VARIANT (the Waitlisted variant differs from Confirmed and Withdrawn).
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EventCard } from "@/features/events/pages/list/EventCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { buildGala } from "@/features/events/pages/detail/registration/waitlist.fixtures";

describe("JOIN-WAITLIST-03-A-FE-STATE-DASH: the dashboard card reads Waitlisted (AC3)", () => {
  // Oracle: a waiting entry shows the Waitlisted badge.
  // Kills: BADGE-M4, F12
  it("JOIN-WAITLIST-03-A-FE-STATE-DASH: a card for a waiting entry shows the Waitlisted badge", () => {
    render(
      <MemoryRouter>
        <EventCard event={buildGala()} registrationStatus="waitlisted" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Waitlisted")).toBeInTheDocument();
  });

  // Oracle: the Waitlisted variant is a different visual variant from Confirmed and Withdrawn, so a learner or
  // attendee can tell the three apart. The badge classes are compared, not the labels alone.
  // Kills: F12, F13
  it("JOIN-WAITLIST-03-A-FE-VARIANT: the Waitlisted badge styling differs from Confirmed and Withdrawn", () => {
    const { unmount } = render(<StatusBadge status="waitlisted" />);
    const waitlisted = screen.getByText("Waitlisted").className;
    unmount();
    const confirmed = render(<StatusBadge status="registered" />);
    const confirmedClass = screen.getByText("Confirmed").className;
    confirmed.unmount();
    render(<StatusBadge status="withdrawn" />);
    const withdrawnClass = screen.getByText("Withdrawn").className;

    expect(waitlisted).not.toBe(confirmedClass);
    expect(waitlisted).not.toBe(withdrawnClass);
    expect(confirmedClass).not.toBe(withdrawnClass);
  });
});
