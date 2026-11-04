import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, RouterProvider, createMemoryRouter, useLocation } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingsPage } from "./BookingsPage";
import { useAppStore } from "@/store/useAppStore";
import { ApiError, api } from "@/utils/api";
import { deferred } from "@/test/deferred";

vi.mock("@/utils/api", async (original) => ({
  ...(await original<typeof import("@/utils/api")>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const booking = {
  id: "booking-1",
  eventId: "event-1",
  eventName: "Gala",
  venueId: "venue-1",
  venueName: "Main Hall",
  start: "2030-01-12T04:00:00.000Z",
  end: "2030-01-12T05:00:00.000Z",
  status: "pending" as const,
  bookingReference: "VB-BOOKING1",
  createdAt: "2030-01-01T00:00:00.000Z",
  affected: false,
};

// Reports the router location, so a test can read the query string the page leaves behind (SPM-137).
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

/**
 * Renders the page inside a router (it reads ?booking=<id>, SPM-137) at the given address. A link to another
 * booking is rendered beside it to stand for the notification bell.
 */
function renderPage(entry = "/bookings") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <BookingsPage />
      <LocationProbe />
      <Link to="/bookings?booking=booking-2">Go to booking 2</Link>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAppStore.setState({
    currentUser: {
      id: "coord-1",
      name: "Coordinator",
      email: "c@example.test",
      role: "coordinator",
      roles: ["coordinator"],
    },
    bookings: [],
  });
  apiMock.mockReset();
});
afterEach(cleanup);

/** Signs the page in as Venue Staff, the role that reviews pending requests. */
function setVenueStaff() {
  useAppStore.setState({
    currentUser: {
      id: "staff-1",
      name: "Venue Staff",
      email: "staff@example.test",
      role: "venue_staff",
      roles: ["venue_staff"],
    },
    bookings: [],
  });
}

/** Builds one booking row as the GET /venues/bookings/pending endpoint returns it (now includes status). */
function pendingRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "booking-1",
    eventId: "event-1",
    eventName: "Gala",
    // The booking window (start/end) is what the pending card and review dialog display; the
    // event window (eventStart/eventEnd) differs on purpose so a test can tell which pair the UI rendered.
    eventStart: "2030-01-12T09:00:00.000Z",
    eventEnd: "2030-01-12T10:00:00.000Z",
    coordinatorName: "Coordinator Two",
    venueId: "venue-1",
    venueName: "Main Hall",
    bookingReference: "VB-BOOKING1",
    start: "2030-01-12T04:00:00.000Z",
    end: "2030-01-12T05:00:00.000Z",
    status: "pending",
    ...overrides,
  };
}

describe("Coordinator venue bookings", () => {
  /** VEN-BKG-08-A: My Bookings loads persisted requests scoped by the server and shows event, venue, and status. */
  it("VEN-BKG-08-A SPM-54 shows API-backed event, venue, and booking status", async () => {
    apiMock.mockResolvedValue([booking] as never);
    useAppStore.setState({
      bookings: [
        { ...booking, id: "local-own", requestedBy: "Coordinator" },
        { ...booking, id: "local-other", requestedBy: "Another Coordinator" },
      ],
    });
    renderPage();
    expect(await screen.findAllByRole("heading", { name: "Gala" })).toHaveLength(2);
    const bookingCard = screen.getByRole("article");
    expect(within(bookingCard).getByRole("heading", { name: "Gala" })).toBeInTheDocument();
    expect(within(bookingCard).getByText("Venue: Main Hall")).toBeInTheDocument();
    expect(bookingCard).toHaveClass("bg-white", "dark:bg-gray-800");
    expect(bookingCard).toHaveClass("border-gray-200", "dark:border-gray-700");
    expect(within(bookingCard).getByRole("heading", { name: "Gala" })).toHaveClass("text-gray-900", "dark:text-gray-100");
    expect(screen.getByText(/VB-BOOKING1/)).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/venues/bookings/mine");
  });

  /** VEN-HOLD-09-SUP-COORDINATOR: a fresh coordinator list distinguishes Pending, Active, and expired tentative holds with their expiry timestamps. */
  it("VEN-HOLD-09-SUP-COORDINATOR shows coordinator hold state and expiry from the API", async () => {
    apiMock.mockResolvedValueOnce([
      {
        ...booking,
        id: "hold-pending",
        eventName: "Pending Hold Event",
        requestKind: "tentative_hold",
        holdExpired: false,
      },
      {
        ...booking,
        id: "hold-active",
        eventName: "Active Hold Event",
        status: "approved",
        requestKind: "tentative_hold",
        holdExpiresAt: "2030-01-24T12:00:00.000Z",
        holdExpired: false,
      },
      {
        ...booking,
        id: "hold-expired",
        eventName: "Expired Hold Event",
        status: "expired",
        requestKind: "tentative_hold",
        holdExpiresAt: "2030-01-09T12:00:00.000Z",
        holdExpired: true,
      },
    ] as never);
    renderPage();

    expect(await screen.findByText("Tentative hold request pending Venue Staff approval. The hold is not active.")).toBeInTheDocument();
    expect(screen.getByText("Active tentative hold until 24 Jan 2030, 20:00 SGT.")).toBeInTheDocument();
    expect(screen.getByText("Expired tentative hold until 09 Jan 2030, 20:00 SGT.")).toBeInTheDocument();
  });

  /** VEN-HOLD-09-SUP-COORDINATOR: a rejected or cancelled tentative hold, or an approved hold without an expiry, shows no hold-state label. */
  it("VEN-HOLD-09-SUP-COORDINATOR shows no hold-state label for a rejected hold or an approved hold without expiry", async () => {
    apiMock.mockResolvedValueOnce([
      {
        ...booking,
        id: "hold-rejected",
        eventName: "Rejected Hold Event",
        status: "rejected",
        requestKind: "tentative_hold",
        holdExpiresAt: "2030-01-24T12:00:00.000Z",
        holdExpired: false,
        rejectionReason: "Venue closed",
      },
      {
        ...booking,
        id: "hold-cancelled",
        eventName: "Cancelled Hold Event",
        status: "cancelled",
        requestKind: "tentative_hold",
        holdExpiresAt: "2030-01-24T12:00:00.000Z",
        holdExpired: false,
      },
      {
        ...booking,
        id: "hold-no-expiry",
        eventName: "No Expiry Hold Event",
        status: "approved",
        requestKind: "tentative_hold",
        holdExpired: false,
      },
    ] as never);
    renderPage();

    await screen.findAllByText("Rejected Hold Event");
    for (const eventName of ["Rejected Hold Event", "Cancelled Hold Event", "No Expiry Hold Event"]) {
      const card = screen
        .getAllByRole("heading", { name: eventName })
        .map((heading) => heading.closest("article"))
        .find((article): article is HTMLElement => article !== null);
      expect(card).toBeDefined();
      expect(within(card as HTMLElement).queryByText(/tentative hold/i)).not.toBeInTheDocument();
      expect(within(card as HTMLElement).queryByText(/hold expired/i)).not.toBeInTheDocument();
      expect(within(card as HTMLElement).queryByText(/active/i)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/tentative hold/i)).not.toBeInTheDocument();
  });

  /** VEN-BKG-05-A: affected and cancelled history rows offer the assigned event as replacement context. */
  it("VEN-BKG-05-A VEN-BKG-06-A SPM-54 shows replacement context and preserves the affected booking history", async () => {
    apiMock.mockResolvedValue([
      { ...booking, specialRequest: "Microphones", affected: true },
      {
        ...booking,
        id: "booking-2",
        venueName: "Garden Hall",
        status: "cancelled",
        specialRequest: "",
        affected: false,
      },
    ] as never);
    renderPage();

    expect(await screen.findByText("Microphones")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Find a replacement venue" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("link", { name: "Find a replacement venue" })[0],
    ).toHaveAttribute("href", "/venues?eventId=event-1");
    expect(screen.getByText("Venue: Garden Hall")).toBeInTheDocument();
  });

  /** VEN-BKG-08-A: the status filter selects retained cancelled request history. */
  it("VEN-BKG-08-A SPM-54 filters the coordinator booking history by cancelled status", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue([
      booking,
      {
        ...booking,
        id: "booking-2",
        venueName: "Garden Hall",
        status: "cancelled",
      },
    ] as never);
    renderPage();
    await screen.findAllByText("Gala");

    await user.selectOptions(
      screen.getByLabelText("Status filter"),
      "cancelled",
    );

    expect(screen.getByText("Venue: Garden Hall")).toBeInTheDocument();
    expect(screen.queryByText("Venue: Main Hall")).not.toBeInTheDocument();
  });

  // VEN-BKG-08-A. Kills: the BookingsPage onDecided mirror that updates coordinatorBookings for the same booking id; without it
  // the coordinator card keeps its pending status after a Venue Staff approval of that booking.
  it("VEN-BKG-08-A SPM-54 shows a Venue Staff decision on the coordinator card for the same booking", async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      currentUser: {
        id: "dual-1",
        name: "Dual Role",
        email: "dual@example.test",
        role: "venue_staff",
        roles: ["coordinator", "venue_staff"],
      },
      bookings: [],
    });
    apiMock.mockImplementation((async (path: string) => {
      if (path === "/venues/bookings/mine")
        return [booking, { ...booking, id: "booking-2", bookingReference: "VB-BOOKING2", venueName: "Garden Hall", status: "cancelled" }];
      if (path === "/venues/bookings/pending") return [pendingRequest()];
      if (path === "/venues/bookings/booking-1/approve") return { id: "booking-1", status: "approved" };
      throw new Error(`unexpected request ${path}`);
    }) as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // The staff card leaves the default Pending view, so the only card for this reference is the coordinator's.
    const coordinatorCard = screen.getByText("Reference VB-BOOKING1").closest("article");
    expect(coordinatorCard).not.toBeNull();
    expect(within(coordinatorCard as HTMLElement).getByText("approved")).toBeInTheDocument();
    // An unrelated coordinator row keeps its own status.
    const otherCard = screen.getByText("Reference VB-BOOKING2").closest("article");
    expect(within(otherCard as HTMLElement).getByText("cancelled")).toBeInTheDocument();
  });

  /** VEN-BKG-08-A: a failed booking-history request is reported without rendering phantom rows. */
  it("VEN-BKG-04-B VEN-BKG-08-A SPM-54 reports a booking list load failure", async () => {
    apiMock.mockRejectedValueOnce(new Error("Connection failed"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load your venue bookings.",
    );
    expect(
      screen.getByText("No bookings match this filter."),
    ).toBeInTheDocument();
  });

  /** VEN-BKG-08-SEC-1 / SPM-55 AC1: Venue Staff see the API's pending list in its returned order, without the coordinator endpoint. */
  it("VEN-BKG-08-SEC-1 SPM-54 / SPM-55 AC1 loads the pending venue requests for Venue Staff without the coordinator endpoint", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([
      pendingRequest({ id: "older", eventName: "Older Event", status: "pending" }),
      pendingRequest({ id: "newer", eventName: "Newer Event", eventStart: "2030-01-20T04:00:00.000Z", eventEnd: "2030-01-20T05:00:00.000Z", status: "pending" }),
    ] as never);
    renderPage();

    expect(await screen.findByText("Older Event")).toBeInTheDocument();
    expect(screen.getByText("Newer Event")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/venues/bookings/pending");
    expect(apiMock).not.toHaveBeenCalledWith("/venues/bookings/mine");
    await user.click(screen.getAllByRole("button", { name: "Review Details" })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("Booking Request — Older Event");
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /** VEN-REV-01-A: each pending card shows event, date and time, coordinator, venue, booking reference, and any special request. */
  it("SPM-55 AC1 shows coordinator, venue, reference, time and special request on each pending card", async () => {
    setVenueStaff();
    apiMock.mockResolvedValueOnce([
      pendingRequest({ specialRequest: "Wheelchair access" }),
    ] as never);
    renderPage();

    expect(await screen.findByRole("heading", { name: "Gala" })).toBeInTheDocument();
    expect(screen.getByText("Venue: Main Hall")).toBeInTheDocument();
    expect(screen.getByText("Coordinator: Coordinator Two")).toBeInTheDocument();
    expect(screen.getByText("Reference VB-BOOKING1")).toBeInTheDocument();
    expect(screen.getByText("Special request: Wheelchair access")).toBeInTheDocument();
    // The card shows the stored booking slot in Singapore time, not the current event window (eventStart/eventEnd).
    expect(screen.getByText("12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 SGT")).toBeInTheDocument();
    expect(screen.queryByText("12 Jan 2030, 17:00 – 12 Jan 2030, 18:00 SGT")).not.toBeInTheDocument();
  });

  /** VEN-HOLD-13-A: a setup change is visible on the Pending card and its review details for staff reassessment. */
  it("VEN-HOLD-13-A shows the reassessment flag on a Pending card and review dialog", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([
      pendingRequest({ reassessmentRequired: true }),
    ] as never);
    renderPage();

    expect(
      await screen.findByText("Venue setup changed. Reassess the occupied period before approval."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review Details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Venue setup changed after this request was submitted. Reassess the occupied period before approving it.",
    );
  });

  /** VEN-HOLD-13-A: staff can distinguish a tentative hold, understand approval activates it temporarily, and see its expiry after approval. */
  it("VEN-HOLD-13-A identifies tentative holds and explains their 14-day approval expiry", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest({ requestKind: "tentative_hold" })] as never)
      .mockResolvedValueOnce({ holdExpiresAt: "2030-01-24T12:00:00.000Z" } as never);
    renderPage();

    expect(await screen.findByText("Tentative hold request")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review Details" }));
    const pendingDialog = screen.getByRole("dialog");
    expect(pendingDialog).toHaveTextContent("Tentative Hold Request — Gala");
    expect(pendingDialog).toHaveTextContent("14 days (336 hours) from approval");
    expect(pendingDialog).toHaveTextContent("It does not confirm a booking");
    expect(screen.getByLabelText(/Approve — activate tentative hold/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Approve — activate tentative hold/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("Status filter"), "approved");
    expect(await screen.findByText("Active tentative hold until 24 Jan 2030, 20:00 SGT")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Active tentative hold until 24 Jan 2030, 20:00 SGT");
  });

  /** VEN-HOLD-DEC-02-A: staff review details show the venue, requested time, Coordinator and 14-day hold duration. */
  it("VEN-HOLD-DEC-02-A shows hold request details and the fixed 14-day duration", async () => {
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ requestKind: "tentative_hold" })] as never);
    renderPage();

    await screen.findByRole("heading", { name: "Gala" });
    expect(screen.getByText("Venue: Main Hall")).toBeInTheDocument();
    expect(screen.getByText("Coordinator: Coordinator Two")).toBeInTheDocument();
    expect(screen.getByText("12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 SGT")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Review Details" }));
    const details = screen.getByRole("dialog");
    expect(details).toHaveTextContent("Tentative Hold Request — Gala");
    expect(details).toHaveTextContent("14 days (336 hours) from approval");
    expect(details).toHaveTextContent("It does not confirm a booking");
  });

  /** VEN-HOLD-09-SUP-LOOKUP: an approved hold past its expiry is shown as expired in both card and details. */
  it("VEN-HOLD-09-SUP-LOOKUP labels an approved hold expired after its cutoff", async () => {
    setVenueStaff();
    apiMock.mockResolvedValueOnce([
      pendingRequest({
        status: "approved",
        requestKind: "tentative_hold",
        holdExpiresAt: "2030-01-24T12:00:00.000Z",
        holdExpired: true,
      }),
    ] as never);
    renderPage();

    await userEvent.setup().selectOptions(screen.getByLabelText("Status filter"), "approved");
    expect(await screen.findByText("Expired tentative hold until 24 Jan 2030, 20:00 SGT")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "View Details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Expired tentative hold until 24 Jan 2030, 20:00 SGT");
  });

  /** VEN-HOLD-DEC-06-B: a persisted expired hold remains visible to its Venue Staff owner after reload. */
  it("VEN-HOLD-DEC-06-B shows a persisted expired hold in the staff queue", async () => {
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ status: "expired", requestKind: "tentative_hold", holdExpiresAt: "2030-01-09T12:00:00.000Z", holdExpired: true })] as never);
    renderPage();
    await userEvent.setup().selectOptions(screen.getByLabelText("Status filter"), "expired");
    expect(await screen.findByText("Expired tentative hold until 09 Jan 2030, 20:00 SGT")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "View Details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Expired tentative hold until 09 Jan 2030, 20:00 SGT");
    expect(screen.queryByRole("button", { name: "Convert to confirmed booking" })).not.toBeInTheDocument();
  });

  /** VEN-HOLD-DEC-09-A/12-A: staff conversion persists through the API and changes the row to a confirmed booking. */
  it("VEN-HOLD-DEC-12-A converts an active tentative hold and updates its label", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([
      pendingRequest({ status: "approved", requestKind: "tentative_hold", holdExpiresAt: "2030-01-24T12:00:00.000Z", holdExpired: false }),
      pendingRequest({ id: "booking-2", eventName: "Other event", status: "approved", requestKind: "booking" }),
    ] as never)
      .mockResolvedValueOnce({ id: "booking-1", status: "approved", requestKind: "booking" } as never);
    renderPage();

    await user.selectOptions(screen.getByLabelText("Status filter"), "approved");
    expect(await screen.findByText("Active tentative hold until 24 Jan 2030, 20:00 SGT")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "View Details" })[0]);
    await user.click(screen.getByRole("button", { name: "Convert to confirmed booking" }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/bookings/booking-1/convert-hold", { method: "POST" }));
    expect(screen.queryByText(/Active tentative hold/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "View Details" })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Other event" })).toBeInTheDocument();
  });

  /** VEN-HOLD-DEC-09-B: when conversion is refused without an Error object, staff see a safe fallback and retain the hold details. */
  it("VEN-HOLD-DEC-09-B keeps the active hold details open when conversion returns an untyped failure", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ status: "approved", requestKind: "tentative_hold", holdExpiresAt: "2030-01-24T12:00:00.000Z", holdExpired: false })] as never)
      .mockRejectedValueOnce("expired by the server");
    renderPage();

    await user.selectOptions(screen.getByLabelText("Status filter"), "approved");
    await user.click(await screen.findByRole("button", { name: "View Details" }));
    await user.click(screen.getByRole("button", { name: "Convert to confirmed booking" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to update this tentative hold.");
    expect(screen.getByRole("dialog")).toHaveTextContent("Tentative Hold Request — Gala");
    expect(apiMock).toHaveBeenCalledWith("/venues/bookings/booking-1/convert-hold", { method: "POST" });
  });

  /** VEN-HOLD-DEC-09-B: a server error is shown to staff and does not close the hold details. */
  it("VEN-HOLD-DEC-09-B reports a conversion error while retaining the hold details", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ status: "approved", requestKind: "tentative_hold", holdExpiresAt: "2030-01-24T12:00:00.000Z", holdExpired: false })] as never)
      .mockRejectedValueOnce(new Error("The hold has expired."));
    renderPage();
    await user.selectOptions(screen.getByLabelText("Status filter"), "approved");
    await user.click(await screen.findByRole("button", { name: "View Details" }));
    await user.click(screen.getByRole("button", { name: "Convert to confirmed booking" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The hold has expired.");
    expect(screen.getByRole("dialog")).toHaveTextContent("Tentative Hold Request — Gala");
  });

  /** VEN-HOLD-DEC-10-A/13-A: staff release calls the API and removes that active hold from the list. */
  it("VEN-HOLD-DEC-13-A releases an active tentative hold from the staff list", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ status: "approved", requestKind: "tentative_hold", holdExpiresAt: "2030-01-24T12:00:00.000Z", holdExpired: false })] as never)
      .mockResolvedValueOnce({ id: "booking-1", status: "released" } as never);
    renderPage();

    await user.selectOptions(screen.getByLabelText("Status filter"), "approved");
    await user.click(await screen.findByRole("button", { name: "View Details" }));
    await user.click(screen.getByRole("button", { name: "Release hold" }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/bookings/booking-1/release-hold", { method: "POST" }));
    expect(await screen.findByText("No bookings match this filter.")).toBeInTheDocument();
  });

  /** VEN-REV-01-B: a Venue Staff member with no pending requests sees the empty state. */
  it("SPM-55 AC1 shows the empty state when no pending requests are assigned", async () => {
    setVenueStaff();
    apiMock.mockResolvedValueOnce([] as never);
    renderPage();

    expect(await screen.findByText("No bookings match this filter.")).toBeInTheDocument();
  });

  /** VEN-REV-01-B: a failed pending-list load is reported without rendering stale rows. */
  it("SPM-55 AC1 reports a pending-list load failure for Venue Staff", async () => {
    setVenueStaff();
    apiMock.mockRejectedValueOnce(new Error("Connection failed"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load pending booking requests.");
  });

  /** VEN-REV-01-A: the review dialog shows the special request when one was submitted. */
  it("SPM-55 AC1 shows the special request in the review dialog", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ specialRequest: "Microphones" })] as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Special request");
    expect(screen.getByRole("dialog")).toHaveTextContent("Microphones");
  });

  /** VEN-REV-01-B: Venue Staff have Pending / Approved / Rejected filter options so decided bookings remain visible; defaults to Pending. */
  it("SPM-55 AC1 defaults to Pending filter and exposes Pending / Approved / Rejected options for Venue Staff", async () => {
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ eventName: "Filtered Event" })] as never);
    renderPage();

    expect(await screen.findByText("Filtered Event")).toBeInTheDocument();
    const select = screen.getByLabelText("Status filter");
    expect((select as HTMLSelectElement).value).toBe("pending");
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toContain("pending");
    expect(options).toContain("approved");
    expect(options).toContain("rejected");
    expect(options).not.toContain("cancelled");
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  /** VEN-REV-02-A: approving calls the approve endpoint, closes the review, and updates the booking status locally without re-fetching. */
  it("SPM-55 AC2 approves a request through the API and keeps it visible as approved without re-fetching", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest()] as never)
      .mockResolvedValueOnce({ id: "booking-1", status: "approved" } as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    // The review dialog shows the stored booking slot in Singapore time, not the current event window (eventStart/eventEnd).
    expect(screen.getByRole("dialog")).toHaveTextContent("12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 SGT");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("12 Jan 2030, 17:00 – 12 Jan 2030, 18:00 SGT");
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledWith("/venues/bookings/booking-1/approve", { method: "POST" });
    // Booking stays in the list with updated status; no re-fetch is issued.
    expect(apiMock).toHaveBeenCalledTimes(2);
    // Approved booking is hidden under the default Pending filter; switching to Approved reveals it.
    await user.selectOptions(screen.getByLabelText("Status filter"), "approved");
    expect(screen.getByRole("button", { name: "View Details" })).toBeInTheDocument();
  });

  /** VEN-REV-02-D: while a decision is in flight the Submit Decision button is disabled, so a second click cannot send a duplicate. */
  it("SPM-55 AC2 disables Submit Decision while the decision request is pending", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest()] as never)
      .mockReturnValueOnce(new Promise(() => {}) as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    const submit = screen.getByRole("button", { name: "Submit Decision" });
    await user.click(submit);

    // The approve POST has not resolved, so the button must stay disabled and only one decision request was sent.
    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(apiMock).toHaveBeenLastCalledWith("/venues/bookings/booking-1/approve", { method: "POST" });
  });

  /** VEN-REV-03-A: a rejection cannot be submitted until a non-empty reason is entered, then sends the trimmed reason and updates status locally. */
  it("SPM-55 AC3 requires a non-empty rejection reason and keeps the booking visible as rejected without re-fetching", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest()] as never)
      .mockResolvedValueOnce({ id: "booking-1", status: "rejected" } as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Reject — provide reason/));
    const submit = screen.getByRole("button", { name: "Submit Decision" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Rejection reason/), "   ");
    expect(submit).toBeDisabled();
    await user.clear(screen.getByLabelText(/Rejection reason/));
    await user.type(screen.getByLabelText(/Rejection reason/), "  Clashes with maintenance  ");
    await user.click(submit);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledWith("/venues/bookings/booking-1/reject", {
      method: "POST",
      body: JSON.stringify({ reason: "Clashes with maintenance" }),
    });
    // Booking stays in the list with updated status; no re-fetch is issued.
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(apiMock).toHaveBeenNthCalledWith(1, "/venues/bookings/pending");
    // Rejected booking is hidden under the default Pending filter; switching to Rejected reveals it.
    await user.selectOptions(screen.getByLabelText("Status filter"), "rejected");
    expect(screen.getByRole("button", { name: "View Details" })).toBeInTheDocument();
  });

  /** VEN-REV-03-B: Submit Decision stays disabled for a rejection whose reason is missing or whitespace-only. */
  it("SPM-55 AC3 keeps a rejection disabled until the reason is non-blank", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest()] as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Reject — provide reason/));
    const submit = screen.getByRole("button", { name: "Submit Decision" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Rejection reason/), "   ");
    expect(submit).toBeDisabled();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  /** VEN-REV-06-A: a decision on a request that was already decided shows the server's error and keeps the review open. */
  it("SPM-55 AC6 shows the already-decided error and keeps the review open", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest()] as never)
      .mockRejectedValueOnce(
        new ApiError("This booking request is already cancelled and can no longer be approved or rejected.", undefined, "BOOKING_ALREADY_DECIDED", 409),
      );
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This booking request is already cancelled and can no longer be approved or rejected.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The failed request is no longer in flight, so the decision can be retried.
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeEnabled();
  });

  /** VEN-CONF-02-A, VEN-CONF-06-A/B/C/D: a conflict keeps approval open and shows each correct full interval and blocker label. */
  it("VEN-CONF-02-A VEN-CONF-06-A VEN-CONF-06-B VEN-CONF-06-C VEN-CONF-06-D SPM-56 shows and dismisses each conflicting occupied interval", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest()] as never)
      .mockRejectedValueOnce(new ApiError(
        "This slot can no longer be approved because it conflicts with Lecture Series. Check availability again before approving.",
        undefined,
        "BOOKING_SLOT_CONFLICT",
        409,
        [
          {
            id: "approved-1", reason: "Lecture Series", kind: "booking",
            start: "2030-01-12T03:20:00.000Z", end: "2030-01-12T04:00:00.000Z",
            occupiedStart: "2030-01-12T02:50:00.000Z", occupiedEnd: "2030-01-12T04:45:00.000Z", status: "approved",
          },
          {
            id: "hold-1", reason: "Tentative Event", kind: "booking",
            start: "2030-01-12T04:45:00.000Z", end: "2030-01-12T05:45:00.000Z",
            occupiedStart: "2030-01-12T04:15:00.000Z", occupiedEnd: "2030-01-12T06:30:00.000Z", status: "approved", requestKind: "tentative_hold",
            holdExpiresAt: "2030-01-12T03:00:00.000Z",
          },
          {
            id: "closure-1", reason: "Maintenance", kind: "unavailable",
            start: "2030-01-12T06:00:00.000Z", end: "2030-01-12T07:00:00.000Z",
            occupiedStart: "2030-01-12T06:00:00.000Z", occupiedEnd: "2030-01-12T07:00:00.000Z",
          },
        ],
      ));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Confirmed booking: Lecture Series; occupied 12 Jan 2030, 10:50 – 12 Jan 2030, 12:45 SGT");
    expect(alert).toHaveTextContent("Active tentative hold: Tentative Event; occupied 12 Jan 2030, 12:15 – 12 Jan 2030, 14:30 SGT");
    expect(alert).toHaveTextContent("Unavailable period: 12 Jan 2030, 14:00 – 12 Jan 2030, 15:00 SGT — Maintenance");
    expect(within(alert).getAllByRole("listitem")).toHaveLength(3);
    expect(alert).not.toHaveClass("fixed");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /** VEN-CONF-02-A: the approval alert remains visible if a conflict response has no structured blocker list. */
  it("VEN-CONF-02-A SPM-56 shows the approval conflict alert when blocker details are unavailable", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest()] as never)
      .mockRejectedValueOnce(new ApiError(
        "This slot can no longer be approved because it conflicts with another booking. Check availability again before approving.",
        undefined,
        "BOOKING_SLOT_CONFLICT",
        409,
      ));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("conflicts with another booking");
    expect(within(alert).queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /** VEN-CONF-02-VAR-3: a successful decision after a conflict clears the stale conflict alert. */
  it("VEN-CONF-02-VAR-3 SPM-56 clears the conflict alert after a subsequent successful decision", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest()] as never)
      .mockRejectedValueOnce(new ApiError(
        "This slot can no longer be approved because it conflicts with another booking.",
        undefined,
        "BOOKING_SLOT_CONFLICT",
        409,
      ))
      .mockResolvedValueOnce({ holdExpiresAt: undefined } as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("conflicts with another booking");

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  /** VEN-REV-06-B: a reason typed and rejected for one request, with its error, does not carry into the next request's dialog. */
  it("SPM-55 AC6 starts a fresh dialog with no reason or error for another request", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([
        pendingRequest({ id: "booking-1", eventName: "Gala" }),
        pendingRequest({ id: "booking-2", eventName: "Workshop" }),
      ] as never)
      .mockRejectedValueOnce(
        new ApiError("This booking request is already rejected and can no longer be approved or rejected.", undefined, "BOOKING_ALREADY_DECIDED", 409),
      );
    renderPage();

    await user.click((await screen.findAllByRole("button", { name: "Review Details" }))[0]);
    await user.click(screen.getByLabelText(/Reject — provide reason/));
    await user.type(screen.getByLabelText(/Rejection reason/), "Clash with maintenance");
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: "Review Details" })[1]);
    expect(screen.getByRole("dialog")).toHaveTextContent("Workshop");
    expect(screen.getByLabelText(/Reject — provide reason/)).not.toBeChecked();
    expect(screen.queryByLabelText(/Rejection reason/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /** VEN-REV-06-A: a non-ApiError failure during a decision falls back to a generic message. */
  it("SPM-55 AC6 shows a generic message when a decision fails unexpectedly", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest()] as never)
      .mockRejectedValueOnce("offline");
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to submit this decision.");
  });

  /** VEN-REV-04-A: a coordinator sees the stored rejection reason on a rejected request. */
  it("SPM-55 AC4 shows the rejection reason on a rejected coordinator booking", async () => {
    apiMock.mockResolvedValueOnce([
      { ...booking, status: "rejected", rejectionReason: "Clashes with maintenance" },
    ] as never);
    renderPage();

    expect(await screen.findByText("Rejection reason: Clashes with maintenance")).toBeInTheDocument();
  });

  /** VEN-REV-04-A: a rejected booking with no stored reason says so rather than showing a blank reason. */
  it("SPM-55 AC4 notes when a rejected booking has no stored reason", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "rejected" }] as never);
    renderPage();

    expect(await screen.findByText("Rejection reason: Not provided")).toBeInTheDocument();
  });

  /** VEN-REV-04-A: the coordinator card names the Venue Staff member who manages the venue, when one is returned. */
  it("SPM-55 AC1 shows the managing Venue Staff name on a coordinator booking", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, venueStaffName: "Venue Staff One" }] as never);
    renderPage();

    expect(await screen.findByText("Managed by Venue Staff One")).toBeInTheDocument();
  });

  /** VEN-REV-04-B: an approved coordinator booking shows its status without a rejection reason. */
  it("SPM-55 AC4 omits the rejection reason for an approved coordinator booking", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "approved" }] as never);
    renderPage();

    await screen.findByText("Venue: Main Hall");
    expect(screen.queryByText(/Rejection reason/)).not.toBeInTheDocument();
  });

  /** VEN-REV-04-B: a pending coordinator booking never shows a rejection reason, even when a stale reason is stored. */
  it("SPM-55 AC4 hides the rejection reason on a pending coordinator booking", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "pending", rejectionReason: "Stale reason" }] as never);
    renderPage();

    await screen.findByText("Venue: Main Hall");
    expect(screen.queryByText(/Rejection reason/)).not.toBeInTheDocument();
  });

  /** VEN-REV-04-B: a cancelled coordinator booking never shows a rejection reason, even when a stale reason is stored. */
  it("SPM-55 AC4 hides the rejection reason on a cancelled coordinator booking", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "cancelled", rejectionReason: "Stale reason" }] as never);
    renderPage();

    await screen.findByText("Venue: Main Hall");
    expect(screen.queryByText(/Rejection reason/)).not.toBeInTheDocument();
  });

  /** VEN-BKG-09-A: a non-confirmation cancellation failure leaves the active history row visible with an error. */
  it("VEN-BKG-04-B SPM-54 reports a cancellation failure without changing booking status", async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce([booking] as never)
      .mockRejectedValueOnce(new Error("Cancellation failed"));
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Cancel booking" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cancellation failed",
    );
    expect(screen.getByText("Venue: Main Hall")).toBeInTheDocument();
  });

  /** VEN-BKG-09-A: canceling one venue booking retains the other active event booking unchanged. */
  it("VEN-BKG-09-A SPM-54 updates only the selected row after cancellation", async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce([
        booking,
        {
          ...booking,
          id: "booking-2",
          venueName: "Garden Hall",
          eventName: "Gala",
          start: "2030-01-13T04:00:00.000Z",
          end: "2030-01-13T05:00:00.000Z",
        },
      ] as never)
      .mockResolvedValueOnce({ id: booking.id, status: "cancelled" } as never);
    renderPage();

    await user.click(
      (await screen.findAllByRole("button", { name: "Cancel booking" }))[0],
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );

    expect(
      await screen.findByText("cancelled", { selector: "span" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Venue: Garden Hall")).toBeInTheDocument();
  });

  /** VEN-BKG-09-A: an unstructured cancellation failure gets a safe generic message and leaves history unchanged. */
  it("VEN-BKG-04-B SPM-54 reports an unknown cancellation failure without changing status", async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce([booking] as never)
      .mockRejectedValueOnce("offline");
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Cancel booking" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to cancel this booking.",
    );
    expect(screen.getByText("Venue: Main Hall")).toBeInTheDocument();
  });

  /** VEN-BKG-10-A: last active booking requires explicit confirmation and a declined confirmation leaves it pending. */
  it("VEN-BKG-10-B VEN-BKG-10-VAR-2 SPM-54 requires confirmation for the last active booking and leaves it unchanged when declined", async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce([booking] as never)
      .mockRejectedValueOnce(
        new ApiError(
          "Confirm cancellation",
          undefined,
          "LAST_ACTIVE_VENUE_BOOKING",
          409,
        ),
      );
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "Cancel booking" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "no pending or confirmed venue booking",
    );
    await user.click(screen.getByRole("button", { name: "Keep booking" }));
    await waitFor(() =>
      expect(screen.getByText("Venue: Main Hall")).toBeInTheDocument(),
    );
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /** VEN-BKG-10-B: confirming the explicit last-booking warning sends confirmation and retains a cancelled history row. */
  it("VEN-BKG-10-A VEN-BKG-10-SEC-1 SPM-54 cancels only after the user explicitly confirms", async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce([booking] as never)
      .mockRejectedValueOnce(
        new ApiError(
          "Confirm cancellation",
          undefined,
          "LAST_ACTIVE_VENUE_BOOKING",
          409,
        ),
      )
      .mockResolvedValueOnce({ id: booking.id, status: "cancelled" } as never);
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "Cancel booking" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("cancelled", { selector: "span" }),
      ).toBeInTheDocument(),
    );
    expect(apiMock).toHaveBeenLastCalledWith(
      "/venues/bookings/booking-1/cancel",
      { method: "POST", body: JSON.stringify({ confirmed: true }) },
    );
  });

  /** VEN-BKG-10-C: a sole confirmed booking is active and requires the same explicit confirmation as a pending booking. */
  it("VEN-BKG-10-C SPM-54 warns before cancelling the sole confirmed booking", async () => {
    const confirmedBooking = { ...booking, status: "approved" as const };
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce([confirmedBooking] as never)
      .mockRejectedValueOnce(
        new ApiError("Confirm cancellation", undefined, "LAST_ACTIVE_VENUE_BOOKING", 409),
      );
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Cancel booking" }));
    await user.click(await screen.findByRole("button", { name: "Confirm cancellation" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("no pending or confirmed venue booking");
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /** VEN-BKG-06-B: leaving the replacement search unopened does not issue a new booking request or remove original history. */
  it("VEN-BKG-06-B SPM-54 preserves the affected booking when replacement search is abandoned", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, affected: true }] as never);
    renderPage();

    expect(await screen.findByText("Venue: Main Hall")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a replacement venue" })).toHaveAttribute("href", "/venues?eventId=event-1");
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  /** VEN-REV-08-A: each status filter shows only the bookings in that status, and All statuses shows pending, approved and rejected together. */
  it("SPM-55 AC1 isolates each status in the Venue Staff filter and All statuses shows every status", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([
      pendingRequest({ id: "booking-p", eventName: "Pending Event", status: "pending" }),
      pendingRequest({ id: "booking-a", eventName: "Approved Event", status: "approved" }),
      pendingRequest({ id: "booking-r", eventName: "Rejected Event", status: "rejected", rejectionReason: "Clashes with maintenance" }),
    ] as never);
    renderPage();

    // The default filter is Pending, so only the pending request is listed.
    expect(await screen.findByText("Pending Event")).toBeInTheDocument();
    expect(screen.queryByText("Approved Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejected Event")).not.toBeInTheDocument();
    // A pending card never carries a rejection reason (the reason is shown only on rejected cards).
    expect(screen.queryByText(/Rejection reason/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status filter"), "Approved");
    expect(screen.getByText("Approved Event")).toBeInTheDocument();
    expect(screen.queryByText("Pending Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejected Event")).not.toBeInTheDocument();
    // An approved card never carries a rejection reason.
    expect(screen.queryByText(/Rejection reason/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status filter"), "Rejected");
    expect(screen.getByText("Rejected Event")).toBeInTheDocument();
    expect(screen.queryByText("Pending Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved Event")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status filter"), "All statuses");
    expect(screen.getByText("Pending Event")).toBeInTheDocument();
    expect(screen.getByText("Approved Event")).toBeInTheDocument();
    expect(screen.getByText("Rejected Event")).toBeInTheDocument();
  });

  /** VEN-REV-08-B: approving one request changes only that row in place to Approved; the other request stays pending. */
  it("SPM-55 AC2 updates only the approved row in place and leaves the other request pending", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([
        pendingRequest({ id: "booking-1", eventName: "Gala" }),
        pendingRequest({ id: "booking-2", eventName: "Workshop" }),
      ] as never)
      .mockResolvedValueOnce({ id: "booking-1", status: "approved" } as never);
    renderPage();

    await user.click((await screen.findAllByRole("button", { name: "Review Details" }))[0]);
    await user.click(screen.getByLabelText(/Approve — accept booking/));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // The approved row leaves the default Pending view; All statuses shows it in place with its new status.
    await user.selectOptions(screen.getByLabelText("Status filter"), "All statuses");
    const galaCard = screen.getByRole("heading", { name: "Gala" }).closest("div.rounded-xl") as HTMLElement;
    const workshopCard = screen.getByRole("heading", { name: "Workshop" }).closest("div.rounded-xl") as HTMLElement;
    expect(within(galaCard).getByText("Approved", { selector: "span" })).toBeInTheDocument();
    expect(within(galaCard).getByRole("button", { name: "View Details" })).toBeInTheDocument();
    expect(within(workshopCard).getByText("Pending", { selector: "span" })).toBeInTheDocument();
    expect(within(workshopCard).getByRole("button", { name: "Review Details" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /** VEN-REV-08-C: after a rejection the card shows the entered reason and a Rejected badge. */
  it("SPM-55 AC3 shows the entered rejection reason and a Rejected badge on the card after rejecting", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock
      .mockResolvedValueOnce([pendingRequest()] as never)
      .mockResolvedValueOnce({ id: "booking-1", status: "rejected" } as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Review Details" }));
    await user.click(screen.getByLabelText(/Reject — provide reason/));
    await user.type(screen.getByLabelText(/Rejection reason/), "Clashes with maintenance");
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("Status filter"), "Rejected");
    const card = screen.getByRole("heading", { name: "Gala" }).closest("div.rounded-xl") as HTMLElement;
    expect(within(card).getByText("Rejection reason: Clashes with maintenance")).toBeInTheDocument();
    expect(within(card).getByText("Rejected", { selector: "span" })).toBeInTheDocument();
  });

  /** VEN-REV-08-D: a rejected request stored without a reason shows the Not provided fallback on its card. */
  it("SPM-55 AC3 shows Not provided on a rejected card when no reason is stored", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ status: "rejected" })] as never);
    renderPage();

    await user.selectOptions(screen.getByLabelText("Status filter"), "Rejected");
    expect(await screen.findByText("Rejection reason: Not provided")).toBeInTheDocument();
  });

  /** VEN-REV-08-E: an approved request opens read-only, with the decision shown and no Approve, Reject or Submit controls. */
  it("SPM-55 AC6 opens an approved request read-only with no decision controls", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ status: "approved", eventName: "Approved Gala" })] as never);
    renderPage();

    await user.selectOptions(screen.getByLabelText("Status filter"), "Approved");
    await user.click(await screen.findByRole("button", { name: "View Details" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Booking Request — Approved Gala");
    expect(dialog).toHaveTextContent("Decision: approved");
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Submit Decision" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/Rejection reason/)).not.toBeInTheDocument();
  });

  /** VEN-REV-08-F: a rejected request opens read-only, showing its stored reason with no Approve, Reject or Submit controls. */
  it("SPM-55 AC6 opens a rejected request read-only and shows its stored reason", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([
      pendingRequest({ status: "rejected", eventName: "Rejected Gala", rejectionReason: "Clashes with maintenance" }),
    ] as never);
    renderPage();

    await user.selectOptions(screen.getByLabelText("Status filter"), "Rejected");
    await user.click(await screen.findByRole("button", { name: "View Details" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Rejection reason: Clashes with maintenance")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Decision: rejected");
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Submit Decision" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  /** VEN-REV-08-G: a rejected request with no stored reason shows the Not provided fallback in its read-only dialog. */
  it("SPM-55 AC6 shows Not provided in the read-only dialog for a rejected request without a stored reason", async () => {
    const user = userEvent.setup();
    setVenueStaff();
    apiMock.mockResolvedValueOnce([pendingRequest({ status: "rejected", eventName: "Unexplained Gala" })] as never);
    renderPage();

    await user.selectOptions(screen.getByLabelText("Status filter"), "Rejected");
    await user.click(await screen.findByRole("button", { name: "View Details" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Rejection reason: Not provided")).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
  });

  /** VEN-REV-09-C: a user with both Venue Staff and Coordinator roles sees the staff review list and the coordinator bookings together. */
  it("SPM-55 AC1 shows both the staff review list and the coordinator bookings to a user with both roles", async () => {
    useAppStore.setState({
      currentUser: {
        id: "coor-venue-1",
        name: "Coor Venue",
        email: "coor-venue@example.test",
        role: "coordinator",
        roles: ["coordinator", "venue_staff"],
      },
      bookings: [],
    });
    // Both endpoints answer, so the page can load the review list and the coordinator bookings for the same user.
    apiMock.mockImplementation((async (path: string) => {
      if (path === "/venues/bookings/pending")
        return [pendingRequest({ id: "review-1", eventName: "Review Event", coordinatorName: "Coordinator Two" })];
      if (path === "/venues/bookings/mine")
        return [{ ...booking, id: "mine-1", eventName: "Coordinator Event", venueName: "Garden Hall", status: "approved" }];
      throw new Error(`Unexpected request ${path}`);
    }) as never);
    renderPage();

    // Staff review section: the card shows the coordinator and the Review Details action.
    expect(await screen.findByText("Coordinator: Coordinator Two")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Details" })).toBeInTheDocument();
    // Coordinator section: the booking's venue and event heading are rendered as well.
    expect(await screen.findByText("Venue: Garden Hall")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Coordinator Event" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/venues/bookings/pending");
    expect(apiMock).toHaveBeenCalledWith("/venues/bookings/mine");
  });

  /** VEN-REV-09-D: a failed coordinator load stays visible for a dual-role user when the Venue Staff load succeeds afterwards. */
  it("SPM-55 AC1 keeps the coordinator load error visible when the staff load succeeds afterwards for a user with both roles", async () => {
    useAppStore.setState({
      currentUser: {
        id: "coor-venue-2",
        name: "Coor Venue",
        email: "coor-venue-2@example.test",
        role: "coordinator",
        roles: ["coordinator", "venue_staff"],
      },
      bookings: [],
    });
    // The staff request stays open until the coordinator error is on screen, so the staff success lands after it.
    let resolvePending!: (rows: unknown[]) => void;
    const pendingResponse = new Promise<unknown[]>((resolve) => {
      resolvePending = resolve;
    });
    apiMock.mockImplementation((async (path: string) => {
      if (path === "/venues/bookings/mine") throw new Error("Coordinator service unavailable");
      if (path === "/venues/bookings/pending") return pendingResponse;
      throw new Error(`Unexpected request ${path}`);
    }) as never);
    renderPage();

    expect(await screen.findByText("Unable to load your venue bookings.")).toBeInTheDocument();
    resolvePending([pendingRequest({ id: "review-2", eventName: "Review Event", coordinatorName: "Coordinator Three" })]);

    // Wait until the staff success has rendered its review card, then check the coordinator error survived it.
    expect(await screen.findByText("Coordinator: Coordinator Three")).toBeInTheDocument();
    expect(screen.getByText("Unable to load your venue bookings.")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/venues/bookings/pending");
    expect(apiMock).toHaveBeenCalledWith("/venues/bookings/mine");
  });
});

// ---------------------------------------------------------------------------------------------------------
// SPM-137 AC3: the notification bell links to /bookings?booking=<id>. The Coordinator's Bookings page opens a
// read-only details dialog for that booking (status and, if rejected, the rejection reason; SPM-55 AC4), handles an
// unknown or not-visible id without breaking the page, and removes the link from the address when the dialog closes.
// Unit tests of the page with the API stubbed; the signed-in user is set directly in the store (a fixture).
// ---------------------------------------------------------------------------------------------------------
describe("Coordinator booking opened from a notification (SPM-137 AC3)", () => {
  const second = { ...booking, id: "booking-2", eventId: "event-2", eventName: "Dinner", venueName: "Orchid Hall", bookingReference: "VB-BOOKING2" };
  const detailsDialog = () => screen.findByRole("dialog", { name: /Booking details/ });

  /**
   * VENUE-BOOK-NOTIF-03-D (SPM-137 AC3): /bookings?booking=booking-1 opens that booking's details: event, venue,
   * slot (Singapore time), reference and its current status (approved), with no decision controls.
   * Kills: no dialog for the linked id, the wrong booking opened, decision controls shown to a Coordinator.
   */
  it("VENUE-BOOK-NOTIF-03-D opens the linked booking's details with its status and no decision controls", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "approved", specialRequest: "Two microphones" }, second] as never);

    renderPage("/bookings?booking=booking-1");

    const dialog = await detailsDialog();
    expect(dialog).toHaveTextContent("Gala");
    expect(within(dialog).getByText("Two microphones")).toBeInTheDocument();
    expect(within(dialog).getByText("Main Hall")).toBeInTheDocument();
    expect(within(dialog).getByText("12 Jan 2030, 12:00 – 12 Jan 2030, 13:00 SGT")).toBeInTheDocument();
    expect(within(dialog).getByText("VB-BOOKING1")).toBeInTheDocument();
    expect(within(dialog).getByText("approved")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Rejection reason/)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Submit Decision|Approve|Reject/ })).toBeNull();
    // The other booking's details are not shown in the dialog.
    expect(within(dialog).queryByText("VB-BOOKING2")).toBeNull();
  });

  /**
   * VENUE-BOOK-NOTIF-03-G (SPM-137 AC3, SPM-55 AC4): a rejected booking's details show its status and the rejection reason.
   * Kills: dropping the rejection reason from the details.
   */
  it("VENUE-BOOK-NOTIF-03-G shows the rejection reason in the details of a rejected booking", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "rejected", rejectionReason: "Clashes with maintenance" }] as never);

    renderPage("/bookings?booking=booking-1");

    const dialog = await detailsDialog();
    expect(within(dialog).getByText("rejected")).toBeInTheDocument();
    expect(within(dialog).getByText("Rejection reason: Clashes with maintenance")).toBeInTheDocument();
  });

  /**
   * VENUE-BOOK-NOTIF-03-G (SPM-137 AC3, SPM-55 AC4): a rejected booking with no stored reason says "Not provided"
   * rather than leaving the reason blank.
   * Kills: a blank or "undefined" reason in the details.
   */
  it("VENUE-BOOK-NOTIF-03-G says Not provided when a rejected booking has no stored reason", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "rejected" }] as never);

    renderPage("/bookings?booking=booking-1");

    expect(within(await detailsDialog()).getByText("Rejection reason: Not provided")).toBeInTheDocument();
  });

  /**
   * VENUE-BOOK-NOTIF-03-H (SPM-137 AC3, robustness): an id that is not in the Coordinator's bookings (unknown, deleted
   * or the event was reassigned away) opens no dialog, shows a clear notice and leaves the bookings list working.
   * The same notice shows when the Coordinator has no bookings at all (an empty list loaded).
   * Kills: a crash, a blank dialog, or a silent page with no explanation for an unknown id; hiding the notice when
   * the loaded list is empty.
   */
  it("VENUE-BOOK-NOTIF-03-H shows a notice and the normal list when the linked booking is not visible", async () => {
    apiMock.mockResolvedValueOnce([booking] as never);

    renderPage("/bookings?booking=booking-gone");

    // SC-SPM137-02: the exact wording confirmed by the story owner.
    expect(
      await screen.findByText("That booking is no longer available to you. Its event may have been reassigned to another Coordinator."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Venue: Main Hall")).toBeInTheDocument();

    // Dismissing the notice takes the unknown id out of the address.
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/no longer available to you/i)).toBeNull();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/bookings$/);

    // A Coordinator with no bookings at all gets the same notice for the link.
    cleanup();
    apiMock.mockResolvedValueOnce([] as never);
    renderPage("/bookings?booking=booking-gone");
    expect(await screen.findByText(/no longer available to you/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /**
   * VENUE-BOOK-NOTIF-03-I (SPM-137 AC3, robustness): while the bookings are still loading, nothing is claimed about the
   * linked booking; when the load fails the usual error shows and no "not available" notice is added.
   * Kills: flashing the not-available notice before the list arrives, or saying the booking is gone when it was never loaded.
   */
  it("VENUE-BOOK-NOTIF-03-I makes no not-available claim while loading or when the load fails", async () => {
    const pending = deferred<unknown>();
    apiMock.mockReturnValueOnce(pending.promise as never);

    renderPage("/bookings?booking=booking-1");
    expect(screen.queryByText(/no longer available to you/i)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    pending.reject(new Error("network down"));
    expect(await screen.findByText("Unable to load your venue bookings.")).toBeInTheDocument();
    expect(screen.queryByText(/no longer available to you/i)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /**
   * VENUE-BOOK-NOTIF-03-J (SPM-137 AC3): closing the details removes ?booking from the address, so a reload does not
   * reopen it, and the dialog is gone. The address is replaced, not added to the history, so the back button does not
   * step back to the ?booking address either (checked as a REPLACE navigation on a memory router).
   * Kills: the dialog closing but the query string staying, the dialog not closing, or closing adding a history entry.
   */
  it("VENUE-BOOK-NOTIF-03-J closing the details clears the booking from the address", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "approved" }] as never);
    const router = createMemoryRouter([{ path: "/bookings", element: <BookingsPage /> }], {
      initialEntries: ["/bookings?booking=booking-1"],
    });
    render(<RouterProvider router={router} />);
    await detailsDialog();
    expect(router.state.location.search).toBe("?booking=booking-1");

    await userEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.search).toBe("");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  /**
   * VENUE-BOOK-NOTIF-03-K (SPM-137 AC3): with the page already open, following a notification for another booking
   * switches the details to that booking.
   * Kills: reading the address only once on mount, so a second notification click is ignored.
   */
  it("VENUE-BOOK-NOTIF-03-K switches to another booking when the address changes while the page is open", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "approved" }, { ...second, status: "rejected", rejectionReason: "Too small" }] as never);
    renderPage("/bookings?booking=booking-1");
    expect(await detailsDialog()).toHaveTextContent("VB-BOOKING1");

    await userEvent.click(screen.getByRole("link", { name: "Go to booking 2" }));

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("VB-BOOKING2"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Rejection reason: Too small");
  });

  /**
   * VENUE-BOOK-NOTIF-03-L (SPM-137 AC3): a booking the Coordinator cancelled since the decision still opens, showing
   * its current status (cancelled) and no rejection reason.
   * Kills: showing the status from the notification time instead of the current status.
   */
  it("VENUE-BOOK-NOTIF-03-L shows the current status of a booking cancelled after the decision", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, status: "cancelled", rejectionReason: "Stale reason" }] as never);

    renderPage("/bookings?booking=booking-1");

    const dialog = await detailsDialog();
    expect(within(dialog).getByText("cancelled")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Rejection reason/)).toBeNull();
  });

  /**
   * VENUE-BOOK-NOTIF-03-M (SPM-137 AC3, permission): a Venue Staff member who is not a Coordinator never loads the
   * Coordinator bookings, so a ?booking link opens no details and shows no notice.
   * Kills: opening Coordinator details (or the not-available notice) for a staff-only user.
   */
  it("VENUE-BOOK-NOTIF-03-M ignores the booking link for a Venue Staff user who is not a Coordinator", async () => {
    setVenueStaff();
    apiMock.mockResolvedValue([] as never);

    renderPage("/bookings?booking=booking-1");

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/venues/bookings/pending"));
    expect(apiMock).not.toHaveBeenCalledWith("/venues/bookings/mine");
    expect(screen.queryByText(/no longer available to you/i)).toBeNull();
    expect(screen.queryByRole("dialog", { name: /Booking details/ })).toBeNull();
  });
});

/*
 * SPM-125 AC7: a notice that a venue change affects a booking opens `/bookings?booking=<id>` (the SPM-137 link), and
 * the booking's details offer the same "Find a replacement venue" search as its card (SPM-54 AC5). Frontend unit test
 * with the API stubbed; the Coordinator is a fixture, not a live login.
 */
describe("SPM-125 affected booking opened from a notification", () => {
  /**
   * VEN-IMPACT-07-D (AC7): the linked affected booking opens in its details dialog, which says the booking is affected
   * and links "Find a replacement venue" to the venue search for that event.
   * Kills: the link landing on the list without a way to find a replacement from the booking it is about.
   */
  it("VEN-IMPACT-07-D shows the linked affected booking with Find a replacement venue", async () => {
    apiMock.mockResolvedValue([
      booking,
      { ...booking, id: "booking-2", eventId: "event-2", eventName: "Spring Gala", status: "approved", affected: true },
    ] as never);

    renderPage("/bookings?booking=booking-2");

    const dialog = await screen.findByRole("dialog", { name: "Booking details — Spring Gala" });
    expect(within(dialog).getByText("⚠ This booking is affected by a venue availability change.")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Find a replacement venue" })).toHaveAttribute(
      "href",
      "/venues?eventId=event-2",
    );
  });

  /**
   * VEN-IMPACT-07-BND-1 (AC7): a confirmed booking that no venue change affects opens without the warning or the
   * replacement link (the dialog follows the card's rule).
   */
  it("VEN-IMPACT-07-BND-1 offers no replacement for an unaffected confirmed booking", async () => {
    apiMock.mockResolvedValue([{ ...booking, status: "approved" }] as never);

    renderPage("/bookings?booking=booking-1");

    const dialog = await screen.findByRole("dialog", { name: "Booking details — Gala" });
    expect(within(dialog).queryByText(/affected by a venue availability change/)).toBeNull();
    expect(within(dialog).queryByRole("link", { name: "Find a replacement venue" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------
// SPM-165 AC3: the bell's link for a tentative hold decision opens the same read-only details dialog (SPM-137), which for
// a hold also shows that it is a tentative hold and, once approved, when the hold expires (SPM-159), and for a
// rejected hold the rejection reason. Unit tests of the page with the API stubbed; the user is a store fixture.
// ---------------------------------------------------------------------------------------------------------
describe("Coordinator tentative hold opened from a notification (SPM-165 AC3)", () => {
  const hold = { ...booking, id: "hold-1", requestKind: "tentative_hold" as const, holdExpired: false };
  const detailsDialog = () => screen.findByRole("dialog", { name: /Booking details/ });

  /**
   * VENUE-HOLD-NOTIF-03-D (SPM-165 AC3): /bookings?booking=hold-1 opens an approved hold's details with its status and
   * the hold expiry time (Singapore time), and no decision controls.
   * Kills: no expiry for an approved hold, a wrong time zone, decision controls shown to a Coordinator.
   */
  it("VENUE-HOLD-NOTIF-03-D opens an approved hold's details with its status and hold expiry", async () => {
    apiMock.mockResolvedValueOnce([{ ...hold, status: "approved", holdExpiresAt: "2030-01-24T12:00:00.000Z" }] as never);

    renderPage("/bookings?booking=hold-1");

    const dialog = await detailsDialog();
    expect(within(dialog).getByText("approved")).toBeInTheDocument();
    expect(within(dialog).getByText("Tentative hold")).toBeInTheDocument();
    expect(within(dialog).getByText("Hold expires")).toBeInTheDocument();
    expect(within(dialog).getByText("24 Jan 2030, 20:00 SGT")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Submit Decision|Approve|Reject/ })).toBeNull();
  });

  /**
   * VENUE-HOLD-NOTIF-03-E (SPM-165 AC3): a rejected hold's details show its status and the rejection reason and no hold expiry.
   * Kills: dropping the rejection reason, showing an expiry for a hold that was never active.
   */
  it("VENUE-HOLD-NOTIF-03-E shows the rejection reason and no expiry in the details of a rejected hold", async () => {
    // A rejected hold carries a stale expiry in the data on purpose: it must still not be shown.
    apiMock.mockResolvedValueOnce([{ ...hold, status: "rejected", rejectionReason: "Clashes with maintenance", holdExpiresAt: "2030-01-24T12:00:00.000Z" }] as never);

    renderPage("/bookings?booking=hold-1");

    const dialog = await detailsDialog();
    expect(within(dialog).getByText("rejected")).toBeInTheDocument();
    expect(within(dialog).getByText("Rejection reason: Clashes with maintenance")).toBeInTheDocument();
    expect(within(dialog).queryByText("Hold expires")).toBeNull();
  });

  /**
   * VENUE-HOLD-NOTIF-03-F (SPM-165 AC3, boundary): an approved hold whose expiry time is no longer in the future (the
   * hold expired since the decision) is shown as expired, and an ordinary booking never shows a hold line.
   * Kills: labelling an expired hold as active, hold lines on a normal booking.
   */
  it("VENUE-HOLD-NOTIF-03-F labels an expired hold as expired and a normal booking shows no hold line", async () => {
    apiMock.mockResolvedValueOnce([{ ...hold, status: "approved", holdExpiresAt: "2030-01-09T12:00:00.000Z", holdExpired: true }] as never);

    const view = renderPage("/bookings?booking=hold-1");

    const dialog = await detailsDialog();
    expect(within(dialog).getByText("Hold expired")).toBeInTheDocument();
    expect(within(dialog).queryByText("Hold expires")).toBeNull();

    view.unmount();
    apiMock.mockResolvedValueOnce([{ ...booking, requestKind: "booking", status: "approved" }] as never);
    renderPage("/bookings?booking=booking-1");
    const normal = await detailsDialog();
    expect(within(normal).queryByText(/Tentative hold|Hold expire/)).toBeNull();
  });

  /**
   * VENUE-HOLD-NOTIF-03-I (SPM-165 AC3, SPM-132 integration): a hold the SPM-132 scheduler has persisted as expired
   * (status 'expired') still shows "Hold expired" with its expiry in Singapore time; a released hold shows no expiry
   * line; a converted hold (now a booking) shows no hold lines.
   * Kills: hiding the expiry once the status is 'expired', showing an expiry for a released hold, hold lines after conversion.
   */
  it("VENUE-HOLD-NOTIF-03-I shows Hold expired for a persisted expired hold, none for released or converted", async () => {
    apiMock.mockResolvedValueOnce([{ ...hold, status: "expired", holdExpiresAt: "2030-01-09T12:00:00.000Z", holdExpired: true }] as never);
    const first = renderPage("/bookings?booking=hold-1");
    const expired = await detailsDialog();
    expect(within(expired).getByText("Hold expired")).toBeInTheDocument();
    expect(within(expired).getByText("09 Jan 2030, 20:00 SGT")).toBeInTheDocument();
    first.unmount();

    apiMock.mockResolvedValueOnce([{ ...hold, status: "released", holdExpiresAt: "2030-01-24T12:00:00.000Z" }] as never);
    const second = renderPage("/bookings?booking=hold-1");
    const released = await detailsDialog();
    expect(within(released).getByText("released")).toBeInTheDocument();
    expect(within(released).queryByText(/Hold expire/)).toBeNull();
    second.unmount();

    apiMock.mockResolvedValueOnce([{ ...hold, requestKind: "booking", status: "approved", holdExpiresAt: undefined }] as never);
    renderPage("/bookings?booking=hold-1");
    const converted = await detailsDialog();
    expect(within(converted).queryByText(/Tentative hold|Hold expire/)).toBeNull();
  });
});
