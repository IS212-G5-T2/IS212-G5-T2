import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord, Venue } from "@/types";
import { VenuesPage } from "./VenuesPage";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const venue: Venue = {
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
    expect(screen.getByText("Suitable")).toBeInTheDocument();
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

  /** SPM-51 filtering retains matching venues and applies capacity, facility, accessibility and location controls. */
  it("applies each editable catalogue filter and displays the creation status", async () => {
    const user = userEvent.setup();
    const alternate: Venue = {
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

    expect(await screen.findByRole("status")).toHaveTextContent("Venue created.");
    await screen.findByRole("heading", { name: "Orchid Hall" });

    await user.type(screen.getByLabelText("Minimum capacity"), "100");
    expect(screen.getByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Maple Room" })).toBeNull();
    await user.clear(screen.getByLabelText("Minimum capacity"));

    await user.selectOptions(screen.getByLabelText("Facility"), "Projector");
    expect(screen.getByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Maple Room" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Facility"), "");

    await user.selectOptions(screen.getByLabelText("Accessibility"), "Wheelchair access");
    expect(screen.getByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Maple Room" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Accessibility"), "");

    await user.type(screen.getByLabelText("Location contains"), "north");
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
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  /** A catalogue response resolving after unmount is ignored without updating state. */
  it("ignores a late catalogue success after the page unmounts", async () => {
    let resolve!: (records: Venue[]) => void;
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
