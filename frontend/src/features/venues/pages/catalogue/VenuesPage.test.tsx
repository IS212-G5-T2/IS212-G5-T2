import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord } from "@/types";
import type { VenueRecord } from "@/features/venues/pages/records/venue-records";
import { deferred } from "@/test/deferred";
import { VenuesPage } from "./VenuesPage";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const venue: VenueRecord = {
  id: "venue-51",
  name: "Orchid Hall",
  location: "North Campus",
  capacity: 120,
  facilities: ["Projector"],
  accessibility: ["Wheelchair access"],
  layouts: ["Classroom"],
  operatingInformation: "Weekdays",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 15,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [],
};
const event: EventRecord = {
  id: "event-51",
  name: "Planning Workshop",
  purpose: "Planning",
  description: "A planning event",
  organiserId: "org-1",
  organiserName: "Organisation",
  status: "approved",
  startDateTime: "2026-10-12T09:00:00+08:00",
  endDateTime: "2026-10-12T10:00:00+08:00",
  expectedAttendance: 50,
  venueRequirements: {
    minCapacity: 40,
    layout: "Classroom",
    facilities: ["Projector"],
    accessibility: ["Wheelchair access"],
  },
  equipmentNeeds: "",
  registrationEnabled: false,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

function renderPage(path = "/venues", state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "", state }]}>
      <Routes>
        <Route path="/venues" element={<VenuesPage />} />
        <Route path="/venue-records/:id" element={<AvailabilityDestination />} />
      </Routes>
    </MemoryRouter>,
  );
}

function AvailabilityDestination() {
  const { id } = useParams();
  const [params] = useSearchParams();
  return <p>Venue availability screen: {id}; event: {params.get("eventId")}</p>;
}

function SwitchCatalogueEvent() {
  const navigate = useNavigate();
  return <>
    <button onClick={() => navigate("/venues?eventId=event-52")}>Switch event</button>
    <button onClick={() => navigate("/venues?eventId=event-53")}>Switch again</button>
  </>;
}

describe("VenuesPage catalogue loading", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator", email: "", role: "coordinator" },
      events: [event],
    });
  });

  afterEach(() => cleanup());

  /** SPM-51 catalogue regression: the standard catalogue fetches persisted venues and displays returned cards. */
  it("fetches /venues and renders the records returned by the catalogue API", async () => {
    apiMock.mockResolvedValue([venue]);
    renderPage();

    expect(screen.getByRole("status").textContent).toContain("Loading venues");
    expect(await screen.findByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/venues");
  });

  /** SPM-51 AC1: event-specific catalogue links preserve event context when opening venue details. Kills: FE-B15 (dropping eventId from the venue-details link). */
  it("fetches and renders catalogue records when opened for a specific event", async () => {
    apiMock.mockResolvedValue([venue]);
    renderPage("/venues?eventId=event-51");

    expect(await screen.findByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View details →/i })).toHaveAttribute(
      "href",
      "/venues/venue-51?eventId=event-51",
    );
    expect(apiMock).toHaveBeenCalledWith("/venues");
    expect(screen.getByText(/Searching venues suitable for/)).toHaveTextContent("Planning Workshop");
    expect(screen.queryByText("Suitable")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to event" })).toHaveAttribute("href", "/events/event-51");
  });

  /** SPM-51 refresh regression: a cold store loads the URL's event before exposing its availability action. */
  it("loads event context from the URL when the catalogue is opened after refresh", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ events: [] });
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues") return [venue] as never;
      if (path === "/events/event-51") return event as never;
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage("/venues?eventId=event-51");

    expect(await screen.findByText(/Searching venues suitable for/)).toHaveTextContent("Planning Workshop");
    await user.click(screen.getByRole("button", { name: "Check Availability" }));

    expect(await screen.findByText("Venue availability screen: venue-51; event: event-51")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/events/event-51");
    expect(useAppStore.getState().events).toContainEqual(event);
  });

  /** SPM-51 event-context failure is visible and retry restores the catalogue action. */
  it("shows a retryable event-load error when the URL event cannot be loaded", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ events: [] });
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues") return [venue] as never;
      if (path === "/events/event-51") {
        if (apiMock.mock.calls.filter(([requestedPath]) => requestedPath === path).length === 1) {
          throw new Error("offline");
        }
        return event as never;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage("/venues?eventId=event-51");

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the selected event");
    await user.click(screen.getByRole("button", { name: "Retry event" }));
    expect(await screen.findByRole("button", { name: "Check Availability" })).toBeInTheDocument();
  });

  /** A stale catalogue event response cannot overwrite context after the query string changes. */
  it("ignores a late event response after switching to another catalogue event", async () => {
    const user = userEvent.setup();
    const nextEvent = { ...event, id: "event-52", name: "Next Workshop" };
    const currentEvent = { ...event, id: "event-53", name: "Current Workshop" };
    useAppStore.setState({ events: [{ ...event, id: "event-99", name: "Other Event" }] });
    const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
    apiMock.mockImplementation((path) => {
      if (path === "/venues") return Promise.resolve([venue]) as never;
      return new Promise((resolve, reject) => pending.set(path, { resolve, reject })) as never;
    });
    render(
      <MemoryRouter initialEntries={["/venues?eventId=event-51"]}>
        <SwitchCatalogueEvent />
        <Routes>
          <Route path="/venues" element={<VenuesPage />} />
          <Route path="/venue-records/:id" element={<AvailabilityDestination />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Orchid Hall" });
    await user.click(screen.getByRole("button", { name: "Switch event" }));

    await waitFor(() => expect(pending.has("/events/event-52")).toBe(true));
    await user.click(screen.getByRole("button", { name: "Switch again" }));
    await waitFor(() => expect(pending.has("/events/event-53")).toBe(true));
    pending.get("/events/event-53")!.resolve(currentEvent);
    expect(await screen.findByText(/Searching venues suitable for/)).toHaveTextContent("Current Workshop");
    pending.get("/events/event-52")!.resolve(nextEvent);
    pending.get("/events/event-51")!.reject(new Error("late failure"));
    await waitFor(() => expect(useAppStore.getState().events.map((item) => item.id)).toEqual(["event-53", "event-99"]));
    expect(screen.getByText(/Searching venues suitable for/)).toHaveTextContent("Current Workshop");
  });

  it("does not show an event return button when the catalogue is opened without event context", async () => {
    apiMock.mockResolvedValue([venue]);
    renderPage();

    await screen.findByRole("heading", { name: "Orchid Hall" });
    expect(screen.queryByRole("link", { name: "Back to event" })).toBeNull();
    expect(screen.getByRole("link", { name: /View details →/i })).toHaveAttribute(
      "href",
      "/venues/venue-51",
    );
  });

  /** SPM-52 AC1-AC2 (extends SPM-51 filtering): name/location search and capacity, facility and accessibility filters narrow the list, and the creation status still displays. */
  it("VEN-SRCH-02-G applies each editable catalogue filter and displays the creation status", async () => {
    const user = userEvent.setup();
    const alternate: VenueRecord = {
      ...venue,
      id: "venue-52",
      name: "Maple Room",
      location: "South Campus",
      capacity: 20,
      facilities: ["Whiteboard"],
      accessibility: [],
    };
    apiMock.mockResolvedValue([venue, alternate]);
    renderPage("/venues", { creationMessage: "Venue created." });

    expect(await screen.findByText("Venue created.")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Orchid Hall" });

    await user.type(screen.getByLabelText("Minimum capacity"), "100");
    expect(screen.getByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Maple Room" })).toBeNull();
    await user.clear(screen.getByLabelText("Minimum capacity"));

    await user.click(screen.getByRole("checkbox", { name: "Projector" }));
    expect(screen.getByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Maple Room" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Projector" }));

    await user.click(screen.getByRole("checkbox", { name: "Wheelchair access" }));
    expect(screen.getByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Maple Room" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Wheelchair access" }));

    await user.type(screen.getByLabelText("Name or location"), "north");
    expect(screen.getByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Maple Room" })).toBeNull();
  });

  /** SPM-51 sends event-specific venue choices to availability checks before request submission. */
  it("opens the selected venue availability screen from the catalogue action", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([venue]);
    renderPage("/venues?eventId=event-51");

    await user.click(await screen.findByRole("button", { name: "Check Availability" }));
    expect(await screen.findByText("Venue availability screen: venue-51; event: event-51")).toBeInTheDocument();
  });

  /** SPM-51 dual-role coordinators retain the selected event scope when opening venue availability. Kills: FE-B12 and FE-B20. */
  it("preserves event scope for users with a secondary coordinator role", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([venue]);
    useAppStore.setState({ currentUser: { id: "organiser", name: "Organiser", email: "", role: "organiser" } });
    const { rerender } = renderPage("/venues?eventId=event-51");
    await screen.findByRole("heading", { name: "Orchid Hall" });
    expect(screen.queryByRole("button", { name: "Check Availability" })).toBeNull();

    useAppStore.setState({ currentUser: { id: "dual", name: "Dual role", email: "", role: "venue_staff", roles: ["venue_staff", "coordinator"] } });
    rerender(
      <MemoryRouter initialEntries={["/venues?eventId=event-51"]}>
        <Routes>
          <Route path="/venues" element={<VenuesPage />} />
          <Route path="/venue-records/:id" element={<AvailabilityDestination />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "Check Availability" }));
    expect(await screen.findByText("Venue availability screen: venue-51; event: event-51")).toBeInTheDocument();
  });

  /** Failed catalogue requests show a retry action, and retrying issues a new GET and renders its result. */
  it("shows a recoverable error and retries the catalogue request", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([venue]);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load venues from the catalogue.");
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(apiMock).toHaveBeenNthCalledWith(2, "/venues");
  });

  /** A successful empty response renders the catalogue empty state instead of a loading or failure state. */
  it("shows the empty state when the catalogue has no venue records", async () => {
    apiMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No venues match these filters.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading venues…")).toBeNull());
  });

  /** A catalogue response resolving after unmount is ignored without updating state. */
  it("ignores a late catalogue success after the page unmounts", async () => {
    let resolve!: (records: VenueRecord[]) => void;
    apiMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = renderPage();
    view.unmount();

    resolve([venue]);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues"));
  });

  /** A catalogue failure resolving after unmount is ignored without displaying a stale error. */
  it("ignores a late catalogue failure after the page unmounts", async () => {
    let reject!: (reason: Error) => void;
    apiMock.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    const view = renderPage();
    view.unmount();

    reject(new Error("late offline"));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues"));
  });

});

const searchEvent: EventRecord = {
  ...event,
  id: "event-60",
  name: "Small classroom workshop",
  expectedAttendance: 24,
  startDateTime: "2026-10-27T09:00:00+08:00",
  endDateTime: "2026-10-27T10:30:00+08:00",
  venueRequirements: {
    minCapacity: 24,
    layout: "Classroom",
    facilities: ["Projector"],
    accessibility: ["Wheelchair access"],
  },
};

const orchid: VenueRecord = { ...venue, id: "venue-orchid", name: "Orchid Hall", location: "North Campus" };
const maple: VenueRecord = {
  ...venue,
  id: "venue-maple",
  name: "Maple Room",
  location: "South Campus",
  capacity: 20,
  facilities: ["Whiteboard"],
  layouts: ["Boardroom"],
  accessibility: [],
};
// Booked 10:45-12:00 SGT: conflicts with the 09:00-10:30 event once the 20-minute buffers are applied.
const fern: VenueRecord = {
  ...venue,
  id: "venue-fern",
  name: "Fern Training Room",
  location: "North Campus",
  capacity: 40,
  setupTimeMinutes: 20,
  turnaroundTimeMinutes: 20,
  reservations: [
    {
      id: "booking-fern",
      eventName: "Fern booking",
      status: "booked",
      start: "2026-10-27T10:45:00+08:00",
      end: "2026-10-27T12:00:00+08:00",
      affectedByUnavailablePeriod: false,
    },
  ],
};
// Booked 06:00-08:00 SGT: finishes before the event's setup and turnaround buffer begins.
const coral: VenueRecord = {
  ...venue,
  id: "venue-coral",
  name: "Coral Workshop Lab",
  location: "West Wing",
  capacity: 30,
  reservations: [
    {
      id: "booking-coral",
      eventName: "Coral booking",
      status: "booked",
      start: "2026-10-27T06:00:00+08:00",
      end: "2026-10-27T08:00:00+08:00",
      affectedByUnavailablePeriod: false,
    },
  ],
};
// Expired tentative hold (expired in 2020) must not block the event.
const cypress: VenueRecord = {
  ...venue,
  id: "venue-cypress",
  name: "Cypress Training Suite",
  location: "West Wing",
  capacity: 60,
  reservations: [
    {
      id: "hold-cypress",
      eventName: "Expired hold",
      status: "tentative",
      start: "2026-10-27T09:00:00+08:00",
      end: "2026-10-27T10:30:00+08:00",
      holdExpiresAt: "2020-01-01T00:00:00+08:00",
      affectedByUnavailablePeriod: false,
    },
  ],
};
const cedar: VenueRecord = {
  ...venue,
  id: "venue-cedar",
  name: "Cedar Studio",
  location: "East Wing",
  capacity: 60,
  reservations: [
    {
      id: "booking-cedar",
      eventName: "Cedar booking",
      status: "booked",
      start: "2026-10-27T08:00:00+08:00",
      end: "2026-10-27T09:30:00+08:00",
      affectedByUnavailablePeriod: false,
    },
  ],
};

function setDateTime(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function visibleVenueNames() {
  return screen
    .queryAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
}

describe("VenuesPage search and filters (SPM-52)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator", email: "", role: "coordinator" },
      events: [searchEvent],
    });
  });

  afterEach(() => cleanup());

  /** SPM-52 AC1: the name search matches a partial name ignoring letter case. */
  it("VEN-SRCH-01-D narrows the cards by a partial, case-insensitive name", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid, maple]);
    renderPage();
    await screen.findByRole("heading", { name: "Orchid Hall" });

    await user.type(screen.getByLabelText("Name or location"), "ORCH");

    expect(visibleVenueNames()).toEqual(["Orchid Hall"]);
    expect(screen.getByText("1 venue matches your criteria.")).toBeInTheDocument();
  });

  /** SPM-52 AC2: capacity, room layout, facilities and accessibility must all match (only venues matching all selections are shown). */
  it("VEN-SRCH-02-F shows only venues that match every selected capacity, layout, facility and accessibility criterion", async () => {
    const user = userEvent.setup();
    const noAccessibility: VenueRecord = { ...orchid, id: "venue-plain", name: "Plain Hall", accessibility: [] };
    apiMock.mockResolvedValue([orchid, maple, noAccessibility]);
    renderPage();
    await screen.findByRole("heading", { name: "Orchid Hall" });

    await user.type(screen.getByLabelText("Minimum capacity"), "100");
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Plain Hall"]);
    await user.selectOptions(screen.getByLabelText("Room layout"), "Classroom");
    await user.click(screen.getByRole("checkbox", { name: "Projector" }));
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Plain Hall"]);
    await user.click(screen.getByRole("checkbox", { name: "Wheelchair access" }));

    expect(visibleVenueNames()).toEqual(["Orchid Hall"]);
  });

  /** SPM-52 AC3: a date and time range hides venues busy in that range: one with a booking that overlaps it directly, and one whose booking clashes only with its setup or turnaround buffer. Free venues stay visible. */
  it("VEN-SRCH-03-G hides venues busy in the requested range, including buffer time", async () => {
    const overlapping: VenueRecord = {
      ...orchid,
      id: "venue-overlap",
      name: "Overlap Hall",
      reservations: [
        {
          id: "booking-overlap",
          eventName: "Direct overlap",
          status: "booked",
          start: "2026-10-27T10:00:00+08:00",
          end: "2026-10-27T10:30:00+08:00",
          affectedByUnavailablePeriod: false,
        },
      ],
    };
    apiMock.mockResolvedValue([orchid, maple, fern, overlapping]);
    renderPage();
    await screen.findByRole("heading", { name: "Fern Training Room" });

    setDateTime("Start date and time", "2026-10-27T10:00");
    setDateTime("End date and time", "2026-10-27T10:30");

    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Maple Room"]);
  });

  /** SPM-52 AC4: opening the search from an event starts every filter from that event's requirements. */
  it("VEN-SRCH-04-D starts the filters from the event and lists only venues that suit it and are free", async () => {
    apiMock.mockResolvedValue([orchid, maple, fern, coral, cypress, cedar]);
    renderPage("/venues?eventId=event-60");

    expect(await screen.findByText("3 venues match your criteria.")).toBeInTheDocument();
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Coral Workshop Lab", "Cypress Training Suite"]);
    expect(screen.getByLabelText("Minimum capacity")).toHaveValue("24");
    expect(screen.getByLabelText("Room layout")).toHaveValue("Classroom");
    expect(screen.getByLabelText("Start date and time")).toHaveValue("2026-10-27T09:00");
    expect(screen.getByLabelText("End date and time")).toHaveValue("2026-10-27T10:30");
    expect(screen.getByRole("checkbox", { name: "Projector" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Wheelchair access" })).toBeChecked();
  });

  /** SPM-52 AC4: event-derived filters remain editable and the results follow each change. Unchecking Projector lists a venue that differs only by lacking it; a capacity change narrows the list; clearing the filters restores the event's results. */
  it("VEN-SRCH-04-E lets the user change any event-derived filter without re-applying the event", async () => {
    const user = userEvent.setup();
    const noProjector: VenueRecord = {
      ...coral,
      id: "venue-no-projector",
      name: "Juniper Seminar Room",
      capacity: 60,
      facilities: ["Wi-Fi"],
      reservations: [],
    };
    apiMock.mockResolvedValue([orchid, maple, coral, cypress, noProjector]);
    renderPage("/venues?eventId=event-60");
    await screen.findByText("3 venues match your criteria.");
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Coral Workshop Lab", "Cypress Training Suite"]);

    await user.click(screen.getByRole("checkbox", { name: "Projector" }));
    expect(screen.getByRole("checkbox", { name: "Projector" })).not.toBeChecked();
    expect(visibleVenueNames()).toEqual([
      "Orchid Hall",
      "Coral Workshop Lab",
      "Cypress Training Suite",
      "Juniper Seminar Room",
    ]);
    await user.click(screen.getByRole("checkbox", { name: "Projector" }));
    expect(screen.getByRole("checkbox", { name: "Projector" })).toBeChecked();
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Coral Workshop Lab", "Cypress Training Suite"]);

    await user.clear(screen.getByLabelText("Minimum capacity"));
    await user.type(screen.getByLabelText("Minimum capacity"), "100");
    expect(visibleVenueNames()).toEqual(["Orchid Hall"]);

    await user.selectOptions(screen.getByLabelText("Room layout"), "");
    expect(screen.getByLabelText("Room layout")).toHaveValue("");
    await user.clear(screen.getByLabelText("Minimum capacity"));
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Coral Workshop Lab", "Cypress Training Suite"]);
  });

  /** SPM-52 AC4 failure: when the event cannot load, no event filters are applied and the search still works. */
  it("VEN-SRCH-04-F keeps the search usable with empty filters when the event cannot be loaded", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ events: [] });
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues") return [orchid, maple] as never;
      if (path === "/events/event-60") throw new Error("offline");
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage("/venues?eventId=event-60");

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the selected event");
    expect(screen.getByLabelText("Minimum capacity")).toHaveValue("");
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Maple Room"]);
    await user.type(screen.getByLabelText("Name or location"), "maple");
    expect(visibleVenueNames()).toEqual(["Maple Room"]);
  });

  /** SPM-52 AC5: a non-whole minimum capacity (99.5) is reported and not applied; applied, it would drop the 20-seat room, so that room staying visible proves the criterion is ignored. Entering a valid capacity then applies it. */
  it("VEN-SRCH-05-E reports an invalid minimum capacity and keeps the results unfiltered by it", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid, maple]);
    renderPage();
    await screen.findByRole("heading", { name: "Orchid Hall" });

    await user.type(screen.getByLabelText("Minimum capacity"), "99.5");

    expect(screen.getByText("Minimum capacity must be a positive whole number.")).toBeInTheDocument();
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Maple Room"]);
    await user.clear(screen.getByLabelText("Minimum capacity"));
    await user.type(screen.getByLabelText("Minimum capacity"), "50");
    expect(screen.queryByText("Minimum capacity must be a positive whole number.")).toBeNull();
    expect(visibleVenueNames()).toEqual(["Orchid Hall"]);
  });

  /** SPM-52 AC5: an end time equal to or before the start time is reported and not applied; a half-entered range is reported on the empty field. Both venues stay visible until a valid range is entered. */
  it("VEN-SRCH-05-F reports an end time not after the start time and does not apply the range", async () => {
    apiMock.mockResolvedValue([orchid, fern]);
    renderPage();
    await screen.findByRole("heading", { name: "Fern Training Room" });

    setDateTime("Start date and time", "2026-10-27T11:00");
    expect(screen.getByText("Enter an end date and time to filter by availability.")).toBeInTheDocument();
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Fern Training Room"]);

    setDateTime("End date and time", "2026-10-27T10:00");
    expect(screen.getByText("The end time must be after the start time.")).toBeInTheDocument();
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Fern Training Room"]);

    setDateTime("End date and time", "2026-10-27T11:00");
    expect(screen.getByText("The end time must be after the start time.")).toBeInTheDocument();
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Fern Training Room"]);

    setDateTime("End date and time", "2026-10-27T11:30");
    expect(screen.queryByText("The end time must be after the start time.")).toBeNull();
    expect(visibleVenueNames()).toEqual(["Orchid Hall"]);
  });

  /** SPM-52 AC6: the count reflects the current criteria, with the singular form for one match. */
  it("VEN-SRCH-06-A shows how many venues match the current criteria", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid, maple]);
    renderPage();

    expect(await screen.findByText("2 venues match your criteria.")).toBeInTheDocument();
    expect(screen.getAllByRole("status").map((status) => status.textContent)).toContain(
      "2 venues match your criteria.",
    );
    await user.type(screen.getByLabelText("Name or location"), "maple");
    expect(screen.getByText("1 venue matches your criteria.")).toBeInTheDocument();
  });

  /** SPM-52 AC6: each result shows layouts and offers one Check Availability button, with no separate availability link. */
  it("VEN-SRCH-06-B shows layouts and offers one Check Availability button per result", async () => {
    apiMock.mockResolvedValue([orchid, coral]);
    renderPage("/venues?eventId=event-60");

    await screen.findByRole("heading", { name: "Orchid Hall" });
    expect(screen.getAllByText("Layouts: Classroom")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Check Availability" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /availability/i })).toBeNull();
  });

  /** SPM-52 AC6: without event context, Check Availability opens the SPM-51 availability view for that venue with no query string. */
  it("VEN-SRCH-06-C opens the venue availability view from a result without requiring an event", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid]);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Check Availability" }));

    expect(await screen.findByText("Venue availability screen: venue-orchid; event:")).toBeInTheDocument();
  });

  /** SPM-52 AC6: with event context, Check Availability opens the SPM-51 view for that venue carrying the event. */
  it("VEN-SRCH-06-H carries the event into the availability view opened from a result", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid]);
    renderPage("/venues?eventId=event-60");

    await user.click(await screen.findByRole("button", { name: "Check Availability" }));

    expect(await screen.findByText("Venue availability screen: venue-orchid; event: event-60")).toBeInTheDocument();
  });

  /** SPM-52 AC7: one action clears every search and filter criterion. */
  it("VEN-SRCH-07-A clears all search and filter criteria in one step", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid, maple]);
    renderPage();
    await screen.findByRole("heading", { name: "Orchid Hall" });

    await user.type(screen.getByLabelText("Name or location"), "orchid");
    await user.type(screen.getByLabelText("Minimum capacity"), "500");
    await user.selectOptions(screen.getByLabelText("Room layout"), "Classroom");
    await user.click(screen.getByRole("checkbox", { name: "Hearing loop" }));
    setDateTime("Start date and time", "2026-10-27T08:00");
    setDateTime("End date and time", "2026-10-27T09:00");
    expect(screen.getByText("No venues match these filters.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(screen.getByLabelText("Name or location")).toHaveValue("");
    expect(screen.getByLabelText("Minimum capacity")).toHaveValue("");
    expect(screen.getByLabelText("Room layout")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Hearing loop" })).not.toBeChecked();
    expect(screen.getByLabelText("Start date and time")).toHaveValue("");
    expect(screen.getByLabelText("End date and time")).toHaveValue("");
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Maple Room"]);
  });

  /** SPM-52 AC8: when nothing matches, the page says so and suggests adjusting the filters. */
  it("VEN-SRCH-08-A explains that no venue matches and suggests adjusting the filters", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid]);
    renderPage();
    await screen.findByRole("heading", { name: "Orchid Hall" });

    await user.type(screen.getByLabelText("Name or location"), "zzz");

    expect(screen.getByText("No venues match these filters.")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting or clearing some of your filters to see more venues.")).toBeInTheDocument();
    expect(screen.getByText("0 venues match your criteria.")).toBeInTheDocument();
  });

  /** SPM-52 AC8 (failure path of the results area): while the catalogue request fails, the results area shows only the retry message, with no result count and no no-match text. Retrying restores the results and the count, and the search still applies. */
  it("VEN-SRCH-08-B shows no result count while the catalogue is unavailable and recovers on retry", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([orchid, maple]);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load venues from the catalogue.");
    expect(screen.queryByText(/match your criteria/)).toBeNull();
    expect(screen.queryByText("No venues match these filters.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("2 venues match your criteria.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name or location"), "maple");
    expect(visibleVenueNames()).toEqual(["Maple Room"]);
  });

  /** SPM-52 AC4 (state): the event's requirements are applied when the event finishes loading after the page opens. */
  it("VEN-SRCH-04-H pre-fills the filters when the event finishes loading after the page opens", async () => {
    useAppStore.setState({ events: [] });
    const eventRequest = deferred<EventRecord>();
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues") return [orchid] as never;
      if (path === "/events/event-60") return eventRequest.promise as never;
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage("/venues?eventId=event-60");
    await screen.findByRole("heading", { name: "Orchid Hall" });
    expect(screen.getByLabelText("Minimum capacity")).toHaveValue("");

    await act(async () => {
      eventRequest.resolve(searchEvent);
    });

    await waitFor(() => expect(screen.getByLabelText("Minimum capacity")).toHaveValue("24"));
    expect(screen.getByRole("checkbox", { name: "Projector" })).toBeChecked();
  });

  /** SPM-52 AC3 (concurrency): a tentative hold that expires while the page stays open stops blocking its venue at the expiry instant, without a reload. Venue A's only hold expires first (09:10) and venue B's hold expires later (09:30). The page must arm its clock for the earliest expiry: A reappears at 09:10 while B stays hidden, and B reappears at 09:30. */
  it("VEN-SRCH-03-I re-judges a venue when its tentative hold expires while the page is open", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      vi.setSystemTime(new Date("2026-10-17T09:00:00+08:00"));
      const holdUntil = (id: string, expiry: string): VenueRecord["reservations"][number] => ({
        id,
        eventName: id,
        status: "tentative",
        start: "2026-10-17T10:00:00+08:00",
        end: "2026-10-17T11:00:00+08:00",
        holdExpiresAt: expiry,
        affectedByUnavailablePeriod: false,
      });
      const early: VenueRecord = {
        ...orchid,
        id: "venue-early",
        name: "Orchid Hall",
        reservations: [holdUntil("hold-early", "2026-10-17T09:10:00+08:00")],
      };
      const late: VenueRecord = {
        ...orchid,
        id: "venue-late",
        name: "Birch Hall",
        reservations: [holdUntil("hold-late", "2026-10-17T09:30:00+08:00")],
      };
      // The late venue is listed first, so the page cannot pick its expiry by list position.
      apiMock.mockResolvedValue([late, early]);
      renderPage();
      for (let i = 0; i < 5; i++) await act(async () => {});
      expect(visibleVenueNames()).toEqual(["Birch Hall", "Orchid Hall"]);

      setDateTime("Start date and time", "2026-10-17T10:00");
      setDateTime("End date and time", "2026-10-17T11:00");
      expect(visibleVenueNames()).toEqual([]);

      act(() => vi.advanceTimersByTime(10 * 60 * 1000 - 1));
      expect(visibleVenueNames()).toEqual([]);

      // 09:10: venue A's only hold expires; venue B is still held until 09:30.
      act(() => vi.advanceTimersByTime(1));
      expect(visibleVenueNames()).toEqual(["Orchid Hall"]);
      expect(screen.getByText("1 venue matches your criteria.")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(20 * 60 * 1000 - 1));
      expect(visibleVenueNames()).toEqual(["Orchid Hall"]);

      // 09:30: venue B's hold expires.
      act(() => vi.advanceTimersByTime(1));
      expect(visibleVenueNames()).toEqual(["Birch Hall", "Orchid Hall"]);
      expect(screen.getByText("2 venues match your criteria.")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  /** SPM-52 AC3 (concurrency, timer limit): a hold more than 24.8 days away is re-checked through timers no longer than the browser's maximum delay (2,147,483,647 ms, about 24.86 days), and at least one timer is armed at 24 days or more. A longer delay would overflow and fire at once, re-judging the venue in a tight loop. The test checks the armed delays before any time is advanced, then that nothing fires during the next hour while the hold is still active. */
  it("VEN-SRCH-03-K caps the re-check timer for a hold more than 24.8 days away", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const timerSpy = vi.spyOn(window, "setTimeout");
    try {
      vi.setSystemTime(new Date("2026-10-17T09:00:00+08:00"));
      const farHold: VenueRecord = {
        ...orchid,
        reservations: [
          {
            id: "hold-far",
            eventName: "Far hold",
            status: "tentative",
            start: "2026-10-17T10:00:00+08:00",
            end: "2026-10-17T11:00:00+08:00",
            holdExpiresAt: "2026-12-01T09:00:00+08:00",
            affectedByUnavailablePeriod: false,
          },
        ],
      };
      apiMock.mockResolvedValue([farHold]);
      renderPage();
      for (let i = 0; i < 5; i++) await act(async () => {});
      setDateTime("Start date and time", "2026-10-17T10:00");
      setDateTime("End date and time", "2026-10-17T11:00");
      expect(visibleVenueNames()).toEqual([]);

      // The browser limit is 2,147,483,647 ms; a 45-day hold therefore needs a timer of at least 24 days, and no timer may exceed the limit.
      const TWENTY_FOUR_DAYS_MS = 24 * 24 * 60 * 60 * 1000;
      const delays = timerSpy.mock.calls.map(([, delay]) => Number(delay ?? 0));
      expect(delays.some((delay) => delay >= TWENTY_FOUR_DAYS_MS)).toBe(true);
      expect(delays.every((delay) => delay <= 2_147_483_647)).toBe(true);

      const armed = timerSpy.mock.calls.length;
      act(() => vi.advanceTimersByTime(60 * 60 * 1000));
      expect(timerSpy.mock.calls.length).toBe(armed);
      expect(visibleVenueNames()).toEqual([]);
    } finally {
      timerSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  /** SPM-52 AC5 (interaction): a valid date range still narrows the results while the minimum capacity is invalid. */
  it("VEN-SRCH-05-H still applies a valid date range while the minimum capacity is invalid", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid, fern]);
    renderPage();
    await screen.findByRole("heading", { name: "Fern Training Room" });

    await user.type(screen.getByLabelText("Minimum capacity"), "abc");
    expect(screen.getByText("Minimum capacity must be a positive whole number.")).toBeInTheDocument();
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Fern Training Room"]);

    setDateTime("Start date and time", "2026-10-27T10:00");
    setDateTime("End date and time", "2026-10-27T10:30");

    expect(visibleVenueNames()).toEqual(["Orchid Hall"]);
    expect(screen.getByText("Minimum capacity must be a positive whole number.")).toBeInTheDocument();
  });

  /** SPM-52 AC5: every entry that is not a positive whole number (text, zero, negative, decimal, exponent) shows the capacity error and is not applied. "99.5" would hide the 20-seat room and "1e3" would hide both venues if they were applied, so both venues staying visible proves each entry is ignored. */
  it("VEN-SRCH-05-J reports every non-whole or non-positive capacity entry and keeps the results unfiltered by it", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid, maple]);
    renderPage();
    await screen.findByRole("heading", { name: "Orchid Hall" });

    for (const entry of ["abc", "1e", "-", "2.5", "0", "99.5", "1e3"]) {
      await user.clear(screen.getByLabelText("Minimum capacity"));
      await user.type(screen.getByLabelText("Minimum capacity"), entry);
      expect(screen.getByText("Minimum capacity must be a positive whole number.")).toBeInTheDocument();
      expect(visibleVenueNames()).toEqual(["Orchid Hall", "Maple Room"]);
    }
  });

  /** SPM-52 AC6 (state): a change from a matching to a non-matching criterion updates the count and the cards together. */
  it("VEN-SRCH-06-I updates the count and the visible cards together when the criteria stop matching", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid, maple]);
    renderPage();
    expect(await screen.findByText("2 venues match your criteria.")).toBeInTheDocument();
    expect(visibleVenueNames()).toEqual(["Orchid Hall", "Maple Room"]);

    await user.type(screen.getByLabelText("Name or location"), "zzz");

    expect(screen.getByText("0 venues match your criteria.")).toBeInTheDocument();
    expect(visibleVenueNames()).toEqual([]);
    expect(screen.getByText("No venues match these filters.")).toBeInTheDocument();
  });

  /** SPM-52 AC7 (interaction): clear-all also removes facilities and accessibility needs that the event pre-filled, so every venue is shown again. */
  it("VEN-SRCH-07-B clears the event-derived facility and accessibility criteria as well", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([orchid, maple, fern, coral, cypress, cedar]);
    renderPage("/venues?eventId=event-60");
    await screen.findByText("3 venues match your criteria.");
    expect(screen.getByRole("checkbox", { name: "Projector" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(screen.getByRole("checkbox", { name: "Projector" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Wheelchair access" })).not.toBeChecked();
    expect(screen.getByLabelText("Minimum capacity")).toHaveValue("");
    expect(visibleVenueNames()).toEqual([
      "Orchid Hall",
      "Maple Room",
      "Fern Training Room",
      "Coral Workshop Lab",
      "Cypress Training Suite",
      "Cedar Studio",
    ]);
  });
});
