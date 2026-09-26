import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "./EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import { formatDateTime, formatDateTimeRange } from "@/utils/format";
import type { EventRecord, User } from "@/types";

const attendee: User = {
  id: "attendee-1",
  name: "Attendee",
  email: "attendee@example.com",
  role: "attendee",
};

const event: EventRecord = {
  id: "event-1",
  name: "Open event",
  purpose: "Test registrations",
  description: "Test event",
  organiserId: "organiser-1",
  organiserName: "Organiser",
  status: "confirmed",
  startDateTime: "2026-10-01T09:00:00.000Z",
  endDateTime: "2026-10-01T10:00:00.000Z",
  expectedAttendance: 10,
  venueRequirements: { minCapacity: 10, accessibility: [], facilities: [], layout: "" },
  equipmentNeeds: "",
  registrationEnabled: true,
  registrationOpensAt: "2020-10-01T09:00:00.000Z",
  registrationClosesAt: "2099-10-14T23:59:00.000Z",
  changeRequests: [],
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

/** Renders an event detail route with the current Zustand test state. */
function renderEventDetail(eventId = event.id) {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.mockImplementation((path: string) =>
    path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
  );
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: true,
    currentUser: attendee,
    events: [event],
    registrations: [],
  });
});

describe("EventDetailPage attendee registration", () => {
  // Supplementary negative path: a valid-looking but nonexistent event must show a
  // safe attendee-facing error and must not render stale or fabricated details.
  it("shows a safe not-found state for a nonexistent attendee event", async () => {
    apiMock.mockRejectedValue(new Error("Event not found."));
    useAppStore.setState({ events: [] });

    render(
      <MemoryRouter initialEntries={["/events/00000000-0000-4000-8000-000000000099"]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Event not found.");
    expect(screen.queryByRole("heading", { name: event.name })).not.toBeInTheDocument();
    expect(screen.queryByText(event.description)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });

  // Supplementary security path: the attendee UI treats a restricted existing
  // event as unavailable, without exposing the event's planning details.
  it("does not expose a restricted event when the attendee API request is denied", async () => {
    const restrictedEvent = {
      ...event,
      name: "Private planning event",
      description: "Restricted planning information",
      status: "submitted" as const,
    };
    apiMock.mockRejectedValue(new Error("Event not found."));
    useAppStore.setState({ events: [] });

    render(
      <MemoryRouter initialEntries={[`/events/${restrictedEvent.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Event not found.");
    expect(screen.queryByRole("heading", { name: restrictedEvent.name })).not.toBeInTheDocument();
    expect(screen.queryByText(restrictedEvent.description)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });

  // Supplementary negative path: a transient request failure must take
  // precedence over any stale copy of the event left in the client store.
  it("shows a request error instead of stale event details when loading fails", async () => {
    apiMock.mockRejectedValue(new Error("Could not reach the event service."));
    useAppStore.setState({ events: [event] });

    renderEventDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the event service.");
    expect(screen.queryByRole("heading", { name: event.name })).not.toBeInTheDocument();
    expect(screen.queryByText(event.description)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });

  // SPM-99 EVENT-VIEW-01-A: the attendee detail view presents every agreed
  // core field from the seeded event fixture.
  it("shows an attendee every core event-information field", async () => {
    const attendeeEvent = {
      ...event,
      id: "00000000-0000-4000-8000-000000000104",
      name: "Inclusive Arts Workshop",
      description: "A hands-on workshop where participants create collaborative art with guided support.",
      startDateTime: "2027-03-13T05:00:00.000Z",
      endDateTime: "2027-03-13T08:00:00.000Z",
      expectedAttendance: 45,
    };
    apiMock.mockResolvedValue(attendeeEvent);
    useAppStore.setState({ events: [attendeeEvent] });

    renderEventDetail(attendeeEvent.id);

    expect(await screen.findByRole("heading", { name: attendeeEvent.name })).toBeInTheDocument();
    expect(screen.getByText(attendeeEvent.description)).toBeInTheDocument();
    expect(within(screen.getByText("Date & time").parentElement!).getByText(
      formatDateTimeRange(attendeeEvent.startDateTime, attendeeEvent.endDateTime),
    )).toBeInTheDocument();
    expect(within(screen.getByText("Expected attendance").parentElement!).getByText("45")).toBeInTheDocument();
    expect(screen.getByText("Event status")).toBeInTheDocument();
    expect(screen.getByText("Upcoming", { selector: "dd" })).toBeInTheDocument();
  });

  // Supplementary refresh path: reloading the unchanged event must preserve the
  // server-provided detail and registration presentation.
  it("keeps attendee event information consistent after a refresh", async () => {
    const stableEvent = {
      ...event,
      registrationOpensAt: "2020-10-01T09:00:00.000Z",
      registrationClosesAt: "2099-10-14T23:59:00.000Z",
      availableRegistrationSpots: 17,
    };
    apiMock.mockClear();
    apiMock.mockResolvedValue(stableEvent);
    useAppStore.setState({ events: [stableEvent] });

    const firstView = renderEventDetail();
    await screen.findByRole("heading", { name: stableEvent.name });
    expect(screen.getByText("17", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Registration Open");
    firstView.unmount();

    renderEventDetail();
    await screen.findByRole("heading", { name: stableEvent.name });
    expect(screen.getByText("17", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Registration Open");
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("registers and withdraws only the signed-in attendee's registration", async () => {
    const user = userEvent.setup();
    renderEventDetail();

    await user.click(await screen.findByRole("button", { name: "Register" }));
    expect(useAppStore.getState().registrations).toMatchObject([
      { eventId: event.id, attendeeId: attendee.id, status: "registered" },
    ]);
    expect(screen.getByRole("button", { name: "Withdraw Registration" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Withdraw Registration" }));
    expect(useAppStore.getState().registrations[0]).toMatchObject({
      attendeeId: attendee.id,
      status: "withdrawn",
    });
  });

  it("does not offer registration controls to a different role", async () => {
    useAppStore.setState({ currentUser: { ...attendee, id: "organiser-1", role: "organiser" } });
    renderEventDetail();

    await screen.findByRole("heading", { name: event.name });
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(screen.queryByText("Registration")).not.toBeInTheDocument();
  });

  it("does not let an attendee withdraw another attendee's registration", () => {
    useAppStore.setState({
      registrations: [
        {
          id: "registration-other-user",
          eventId: event.id,
          attendeeId: "attendee-2",
          attendeeName: "Another attendee",
          status: "registered",
          registeredAt: "2026-09-15T00:00:00.000Z",
        },
      ],
    });

    useAppStore.getState().withdrawRegistration(event.id);

    expect(useAppStore.getState().registrations[0].status).toBe("registered");
  });

  it("prompts attendee to sign up through website first when registration is enabled and not yet registered", async () => {
    renderEventDetail();

    await screen.findByRole("heading", { name: event.name });
    expect(
      screen.getAllByText("Please sign up through the website first to attend this event.").length,
    ).toBeGreaterThan(0);
  });

  it("informs attendee that registration through website is not enabled when registrationEnabled is false", async () => {
    const disabledEvent = { ...event, registrationEnabled: false };
    apiMock.mockResolvedValue(disabledEvent);
    useAppStore.setState({ events: [disabledEvent] });

    renderEventDetail();

    await screen.findByRole("heading", { name: disabledEvent.name });
    expect(
      screen.getByText("Registration through the website is not enabled for this event."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Please sign up through the website first to attend this event."),
    ).not.toBeInTheDocument();
  });

  // Supplementary robustness path: incomplete optional event details should
  // use deliberate fallbacks rather than leaving the attendee page blank.
  it("renders safe fallbacks when optional description and venue data are absent", async () => {
    const incompleteEvent = { ...event, description: "", venueName: undefined };
    apiMock.mockResolvedValue(incompleteEvent);
    useAppStore.setState({ events: [incompleteEvent] });

    renderEventDetail();

    expect(await screen.findByRole("heading", { name: incompleteEvent.name })).toBeInTheDocument();
    expect(screen.getByText("No description provided.")).toBeInTheDocument();
    expect(screen.getByText("Not yet booked")).toBeInTheDocument();
  });

  // Supplementary negative path: attendee registration information is hidden
  // until the organiser has configured both boundaries of its period.
  it("hides registration information when its window timestamps are absent", async () => {
    const unconfiguredWindowEvent = {
      ...event,
      registrationOpensAt: undefined,
      registrationClosesAt: undefined,
      availableRegistrationSpots: 3,
    };
    apiMock.mockResolvedValue(unconfiguredWindowEvent);
    useAppStore.setState({ events: [unconfiguredWindowEvent] });

    renderEventDetail();

    await screen.findByRole("heading", { name: unconfiguredWindowEvent.name });
    expect(screen.queryByRole("heading", { name: "Registration" })).not.toBeInTheDocument();
    expect(screen.queryByText("Registration opens")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });

  // SPM-99 EVENT-VIEW-03-A: both configured registration boundaries are
  // shown using the timestamps supplied by the event API.
  it("shows the configured registration opening and closing timestamps", async () => {
    const scheduledEvent = {
      ...event,
      registrationOpensAt: "2027-03-01T01:00:00.000Z",
      registrationClosesAt: "2027-03-12T15:59:00.000Z",
    };
    apiMock.mockResolvedValue(scheduledEvent);
    useAppStore.setState({ events: [scheduledEvent] });

    renderEventDetail();

    await screen.findByRole("heading", { name: scheduledEvent.name });
    expect(within(screen.getByText("Registration opens").parentElement!).getByText(
      formatDateTime(scheduledEvent.registrationOpensAt),
    )).toBeInTheDocument();
    expect(within(screen.getByText("Registration closes").parentElement!).getByText(
      formatDateTime(scheduledEvent.registrationClosesAt),
    )).toBeInTheDocument();
  });

  // SPM-99 EVENT-VIEW-04-A: the attendee sees Registration Closed after the
  // configured closing time, while remaining spots still come from the API.
  it("shows registration metadata, remaining spots, and a closed notice after the window", async () => {
    const closedEvent = {
      ...event,
      registrationOpensAt: "2020-10-01T09:00:00.000Z",
      registrationClosesAt: "2020-10-14T23:59:00.000Z",
      availableRegistrationSpots: 17,
      venueRequirements: { ...event.venueRequirements, minCapacity: 120 },
    };
    apiMock.mockResolvedValue(closedEvent);
    useAppStore.setState({ events: [closedEvent] });

    renderEventDetail();

    expect(await screen.findByRole("heading", { name: closedEvent.name })).toBeInTheDocument();
    expect(screen.getByText("Registration opens")).toBeInTheDocument();
    expect(screen.getByText("Registration closes")).toBeInTheDocument();
    expect(screen.getByText("Available registration spots")).toBeInTheDocument();
    expect(screen.getByText("17", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("Registration Closed", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
  });

  // SPM-99 EVENT-VIEW-05-A and supplementary lifecycle checks: a pre-opening or cancelled
  // event must never expose a misleading enabled registration control.
  it.each([
    [
      "not-yet-open",
      { registrationOpensAt: "2099-10-01T09:00:00.000Z", registrationClosesAt: "2099-10-14T23:59:00.000Z" },
      "Registration Not Yet Open",
    ],
    [
      "cancelled",
      { status: "cancelled" as const, registrationOpensAt: "2020-10-01T09:00:00.000Z", registrationClosesAt: "2099-10-14T23:59:00.000Z" },
      "Registration Closed",
    ],
    [
      "completed",
      { status: "completed" as const, registrationOpensAt: "2020-10-01T09:00:00.000Z", registrationClosesAt: "2099-10-14T23:59:00.000Z" },
      "Registration Closed",
    ],
  ])("shows the correct %s registration notice and disables registration", async (_scenario, overrides, notice) => {
    const unavailableEvent = { ...event, ...overrides };
    apiMock.mockResolvedValue(unavailableEvent);
    useAppStore.setState({ events: [unavailableEvent] });

    renderEventDetail();

    await screen.findByRole("heading", { name: unavailableEvent.name });
    expect(screen.getByRole("status")).toHaveTextContent(notice);
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
    if (unavailableEvent.status === "cancelled" || unavailableEvent.status === "completed") {
      expect(
        screen.getByText(unavailableEvent.status === "cancelled" ? "Cancelled" : "Completed", { selector: "dd" }),
      ).toBeInTheDocument();
    }
  });

  // Supplementary boundary path: zero is full, so no negative availability
  // or enabled registration control can leak into the attendee view.
  it("treats zero remaining registration spots as full", async () => {
    const fullEvent = {
      ...event,
      registrationOpensAt: "2020-10-01T09:00:00.000Z",
      registrationClosesAt: "2099-10-14T23:59:00.000Z",
      availableRegistrationSpots: 0,
    };
    apiMock.mockResolvedValue(fullEvent);
    useAppStore.setState({ events: [fullEvent] });

    renderEventDetail();

    await screen.findByRole("heading", { name: fullEvent.name });
    expect(screen.getByRole("status")).toHaveTextContent("Registration Full");
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
  });
});
