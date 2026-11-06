// Story: SPM-48 Monitor Workspace Queue & Status (Coordinator)
// ACs: AC2 (standard status terms), AC5 (visually distinct status indicators)
// Test cases: MONITOR-QUEUE-02-A, 02-B, 05-A
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EVENT_STATUS_STYLES, StatusBadge } from "@/components/ui/StatusBadge";

afterEach(cleanup);

const STANDARD_TERMS = {
  submitted: "Submitted",
  approved: "Approved",
  planning: "Planning",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
} as const;

/** The background colour token of a badge, for example "bg-sky-100". */
const background = (element: HTMLElement) =>
  element.className.split(/\s+/).find((token) => token.startsWith("bg-"));

describe("SPM-48 event status badges", () => {
  /** MONITOR-QUEUE-02-A: each event status reads exactly as its standard term (case and spelling). */
  it.each(Object.entries(STANDARD_TERMS))("MONITOR-QUEUE-02-A labels %s as %s", (status, term) => {
    render(<StatusBadge status={status as keyof typeof STANDARD_TERMS} />);
    expect(screen.getByText(term).textContent).toBe(term);
  });

  /** MONITOR-QUEUE-02-B: the event statuses are exactly the seven terms; Under Review is not one of them. */
  it("MONITOR-QUEUE-02-B styles exactly the seven event statuses", () => {
    expect(Object.keys(EVENT_STATUS_STYLES).sort()).toEqual(Object.keys(STANDARD_TERMS).sort());
  });

  /**
   * MONITOR-QUEUE-05-A: compared pairwise, the seven badges all have different colours and different labels, so a
   * status can be told apart by colour and, without colour, by its text.
   */
  it("MONITOR-QUEUE-05-A gives every status its own colour and label", () => {
    for (const status of Object.keys(STANDARD_TERMS)) render(<StatusBadge status={status as keyof typeof STANDARD_TERMS} />);
    const badges = Object.values(STANDARD_TERMS).map((term) => screen.getByText(term));
    const colours = badges.map(background);
    expect(colours.every(Boolean)).toBe(true);
    expect(new Set(colours).size).toBe(7);
    expect(new Set(badges.map((badge) => badge.textContent)).size).toBe(7);
  });
});
