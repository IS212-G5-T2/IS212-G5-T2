import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  EventInformationList,
  PlanningInformationPanel,
} from "@/features/events/pages/detail/planning/PlanningInformationPanel";
import { formatDateTime, formatDateTimeRange } from "@/utils/format";
import type {
  EventRecord,
  FlaggedChange,
  PlanningView,
  ReplacementRequired,
} from "@/types";

/**
 * SPM-97 — the read-only "Planning Information" panel. The page tests cover it
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
    venueRequirements: {
      minCapacity: 80,
      layout: "Banquet",
      facilities: ["Catering", "AV System"],
      accessibility: [],
    },
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-10-04T09:00:00.000Z",
  };
}

function view(overrides: Partial<PlanningView> = {}): PlanningView {
  return {
    event: eventRecord(),
    venueBookings: [
      {
        id: "bk-1",
        venueName: "Hall A",
        start: START,
        end: END,
        status: "Booked",
      },
    ],
    equipmentArrangements: [
      { id: "eq-1", name: "Projector", quantity: 2, status: "Reserved" },
    ],
    pendingChanges: [],
    readOnly: true,
    editableFields: [],
    lastUpdatedAt: "2026-10-04T09:00:00.000Z",
    ...overrides,
  };
}

const pending = (
  field: string,
  proposedValue: unknown,
  id = `chg-${field}`,
): FlaggedChange => ({
  id,
  kind: "booking_conflict",
  field,
  currentValue: null,
  proposedValue,
  status: "Needs Review",
});

// The definition row that holds a given label, so assertions stay local to one field.
const row = (label: string) =>
  screen.getByText(label, { selector: "dt" }).parentElement as HTMLElement;

afterEach(cleanup);

describe("SPM-54 AC11: capacity summaries", () => {
  // VEN-BKG-11-A: organiser capacity is capped at expected attendance and excludes pending/unavailable venues.
  // Kills: a pending or unavailable venue counted into confirmed capacity, or the organiser total not capped at expected attendance.
  it("VEN-BKG-11-A caps confirmed usable capacity for the organiser and separates pending capacity", () => {
    const { rerender } = render(
      <PlanningInformationPanel
        view={view({
          event: { ...eventRecord(), expectedAttendance: 180 },
          venueBookings: [
            {
              id: "a",
              venueName: "Hall A",
              start: START,
              end: END,
              status: "Booked",
              requestStatus: "approved",
              capacity: 40,
            },
            {
              id: "b",
              venueName: "Hall B",
              start: START,
              end: END,
              status: "Booked",
              requestStatus: "pending",
              capacity: 100,
            },
            {
              id: "c",
              venueName: "Hall C",
              start: START,
              end: END,
              status: "Unavailable",
              requestStatus: "approved",
              capacity: 120,
            },
          ],
        })}
      />,
    );
    const summary = screen.getByRole("group", {
      name: "Venue capacity summary",
    });
    expect(within(summary).getByText("40 / 180")).toBeInTheDocument();
    expect(within(summary).getByText("100")).toBeInTheDocument();

    // Optional capacity metadata safely contributes zero to both confirmed and pending totals.
    rerender(
      <PlanningInformationPanel
        view={view({
          event: { ...eventRecord(), expectedAttendance: 180 },
          venueBookings: [
            {
              id: "a",
              venueName: "Hall A",
              start: START,
              end: END,
              status: "Booked",
              requestStatus: "approved",
            },
            {
              id: "b",
              venueName: "Hall B",
              start: START,
              end: END,
              status: "Booked",
              requestStatus: "pending",
            },
          ],
        })}
      />,
    );
    expect(within(summary).getByText("0 / 180")).toBeInTheDocument();
    expect(
      within(summary).queryByText("Pending venue capacity"),
    ).not.toBeInTheDocument();
  });

  // VEN-BKG-11-B: coordinator sees aggregate confirmed capacity without the organiser cap.
  // Kills: the coordinator summary capped at expected attendance (180 shown instead of 220 actual), or the actual sum wrong.
  it("VEN-BKG-11-B shows actual confirmed capacity to the coordinator", () => {
    render(
      <EventInformationList
        coordinator
        view={view({
          event: { ...eventRecord(), expectedAttendance: 180 },
          venueBookings: [
            {
              id: "a",
              venueName: "Hall A",
              start: START,
              end: END,
              status: "Booked",
              requestStatus: "approved",
              capacity: 100,
            },
            {
              id: "b",
              venueName: "Hall B",
              start: START,
              end: END,
              status: "Booked",
              requestStatus: "approved",
              capacity: 120,
            },
          ],
        })}
      />,
    );
    const summary = screen.getByRole("group", {
      name: "Venue capacity summary",
    });
    expect(
      within(summary).getByText("220 actual / 180 expected"),
    ).toBeInTheDocument();
  });

  // VEN-BKG-11-A: the coordinator sees the same 40/180 usable summary as the organiser.
  // Kills: the coordinator summary showing a different actual figure, or dropping the expected value from the summary.
  it("VEN-BKG-11-A shows 40 of 180 confirmed usable capacity to the coordinator", () => {
    render(
      <EventInformationList
        coordinator
        view={view({
          event: { ...eventRecord(), expectedAttendance: 180 },
          venueBookings: [
            {
              id: "a",
              venueName: "Hall A",
              start: START,
              end: END,
              status: "Booked",
              requestStatus: "approved",
              capacity: 40,
            },
          ],
        })}
      />,
    );
    const summary = screen.getByRole("group", {
      name: "Venue capacity summary",
    });
    expect(
      within(summary).getByText("40 actual / 180 expected"),
    ).toBeInTheDocument();
  });

  // VEN-BKG-11-BND-1: the organiser total stops at expected attendance when confirmed venues exceed it.
  // Kills: the organiser total not stopping at 180 when confirmed capacity is 220 (cap missing or off by one).
  it("VEN-BKG-11-BND-1 caps 220 confirmed seats at 180 for the organiser", () => {
    render(
      <EventInformationList
        view={view({
          event: { ...eventRecord(), expectedAttendance: 180 },
          venueBookings: [
            {
              id: "a",
              venueName: "Hall A",
              start: START,
              end: END,
              status: "Booked",
              requestStatus: "approved",
              capacity: 100,
            },
            {
              id: "b",
              venueName: "Hall B",
              start: START,
              end: END,
              status: "Booked",
              requestStatus: "approved",
              capacity: 120,
            },
          ],
        })}
      />,
    );
    const summary = screen.getByRole("group", {
      name: "Venue capacity summary",
    });
    expect(within(summary).getByText("180 / 180")).toBeInTheDocument();
  });

  // VEN-BKG-11-VAR-1: a venue becoming unavailable immediately removes only its capacity from the live summary.
  // Kills: capacity not recalculated when a confirmed venue becomes unavailable, so its capacity stays in the summary.
  it("VEN-BKG-11-VAR-1 recalculates usable capacity when one confirmed venue becomes unavailable", () => {
    const initial = view({
      event: { ...eventRecord(), status: "confirmed", expectedAttendance: 180 },
      venueBookings: [
        {
          id: "a",
          venueName: "Hall A",
          start: START,
          end: END,
          status: "Booked",
          requestStatus: "approved",
          capacity: 100,
        },
        {
          id: "b",
          venueName: "Hall B",
          start: START,
          end: END,
          status: "Booked",
          requestStatus: "approved",
          capacity: 80,
        },
      ],
    });
    const { rerender } = render(
      <EventInformationList coordinator view={initial} />,
    );
    const summary = screen.getByRole("group", {
      name: "Venue capacity summary",
    });
    expect(
      within(summary).getByText("180 actual / 180 expected"),
    ).toBeInTheDocument();

    const unavailable = {
      ...initial,
      venueBookings: [
        initial.venueBookings[0],
        { ...initial.venueBookings[1], status: "Unavailable" as const },
      ],
    };
    rerender(<EventInformationList coordinator view={unavailable} />);
    expect(
      within(summary).getByText("100 actual / 180 expected"),
    ).toBeInTheDocument();
    expect(unavailable.event.status).toBe("confirmed");
    expect(unavailable.venueBookings[0]).toEqual(initial.venueBookings[0]);
  });
});

describe("PlanningInformationPanel", () => {
  // EVENT-VIEW-02-A: AC2 — every row of event information is shown in readable form.
  // Kills: a row (date and time, attendance, room layout, facilities, accessibility or equipment) missing or showing the wrong value.
  it("EVENT-VIEW-02-A shows the current event information", () => {
    render(<PlanningInformationPanel view={view()} />);
    expect(row("Date & time")).toHaveTextContent(
      formatDateTimeRange(START, END),
    );
    expect(row("Expected attendance")).toHaveTextContent("80");
    expect(row("Room layout")).toHaveTextContent("Banquet");
    expect(row("Required facilities")).toHaveTextContent("Catering, AV System");
    expect(row("Accessibility needs")).toHaveTextContent("None");
    expect(row("Equipment requirements")).toHaveTextContent("Two microphones");
  });

  // EVENT-VIEW-02-A: bookings and equipment are listed with their schedule, quantity and status.
  // Kills: a venue booking or equipment arrangement rendered without its schedule, quantity or status.
  it("EVENT-VIEW-02-A lists each venue booking and equipment arrangement with its status", () => {
    render(<PlanningInformationPanel view={view()} />);
    const venue = screen.getByText("Hall A").closest("li") as HTMLElement;
    expect(venue).toHaveTextContent(formatDateTimeRange(START, END));
    expect(venue).toHaveTextContent("Booked");
    const item = screen.getByText("Projector").closest("li") as HTMLElement;
    expect(item).toHaveTextContent("Qty 2");
    expect(item).toHaveTextContent("Reserved");
  });

  // Kills: a cancelled booking listed among the active venues (status filter removed).
  /** VEN-BKG-09-A: a cancelled request is retained in history but omitted from the event's active venue list. */
  it("VEN-BKG-09-A hides a cancelled venue booking while keeping other active venues visible", () => {
    const cancelled = {
      id: "bk-cancelled",
      venueName: "Old Hall",
      start: START,
      end: END,
      status: "Cancelled" as const,
    };
    const active = {
      id: "bk-active",
      venueName: "Current Hall",
      start: START,
      end: END,
      status: "Booked" as const,
    };
    const replacement: ReplacementRequired = {
      id: "replacement-old",
      kind: "replacement_venue_required",
      field: "venue",
      bookingId: "bk-cancelled",
      venueName: "Old Hall",
      status: "Needs Review",
    };
    render(
      <PlanningInformationPanel
        view={view({
          venueBookings: [cancelled, active],
          pendingChanges: [replacement],
        })}
      />,
    );

    const venues = screen.getByRole("heading", {
      name: "Venues",
    }).parentElement!;
    expect(within(venues).getByText("Current Hall")).toBeInTheDocument();
    expect(within(venues).queryByText("Old Hall")).not.toBeInTheDocument();
  });

  // EVENT-VIEW-02-A: nothing booked yet is stated, not left blank.
  // Kills: an empty list rendered blank instead of 'No venue booked yet.' or 'No equipment arranged yet.'
  it("EVENT-VIEW-02-A says when no venue or equipment has been arranged", () => {
    render(
      <PlanningInformationPanel
        view={view({ venueBookings: [], equipmentArrangements: [] })}
      />,
    );
    expect(screen.getByText("No venue booked yet.")).toBeInTheDocument();
    expect(screen.getByText("No equipment arranged yet.")).toBeInTheDocument();
  });

  // EVENT-UPDATE-06-A: the last-updated time is shown on the panel as well as the form.
  // Kills: the last-updated time omitted, or formatted differently from formatDateTime.
  it("EVENT-UPDATE-06-A shows when the information was last updated", () => {
    render(<PlanningInformationPanel view={view()} />);
    expect(
      screen.getByText(formatDateTime("2026-10-04T09:00:00.000Z")),
    ).toBeInTheDocument();
  });

  // EVENT-VIEW-04-A: AC4 — whoever sees the panel, it never offers a way to edit.
  // Kills: a button, text box, checkbox, combobox or link rendered in the panel for either readOnly value.
  it.each([true, false])(
    "EVENT-VIEW-04-A renders no controls when readOnly is %s",
    (readOnly) => {
      render(
        <PlanningInformationPanel
          view={view({
            readOnly,
            pendingChanges: [pending("expectedAttendance", 150)],
          })}
        />,
      );
      const region = screen.getByRole("region", {
        name: /planning information/i,
      });
      expect(within(region).queryAllByRole("button")).toHaveLength(0);
      for (const role of [
        "textbox",
        "spinbutton",
        "checkbox",
        "combobox",
        "link",
      ])
        expect(within(region).queryAllByRole(role)).toHaveLength(0);
    },
  );

  // EVENT-VIEW-04-A: the explanatory sentence tells the organiser who keeps this up to date.
  // Kills: the read-only sentence missing or reworded for a read-only viewer.
  it("EVENT-VIEW-04-A tells a read-only viewer that the coordinator maintains the information", () => {
    render(<PlanningInformationPanel view={view({ readOnly: true })} />);
    expect(
      screen.getByText(
        /Read-only\. Your coordinator keeps these arrangements up to date/,
      ),
    ).toBeInTheDocument();
  });

  // Kills: the organiser-view description missing when readOnly is false.
  it("EVENT-VIEW-04-A describes the panel as the organiser's view when the coordinator sees it", () => {
    render(<PlanningInformationPanel view={view({ readOnly: false })} />);
    expect(
      screen.getByText("Current arrangements as seen by the organiser."),
    ).toBeInTheDocument();
  });
});

describe("PlanningInformationPanel: pending changes and replacements", () => {
  // EVENT-VIEW-03-A: AC3 — "Change pending" appears on the affected row only, with the proposed value.
  // Kills: 'Change pending' shown on every row, or the proposed value missing from the affected row.
  it("EVENT-VIEW-03-A marks only the row with a pending change and shows the proposed value", () => {
    render(
      <PlanningInformationPanel
        view={view({ pendingChanges: [pending("expectedAttendance", 150)] })}
      />,
    );
    const marked = row("Expected attendance");
    expect(within(marked).getByText("Change pending")).toBeInTheDocument();
    expect(marked).toHaveTextContent("Booking conflict");
    expect(marked).toHaveTextContent("Proposed: 150");
    expect(
      within(row("Room layout")).queryByText("Change pending"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Change pending")).toHaveLength(1);
  });

  // EVENT-VIEW-03-A: a start or end change both belong to the date & time row.
  // Kills: a pending start or end change shown on another row, or only one of the two marked on Date & time.
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
    expect(marked).toHaveTextContent("Proposed: 11 Nov 2026, 6:00 pm"); // Singapore time with am/pm
  });

  // EVENT-VIEW-03-A: a pending list value is shown as readable text.
  // Kills: a proposed list shown as raw array text or '[object Object]' instead of comma-separated text.
  it("EVENT-VIEW-03-A shows a proposed list value as text", () => {
    render(
      <PlanningInformationPanel
        view={view({
          pendingChanges: [pending("facilities", ["Stage", "Projector"])],
        })}
      />,
    );
    expect(row("Required facilities")).toHaveTextContent(
      "Proposed: Stage, Projector",
    );
  });

  // EVENT-VIEW-03-B: AC3 — the unavailable venue is marked on its own booking.
  // Kills: the replacement label shown on every booking, or missing from the unavailable booking.
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
            {
              id: "bk-1",
              venueName: "Hall A",
              start: START,
              end: END,
              status: "Unavailable",
            },
            {
              id: "bk-2",
              venueName: "Hall B",
              start: START,
              end: END,
              status: "Booked",
            },
          ],
          pendingChanges: [replacement],
        })}
      />,
    );
    const hallA = screen.getByText("Hall A").closest("li") as HTMLElement;
    const hallB = screen.getByText("Hall B").closest("li") as HTMLElement;
    expect(
      within(hallA).getByText("Replacement venue required"),
    ).toBeInTheDocument();
    expect(hallA).toHaveTextContent("Unavailable");
    expect(
      within(hallB).queryByText("Replacement venue required"),
    ).not.toBeInTheDocument();
  });

  // EVENT-VIEW-03-B: a replacement for a booking that is no longer listed is still shown, by venue name.
  // Kills: a replacement dropped when its booking is no longer listed.
  it("EVENT-VIEW-03-B still shows a replacement whose booking is no longer listed", () => {
    render(
      <PlanningInformationPanel
        view={view({
          venueBookings: [],
          pendingChanges: [
            {
              id: "venue-bk-9",
              kind: "replacement_venue_required",
              field: "venue",
              bookingId: "bk-9",
              venueName: "Old Hall",
              status: "Needs Review",
            },
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
  // Kills: the refresh error not shown as an alert, or the planning data hidden when the refresh fails.
  it("EVENT-VIEW-05-C shows the refresh error and keeps the data", () => {
    render(
      <PlanningInformationPanel
        view={view()}
        refreshError="Could not refresh planning information: Server down"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Server down");
    expect(screen.getByText("Hall A")).toBeInTheDocument();
  });

  // Kills: an alert shown when no refresh error was supplied.
  it("EVENT-VIEW-05-C shows no alert when the last refresh succeeded", () => {
    render(<PlanningInformationPanel view={view()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Kills: an empty room layout rendered as a blank cell or as another layout instead of a dash.
  /**
   * EVENT-VIEW-02-H: an event with no room layout recorded shows a dash in the
   * layout row instead of an empty cell.
   */
  it("EVENT-VIEW-02-H shows a dash when no room layout is recorded", () => {
    const event = eventRecord();
    event.venueRequirements = { ...event.venueRequirements, layout: "" };
    render(<PlanningInformationPanel view={view({ event })} />);
    expect(row("Room layout")).toHaveTextContent("—");
    expect(row("Room layout")).not.toHaveTextContent("Banquet");
  });
});

// SPM-94: the organiser sees the safety state in the planning information, in words (the label stays in the header).
describe("planning information shows the safety check to the organiser", () => {
  // Kills: a safety indicator mapped to the wrong sentence (e.g. CLEARED described as awaiting a check).
  it.each([
    ["AWAITING_CHECK", "Waiting for the Safety Officer's check."],
    [
      "CHANGES_REQUESTED",
      "The Safety Officer has requested changes; your coordinator will respond.",
    ],
    ["CLEARED", "The Safety Officer has cleared this event."],
  ] as const)(
    "TRACK-EVENT-STATUS-03-B PLANNING: %s is described in the planning information",
    (indicator, sentence) => {
      render(
        <PlanningInformationPanel view={view()} safetyIndicator={indicator} />,
      );
      expect(screen.getByText(sentence)).toBeInTheDocument();
    },
  );

  // Kills: the 'No safety check requested yet.' sentence missing when the safety indicator is null.
  it("TRACK-EVENT-STATUS-03-B PLANNING: no safety check requested yet when there is no indicator", () => {
    render(<PlanningInformationPanel view={view()} safetyIndicator={null} />);
    expect(
      screen.getByText("No safety check requested yet."),
    ).toBeInTheDocument();
  });
});
