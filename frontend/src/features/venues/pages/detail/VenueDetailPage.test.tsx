import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { Venue } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import { api, ApiError } from "@/utils/api";
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
  operatingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  operatingStartTime: "08:00",
  operatingEndTime: "22:00",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};

function renderDetail(id: string | null = venue.id) {
  return render(
    <MemoryRouter initialEntries={[id ? `/venues/${id}` : "/venues"]}>
      <Routes>
        <Route path="/venues" element={<VenueDetailPage />} />
        <Route path="/venues/:id" element={<VenueDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function VenueRouteSwitcher() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/venues/venue-2")}>Open second venue</button>;
}

describe("VenueDetailPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue(venue);
    useAppStore.setState({ venues: [venue], bookings: [] });
  });

  // SPM-50 / AC2: saved operating information and schedule must be presented independently.
  it("loads persisted venue details, schedule, and durations from the catalogue API", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Orchid Hall" })).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith("/venues/venue-1");
    expect(
      screen.getByText("Monday, Tuesday, Wednesday, Thursday, Friday · 08:00–22:00"),
    ).toBeTruthy();
    expect(screen.getByText("Closed on public holidays")).toBeTruthy();
    expect(screen.getByText("30 minutes")).toBeTruthy();
    expect(screen.getByText("45 minutes")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("No bookings recorded.")).toBeTruthy();
  });

  // A persisted optional image must render with meaningful alternative text.
  it("renders a saved venue image", async () => {
    apiMock.mockResolvedValue({
      ...venue,
      image: {
        name: "orchid.png",
        type: "image/png",
        size: 4,
        dataUrl: "data:image/png;base64,dGVzdA==",
      },
    });
    renderDetail();

    expect((await screen.findByRole("img", { name: "Orchid Hall venue" })).getAttribute("src")).toBe(
      "data:image/png;base64,dGVzdA==",
    );
  });

  // Bookings linked to this venue must remain visible while unrelated venue bookings stay filtered out.
  it("renders only bookings associated with the displayed venue", async () => {
    useAppStore.setState({
      bookings: [
        {
          id: "booking-1",
          eventId: "event-1",
          eventName: "Planning Workshop",
          venueId: venue.id,
          venueName: venue.name,
          requestedBy: "staff-1",
          start: "2030-01-10T18:00:00.000Z",
          end: "2030-01-10T21:00:00.000Z",
          status: "approved",
          createdAt: "2030-01-01T00:00:00.000Z",
        },
        {
          id: "booking-2",
          eventId: "event-2",
          eventName: "Other Venue Meeting",
          venueId: "other-venue",
          venueName: "Other Venue",
          requestedBy: "staff-1",
          start: "2030-01-11T18:00:00.000Z",
          end: "2030-01-11T20:00:00.000Z",
          status: "pending",
          createdAt: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
    renderDetail();

    expect(await screen.findByText("Planning Workshop")).toBeTruthy();
    expect(screen.queryByText("Other Venue Meeting")).toBeNull();
    expect(screen.queryByText("No bookings recorded.")).toBeNull();
  });

  // Unknown identifiers must keep the existing not-found behavior.
  it("reports when the requested venue does not exist", async () => {
    apiMock.mockRejectedValue(new ApiError("Venue not found.", undefined, undefined, 404));
    renderDetail("missing");

    expect(await screen.findByText("Venue not found.")).toBeTruthy();
  });

  /** Transient API errors are distinct from a missing venue and can be retried. */
  it("shows a recoverable error and retries the detail request", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(venue);
    renderDetail();

    expect(await screen.findByText("Unable to load venue details.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Orchid Hall" })).toBeTruthy();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /** Missing route parameters produce a not-found response without calling the API. */
  it("reports a missing route identifier", async () => {
    renderDetail(null);

    expect(await screen.findByText("Venue not found.")).toBeTruthy();
    expect(apiMock).not.toHaveBeenCalled();
  });

  /** A successful empty detail response uses the page's not-found fallback. */
  it("shows the fallback when the detail API returns no record", async () => {
    apiMock.mockResolvedValue(undefined as never);
    renderDetail();

    expect(await screen.findByText("Venue not found.")).toBeTruthy();
  });

  /** SPM-51 route changes ignore a stale venue detail response that resolves after the new venue. */
  it("keeps the route-selected venue when an earlier detail request resolves last", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: Venue) => void;
    let resolveSecond!: (value: Venue) => void;
    const firstRequest = new Promise<Venue>((resolve) => { resolveFirst = resolve; });
    const secondVenue = { ...venue, id: "venue-2", name: "Second Hall" };
    const secondRequest = new Promise<Venue>((resolve) => { resolveSecond = resolve; });
    apiMock.mockImplementation((path) => path === "/venues/venue-1" ? firstRequest : secondRequest);

    render(
      <MemoryRouter initialEntries={["/venues/venue-1"]}>
        <VenueRouteSwitcher />
        <Routes>
          <Route path="/venues/:id" element={<VenueDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Open second venue" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/venue-2"));

    resolveSecond(secondVenue);
    expect(await screen.findByRole("heading", { name: "Second Hall" })).toBeTruthy();
    resolveFirst(venue);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Second Hall" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Orchid Hall" })).toBeNull();
  });

  /** SPM-51 route changes ignore a stale failure from the prior venue request. */
  it("does not replace the new venue with an earlier request error", async () => {
    const user = userEvent.setup();
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: (value: Venue) => void;
    const firstRequest = new Promise<Venue>((_, reject) => { rejectFirst = reject; });
    const secondVenue = { ...venue, id: "venue-2", name: "Second Hall" };
    const secondRequest = new Promise<Venue>((resolve) => { resolveSecond = resolve; });
    apiMock.mockImplementation((path) => path === "/venues/venue-1" ? firstRequest : secondRequest);

    render(
      <MemoryRouter initialEntries={["/venues/venue-1"]}>
        <VenueRouteSwitcher />
        <Routes><Route path="/venues/:id" element={<VenueDetailPage />} /></Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Open second venue" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/venue-2"));
    resolveSecond(secondVenue);
    expect(await screen.findByRole("heading", { name: "Second Hall" })).toBeTruthy();

    rejectFirst(new Error("late failure"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Second Hall" })).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
