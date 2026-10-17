import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import { VenueRecordDetailPage } from "./VenueRecordDetailPage";
import type { VenueRecord } from "../venue-records";

// ASSUMPTION INDEX
// A1: AC10 defines expired holds as available but gives no grace interval; this test treats the expiry instant as the boundary.
// A2: AC4 requires available slots to be distinguishable but does not prescribe a label; the current UI label is "Available slot".

vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, unknown>) => createElement(
    "button",
    {
      type: "button",
      onClick: () => (props.select as (selection: { start: Date; end: Date }) => void)?.({
        start: new Date("2030-01-12T08:00:00.000Z"),
        end: new Date("2030-01-12T09:00:00.000Z"),
      }),
    },
    "Drag event range",
  ),
}));

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const venueId = "00000000-0000-4000-8000-000000000124";
const venue: VenueRecord = {
  id: venueId,
  name: "Conference Room",
  location: "North Wing",
  capacity: 80,
  facilities: [],
  layouts: [],
  accessibility: [],
  operatingInformation: "Public holiday closures",
  setupTimeMinutes: 0,
  turnaroundTimeMinutes: 0,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [{
    id: "booking-1",
    eventName: "Existing event",
    start: "2030-01-12T04:00:00.000Z",
    end: "2030-01-12T05:00:00.000Z",
    status: "booked",
    affectedByUnavailablePeriod: false,
  }],
};
const originalUser = useAppStore.getState().currentUser;

beforeEach(() => {
  vi.resetAllMocks();
  useAppStore.setState({
    currentUser: { id: "coordinator", name: "Coordinator", email: "coordinator@example.test", role: "coordinator" },
    events: [{
      id: "event-1",
      name: "New workshop",
      purpose: "",
      description: "",
      organiserId: "org-1",
      organiserName: "Organiser",
      status: "submitted",
      startDateTime: "2030-01-12T06:00:00.000Z",
      endDateTime: "2030-01-12T07:00:00.000Z",
      expectedAttendance: 20,
      venueRequirements: { minCapacity: 10, accessibility: [], facilities: [], layout: "" },
      equipmentNeeds: "",
      registrationEnabled: false,
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
    }],
  });
});
afterEach(() => {
  cleanup();
  useAppStore.setState({ currentUser: originalUser });
});

function renderPage() {
  return render(<MemoryRouter initialEntries={[`/venue-records/${venueId}`]}>
    <Routes><Route path="/venue-records/:id" element={<VenueRecordDetailPage />} /></Routes>
  </MemoryRouter>);
}

describe("VenueRecordDetailPage calendar range handoff", () => {
  /** SPM-51 AC6: the loaded schedule immediately determines availability; refreshing is optional. */
  it("shows the available result and review action without requiring a schedule refresh", async () => {
    apiMock.mockResolvedValue(venue);
    renderPage();

    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), { target: { value: "2030-01-12T14:00" } });
    fireEvent.change(screen.getByLabelText("Event ends"), { target: { value: "2030-01-12T15:00" } });

    expect(screen.getByRole("status")).toHaveTextContent("available for this venue");
    expect(screen.getByRole("button", { name: "Continue to booking request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh schedule" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledOnce();
  });

  /** SPM-51 ignores stale event IDs and empty start values without creating a valid range. */
  it("keeps an unmatched event selection and empty date out of the availability flow", async () => {
    useAppStore.setState({
      currentUser: { id: "coordinator", name: "Coordinator", email: "coordinator@example.test", role: "coordinator" },
      events: [{
        id: "event-1", name: "New workshop", purpose: "", description: "", organiserId: "org-1", organiserName: "Organiser", status: "submitted",
        startDateTime: "2030-01-12T06:00:00.000Z", endDateTime: "2030-01-12T07:00:00.000Z", expectedAttendance: 20,
        venueRequirements: { minCapacity: 10, accessibility: [], facilities: [], layout: "" }, equipmentNeeds: "", registrationEnabled: false,
        createdAt: "2030-01-01T00:00:00.000Z", updatedAt: "2030-01-01T00:00:00.000Z",
      }],
    });
    apiMock.mockResolvedValue(venue);
    render(<MemoryRouter initialEntries={[`/venue-records/${venueId}?eventId=missing-event`]}>
      <Routes><Route path="/venue-records/:id" element={<VenueRecordDetailPage />} /></Routes>
    </MemoryRouter>);

    await screen.findByRole("heading", { name: "Conference Room" });
    expect(screen.getByLabelText("Event starts")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Event starts"), { target: { value: "2030-01-12T14:00" } });
    fireEvent.change(screen.getByLabelText("Event ends"), { target: { value: "2030-01-12T15:00" } });
    fireEvent.change(screen.getByLabelText("Event for booking request"), { target: { value: "missing-event" } });
    fireEvent.change(screen.getByLabelText("Event starts"), { target: { value: "" } });

    expect(screen.getByLabelText("Event starts")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Refresh schedule" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Continue to booking request" })).not.toBeInTheDocument();
  });

  /** SPM-51 date formatting safely supplies an empty part if a host formatter omits a requested field. */
  it("tolerates missing date parts from the host formatter", async () => {
    const originalFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;
    let omitYear = true;
    const formatterSpy = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockImplementation(function (this: Intl.DateTimeFormat, instant) {
      const parts = originalFormatToParts.call(this, instant);
      if (!omitYear) return parts;
      omitYear = false;
      return parts.filter((part) => part.type !== "year");
    });
    apiMock.mockResolvedValue(venue);

    try {
      renderPage();
      await screen.findByRole("heading", { name: "Conference Room" });
      expect(formatterSpy).toHaveBeenCalled();
    } finally {
      formatterSpy.mockRestore();
    }
  });

  /** SPM-51 drag selection updates the requested range and exits stale review even when both ranges are free. */
  it("recomputes availability after a calendar drag instead of retaining review eligibility", async () => {
    apiMock.mockResolvedValue(venue);
    renderPage();

    await screen.findByRole("heading", { name: "Conference Room" });
    fireEvent.change(screen.getByLabelText("Event starts"), { target: { value: "2030-01-12T14:00" } });
    fireEvent.change(screen.getByLabelText("Event ends"), { target: { value: "2030-01-12T15:00" } });
    expect(screen.getByRole("button", { name: "Continue to booking request" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue to booking request" }));
    expect(screen.getByRole("region", { name: "Review booking request" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Drag event range" }));

    expect(screen.getByLabelText("Event starts")).toHaveValue("2030-01-12T16:00");
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-12T17:00");
    expect(screen.getByRole("status")).toHaveTextContent("available");
    expect(screen.getByRole("button", { name: "Continue to booking request" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Review booking request" })).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledOnce();
  });

  /** VEN-AVL-10-A/B/BND-1 / ASSUMPTION A1: a hold becomes available at its expiry instant. */
  it("removes an expired hold from the displayed schedule when its expiry timer fires", async () => {
    const realNow = Date.now();
    const fixedNow = new Date("2030-01-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    apiMock.mockResolvedValue({
      ...venue,
      reservations: [{
        id: "short-hold",
        eventName: "Expiring hold",
        start: "2030-01-12T04:00:00.000Z",
        end: "2030-01-12T05:00:00.000Z",
        status: "tentative",
        holdExpiresAt: "2030-01-01T12:00:01.000Z",
        affectedByUnavailablePeriod: false,
      }, {
        id: "later-hold",
        eventName: "Later hold",
        start: "2030-01-12T06:00:00.000Z",
        end: "2030-01-12T07:00:00.000Z",
        status: "tentative",
        holdExpiresAt: "2030-01-01T12:00:02.000Z",
        affectedByUnavailablePeriod: false,
      }],
    });

    try {
      renderPage();
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByRole("heading", { name: "Conference Room" })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Event starts"), { target: { value: "2030-01-12T12:00" } });
      fireEvent.change(screen.getByLabelText("Event ends"), { target: { value: "2030-01-12T13:00" } });
      fireEvent.click(screen.getByRole("button", { name: "List" }));
      expect(screen.getByRole("list", { name: "Venue schedule" })).toHaveTextContent("Expiring hold");
      expect(screen.getByRole("list", { name: "Venue schedule" })).toHaveTextContent("Later hold");
      expect(screen.getByRole("alert")).toHaveTextContent("Expiring hold");
      expect(screen.getByRole("list", { name: "Venue schedule" })).not.toHaveTextContent("Available slot");
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(screen.getByRole("list", { name: "Venue schedule" })).not.toHaveTextContent("Expiring hold");
      expect(screen.getByRole("list", { name: "Venue schedule" })).toHaveTextContent("Later hold");
      expect(screen.getByRole("status")).toHaveTextContent("available");
      // ASSUMPTION A2: the product requires distinct available slots; it does not prescribe this exact visible label.
      expect(screen.getByRole("list", { name: "Venue schedule" })).toHaveTextContent("Available slot");
      expect(screen.getByRole("list", { name: "Venue schedule" })).toHaveTextContent("12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 (SGT)");
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.setSystemTime(realNow);
    }
  });
});
