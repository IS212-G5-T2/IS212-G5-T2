/*
 * The attendee's event view (AttendeeEventView) and its footer. Each test builds its times with the local Date
 * constructor, so the same expectations hold in every host time zone (see scripts/testing/tz-matrix.mjs). The clock is
 * faked for Date only. Oracles are the spec's rules: local time, "To be announced", no internal status, and the footer
 * states from the registration window.
 */
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendeeEventView } from "./AttendeeEventView";
import {
  accessibilityIcon,
  attendeeAction,
  attendeeBadge,
  deadlineValue,
  formatAttendeeDate,
  formatAttendeeTime,
  formatDeadline,
  venueText,
} from "@/features/events/lib/attendeeEventView";
import { RegistrationSection } from "./registration/RegistrationSection";
import { useAppStore } from "@/store/useAppStore";
import type { EventAttachment, EventRecord, Registration, User } from "@/types";

const local = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString();

const ATTENDEE: User = { id: "att-1", name: "Attendee", email: "attendee@example.com", role: "attendee" };

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

function renderView(event: EventRecord, registration?: Registration, handlers: Partial<Parameters<typeof AttendeeEventView>[0]> = {}) {
  const onRegister = vi.fn();
  const onJoinWaitlist = vi.fn();
  const onViewAttachment = vi.fn();
  render(
    <AttendeeEventView
      event={event}
      registration={registration}
      onRegister={onRegister}
      onJoinWaitlist={onJoinWaitlist}
      onViewAttachment={onViewAttachment}
      {...handlers}
    />,
  );
  return { onRegister, onJoinWaitlist, onViewAttachment };
}

function registration(status: Registration["status"]): Registration {
  return {
    id: "REG-1",
    eventId: "EVT-900",
    attendeeId: ATTENDEE.id,
    attendeeName: ATTENDEE.name,
    status,
    registeredAt: local(2026, 10, 3, 9, 0),
    fullName: ATTENDEE.name,
    email: ATTENDEE.email,
  } as Registration;
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

  // Kills: AV-DATE-SPAN (a multi-day event is shown as one day with the first date)
  it("shows both dates when the event runs over more than one day", () => {
    renderView(baseEvent({ startDateTime: local(2026, 11, 12, 8, 0), endDateTime: local(2026, 11, 13, 17, 0) }));

    expect(
      within(screen.getByText("Date").parentElement!).getByText("Thu, 12 Nov 2026 to Fri, 13 Nov 2026"),
    ).toBeInTheDocument();
  });
});

describe("attendee view: deadline and button states", () => {
  // Kills: AV-BUTTON-ENABLED-AFTER-DEADLINE (the register button is enabled once the deadline has passed)
  it("shows Registration closed and disables the button once the deadline has passed", () => {
    vi.setSystemTime(new Date(2026, 10, 6, 9, 0));
    renderView(baseEvent());

    expect(within(screen.getByText("Register by").parentElement!).getByText("Registration closed")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Register for this event" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Registration closed", { selector: "p" })).toBeInTheDocument();
  });

  // Kills: AV-REGISTER-ENABLED-WHEN-FULL (a full event leaves the register button enabled)
  it("disables the register button with a reason when the event is full", () => {
    renderView(baseEvent({ availableRegistrationSpots: 0, isFull: true, waitlistAvailable: false }));

    expect(screen.getByRole("button", { name: "Register for this event" })).toBeDisabled();
    expect(screen.getByText("This event is full.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join waitlist" })).not.toBeInTheDocument();
  });

  // Kills: AV-FULL-NO-WAITLIST-BUTTON (Join waitlist hidden on a full event that has a waitlist)
  it("offers Join waitlist on a full event whose waitlist is available, and calls onJoinWaitlist", async () => {
    const user = userEvent.setup();
    const { onJoinWaitlist, onRegister } = renderView(
      baseEvent({ availableRegistrationSpots: 0, isFull: true, waitlistAvailable: true }),
    );

    expect(screen.getByRole("button", { name: "Register for this event" })).toBeDisabled();
    expect(screen.getByText("This event is full.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Join waitlist" }));
    expect(onJoinWaitlist).toHaveBeenCalledTimes(1);
    expect(onRegister).not.toHaveBeenCalled();
  });

  // Kills: AV-NOT-YET-OPEN-REASON (the helper text omits the opening time)
  it("disables the button and gives the opening time as the reason before registration opens", () => {
    vi.setSystemTime(new Date(2026, 9, 10, 9, 0));
    renderView(baseEvent({ registrationOpensAt: local(2026, 10, 20, 10, 0) }));

    expect(screen.getByRole("button", { name: "Register for this event" })).toBeDisabled();
    expect(screen.getByText("Registration opens 20 Oct 2026, 10:00am")).toBeInTheDocument();
  });

  // Kills: AV-REGISTER-NOT-WIRED (the register button does nothing when clicked)
  it("calls onRegister when the register button is clicked on an open event", async () => {
    const user = userEvent.setup();
    const { onRegister } = renderView(baseEvent());

    await user.click(screen.getByRole("button", { name: "Register for this event" }));

    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  // Kills: AV-REGISTER-SHOWN-REGISTERED (the footer and register button remain for a registered attendee)
  it("hides the footer and the register button for an attendee who is already registered", () => {
    renderView(baseEvent(), registration("registered"));

    expect(screen.queryByRole("button", { name: "Register for this event" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ready to attend?")).not.toBeInTheDocument();
  });

  // Kills: AV-REGISTER-SHOWN-REGISTERED (the footer remains for a waitlisted attendee)
  it("hides the footer for an attendee who is on the waitlist or has withdrawn", () => {
    const { unmount } = render(
      <AttendeeEventView event={baseEvent()} registration={registration("waitlisted")} onRegister={() => undefined} onJoinWaitlist={() => undefined} onViewAttachment={() => undefined} />,
    );
    expect(screen.queryByRole("button", { name: "Register for this event" })).not.toBeInTheDocument();
    unmount();
    render(
      <AttendeeEventView event={baseEvent()} registration={registration("withdrawn")} onRegister={() => undefined} onJoinWaitlist={() => undefined} onViewAttachment={() => undefined} />,
    );
    expect(screen.queryByRole("button", { name: "Register for this event" })).not.toBeInTheDocument();
  });

  // Kills: AV-REGISTRATION-OFF-FOOTER (a footer leads into registration that is switched off)
  it("shows no footer when registration through the website is not enabled", () => {
    renderView(baseEvent({ registrationEnabled: false }));

    expect(screen.queryByText("Ready to attend?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register for this event" })).not.toBeInTheDocument();
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

  // Kills: AV-FOOTER-COORDINATOR (the coordinator sentence is shown with no coordinator)
  it("names the organiser in the footer, and the coordinator when one is assigned", () => {
    renderView(baseEvent({ coordinatorName: "Daniel Koh" }));
    expect(screen.getByText("Organised by Events Office. Questions go to Daniel Koh.")).toBeInTheDocument();
  });

  // Kills: AV-FOOTER-COORDINATOR (the coordinator sentence is shown with no coordinator)
  it("omits the coordinator sentence when no coordinator is assigned", () => {
    renderView(baseEvent({ coordinatorName: undefined }));
    expect(screen.getByText("Organised by Events Office.")).toBeInTheDocument();
    expect(screen.queryByText(/Questions go to/)).not.toBeInTheDocument();
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

  // Kills: AV-BUTTON-ENABLED-AFTER-DEADLINE (the action ignores the deadline)
  it("gives no register action at or after the deadline, and a register action one minute before it", () => {
    const event = baseEvent({ registrationClosesAt: local(2026, 11, 5, 23, 59) });
    expect(attendeeAction(event, new Date(2026, 10, 5, 23, 58))).toEqual({ kind: "register" });
    expect(attendeeAction(event, new Date(2026, 10, 5, 23, 59))).toEqual({
      kind: "disabled",
      reason: "Registration closed",
      waitlistAvailable: false,
    });
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

describe("attendee view: the footer's register action reaches the form", () => {
  /** The footer and RegistrationSection wired together, as EventDetailPage wires them. */
  function Harness({ event }: { event: EventRecord }) {
    const [registerSignal, setRegisterSignal] = useState(0);
    const [joinSignal, setJoinSignal] = useState(0);
    return (
      <>
        <AttendeeEventView
          event={event}
          onRegister={() => setRegisterSignal((count) => count + 1)}
          onJoinWaitlist={() => setJoinSignal((count) => count + 1)}
          onViewAttachment={() => undefined}
        />
        <RegistrationSection
          event={event}
          currentUser={ATTENDEE}
          registerSignal={registerSignal}
          joinSignal={joinSignal}
        />
      </>
    );
  }

  // Kills: RS-REGISTER-NOT-FOCUSED (the form opens but focus stays on the footer button)
  it("opens the registration form and moves focus to its first field when the footer button is clicked", async () => {
    useAppStore.setState({ registrations: [] });
    const user = userEvent.setup();
    render(<Harness event={baseEvent()} />);

    await user.click(screen.getByRole("button", { name: "Register for this event" }));

    expect(await screen.findByRole("textbox", { name: /full name/i })).toHaveFocus();
  });
});
