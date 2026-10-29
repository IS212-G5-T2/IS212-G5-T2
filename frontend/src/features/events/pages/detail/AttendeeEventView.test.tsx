/*
 * The attendee's event view (AttendeeEventView). Each test builds its times with the local Date constructor, so the
 * same expectations hold in every host time zone (see scripts/testing/tz-matrix.mjs). The clock is faked for Date only.
 * Oracles are the spec's rules: local time, "To be announced", and no internal status. The register action and its
 * states live in RegistrationSection (one register box), tested in RegistrationSection.merged.test.tsx.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendeeEventView } from "./AttendeeEventView";
import {
  accessibilityIcon,
  attendeeBadge,
  deadlineValue,
  formatAttendeeDate,
  formatAttendeeTime,
  formatDeadline,
  venueText,
} from "@/features/events/lib/attendeeEventView";
import type { EventAttachment, EventRecord } from "@/types";

const local = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString();

/** An open event: registration from 1 Oct, deadline 5 Nov 23:59 local, event on 12 Nov 8:00am to 5:00pm. */
function baseEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "EVT-900",
    name: "Cloud Basics",
    purpose: "An introduction",
    description: "Learn the basics of cloud computing.",
    organiserId: "org-1",
    organiserName: "Events Office",
    status: "confirmed",
    startDateTime: local(2026, 11, 12, 8, 0),
    endDateTime: local(2026, 11, 12, 17, 0),
    expectedAttendance: 40,
    venueRequirements: {
      minCapacity: 40,
      accessibility: [],
      facilities: ["Projector"],
      layout: "Theatre",
    },
    equipmentNeeds: "Two microphones",
    registrationEnabled: true,
    registrationOpensAt: local(2026, 10, 1, 0, 0),
    registrationClosesAt: local(2026, 11, 5, 23, 59),
    availableRegistrationSpots: 20,
    registrationLimit: 40,
    createdAt: local(2026, 9, 15),
    updatedAt: local(2026, 10, 2),
    ...overrides,
  };
}

/** The clock for every test: 16 Oct 2026, 10:00 local, between the opening and the deadline. */
const NOW = new Date(2026, 9, 16, 10, 0);

function renderView(event: EventRecord, onViewAttachment = vi.fn()) {
  render(<AttendeeEventView event={event} onViewAttachment={onViewAttachment} />);
  return { onViewAttachment };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("attendee view: key facts", () => {
  // Kills: AV-TIME-FORMAT (times rendered on a 24-hour clock)
  it("shows the date, the start to end time and the venue in local time", () => {
    renderView(baseEvent({ venueName: "Hall A" }));

    expect(within(screen.getByText("Date").parentElement!).getByText("Thu, 12 Nov 2026")).toBeInTheDocument();
    expect(within(screen.getByText("Time").parentElement!).getByText("8:00am to 5:00pm")).toBeInTheDocument();
    expect(within(screen.getByText("Venue").parentElement!).getByText("Hall A")).toBeInTheDocument();
  });

  // Kills: AV-VENUE-ALWAYS-TBA (the venue always reads To be announced)
  it("shows To be announced for the venue when no venue is booked", () => {
    renderView(baseEvent({ venueName: undefined }));

    expect(within(screen.getByText("Venue").parentElement!).getByText("To be announced")).toBeInTheDocument();
    expect(screen.queryByText("Not yet booked")).not.toBeInTheDocument();
    expect(screen.queryByText("Not booked")).not.toBeInTheDocument();
  });

  // Kills: AV-VENUE-ALWAYS-TBA (a booked venue is replaced by the placeholder)
  it("shows the venue name, not the placeholder, once a venue is booked", () => {
    renderView(baseEvent({ venueName: "Hall A" }));

    expect(screen.getByText("Hall A")).toBeInTheDocument();
    expect(screen.queryByText("To be announced")).not.toBeInTheDocument();
  });

  // Kills: AV-PLACEHOLDER-DEADLINE (a hard-coded placeholder deadline instead of the event's own)
  it("shows the Register by item with the event's own deadline in local time", () => {
    renderView(baseEvent({ registrationClosesAt: local(2026, 11, 9, 18, 30) }));

    expect(within(screen.getByText("Register by").parentElement!).getByText("9 Nov 2026, 6:30pm")).toBeInTheDocument();
  });

  // Kills: AV-DEADLINE-WHEN-NONE (a Register by item with no value when no deadline is set)
  it("hides the Register by item when no deadline is set", () => {
    renderView(baseEvent({ registrationClosesAt: undefined }));

    expect(screen.queryByText("Register by")).not.toBeInTheDocument();
  });

  // Kills: AV-DEADLINE-PASSED (the Register by item keeps a date after the deadline has passed)
  it("shows Registration closed in the Register by item once the deadline has passed", () => {
    vi.setSystemTime(new Date(2026, 10, 6, 9, 0));
    renderView(baseEvent());

    expect(within(screen.getByText("Register by").parentElement!).getByText("Registration has closed")).toBeInTheDocument();
  });

  // Kills: AV-DATE-SPAN (a multi-day event is shown as one day with the first date)
  it("shows both dates when the event runs over more than one day", () => {
    renderView(baseEvent({ startDateTime: local(2026, 11, 12, 8, 0), endDateTime: local(2026, 11, 13, 17, 0) }));

    expect(
      within(screen.getByText("Date").parentElement!).getByText("Thu, 12 Nov 2026 to Fri, 13 Nov 2026"),
    ).toBeInTheDocument();
  });
});

describe("attendee view: registration label on a confirmed event", () => {
  // Kills: AV-LABEL-OPEN (the open window shows no Registration open label)
  it("shows Registration open while the registration window is open", () => {
    renderView(baseEvent({ status: "confirmed" }));
    expect(screen.getByText("Registration open")).toBeInTheDocument();
    expect(screen.queryByText("Registration closed")).not.toBeInTheDocument();
  });

  // Kills: AV-LABEL-CLOSED (the passed deadline shows no Registration closed label)
  it("shows Registration closed once the deadline has passed", () => {
    vi.setSystemTime(new Date(2026, 10, 6, 9, 0));
    renderView(baseEvent({ status: "confirmed" }));
    expect(screen.getByText("Registration closed")).toBeInTheDocument();
    expect(screen.queryByText("Registration open")).not.toBeInTheDocument();
  });

  // Kills: AV-LABEL-SOON (registration not enabled, or not yet open, shows no opening-soon label)
  it("shows Registration opening soon when registration is not enabled or has not started", () => {
    renderView(baseEvent({ status: "confirmed", registrationEnabled: false }));
    expect(screen.getByText("Registration opening soon")).toBeInTheDocument();
  });

  it("shows Registration opening soon before the opening time", () => {
    vi.setSystemTime(new Date(2026, 9, 10, 9, 0));
    renderView(baseEvent({ status: "confirmed", registrationOpensAt: local(2026, 10, 20, 10, 0) }));
    expect(screen.getByText("Registration opening soon")).toBeInTheDocument();
    expect(screen.queryByText("Registration open")).not.toBeInTheDocument();
  });

  // Kills: AV-LABEL-EVENT-CONFIRMED (the event's own confirmed label is shown instead of the registration label)
  it("never shows an Event confirmed label", () => {
    renderView(baseEvent({ status: "confirmed" }));
    expect(screen.queryByText("Event confirmed")).not.toBeInTheDocument();
  });
});

describe("attendee view: accessibility", () => {
  // Kills: AV-ACCESS-EMPTY-SHOWN (an empty Accessibility section is shown)
  it("hides the Accessibility section when the event has no features", () => {
    renderView(baseEvent());

    expect(screen.queryByRole("heading", { name: "Accessibility" })).not.toBeInTheDocument();
  });

  // Kills: AV-ACCESS-CHIPS-HIDDEN (the features are not listed as chips)
  it("lists each accessibility feature as a chip with its own icon", () => {
    renderView(
      baseEvent({
        venueRequirements: {
          minCapacity: 40,
          accessibility: ["Step-free access", "Hearing loop"],
          facilities: [],
          layout: "",
        },
      }),
    );

    const section = screen.getByRole("heading", { name: "Accessibility" }).closest("section")!;
    expect(within(section).getByText("Step-free access")).toBeInTheDocument();
    expect(within(section).getByText("Hearing loop")).toBeInTheDocument();
    expect(accessibilityIcon("Step-free access")).toBe("access");
    expect(accessibilityIcon("Hearing loop")).toBe("hearing");
    expect(accessibilityIcon("Quiet room")).toBe("check");
  });
});

describe("attendee view: content rules", () => {
  // Kills: AV-INTERNAL-STATUS-LEAK (the internal event status shown as the badge)
  it("shows an attendee-facing lifecycle label and never the internal event status", () => {
    renderView(baseEvent({ status: "confirmed" }));

    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.queryByText("confirmed")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
  });

  // Kills: AV-INTERNAL-FIELDS-SHOWN (room layout, facilities, equipment, attendance, last updated or status shown)
  it("does not show room layout, required facilities, equipment needs, expected attendance, last updated or internal status", () => {
    renderView(baseEvent());

    for (const hidden of [
      "Room layout",
      "Required facilities",
      "Equipment needs",
      "Expected attendance",
      "Last updated",
      "Event status",
      "Theatre",
      "Projector",
      "Two microphones",
    ]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  // Kills: AV-ATTACHMENTS-HIDDEN (the programme is not listed when the event has one)
  it("lists the event programme with View and Download when attachments exist, and calls onViewAttachment", async () => {
    const user = userEvent.setup();
    const attachment: EventAttachment = {
      id: "A1",
      name: "programme.pdf",
      type: "application/pdf",
      size: 10,
      dataUrl: "data:application/pdf;base64,AA==",
    };
    const { onViewAttachment } = renderView(baseEvent({ attachments: [attachment] }));

    expect(screen.getByRole("heading", { name: "Event programme" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("download", "programme.pdf");
    await user.click(screen.getByRole("button", { name: "View" }));
    expect(onViewAttachment).toHaveBeenCalledWith(attachment);
  });

  // Kills: AV-ATTACHMENTS-HIDDEN (an Event programme section appears with no attachments)
  it("shows no Event programme section when the event has no attachments", () => {
    renderView(baseEvent({ attachments: [] }));

    expect(screen.queryByRole("heading", { name: "Event programme" })).not.toBeInTheDocument();
  });
});

describe("attendee view: helpers (local time, no time zone assumed)", () => {
  // Kills: AV-TIME-FORMAT (times rendered on a 24-hour clock)
  it("formats times as 8:00am, 12:01am and 5:00pm, and deadlines as day, month, year, time", () => {
    expect(formatAttendeeTime(local(2026, 11, 12, 8, 0))).toBe("8:00am");
    expect(formatAttendeeTime(local(2026, 11, 12, 0, 1))).toBe("12:01am");
    expect(formatAttendeeTime(local(2026, 11, 12, 17, 0))).toBe("5:00pm");
    expect(formatDeadline(local(2026, 11, 4, 23, 59))).toBe("4 Nov 2026, 11:59pm");
    expect(formatAttendeeDate(local(2026, 11, 12, 8, 0))).toBe("Thu, 12 Nov 2026");
  });

  // Kills: AV-DEADLINE-MIDNIGHT (a deadline just after local midnight reads as the previous day)
  it("keeps a deadline that falls just after local midnight on the new day", () => {
    const justAfterMidnight = local(2026, 11, 6, 0, 1);
    expect(formatDeadline(justAfterMidnight)).toBe("6 Nov 2026, 12:01am");
    expect(formatDeadline(local(2026, 11, 4, 23, 59))).toBe("4 Nov 2026, 11:59pm");
    expect(deadlineValue(baseEvent({ registrationClosesAt: justAfterMidnight }), new Date(2026, 10, 5, 23, 0))).toBe(
      "6 Nov 2026, 12:01am",
    );
  });

  // Kills: AV-STATUS-BADGE-MAP (the badge maps the lifecycle label to the wrong value)
  it("maps the event's times to upcoming, ongoing and ended, with cancelled reading as ended", () => {
    const event = baseEvent();
    expect(attendeeBadge(event, new Date(2026, 9, 16, 10, 0))).toBe("upcoming");
    expect(attendeeBadge(event, new Date(2026, 10, 12, 9, 0))).toBe("ongoing");
    expect(attendeeBadge(event, new Date(2026, 10, 13, 9, 0))).toBe("ended");
    expect(attendeeBadge(baseEvent({ status: "cancelled" }), new Date(2026, 9, 16, 10, 0))).toBe("ended");
  });

  // Kills: AV-VENUE-ALWAYS-TBA (a blank venue name shown as a blank value)
  it("treats a blank venue name as not booked", () => {
    expect(venueText(baseEvent({ venueName: "   " }))).toBe("To be announced");
  });
});

describe("attendee view: a full event still reads Registration open", () => {
  // Kills: AV-LABEL-FULL (a full event shows Registration closed although its window is open)
  it("shows Registration open when every place is taken but the window is open", () => {
    renderView(baseEvent({ status: "confirmed", availableRegistrationSpots: 0, isFull: true }));
    expect(screen.getByText("Registration open")).toBeInTheDocument();
    expect(screen.queryByText("Registration closed")).not.toBeInTheDocument();
  });
});
