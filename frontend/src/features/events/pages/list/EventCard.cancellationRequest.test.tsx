import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { EventCard } from "@/features/events/pages/list/EventCard";
import type { EventRecord } from "@/types";

/*
 * SPM-155 D13b: the organiser's event card carries the cancellation request indicator (AC2). Words are ASSUMED text
 * (D13b names "Cancellation requested"). Mutant IDs in each "Kills:" line are defined in
 * frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

const event = {
  id: "evt-1",
  name: "Hack Night",
  purpose: "Hackathon",
  organiserId: "org-01",
  status: "approved",
  startDateTime: "2026-11-05T02:00:00.000Z",
  endDateTime: "2026-11-05T04:00:00.000Z",
  expectedAttendance: 40,
} as unknown as EventRecord;

afterEach(cleanup);

const renderCard = (props: Partial<React.ComponentProps<typeof EventCard>> = {}) =>
  render(
    <MemoryRouter>
      <EventCard event={event} {...props} />
    </MemoryRouter>,
  );

describe("SPM-155 EventCard indicator (D13b, AC2)", () => {
  // Kills: FM37, FM51
  /** CANCEL-REQUEST-02-A: a pending request reads "Cancellation requested". */
  it.each([
    ["pending", "Cancellation requested"],
    ["accepted", "Cancellation accepted"],
    ["declined", "Cancellation declined"],
    ["closed", "Cancellation request closed"],
  ] as const)("CANCEL-REQUEST-02-A: a %s request reads %s on the card", (status, label) => {
    // Act
    renderCard({ cancellationRequest: status });

    // Assert
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  // Kills: FM38
  /** CANCEL-REQUEST-02-A: with no request the card has no cancellation indicator. */
  it("CANCEL-REQUEST-02-A: a card with no request shows no cancellation indicator", () => {
    // Act
    renderCard();

    // Assert
    expect(screen.queryByText(/Cancellation/)).not.toBeInTheDocument();
  });
});
