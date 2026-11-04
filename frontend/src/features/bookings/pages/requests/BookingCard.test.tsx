import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingBookingRequest } from "@/types";
import { BookingCard } from "./BookingCard";

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock("@/utils/format", () => ({
  formatSingaporeDateTime: (s: string) => s,
  formatSingaporeRange: (a: string, b: string) => `${a}–${b}`,
}));

const baseBooking: PendingBookingRequest = {
  id: "booking-1",
  eventId: "event-1",
  eventName: "Test Event",
  eventStart: "2030-01-01T09:00:00Z",
  eventEnd: "2030-01-01T17:00:00Z",
  venueName: "Test Venue",
  coordinatorName: "Test Coordinator",
  bookingReference: "REF-001",
  start: "2030-01-01T09:00:00Z",
  end: "2030-01-01T17:00:00Z",
  status: "approved",
  requestKind: "tentative_hold",
  holdExpired: false,
  specialRequest: null as unknown as undefined,
  reassessmentRequired: false,
  rejectionReason: null as unknown as undefined,
};

describe("BookingCard — useHoldExpiry integration (SPM-133)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * VEN-HOLD-EXP-01-COMP-1: BookingCard shows "Active tentative hold" when holdExpiresAt is in the future.
   */
  it("VEN-HOLD-EXP-01-COMP-1 BookingCard shows Active tentative hold when holdExpiresAt is future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const booking: PendingBookingRequest = { ...baseBooking, holdExpiresAt: future, holdExpired: false };
    render(<BookingCard booking={booking} onReview={() => {}} />);
    expect(screen.getByText(/Active tentative hold/)).toBeTruthy();
  });

  /**
   * VEN-HOLD-EXP-05-COMP-2: BookingCard shows "Expired tentative hold" when holdExpired=true.
   */
  it("VEN-HOLD-EXP-05-COMP-2 BookingCard shows Expired tentative hold when holdExpired=true", () => {
    const anyDate = new Date(Date.now() + 60_000).toISOString();
    const booking: PendingBookingRequest = { ...baseBooking, holdExpiresAt: anyDate, holdExpired: true };
    render(<BookingCard booking={booking} onReview={() => {}} />);
    expect(screen.getByText(/Expired tentative hold/)).toBeTruthy();
  });

  /**
   * VEN-HOLD-EXP-01-SUP-4: BookingCard shows "Expired tentative hold" after timer fires.
   */
  it("VEN-HOLD-EXP-01-SUP-4 BookingCard shows Expired tentative hold after timer fires", () => {
    const future = new Date(Date.now() + 5_000).toISOString();
    const booking: PendingBookingRequest = { ...baseBooking, holdExpiresAt: future, holdExpired: false };
    render(<BookingCard booking={booking} onReview={() => {}} />);
    expect(screen.getByText(/Active tentative hold/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText(/Expired tentative hold/)).toBeTruthy();
  });
});
