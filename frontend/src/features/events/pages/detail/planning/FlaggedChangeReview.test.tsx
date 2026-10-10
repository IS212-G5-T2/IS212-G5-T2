import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlaggedChangeReview } from "@/features/events/pages/detail/planning/FlaggedChangeReview";
import { formatDateTime } from "@/utils/format";
import type { ChangeHistoryEntry, FlaggedChange } from "@/types";

/**
 * SPM-85 — Coordinator reviews and resolves flagged changes
 * (FlaggedChangeReview). Contract: props { changes, history,
 * onResolve({ changeId, decision, bookingId? }) }. Each change is an article named
 * after its field with "Current value" / "Proposed value" terms, a "Confirm change"
 * and "Reject change" button, and one role="group" per venue booking (named by venue)
 * with "Confirm for this booking" / "Reject for this booking" buttons when impacted.
 */

const CHANGE: FlaggedChange = {
  id: "chg-1",
  kind: "booking_conflict",
  field: "expectedAttendance",
  currentValue: 80,
  proposedValue: 150,
  status: "Needs Review",
  impacts: [
    { bookingId: "bk-1", venueName: "Hall A", impacted: true, conflicts: [{ kind: "capacity", detail: "Attendance 150 exceeds capacity 120" }] },
    { bookingId: "bk-2", venueName: "Hall B", impacted: true, conflicts: [{ kind: "turnaround", withBookingId: "nb-1", detail: "Only 30 min turnaround after Chemistry Workshop" }] },
    { bookingId: "bk-3", venueName: "Hall C", impacted: false, conflicts: [] },
  ],
};

const HISTORY: ChangeHistoryEntry[] = [
  { id: "chg-2", field: "layout", originalValue: "Banquet", proposedValue: "Theatre", resolvedValue: "Banquet", resolvedBy: "Coord Nine", resolvedAt: "2026-10-05T10:00:00.000Z", status: "Rejected" },
  { id: "chg-0", field: "expectedAttendance", originalValue: 60, proposedValue: 80, resolvedValue: 80, resolvedBy: "Coord Nine", resolvedAt: "2026-10-05T09:00:00.000Z", status: "Applied" },
];

function renderReview(history: ChangeHistoryEntry[] = []) {
  const onResolve = vi.fn().mockResolvedValue(undefined);
  render(<FlaggedChangeReview changes={[CHANGE]} history={history} onResolve={onResolve} />);
  return { onResolve, card: screen.getByRole("article", { name: /expected attendance/i }) };
}

afterEach(cleanup);

describe("FlaggedChangeReview", () => {
  // EVENT-FLAG-02-A: current and proposed values sit side by side with the impacted bookings.
  it("EVENT-FLAG-02-A shows current value, proposed value and the reason for each impact", () => {
    const { card } = renderReview();
    expect(within(card).getByText("Current value").nextElementSibling).toHaveTextContent("80");
    expect(within(card).getByText("Proposed value").nextElementSibling).toHaveTextContent("150");
    expect(within(within(card).getByRole("group", { name: /hall a/i })).getByText(/exceeds capacity/i)).toBeInTheDocument();
    expect(within(within(card).getByRole("group", { name: /hall b/i })).getByText(/turnaround/i)).toBeInTheDocument();
  });

  // EVENT-FLAG-06-A: with several venue bookings, each has its own entry, including clear ones.
  it("EVENT-FLAG-06-A lists impacted bookings per venue booking", () => {
    const { card } = renderReview();
    expect(within(card).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Hall A", "Hall B", "Hall C"]);
    expect(within(within(card).getByRole("group", { name: /hall c/i })).getByText(/no impact/i)).toBeInTheDocument();
  });

  // EVENT-FLAG-03-A: rejecting sends a reject decision for the whole change.
  it("EVENT-FLAG-03-A sends a reject decision when the coordinator rejects the change", async () => {
    const user = userEvent.setup();
    const { onResolve, card } = renderReview();
    await user.click(within(card).getByRole("button", { name: /^reject change$/i }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ changeId: "chg-1", decision: "reject" });
  });

  // EVENT-FLAG-04-A: confirming sends a confirm decision for the whole change.
  it("EVENT-FLAG-04-A sends a confirm decision when the coordinator confirms the change", async () => {
    const user = userEvent.setup();
    const { onResolve, card } = renderReview();
    await user.click(within(card).getByRole("button", { name: /^confirm change$/i }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ changeId: "chg-1", decision: "confirm" });
  });

  // EVENT-FLAG-07-A: per-booking actions are scoped to that booking and leave the others usable.
  // NOTE: scoped-resolution semantics are an interpretation of the AC (backend/HANDOVER.md, rule 10); confirm with the team.
  it("EVENT-FLAG-07-A confirming one booking sends only that booking and leaves the others actionable", async () => {
    const user = userEvent.setup();
    const { onResolve, card } = renderReview();
    const hallA = within(card).getByRole("group", { name: /hall a/i });
    const hallB = within(card).getByRole("group", { name: /hall b/i });
    await user.click(within(hallA).getByRole("button", { name: /confirm for this booking/i }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ changeId: "chg-1", decision: "confirm", bookingId: "bk-1" });
    expect(within(hallB).getByRole("button", { name: /reject for this booking/i })).toBeEnabled();
    expect(within(within(card).getByRole("group", { name: /hall c/i })).queryAllByRole("button")).toHaveLength(0);
  });

  // EVENT-FLAG-05-A: history rows show the values, coordinator, time and final status.
  it("EVENT-FLAG-05-A shows each resolved change with values, coordinator, timestamp and status", () => {
    renderReview(HISTORY);
    const rows = within(screen.getByRole("list", { name: /change history/i })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Banquet → Theatre");
    expect(rows[0]).toHaveTextContent("Coord Nine");
    expect(rows[0]).toHaveTextContent("Rejected");
    expect(rows[0]).toHaveTextContent(formatDateTime("2026-10-05T10:00:00.000Z"));
    expect(rows[1]).toHaveTextContent("60 → 80");
    expect(rows[1]).toHaveTextContent("Applied");
  });
});
// ---------------------------------------------------------------------------
// Gap coverage: equipment and requirements details, recorded decisions,
// in-flight and failed decisions, empty states, value formatting.
// ---------------------------------------------------------------------------

function renderChange(change: FlaggedChange, onResolve = vi.fn().mockResolvedValue(undefined), history: ChangeHistoryEntry[] = []) {
  render(<FlaggedChangeReview changes={[change]} history={history} onResolve={onResolve} />);
  return { onResolve, card: screen.getByRole("article") };
}

describe("FlaggedChangeReview: impact details", () => {
  // EVENT-FLAG-02-A: equipment arrangements that must be re-checked are listed under the change.
  it("EVENT-FLAG-02-A lists the equipment arrangements to re-check", () => {
    const { card } = renderChange({
      ...CHANGE,
      equipmentImpacts: [{ arrangementId: "eq-1", name: "Projector", quantity: 2, detail: "Reservation period must move with the new event time" }],
    });
    expect(within(card).getByRole("heading", { name: /equipment arrangements to re-check/i })).toBeInTheDocument();
    expect(within(card).getByText(/Projector \(Qty 2\): Reservation period must move/)).toBeInTheDocument();
  });

  // EVENT-FLAG-02-A: no equipment section is shown when there is nothing to re-check.
  it("EVENT-FLAG-02-A shows no equipment section when none are affected", () => {
    const { card } = renderChange({ ...CHANGE, equipmentImpacts: [] });
    expect(within(card).queryByText(/equipment arrangements to re-check/i)).not.toBeInTheDocument();
  });

  // EVENT-FLAG-02-A: a layout or facility change asks for a manual check, shown as that booking's reason.
  it("EVENT-FLAG-02-A shows the manual requirements check as the reason for a booking", () => {
    const { card } = renderChange({
      ...CHANGE,
      field: "layout",
      currentValue: "Banquet",
      proposedValue: "Theatre",
      impacts: [
        {
          bookingId: "bk-1",
          venueName: "Hall A",
          impacted: true,
          conflicts: [{ kind: "requirements", detail: "Check that Hall A supports the Theatre layout" }],
        },
      ],
    });
    expect(within(card).getByRole("heading", { name: "Room layout" })).toBeInTheDocument();
    expect(within(within(card).getByRole("group", { name: /hall a/i })).getByText(/supports the Theatre layout/)).toBeInTheDocument();
  });

  // EVENT-FLAG-06-A: with no impact list at all the card says so instead of an empty section.
  it("EVENT-FLAG-06-A says no venue bookings are affected when there is no impact list", () => {
    const { card } = renderChange({ ...CHANGE, impacts: undefined });
    expect(within(card).getByText("No venue bookings affected.")).toBeInTheDocument();
    expect(within(card).queryAllByRole("group")).toHaveLength(0);
  });
});

describe("FlaggedChangeReview: decisions", () => {
  // EVENT-FLAG-07-A: a booking that has been decided shows the outcome and who decided; the others stay actionable.
  it("EVENT-FLAG-07-A shows a recorded booking decision and removes only that booking's actions", () => {
    const { card } = renderChange({
      ...CHANGE,
      impacts: [
        { ...CHANGE.impacts![0], decision: "Applied", decidedBy: "Coord Nine" },
        { ...CHANGE.impacts![1], decision: "Rejected" },
        CHANGE.impacts![2],
      ],
    });
    const hallA = within(card).getByRole("group", { name: /hall a/i });
    const hallB = within(card).getByRole("group", { name: /hall b/i });
    expect(hallA).toHaveTextContent("Confirmed for this booking by Coord Nine");
    expect(within(hallA).queryAllByRole("button")).toHaveLength(0);
    expect(hallB).toHaveTextContent("Rejected for this booking");
    expect(within(hallB).queryAllByRole("button")).toHaveLength(0);
    // The change itself can still be settled as a whole.
    expect(within(card).getByRole("button", { name: "Confirm change" })).toBeEnabled();
  });

  // EVENT-FLAG-04-A: while a decision is being saved the actions are disabled, so it cannot be sent twice.
  it("EVENT-FLAG-04-A disables every action on the change while a decision is saving", async () => {
    const user = userEvent.setup();
    let finish: (value?: unknown) => void = () => {};
    const onResolve = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const { card } = renderChange(CHANGE, onResolve);

    await user.click(within(card).getByRole("button", { name: "Confirm change" }));
    expect(within(card).getByRole("button", { name: "Confirm change" })).toBeDisabled();
    expect(within(card).getByRole("button", { name: "Reject change" })).toBeDisabled();
    for (const button of within(card).getAllByRole("button", { name: /for this booking/i })) expect(button).toBeDisabled();

    finish();
    await waitFor(() => expect(within(card).getByRole("button", { name: "Confirm change" })).toBeEnabled());
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  // EVENT-FLAG-04-A: a per-booking decision locks only that booking while it saves.
  it("EVENT-FLAG-04-A locks only the booking being decided while it saves", async () => {
    const user = userEvent.setup();
    let finish: (value?: unknown) => void = () => {};
    const onResolve = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const { card } = renderChange(
      { ...CHANGE, impacts: [CHANGE.impacts![0], CHANGE.impacts![1]] },
      onResolve,
    );
    const hallA = within(card).getByRole("group", { name: /hall a/i });
    const hallB = within(card).getByRole("group", { name: /hall b/i });

    await user.click(within(hallA).getByRole("button", { name: /confirm for this booking/i }));
    for (const button of within(hallA).getAllByRole("button")) expect(button).toBeDisabled();
    for (const button of within(hallB).getAllByRole("button")) expect(button).toBeEnabled();
    finish();
    await waitFor(() => expect(within(hallA).getByRole("button", { name: /confirm for this booking/i })).toBeEnabled());
  });

  // EVENT-FLAG-04-A: a refused decision shows the reason on that change; a retry clears it.
  it("EVENT-FLAG-04-A shows why a decision failed and clears the message on retry", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn().mockRejectedValueOnce(new Error("This change has already been resolved.")).mockResolvedValue(undefined);
    const { card } = renderChange(CHANGE, onResolve);

    await user.click(within(card).getByRole("button", { name: "Confirm change" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent("This change has already been resolved.");
    expect(within(card).getByRole("button", { name: "Confirm change" })).toBeEnabled();

    await user.click(within(card).getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(within(card).queryByRole("alert")).not.toBeInTheDocument());
  });

  // EVENT-FLAG-04-A: a failure that is not an Error still gets a readable message.
  it("EVENT-FLAG-04-A shows a generic message when the failure has no message", async () => {
    const user = userEvent.setup();
    const { card } = renderChange(CHANGE, vi.fn().mockRejectedValue("nope"));
    await user.click(within(card).getByRole("button", { name: "Reject change" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent("Could not resolve this change.");
  });
});

describe("FlaggedChangeReview: empty states and history values", () => {
  // EVENT-FLAG-05-A: with nothing pending and nothing resolved the panel says so in both places.
  it("EVENT-FLAG-05-A shows empty states for no pending changes and no history", () => {
    render(<FlaggedChangeReview changes={[]} history={[]} onResolve={vi.fn()} />);
    expect(screen.getByText("No changes are awaiting review.")).toBeInTheDocument();
    expect(screen.getByText("No resolved changes yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /change history/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  // EVENT-FLAG-05-A: history shows dates, lists and empty lists in readable form, not as raw values.
  it("EVENT-FLAG-05-A formats dates, lists and empty values in the history", () => {
    const entry = (over: Partial<ChangeHistoryEntry>): ChangeHistoryEntry => ({
      id: "h",
      field: "layout",
      originalValue: "a",
      proposedValue: "b",
      resolvedValue: "a",
      resolvedBy: "Coord Nine",
      resolvedAt: "2026-10-05T10:00:00.000Z",
      status: "Applied",
      ...over,
    });
    render(
      <FlaggedChangeReview
        changes={[]}
        onResolve={vi.fn()}
        history={[
          entry({ id: "h1", field: "startDateTime", originalValue: "2026-11-10T10:00:00.000Z", proposedValue: "2026-11-11T10:00:00.000Z" }),
          entry({ id: "h2", field: "facilities", originalValue: ["Catering"], proposedValue: ["Catering", "AV System"] }),
          entry({ id: "h3", field: "accessibility", originalValue: ["Hearing loop"], proposedValue: [] }),
        ]}
      />,
    );
    const rows = within(screen.getByRole("list", { name: /change history/i })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(`${formatDateTime("2026-11-10T10:00:00.000Z")} → ${formatDateTime("2026-11-11T10:00:00.000Z")}`);
    expect(rows[0]).toHaveTextContent("Start date & time:");
    expect(rows[1]).toHaveTextContent("Catering → Catering, AV System");
    expect(rows[2]).toHaveTextContent("Hearing loop → None");
  });
});
