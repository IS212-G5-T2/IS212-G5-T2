// Story: SPM-48 Monitor Workspace Queue & Status (Coordinator)
// ACs: AC5 (needs action), AC6 and AC7 (safety), AC8 (holds), AC9 (venue unavailable)
// Test cases: MONITOR-QUEUE-05-B, 06-A, 06-B, 07-A, 07-C, 08-A, 08-B, 09-A, 09-B (labels on the card)
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NeedsActionMarker, QueueSafetyLabel, QueueVenueNotes } from "@/features/events/components/QueueIndicators";
import { QUEUE_ACTION_LABELS, QUEUE_SAFETY_LABELS } from "@/features/events/lib/queueLabels";
import type { QueueIndicators } from "@/types";

afterEach(cleanup);

const none: QueueIndicators = { safety: null, holds: [], unavailableVenues: [], actions: [], needsAction: false };

describe("SPM-48 AC5: the Needs action marker", () => {
  /**
   * MONITOR-QUEUE-05-B: an event with reasons carries the marker. The reasons are text inside it (visually hidden,
   * also in the hover title), so screen readers announce them; an aria-label on a plain span may be ignored (CQ-48-01).
   */
  it("MONITOR-QUEUE-05-B marks an event that needs action and names the reasons", () => {
    render(<NeedsActionMarker queue={{ actions: ["AWAITING_REVIEW", "VENUE_UNAVAILABLE"], needsAction: true }} />);
    const marker = screen.getByText("Needs action").parentElement as HTMLElement;
    expect(marker.textContent).toBe("!Needs action: awaiting your review, venue unavailable");
    expect(screen.getByText(": awaiting your review, venue unavailable")).toHaveClass("sr-only");
    expect(marker).toHaveAttribute("title", "Needs action: awaiting your review, venue unavailable");
    expect(marker).not.toHaveAttribute("aria-label");
  });

  /** MONITOR-QUEUE-05-B: an event with no reasons (EVT-406, EVT-410, EVT-411) has no marker. */
  it("MONITOR-QUEUE-05-B shows no marker when nothing needs action", () => {
    const { container } = render(<NeedsActionMarker queue={none} />);
    expect(container).toBeEmptyDOMElement();
  });

  /** MONITOR-QUEUE-05-B: every action reason the server can send has its own wording. */
  it("MONITOR-QUEUE-05-B words every action reason differently", () => {
    const labels = Object.values(QUEUE_ACTION_LABELS);
    expect(labels).toHaveLength(6);
    expect(new Set(labels).size).toBe(6);
  });
});

describe("SPM-48 AC6, AC7: the safety label", () => {
  /** MONITOR-QUEUE-06-A, 06-B, 07-A, 07-C: each safety state has its own text; awaiting, changes and cleared keep the SPM-94 wording. */
  it.each([
    ["AWAITING_CHECK", "Awaiting Safety Officer Check"],
    ["CHANGES_REQUESTED", "Safety Changes Requested"],
    ["REJECTED", "Safety Arrangement Rejected"],
    ["RESET", "Safety Check Reset: Re-request Needed"],
    ["CLEARED", "Safety Check Cleared"],
  ] as const)("MONITOR-QUEUE-06-A: %s reads %s", (safety, text) => {
    render(<QueueSafetyLabel queue={{ safety }} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(QUEUE_SAFETY_LABELS[safety].label).toBe(text);
  });

  /** MONITOR-QUEUE-07-C: rejected is the one safety state shown in red; the others are not. */
  it("MONITOR-QUEUE-07-C shows a rejected arrangement in red", () => {
    expect(QUEUE_SAFETY_LABELS.REJECTED.tone).toBe("red");
    expect(QUEUE_SAFETY_LABELS.CHANGES_REQUESTED.tone).not.toBe("red");
  });

  /** MONITOR-QUEUE-06-A: no safety state shows no label (EVT-406 Confirmed). */
  it("MONITOR-QUEUE-06-A shows nothing without a safety state", () => {
    const { container } = render(<QueueSafetyLabel queue={{ safety: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SPM-48 AC8, AC9: venue notes", () => {
  /** MONITOR-QUEUE-08-A: an active hold names its venue and its expiry date and time in SGT. */
  it("MONITOR-QUEUE-08-A shows an active hold with its expiry in SGT", () => {
    render(
      <QueueVenueNotes
        queue={{ holds: [{ venueName: "Hall A", expiresAt: "2026-11-12T04:00:00.000Z", state: "ACTIVE" }], unavailableVenues: [] }}
      />,
    );
    const notes = screen.getByRole("list", { name: "Venue notes" });
    expect(within(notes).getByText("Hold active: Hall A, expires 12 Nov 2026, 12:00 SGT")).toBeInTheDocument();
  });

  /** MONITOR-QUEUE-08-B: an expired hold says so, with the instant it expired. */
  it("MONITOR-QUEUE-08-B shows an expired hold", () => {
    render(
      <QueueVenueNotes
        queue={{ holds: [{ venueName: "Hall A", expiresAt: "2026-11-10T04:00:00.000Z", state: "EXPIRED" }], unavailableVenues: [] }}
      />,
    );
    expect(screen.getByText("Hold expired: Hall A, expired 10 Nov 2026, 12:00 SGT")).toBeInTheDocument();
    expect(screen.queryByText(/Hold active/)).toBeNull();
  });

  /** MONITOR-QUEUE-09-A, 09-B: each unavailable venue is named once, with the alternative-arrangements wording. */
  it("MONITOR-QUEUE-09-B names only the affected venues", () => {
    render(<QueueVenueNotes queue={{ holds: [], unavailableVenues: ["Hall H"] }} />);
    const items = within(screen.getByRole("list", { name: "Venue notes" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Venue unavailable – alternative arrangements needed: Hall H",
    ]);
  });

  /** MONITOR-QUEUE-09-A: no holds and no unavailable venues show no notes (EVT-406). */
  it("MONITOR-QUEUE-09-A shows no notes when nothing applies", () => {
    const { container } = render(<QueueVenueNotes queue={{ holds: [], unavailableVenues: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
