import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanningInformationPanel } from "@/components/domain/PlanningInformationPanel";
import { formatDateTime, formatDateTimeRange } from "@/utils/format";
import type { EventRecord, FlaggedChange, PlanningView, ReplacementRequired } from "@/types";

/**
 * SPM-97 — the read-only "Planning information" panel. The page tests cover it
 * through EventDetailPage; these cover its own rendering rules: what each row
 * shows, where "Change pending" and "Replacement venue required" appear, empty
 * states, the refresh error, and that it never offers a control.
 */

const START = "2026-11-10T10:00:00.000Z";
const END = "2026-11-10T13:00:00.000Z";

function eventRecord(): EventRecord {
  return {
    id: "00000000-0000-4000-8000-000000000049",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "organiser-1",
    organiserName: "Demo Organiser",
    coordinatorId: "coordinator-1",
    coordinatorName: "Demo Coordinator",
    status: "planning",
    startDateTime: START,
    endDateTime: END,
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: ["Catering", "AV System"], accessibility: [] },
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-10-04T09:00:00.000Z",
  };
}

function view(overrides: Partial<PlanningView> = {}): PlanningView {
  return {
    event: eventRecord(),
    venueBookings: [{ id: "bk-1", venueName: "Hall A", start: START, end: END, status: "Booked" }],
    equipmentArrangements: [{ id: "eq-1", name: "Projector", quantity: 2, status: "Reserved" }],
    pendingChanges: [],
    readOnly: true,
    editableFields: [],
    lastUpdatedAt: "2026-10-04T09:00:00.000Z",
    ...overrides,
  };
}

const pending = (field: string, proposedValue: unknown, id = `chg-${field}`): FlaggedChange => ({
  id,
  kind: "booking_conflict",
  field,
  currentValue: null,
  proposedValue,
  status: "Needs Review",
});

// The definition row that holds a given label, so assertions stay local to one field.
const row = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement as HTMLElement;

afterEach(cleanup);

describe("PlanningInformationPanel", () => {
  // EVENT-VIEW-02-A: AC2 — every row of event information is shown in readable form.
  it("EVENT-VIEW-02-A shows the current event information", () => {
    render(<PlanningInformationPanel view={view()} />);
    expect(row("Date & time")).toHaveTextContent(formatDateTimeRange(START, END));
    expect(row("Expected attendance")).toHaveTextContent("80");
    expect(row("Room layout")).toHaveTextContent("Banquet");
    expect(row("Required facilities")).toHaveTextContent("Catering, AV System");
    expect(row("Accessibility needs")).toHaveTextContent("None");
    expect(row("Equipment requirements")).toHaveTextContent("Two microphones");
  });

  // EVENT-VIEW-02-A: bookings and equipment are listed with their schedule, quantity and status.
  it("EVENT-VIEW-02-A lists each venue booking and equipment arrangement with its status", () => {
    render(<PlanningInformationPanel view={view()} />);
    const venue = screen.getByText("Hall A").closest("li") as HTMLElement;
    expect(venue).toHaveTextContent(formatDateTimeRange(START, END));
    expect(venue).toHaveTextContent("Booked");
    const item = screen.getByText("Projector").closest("li") as HTMLElement;
    expect(item).toHaveTextContent("Qty 2");
    expect(item).toHaveTextContent("Reserved");
  });

  // EVENT-VIEW-02-A: nothing booked yet is stated, not left blank.
  it("EVENT-VIEW-02-A says when no venue or equipment has been arranged", () => {
    render(<PlanningInformationPanel view={view({ venueBookings: [], equipmentArrangements: [] })} />);
    expect(screen.getByText("No venue booked yet.")).toBeInTheDocument();
    expect(screen.getByText("No equipment arranged yet.")).toBeInTheDocument();
  });

  // EVENT-UPDATE-06-A: the last-updated time is shown on the panel as well as the form.
  it("EVENT-UPDATE-06-A shows when the information was last updated", () => {
    render(<PlanningInformationPanel view={view()} />);
    expect(screen.getByText(formatDateTime("2026-10-04T09:00:00.000Z"))).toBeInTheDocument();
  });

  // EVENT-VIEW-04-A: AC4 — whoever sees the panel, it never offers a way to edit.
  it.each([true, false])("EVENT-VIEW-04-A renders no controls when readOnly is %s", (readOnly) => {
    render(
      <PlanningInformationPanel
        view={view({ readOnly, pendingChanges: [pending("expectedAttendance", 150)] })}
      />,
    );
    const region = screen.getByRole("region", { name: /planning information/i });
    expect(within(region).queryAllByRole("button")).toHaveLength(0);
    for (const role of ["textbox", "spinbutton", "checkbox", "combobox", "link"])
      expect(within(region).queryAllByRole(role)).toHaveLength(0);
  });

  // EVENT-VIEW-04-A: the explanatory sentence tells the organiser who keeps this up to date.
  it("EVENT-VIEW-04-A tells a read-only viewer that the coordinator maintains the information", () => {
    render(<PlanningInformationPanel view={view({ readOnly: true })} />);
    expect(screen.getByText(/Read-only\. Your coordinator keeps these arrangements up to date/)).toBeInTheDocument();
  });

  it("EVENT-VIEW-04-A describes the panel as the organiser's view when the coordinator sees it", () => {
    render(<PlanningInformationPanel view={view({ readOnly: false })} />);
    expect(screen.getByText("Current arrangements as seen by the organiser.")).toBeInTheDocument();
  });
});

describe("PlanningInformationPanel: pending changes and replacements", () => {
  // EVENT-VIEW-03-A: AC3 — "Change pending" appears on the affected row only, with the proposed value.
  it("EVENT-VIEW-03-A marks only the row with a pending change and shows the proposed value", () => {
    render(<PlanningInformationPanel view={view({ pendingChanges: [pending("expectedAttendance", 150)] })} />);
    const marked = row("Expected attendance");
    expect(within(marked).getByText("Change pending")).toBeInTheDocument();
    expect(marked).toHaveTextContent("Booking conflict");
    expect(marked).toHaveTextContent("Proposed: 150");
    expect(within(row("Room layout")).queryByText("Change pending")).not.toBeInTheDocument();
    expect(screen.getAllByText("Change pending")).toHaveLength(1);
  });

  // EVENT-VIEW-03-A: a start or end change both belong to the date & time row.
  it("EVENT-VIEW-03-A shows pending start and end changes on the Date & time row", () => {
    render(
      <PlanningInformationPanel
        view={view({
          pendingChanges: [
            pending("startDateTime", "2026-11-11T10:00:00.000Z"),
            pending("endDateTime", "2026-11-11T13:00:00.000Z"),
          ],
        })}
      />,
    );
    const marked = row("Date & time");
    expect(within(marked).getAllByText("Change pending")).toHaveLength(2);
    expect(marked).toHaveTextContent(`Proposed: ${formatDateTime("2026-11-11T10:00:00.000Z")}`);
  });

  // EVENT-VIEW-03-A: a pending list value is shown as readable text.
  it("EVENT-VIEW-03-A shows a proposed list value as text", () => {
    render(<PlanningInformationPanel view={view({ pendingChanges: [pending("facilities", ["Stage", "Projector"])] })} />);
    expect(row("Required facilities")).toHaveTextContent("Proposed: Stage, Projector");
  });

  // EVENT-VIEW-03-B: AC3 — the unavailable venue is marked on its own booking.
  it("EVENT-VIEW-03-B marks the unavailable booking as needing a replacement venue", () => {
    const replacement: ReplacementRequired = {
      id: "venue-bk-1",
      kind: "replacement_venue_required",
      field: "venue",
      bookingId: "bk-1",
      venueName: "Hall A",
      status: "Needs Review",
    };
    render(
      <PlanningInformationPanel
        view={view({
          venueBookings: [
            { id: "bk-1", venueName: "Hall A", start: START, end: END, status: "Unavailable" },
            { id: "bk-2", venueName: "Hall B", start: START, end: END, status: "Booked" },
          ],
          pendingChanges: [replacement],
        })}
      />,
    );
    const hallA = screen.getByText("Hall A").closest("li") as HTMLElement;
    const hallB = screen.getByText("Hall B").closest("li") as HTMLElement;
    expect(within(hallA).getByText("Replacement venue required")).toBeInTheDocument();
    expect(hallA).toHaveTextContent("Unavailable");
    expect(within(hallB).queryByText("Replacement venue required")).not.toBeInTheDocument();
  });

  // EVENT-VIEW-03-B: a replacement for a booking that is no longer listed is still shown, by venue name.
  it("EVENT-VIEW-03-B still shows a replacement whose booking is no longer listed", () => {
    render(
      <PlanningInformationPanel
        view={view({
          venueBookings: [],
          pendingChanges: [
            { id: "venue-bk-9", kind: "replacement_venue_required", field: "venue", bookingId: "bk-9", venueName: "Old Hall", status: "Needs Review" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Replacement venue required")).toBeInTheDocument();
    expect(screen.getByText("Old Hall")).toBeInTheDocument();
  });
});

describe("PlanningInformationPanel: refresh problems", () => {
  // EVENT-VIEW-05-C: a failed refresh is shown above the data, which stays visible.
  it("EVENT-VIEW-05-C shows the refresh error and keeps the data", () => {
    render(<PlanningInformationPanel view={view()} refreshError="Could not refresh planning information: Server down" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Server down");
    expect(screen.getByText("Hall A")).toBeInTheDocument();
  });

  it("EVENT-VIEW-05-C shows no alert when the last refresh succeeded", () => {
    render(<PlanningInformationPanel view={view()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
