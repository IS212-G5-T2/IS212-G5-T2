import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { Venue } from "@/types";
import { ApiError, api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import { VenueDetailPage } from "./VenueDetailPage";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const venue: Venue = {
  id: "venue-1",
  name: "Orchid Hall",
  location: "Test Building, Level 3",
  capacity: 120,
  facilities: ["AV System"],
  accessibility: ["Wheelchair access"],
  layouts: ["Classroom"],
  operatingInformation: "Closed on public holidays",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};

function renderDetail(path = `/venues/${venue.id}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/venues/:id" element={<VenueDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDetailWithoutIdentifier() {
  return render(
    <MemoryRouter initialEntries={["/venues"]}>
      <Routes>
        <Route path="/venues" element={<VenueDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function ChangeVenueRoute() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/venues/venue-2")}>Open second venue</button>;
}

function renderSwitchableDetails() {
  return render(
    <MemoryRouter initialEntries={["/venues/venue-1"]}>
      <ChangeVenueRoute />
      <Routes>
        <Route path="/venues/:id" element={<VenueDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("VenueDetailPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    useAppStore.setState({ venues: [], bookings: [] });
  });

  afterEach(() => cleanup());

  /** SPM-51: the detail view loads the selected venue and its reservation data from the API. */
  it("loads the API-backed venue details and durations", async () => {
    apiMock.mockResolvedValue({ ...venue, availabilityStatus: "available", reservations: [], unavailablePeriods: [] });
    renderDetail();

    expect(screen.getByRole("status")).toHaveTextContent("Loading venue details");
    expect(await screen.findByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.getByText("Closed on public holidays")).toBeInTheDocument();
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
    expect(screen.getByText("45 minutes")).toBeInTheDocument();
    expect(screen.queryByText(/Operating hours/i)).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("No bookings recorded.")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/venues/venue-1");
  });

  /** An uploaded venue image returned by the API keeps its accessible name and source. */
  it("renders a saved venue image", async () => {
    apiMock.mockResolvedValue({
      ...venue,
      image: { name: "orchid.png", type: "image/png", size: 4, dataUrl: "data:image/png;base64,dGVzdA==" },
      availabilityStatus: "available",
      reservations: [],
      unavailablePeriods: [],
    });
    renderDetail();

    expect(await screen.findByRole("img", { name: "Orchid Hall venue" })).toHaveAttribute(
      "src",
      "data:image/png;base64,dGVzdA==",
    );
  });

  /** SPM-51 stale success regression: only the venue selected by the current route may be displayed. */
  it("keeps the route-selected venue when an earlier detail request resolves last", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    apiMock.mockImplementation((path) => (path === "/venues/venue-1" ? first.promise : second.promise) as never);
    const user = userEvent.setup();
    renderSwitchableDetails();
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/venue-1"));

    await user.click(screen.getByRole("button", { name: "Open second venue" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/venue-2"));
    second.resolve({ ...venue, id: "venue-2", name: "Maple Room", availabilityStatus: "available", reservations: [], unavailablePeriods: [] });
    expect(await screen.findByRole("heading", { name: "Maple Room" })).toBeInTheDocument();

    first.resolve({ ...venue, name: "Orchid Hall (stale)", availabilityStatus: "available", reservations: [], unavailablePeriods: [] });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Maple Room" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Orchid Hall (stale)" })).toBeNull();
  });

  /** SPM-51 stale error regression: a failed request for an old route cannot hide the current venue. */
  it("does not replace the new venue with an earlier request error", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    apiMock.mockImplementation((path) => (path === "/venues/venue-1" ? first.promise : second.promise) as never);
    const user = userEvent.setup();
    renderSwitchableDetails();
    await user.click(screen.getByRole("button", { name: "Open second venue" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/venue-2"));
    second.resolve({ ...venue, id: "venue-2", name: "Maple Room", availabilityStatus: "available", reservations: [], unavailablePeriods: [] });
    expect(await screen.findByRole("heading", { name: "Maple Room" })).toBeInTheDocument();

    first.reject(new Error("stale network failure"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Maple Room" })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  /** SPM-51 AC1: an event-specific venue detail link returns to its originating catalogue query. */
  it("returns to the event-specific catalogue when eventId is present", async () => {
    apiMock.mockResolvedValue({ ...venue, availabilityStatus: "available", reservations: [], unavailablePeriods: [] });
    renderDetail("/venues/venue-1?eventId=event-7");

    await screen.findByRole("heading", { name: "Orchid Hall" });
    expect(screen.getByRole("link", { name: "Back to Catalogue" })).toHaveAttribute(
      "href",
      "/venues?eventId=event-7",
    );
  });

  /** SPM-124 reservation view: detail records show API-backed confirmed bookings and active holds, not stale app-store values. */
  it("renders server-backed confirmed bookings and active holds instead of app-store bookings", async () => {
    useAppStore.setState({
      bookings: [{
        id: "stale-booking",
        eventId: "event-old",
        eventName: "Stale app-store booking",
        venueId: venue.id,
        venueName: venue.name,
        requestedBy: "staff-1",
        start: "2030-01-10T18:00:00.000Z",
        end: "2030-01-10T21:00:00.000Z",
        status: "approved",
        createdAt: "2030-01-01T00:00:00.000Z",
      }],
    });
    apiMock.mockResolvedValue({
      ...venue,
      availabilityStatus: "available",
      unavailablePeriods: [],
      reservations: [
        { id: "confirmed-1", eventName: "Server Confirmed Event", start: "2030-01-11T18:00:00.000Z", end: "2030-01-11T20:00:00.000Z", status: "booked", affectedByUnavailablePeriod: false },
        { id: "hold-1", eventName: "Server Held Event", start: "2030-01-12T18:00:00.000Z", end: "2030-01-12T20:00:00.000Z", status: "tentative", holdExpiresAt: "2030-01-12T17:30:00.000Z", affectedByUnavailablePeriod: false },
      ],
    });
    renderDetail();

    expect(await screen.findByText("Server Confirmed Event")).toBeInTheDocument();
    expect(screen.getByText("Server Held Event")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Tentative hold")).toBeInTheDocument();
    expect(screen.queryByText("Stale app-store booking")).toBeNull();
  });

  /** Unknown venue identifiers keep the specific not-found message returned by the venue API. */
  it("reports when the requested venue does not exist", async () => {
    apiMock.mockRejectedValueOnce(new ApiError("Not found", undefined, undefined, 404));
    renderDetail("/venues/missing");

    expect(await screen.findByRole("alert")).toHaveTextContent("Venue not found.");
    expect(apiMock).toHaveBeenCalledWith("/venues/missing");
  });

  /** A route without a venue identifier reports not found without making an invalid API request. */
  it("reports not found when the route has no venue identifier", async () => {
    renderDetailWithoutIdentifier();

    expect(await screen.findByRole("alert")).toHaveTextContent("Venue not found.");
    expect(apiMock).not.toHaveBeenCalled();
  });

  /** An empty successful detail response falls back to the not-found state instead of rendering a partial venue. */
  it("reports not found when the venue detail API returns no record", async () => {
    apiMock.mockResolvedValue(null as never);
    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("Venue not found.");
  });

  /** Older detail responses without reservations still render the empty booking state safely. */
  it("shows an empty booking state when the API omits reservations", async () => {
    apiMock.mockResolvedValue({
      ...venue,
      availabilityStatus: "available",
      unavailablePeriods: [],
    } as never);
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(screen.getByText("No bookings recorded.")).toBeInTheDocument();
  });

  /** A transient detail API failure exposes a retry action that reloads and displays the venue. */
  it("retries venue detail loading after a transient error", async () => {
    apiMock
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ ...venue, availabilityStatus: "available", reservations: [], unavailablePeriods: [] });
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load venue details.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Orchid Hall" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});
