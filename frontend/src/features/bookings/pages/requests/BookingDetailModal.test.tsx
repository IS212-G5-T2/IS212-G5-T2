import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Booking } from "@/types";
import { BookingDetailModal } from "./BookingDetailModal";

const pending: Booking = {
  id: "booking-1", eventId: "event-1", eventName: "Accessible hybrid seminar",
  venueId: "venue-1", venueName: "Sample Birch Lecture Hall", requestedBy: "Coordinator 1",
  start: "2030-01-12T04:00:00Z", end: "2030-01-12T05:00:00Z", status: "pending",
  createdAt: "2030-01-01T00:00:00Z",
};

describe("BookingDetailModal pending decisions", () => {
  /** SPM-54 AC8: coordinators see pending review status and cannot make Venue Staff decisions. */
  it("shows pending review status without approval or rejection controls", () => {
    render(<BookingDetailModal booking={pending} onClose={vi.fn()} />);

    expect(screen.getByText(/This request is pending review by Venue Staff\./)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /approve|reject/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|reject|submit decision/i })).not.toBeInTheDocument();
  });
});
