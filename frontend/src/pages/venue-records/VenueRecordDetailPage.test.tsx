// frontend/src/pages/venue-records/VenueRecordDetailPage.test.tsx
// SPM-124: AC4/6/7; VEN-VIEW-06-A/B, 07-A/B and detail error coverage.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError, api } from "@/utils/api";
import { VenueRecordDetailPage } from "./VenueRecordDetailPage";
import type { VenueRecord } from "./venue-records";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const id = "00000000-0000-4000-8000-000000000124";
const venue: VenueRecord = {
  id,
  name: "Conference Room",
  location: "North Wing",
  capacity: 80,
  facilities: ["Projector"],
  layouts: ["Boardroom"],
  accessibility: ["Wheelchair access"],
  operatingInformation: "Weekdays only",
  operatingDays: ["Monday", "Tuesday"],
  operatingStartTime: "09:00",
  operatingEndTime: "18:00",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
  availabilityStatus: "unavailable",
  unavailablePeriods: [
    {
      id: "period-1",
      start: "2026-10-05T00:00:00Z",
      end: "2026-10-06T00:00:00Z",
      reason: "Maintenance",
    },
  ],
  reservations: [
    {
      id: "booking-1",
      eventName: "Welcome Evening",
      start: "2026-10-05T12:00:00Z",
      end: "2026-10-05T14:00:00Z",
      status: "booked",
      affectedByUnavailablePeriod: true,
    },
    {
      id: "hold-1",
      eventName: "Workshop",
      start: "2026-10-08T12:00:00Z",
      end: "2026-10-08T14:00:00Z",
      status: "tentative",
      affectedByUnavailablePeriod: false,
    },
  ],
};

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/venues/${id}`]}>
      <Routes>
        <Route path="/venues/:id" element={<VenueRecordDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VenueRecordDetailPage (SPM-124)", () => {
  // VEN-VIEW-06-A (AC6): the selected venue shows its upcoming confirmed booking.
  it("VEN-VIEW-06-A: shows BKG-1001 as a booking for Orchid Hall only", async () => {
    // Arrange: the API returns the specified booking on Orchid Hall.
    apiMock.mockResolvedValue({
      ...venue,
      name: "Orchid Hall Test",
      reservations: [
        {
          id: "booking-1001",
          eventName: "BKG-1001",
          start: "2026-10-09T02:00:00Z",
          end: "2026-10-09T03:00:00Z",
          status: "booked",
          affectedByUnavailablePeriod: false,
        },
      ],
    });

    // Act: open the selected venue's details.
    renderPage();
    await screen.findByRole("heading", { name: "Orchid Hall Test" });

    // Assert: BKG-1001 appears as a booking under the selected venue.
    expect(screen.getByText("BKG-1001")).toBeInTheDocument();
    expect(screen.getByText(/Booked/)).toBeInTheDocument();
    expect(screen.queryByText(/Tentative hold/)).not.toBeInTheDocument();
  });

  // VEN-VIEW-06-B (AC6): the view shows active holds returned by the API only.
  it("VEN-VIEW-06-B: shows HOLD-A without inventing expired HOLD-X", async () => {
    // Arrange: the API excludes expired HOLD-X at the specified fixed-time state.
    apiMock.mockResolvedValue({
      ...venue,
      name: "Marina Auditorium Test",
      reservations: [
        {
          id: "hold-a",
          eventName: "HOLD-A",
          start: "2026-10-10T01:00:00Z",
          end: "2026-10-10T02:00:00Z",
          status: "tentative",
          affectedByUnavailablePeriod: false,
        },
      ],
    });

    // Act: open the selected venue's details.
    renderPage();
    await screen.findByRole("heading", { name: "Marina Auditorium Test" });

    // Assert: only the active tentative hold is displayed.
    expect(screen.getByText("HOLD-A")).toBeInTheDocument();
    expect(screen.getByText(/Tentative hold/)).toBeInTheDocument();
    expect(screen.queryByText("HOLD-X")).not.toBeInTheDocument();
  });

  // AC4/6/7: staff can inspect details, schedule reasons and affected bookings.
  it("VEN-VIEW-07-A: shows the selected venue's accessibility, setup and turnaround", async () => {
    // Arrange: the detail API returns one persisted venue with both reservation types.
    apiMock.mockResolvedValue({ ...venue, name: "Orchid Hall Test" });

    // Act: open the venue detail route.
    renderPage();

    // Assert: detailed fields, period reason and booking impact are visible.
    expect(
      await screen.findByRole("heading", { name: "Orchid Hall Test" }),
    ).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(`/venues/${id}`);
    expect(screen.getByText("Wheelchair access")).toBeInTheDocument();
    expect(screen.getByText("30 minutes before an event")).toBeInTheDocument();
    expect(screen.getByText("45 minutes after an event")).toBeInTheDocument();
    expect(screen.getByText(/Maintenance/)).toBeInTheDocument();
    expect(
      within(screen.getByText("Welcome Evening").closest("li")!).getByText("Affected by an unavailable period"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Workshop").closest("li")!).queryByText("Affected by an unavailable period"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Tentative hold/)).toBeInTheDocument();
  });

  // VEN-VIEW-07-B (AC7): changing venue replaces all venue-specific detail values.
  it("VEN-VIEW-07-B: refreshes details when another venue is selected", async () => {
    // Arrange: two venues have different accessibility and timing requirements.
    const user = userEvent.setup();
    const secondId = "00000000-0000-4000-8000-000000000125";
    const secondVenue: VenueRecord = {
      ...venue,
      id: secondId,
      name: "Seminar Room 2 Test",
      accessibility: ["Step-free access"],
      setupTimeMinutes: 15,
      turnaroundTimeMinutes: 20,
    };
    apiMock.mockImplementation(async (path) =>
      path === `/venues/${id}` ? venue : secondVenue,
    );
    render(
      <MemoryRouter initialEntries={[`/venues/${id}`]}>
        <Link to={`/venues/${secondId}`}>Select Seminar Room 2 Test</Link>
        <Routes>
          <Route path="/venues/:id" element={<VenueRecordDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Conference Room" });

    // Act: select the other venue while the detail component stays mounted.
    await user.click(
      screen.getByRole("link", { name: "Select Seminar Room 2 Test" }),
    );

    // Assert: only the selected venue's accessibility and time values remain.
    expect(
      await screen.findByRole("heading", { name: "Seminar Room 2 Test" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Step-free access")).toBeInTheDocument();
    expect(screen.getByText("15 minutes before an event")).toBeInTheDocument();
    expect(screen.getByText("20 minutes after an event")).toBeInTheDocument();
    expect(screen.queryByText("Wheelchair access")).not.toBeInTheDocument();
    expect(
      screen.queryByText("30 minutes before an event"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("45 minutes after an event"),
    ).not.toBeInTheDocument();
  });

  // AC7: a missing record has a clear not-found state.
  it("shows not found for an unknown venue", async () => {
    // Arrange: the API responds 404 for the selected identifier.
    apiMock.mockRejectedValue(
      new ApiError("Venue not found.", undefined, undefined, 404),
    );

    // Act: open its detail route.
    renderPage();

    // Assert: no stale venue details are presented.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Venue not found.",
    );
    expect(screen.queryByRole("heading", { name: "Conference Room" })).not.toBeInTheDocument();
  });

  // Non-404 failures must be actionable without being presented as a missing venue.
  it("shows a retryable generic error for a failed detail request", async () => {
    // Arrange: a transport failure has no HTTP 404 status.
    apiMock.mockRejectedValue(new Error("offline"));

    // Act: open the detail route.
    renderPage();

    // Assert: the generic failure and retry control replace all venue details.
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load venue details.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Conference Room" })).not.toBeInTheDocument();
  });

  // Empty schedule collections have explicit states instead of blank cards.
  it("shows empty unavailable-period and reservation states", async () => {
    // Arrange: the selected venue has no future schedule records.
    apiMock.mockResolvedValue({ ...venue, unavailablePeriods: [], reservations: [] });

    // Act: load the detail page.
    renderPage();

    // Assert: both schedule sections explain their independently empty state.
    expect(await screen.findByText("No current or scheduled unavailable periods.")).toBeInTheDocument();
    expect(screen.getByText("No upcoming bookings or active tentative holds.")).toBeInTheDocument();
  });
});
