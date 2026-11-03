import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingBookingRequest } from "@/types";
import { BookingDetailModal } from "./BookingDetailModal";

vi.mock("@/components/ui/Modal", () => ({
  Modal: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      <div data-testid="modal-body">{children}</div>
      <div data-testid="modal-footer">{footer}</div>
    </div>
  ),
}));
vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/FormControls", () => ({
  RadioGroup: () => <div />,
  TextArea: () => <div />,
}));
vi.mock("@/utils/format", () => ({
  formatSingaporeDateTime: (s: string) => s,
  formatSingaporeRange: (a: string, b: string) => `${a}–${b}`,
}));
vi.mock("@/utils/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {},
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

describe("BookingDetailModal — useHoldExpiry integration (SPM-133)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * VEN-HOLD-EXP-01-COMP-3: BookingDetailModal shows Release/Convert buttons and "Active tentative hold"
   * label when hold is not expired.
   */
  it("VEN-HOLD-EXP-01-COMP-3 BookingDetailModal shows Release/Convert buttons and Active tentative hold label when hold is active", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const booking: PendingBookingRequest = {
      ...baseBooking,
      holdExpiresAt: future,
      holdExpired: false,
    };
    render(
      <BookingDetailModal
        booking={booking}
        onClose={() => {}}
        onDecided={() => {}}
        onConflict={() => {}}
        onHoldUpdated={() => {}}
      />,
    );
    expect(screen.getByText(/Active tentative hold/)).toBeTruthy();
    expect(screen.getByText(/Release hold/)).toBeTruthy();
    expect(screen.getByText(/Convert to confirmed booking/)).toBeTruthy();
  });

  /**
   * VEN-HOLD-EXP-05-COMP-4: BookingDetailModal shows only Close button and "Expired tentative hold"
   * label when holdExpired=true.
   */
  it("VEN-HOLD-EXP-05-COMP-4 BookingDetailModal shows only Close button and Expired tentative hold label when holdExpired=true", () => {
    const anyDate = new Date(Date.now() + 60_000).toISOString();
    const booking: PendingBookingRequest = {
      ...baseBooking,
      holdExpiresAt: anyDate,
      holdExpired: true,
    };
    render(
      <BookingDetailModal
        booking={booking}
        onClose={() => {}}
        onDecided={() => {}}
        onConflict={() => {}}
        onHoldUpdated={() => {}}
      />,
    );
    expect(screen.getByText(/Expired tentative hold/)).toBeTruthy();
    expect(screen.queryByText(/Release hold/)).toBeNull();
  });
});
