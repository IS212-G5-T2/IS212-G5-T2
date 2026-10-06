/*
 * Story: SPM-63 View Registration Information (Organiser and Coordinator), report header.
 * ACs: AC2 (the report displays the total number of registered attendees).
 * Test cases: VIEW-REG-INFO-02-A (FE), 02-B (FE remount).
 *
 * Component test: props in, text out. Oracles are literals from the Confluence cases and the prompt's resolved specs.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportHeader } from "./ReportHeader";

const renderHeader = (totalConfirmed: number, availableSpots: number) =>
  render(
    <ReportHeader
      eventName="Tech Talk: Cloud 101"
      totalConfirmed={totalConfirmed}
      capacity={50}
      availableSpots={availableSpots}
    />,
  );

describe("SPM-63 AC2: the header shows the Confirmed count against capacity", () => {
  // Oracle (SPEC 01-A heading, F1 hyphen; SPEC 02-A): title "Tech Talk: Cloud 101 - Registration Report",
  // "3 Attendees Registered (3 / 50)" and "47 spots available" (50 - 3 = 47).
  // Kills: title wording drift; count and spots swapped; capacity omitted.
  it("VIEW-REG-INFO-02-A: shows the title, the count line and the spots line", () => {
    // Arrange / Act
    renderHeader(3, 47);

    // Assert
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tech Talk: Cloud 101 - Registration Report");
    expect(screen.getByText("3 Attendees Registered (3 / 50)")).toBeInTheDocument();
    expect(screen.getByText("47 spots available")).toBeInTheDocument();
  });

  // Oracle (ASSUMED A4): exactly one attendee reads "1 Attendee Registered (1 / 50)".
  // Kills: M20 plural always "Attendees".
  it("VIEW-REG-INFO-02-A-BND: one attendee is singular", () => {
    // Arrange / Act
    renderHeader(1, 49);

    // Assert
    expect(screen.getByText("1 Attendee Registered (1 / 50)")).toBeInTheDocument();
    expect(screen.getByText("49 spots available")).toBeInTheDocument();
  });

  // Oracle (derived): zero is plural and nothing is hidden.
  // Kills: the count line dropped when the count is falsy.
  it("VIEW-REG-INFO-02-A-BND: zero attendees still shows the line", () => {
    // Arrange / Act
    renderHeader(0, 50);

    // Assert
    expect(screen.getByText("0 Attendees Registered (0 / 50)")).toBeInTheDocument();
  });

  // Oracle (SPEC 02-B): a fresh mount with 4 then with 2 shows "4 Attendees Registered (4 / 50)" and "2 ... (2 / 50)".
  // Kills: the count frozen from a first render; the capacity arithmetic done in the header with stale props.
  it("VIEW-REG-INFO-02-B: remounting with new counts shows the new count", () => {
    // Arrange
    const first = renderHeader(4, 46);
    expect(screen.getByText("4 Attendees Registered (4 / 50)")).toBeInTheDocument();
    first.unmount();

    // Act
    renderHeader(2, 48);

    // Assert
    expect(screen.getByText("2 Attendees Registered (2 / 50)")).toBeInTheDocument();
    expect(screen.queryByText(/4 Attendees/)).not.toBeInTheDocument();
  });
});

// ASSUMPTION index
// A4: singular "1 Attendee Registered (1 / N)"      -> 02-A-BND
