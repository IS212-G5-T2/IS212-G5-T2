import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingsPage } from "./BookingsPage";
import { useAppStore } from "@/store/useAppStore";
import { ApiError, api } from "@/utils/api";

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
    render(<BookingsPage />);
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
    render(<BookingsPage />);

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
    render(<BookingsPage />);
    await screen.findAllByText("Gala");

    await user.selectOptions(
      screen.getByLabelText("Status filter"),
      "cancelled",
    );

    expect(screen.getByText("Venue: Garden Hall")).toBeInTheDocument();
    expect(screen.queryByText("Venue: Main Hall")).not.toBeInTheDocument();
  });

  /** VEN-BKG-08-A: a failed booking-history request is reported without rendering phantom rows. */
  it("VEN-BKG-04-B VEN-BKG-08-A SPM-54 reports a booking list load failure", async () => {
    apiMock.mockRejectedValueOnce(new Error("Connection failed"));
    render(<BookingsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load your venue bookings.",
    );
    expect(
      screen.getByText("No bookings match this filter."),
    ).toBeInTheDocument();
  });

  /** VEN-BKG-08-A: the existing Venue Staff request list remains reviewable and does not load coordinator history. */
  it("VEN-BKG-08-SEC-1 SPM-54 keeps venue-staff booking review available without the coordinator endpoint", async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      currentUser: {
        id: "staff-1",
        name: "Venue Staff",
        email: "staff@example.test",
        role: "venue_staff",
        roles: ["venue_staff"],
      },
      bookings: [
        {
          ...booking,
          id: "older",
          eventName: "Older Event",
          createdAt: "2029-01-01T00:00:00.000Z",
          requestedBy: "Coordinator",
        },
        {
          ...booking,
          id: "newer",
          eventName: "Newer Event",
          createdAt: "2030-01-01T00:00:00.000Z",
          requestedBy: "Coordinator",
        },
      ],
    });
    render(<BookingsPage />);

    expect(await screen.findByText("Newer Event")).toBeInTheDocument();
    expect(screen.getByText("Older Event")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
    await user.click(
      screen.getAllByRole("button", { name: "Review Details" })[0],
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Booking Request — Newer Event",
    );
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /** VEN-BKG-09-A: a non-confirmation cancellation failure leaves the active history row visible with an error. */
  it("VEN-BKG-04-B SPM-54 reports a cancellation failure without changing booking status", async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce([booking] as never)
      .mockRejectedValueOnce(new Error("Cancellation failed"));
    render(<BookingsPage />);

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
    render(<BookingsPage />);

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
    render(<BookingsPage />);

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
    render(<BookingsPage />);
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
    render(<BookingsPage />);
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
    render(<BookingsPage />);

    await user.click(await screen.findByRole("button", { name: "Cancel booking" }));
    await user.click(await screen.findByRole("button", { name: "Confirm cancellation" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("no pending or confirmed venue booking");
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /** VEN-BKG-06-B: leaving the replacement search unopened does not issue a new booking request or remove original history. */
  it("VEN-BKG-06-B SPM-54 preserves the affected booking when replacement search is abandoned", async () => {
    apiMock.mockResolvedValueOnce([{ ...booking, affected: true }] as never);
    render(<BookingsPage />);

    expect(await screen.findByText("Venue: Main Hall")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a replacement venue" })).toHaveAttribute("href", "/venues?eventId=event-1");
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
});
