import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ChangeHistoryEntry } from "@/types";
import { ChangeHistoryList } from "./ChangeHistoryList";

/** SPM-156: change history lists direct updates beside reviewed changes. */
const entry = (overrides: Partial<ChangeHistoryEntry>): ChangeHistoryEntry => ({
  id: "h1",
  field: "expectedAttendance",
  originalValue: 80,
  proposedValue: 150,
  resolvedValue: 150,
  resolvedBy: "Coord Nine",
  resolvedAt: "2026-10-05T10:00:00.000Z",
  status: "Applied",
  ...overrides,
});

afterEach(cleanup);

describe("ChangeHistoryList", () => {
  // EVENT-UPDATE-07-C: a direct update reads "Updated directly"; reviewed changes keep their outcome.
  it("EVENT-UPDATE-07-C labels direct updates and reviewed changes differently", () => {
    render(
      <ChangeHistoryList
        history={[
          entry({
            id: "d1",
            kind: "direct_update",
            field: "name",
            originalValue: "Old",
            proposedValue: "New",
          }),
          entry({ id: "r1", kind: "booking_conflict" }),
          entry({ id: "r2", status: "Rejected", resolvedValue: 80 }),
        ]}
      />,
    );
    const items = within(
      screen.getByRole("list", { name: /change history/i }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Event name: Old → New");
    expect(items[0]).toHaveTextContent("Updated directly by Coord Nine");
    expect(items[1]).toHaveTextContent("Applied by Coord Nine");
    // An entry without a kind (older response) is a reviewed change.
    expect(items[2]).toHaveTextContent("Rejected by Coord Nine");
    expect(items[0].querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-10-05T10:00:00.000Z",
    );
  });

  // EVENT-UPDATE-07-E: an approved change request names the organiser who asked and the coordinator who approved.
  it("EVENT-UPDATE-07-E labels an approved change request with who asked and who approved", () => {
    render(
      <ChangeHistoryList
        history={[
          entry({
            id: "c1",
            kind: "change_request",
            field: "description",
            originalValue: "Old",
            proposedValue: "New",
            proposedBy: "Demo Organiser",
          }),
          entry({ id: "c2", kind: "change_request", proposedBy: undefined }),
        ]}
      />,
    );
    const items = within(
      screen.getByRole("list", { name: /change history/i }),
    ).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Description: Old → New");
    expect(items[0]).toHaveTextContent(
      "Change request approved (requested by Demo Organiser) by Coord Nine",
    );
    // Without a proposer the entry still reads correctly.
    expect(items[1]).toHaveTextContent("Change request approved by Coord Nine");
  });

  it("EVENT-UPDATE-07-C says when nothing is recorded yet", () => {
    render(<ChangeHistoryList history={[]} />);
    expect(screen.getByText("No changes recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
