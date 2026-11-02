import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord } from "@/types";
import { VenueRecordDetailPage } from "./VenueRecordDetailPage";
import type { VenueRecord } from "../venue-records";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
vi.mock("./VenueScheduleCalendar", () => ({
  VenueScheduleCalendar: ({
    venue: calendarVenue,
  }: {
    venue: {
      reservations: Array<{
        eventName: string;
        status: string;
        holdExpiresAt?: string;
      }>;
    };
  }) => (
    <div role="region" aria-label="Venue schedule calendar">
      {calendarVenue.reservations.map((reservation, index) => (
        <p key={`${reservation.eventName}-${index}`}>
          {reservation.status === "booked" ? "Confirmed booking" : "Tentative hold"}: {reservation.eventName}
          {reservation.holdExpiresAt ? ` · hold expires ${reservation.holdExpiresAt}` : ""}
        </p>
      ))}
    </div>
  ),
}));

const apiMock = vi.mocked(api);
const VENUE_ID = "00000000-0000-4000-8000-000000000159";
const EVENT_ID = "00000000-0000-4000-8000-000000000158";
const venue: VenueRecord = {
  id: VENUE_ID,
  ownerId: "venue-staff-1",
  name: "Main Hall",
  location: "North Wing",
  capacity: 200,
  facilities: [],
  accessibility: [],
  layouts: [],
  operatingInformation: "",
  setupTimeMinutes: 60,
  turnaroundTimeMinutes: 30,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [],
};
const event: EventRecord = {
  id: EVENT_ID,
  name: "Innovation Showcase",
  purpose: "",
  description: "",
  organiserId: "organiser-1",
  organiserName: "Organiser",
  coordinatorId: "coordinator-1",
  coordinatorName: "Coordinator",
  status: "planning",
  startDateTime: "2030-01-25T10:00:00.000Z",
  endDateTime: "2030-01-25T12:00:00.000Z",
  expectedAttendance: 100,
  venueRequirements: {
    minCapacity: 50,
    accessibility: [],
    facilities: [],
    layout: "",
  },
  equipmentNeeds: "",
  registrationEnabled: false,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
const originalUser = useAppStore.getState().currentUser;
const originalEvents = useAppStore.getState().events;

function existingBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    eventId: EVENT_ID,
    eventName: event.name,
    venueId: VENUE_ID,
    venueName: venue.name,
    start: event.startDateTime,
    end: event.endDateTime,
    status: "pending",
    requestKind: "booking",
    bookingReference: "VB-BOOKING1",
    ...overrides,
  };
}

function renderPage(strictMode = false, role: "coordinator" | "venue_staff" = "coordinator") {
  useAppStore.setState({
    currentUser: {
      id: role === "venue_staff" ? "venue-staff-1" : "coordinator-1",
      name: role === "venue_staff" ? "Venue Staff" : "Coordinator",
      email: role === "venue_staff" ? "staff@example.test" : "coordinator@example.test",
      role,
    },
    events: [event],
  });
  const page = (
    <MemoryRouter
      initialEntries={[`/venue-records/${VENUE_ID}?eventId=${EVENT_ID}`]}
    >
      <Routes>
        <Route path="/venue-records/:id" element={<VenueRecordDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strictMode ? <StrictMode>{page}</StrictMode> : page);
}

beforeEach(() => {
  vi.resetAllMocks();
  apiMock.mockImplementation(async (path) => {
    if (path === "/venues/bookings/mine") return [] as never;
    return venue as never;
  });
});

afterEach(() => {
  cleanup();
  useAppStore.setState({ currentUser: originalUser, events: originalEvents });
});

describe("SPM-159 Coordinator tentative hold request", () => {
  /** VEN-HOLD-04-A: an approved active hold is listed as tentative until its expiry, while an expired hold is omitted. */
  it("VEN-HOLD-04-A shows an approved active hold in the venue list and omits an expired hold", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      return {
        ...venue,
        name: "Sample Meadow Conference Centre",
        reservations: [
          {
            id: "approved-hold",
            eventName: "Evening alumni networking",
            start: "2030-11-10T10:30:00Z",
            end: "2030-11-10T14:00:00Z",
            status: "tentative",
            holdExpiresAt: "2030-10-31T12:00:00Z",
            affectedByUnavailablePeriod: false,
          },
          {
            id: "expired-hold",
            eventName: "Expired rehearsal hold",
            start: "2030-11-11T10:30:00Z",
            end: "2030-11-11T12:00:00Z",
            status: "tentative",
            holdExpiresAt: "2020-01-01T00:00:00Z",
            affectedByUnavailablePeriod: false,
          },
        ],
      } as never;
    });

    renderPage();
    await screen.findByRole("heading", { name: "Sample Meadow Conference Centre" });

    const activeHoldLabels = screen.getAllByText("Evening alumni networking");
    expect(
      activeHoldLabels.some((label) => label.closest("li")?.textContent?.includes("Tentative hold")),
    ).toBe(true);
    expect(
      activeHoldLabels.some((label) => /hold expires/i.test(label.closest("li")?.textContent ?? "")),
    ).toBe(true);
    expect(screen.queryByText("Expired rehearsal hold")).not.toBeInTheDocument();
  });

  /** VEN-HOLD-04-A: the page passes active approved holds with expiry to its venue calendar and omits expired holds. */
  it("VEN-HOLD-04-A shows the active approved hold in the calendar until expiry", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      return {
        ...venue,
        reservations: [
          {
            id: "approved-active-hold",
            eventName: "Active calendar hold",
            start: "2030-11-10T10:30:00Z",
            end: "2030-11-10T14:00:00Z",
            status: "tentative",
            holdExpiresAt: "2030-11-01T12:00:00Z",
            affectedByUnavailablePeriod: false,
          },
          {
            id: "expired-calendar-hold",
            eventName: "Expired calendar hold",
            start: "2030-11-11T10:30:00Z",
            end: "2030-11-11T14:00:00Z",
            status: "tentative",
            holdExpiresAt: "2020-01-01T00:00:00Z",
            affectedByUnavailablePeriod: false,
          },
        ],
      } as never;
    });
    renderPage();

    const calendar = await screen.findByRole("region", { name: "Venue schedule calendar" });
    expect(within(calendar).getByText(/Tentative hold: Active calendar hold/)).toBeInTheDocument();
    expect(within(calendar).getByText(/hold expires/)).toBeInTheDocument();
    expect(within(calendar).queryByText(/Expired calendar hold/)).not.toBeInTheDocument();
  });

  /** VEN-HOLD-04-A: an approved hold remains visible before its expiry and disappears when the expiry instant arrives. */
  it("VEN-HOLD-04-A removes an approved hold from the schedule at its expiry", async () => {
    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T12:00:00.000Z"));
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      return {
        ...venue,
        reservations: [
          {
            id: "approved-expiring-hold",
            eventName: "Expiring approved hold",
            start: "2030-01-25T10:00:00.000Z",
            end: "2030-01-25T12:00:00.000Z",
            status: "tentative",
            holdExpiresAt: "2030-01-01T12:00:01.000Z",
            affectedByUnavailablePeriod: false,
          },
        ],
      } as never;
    });

    try {
      renderPage();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getAllByText("Expiring approved hold").length).toBeGreaterThan(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(screen.queryByText("Expiring approved hold")).not.toBeInTheDocument();
      expect(screen.getByText("No upcoming bookings or active tentative holds.")).toBeInTheDocument();
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.setSystemTime(realNow);
    }
  });

  /** VEN-HOLD-01-SUP-BOOKING: leaving Request holding unchecked keeps the existing ordinary booking request path. */
  it("VEN-HOLD-01-SUP-BOOKING submits an ordinary booking request from the shared action", async () => {
    apiMock.mockImplementation(async (path, init) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path === `/venues/${VENUE_ID}/booking-requests`) {
        expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
          eventId: EVENT_ID,
          start: expect.any(String),
          end: expect.any(String),
        });
        return {
          id: "booking-new",
          bookingReference: "VB-BOOKING1",
          statusChanged: false,
        } as never;
      }
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage();
    const review = await screen.findByRole("region", { name: "Review booking request" });
    expect(within(review).getByRole("checkbox", { name: /Request holding/ })).not.toBeChecked();
    await user.click(within(review).getByRole("button", { name: "Submit booking request" }));

    expect(await screen.findByText(/Booking request submitted\. Reference:/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Confirm tentative hold request" })).not.toBeInTheDocument();
  });

  /** VEN-HOLD-01-A/04-A: selecting Request holding switches the existing submit action into the confirmed hold flow. */
  it("VEN-HOLD-04-A confirms the hold option through the existing submit action", async () => {
    renderPage(true);

    const bookingReview = await screen.findByRole("region", {
      name: "Review booking request",
    });
    const bookingSubmit = within(bookingReview).getByRole("button", {
      name: "Submit booking request",
    });
    const requestHolding = within(bookingReview).getByRole("checkbox", {
      name: /Request holding/,
    });
    expect(requestHolding).not.toBeChecked();
    expect(screen.queryByRole("region", { name: "Request tentative hold" })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(requestHolding);
    await user.click(bookingSubmit);
    const confirmations = screen.getAllByRole("dialog", {
      name: "Confirm tentative hold request",
    });
    expect(confirmations).toHaveLength(1);
    const confirmation = confirmations[0];
    expect(confirmation).toHaveTextContent("60-minute setup");
    expect(confirmation).toHaveTextContent("30-minute turnaround");
    expect(confirmation).toHaveTextContent("14 days (336 hours) from approval");
    expect(confirmation).toHaveTextContent("does not make the venue hold active");
    expect(bookingReview).toHaveTextContent("Event period");
    await user.click(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      `/venues/${VENUE_ID}/booking-requests`,
      expect.anything(),
    );
  });

  /** VEN-HOLD-02-A: existing event timing and the calculated buffered occupied period are shown without re-entering times. */
  it("VEN-HOLD-02-A displays the event time and calculated occupied period", async () => {
    renderPage();
    const bookingReview = await screen.findByRole("region", {
      name: "Review booking request",
    });
    expect(bookingReview).toHaveTextContent("Event period");
    expect(bookingReview).toHaveTextContent("25 Jan 2030, 18:00 – 25 Jan 2030, 20:00 (SGT)");
    expect(screen.getByLabelText("Event starts")).toHaveValue("2030-01-25T18:00");
    expect(screen.getByLabelText("Event ends")).toHaveValue("2030-01-25T20:00");

    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText("Event starts"), {
      target: { value: "2030-01-27T10:00" },
    });
    await user.click(within(bookingReview).getByRole("checkbox", { name: /Request holding/ }));
    await user.click(within(bookingReview).getByRole("button", { name: "Submit booking request" }));
    const confirmation = screen.getByRole("dialog", { name: "Confirm tentative hold request" });
    expect(confirmation).toHaveTextContent("Event time: 25 Jan 2030, 18:00 – 25 Jan 2030, 20:00 (SGT)");
    expect(confirmation).toHaveTextContent("Venue occupied period, including setup and turnaround");
    expect(confirmation).toHaveTextContent("25 Jan 2030, 17:00 – 25 Jan 2030, 20:30 (SGT)");
  });

  /** VEN-HOLD-04-A/06-A: cancelling the confirmation modal creates no request. */
  it("VEN-HOLD-04-A cancels the confirmation without submitting a request", async () => {
    const user = userEvent.setup();
    renderPage();
    const bookingReview = await screen.findByRole("region", {
      name: "Review booking request",
    });
    await user.click(within(bookingReview).getByRole("checkbox", { name: /Request holding/ }));
    await user.click(within(bookingReview).getByRole("button", { name: "Submit booking request" }));

    const confirmation = screen.getByRole("dialog", { name: "Confirm tentative hold request" });
    expect(confirmation).toHaveTextContent("Pending Venue Staff review");
    await user.click(within(confirmation).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Confirm tentative hold request" })).not.toBeInTheDocument();
    expect(apiMock.mock.calls.some(([path, init]) =>
      path === `/venues/${VENUE_ID}/booking-requests` &&
      (init as RequestInit | undefined)?.method === "POST",
    )).toBe(false);
  });

  /** VEN-HOLD-05-A/06-A: confirmation submits the hold and transitions into the existing Pending request summary flow. */
  it("VEN-HOLD-05-A submits a hold and shows its Pending request summary after confirmation", async () => {
    apiMock.mockImplementation(async (path, init) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path === `/venues/${VENUE_ID}/booking-requests`) {
        const body = JSON.parse(String((init as RequestInit).body));
        expect(body).toEqual({
          eventId: EVENT_ID,
          request_kind: "tentative_hold",
          specialRequest: "Microphones, please.",
        });
        return {
          id: "hold-1",
          start: event.startDateTime,
          end: event.endDateTime,
          bookingReference: "VB-HOLD0001",
          specialRequest: "Microphones, please.",
        } as never;
      }
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage();
    const button = await screen.findByRole("button", {
      name: "Submit booking request",
    });
    await user.type(
      screen.getByLabelText("Special requests (optional)"),
      "Microphones, please.",
    );
    await user.click(screen.getByRole("checkbox", { name: /Request holding/ }));
    await user.click(button);
    expect(apiMock).not.toHaveBeenCalledWith(
      `/venues/${VENUE_ID}/booking-requests`,
      expect.anything(),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm request" }),
    );

    expect(screen.queryByRole("dialog", { name: "Confirm tentative hold request" })).not.toBeInTheDocument();
    const existingRequest = await screen.findByRole("region", { name: "Existing venue booking request" });
    expect(existingRequest).toHaveTextContent("pending");
    expect(existingRequest).toHaveTextContent("Tentative hold request pending Venue Staff approval; the venue is not held yet.");
    expect(existingRequest).toHaveTextContent("Tentative hold request submitted for Venue Staff approval. The hold is not active yet. Reference: VB-HOLD0001.");
    expect(existingRequest).toHaveTextContent("Special request");
    expect(existingRequest).toHaveTextContent("Microphones, please.");
    expect(screen.queryByRole("region", { name: "Review booking request" })).not.toBeInTheDocument();
    expect(
      apiMock.mock.calls.some(
        ([path, init]) =>
          path === `/venues/${VENUE_ID}/booking-requests` &&
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(true);
  });

  /** VEN-HOLD-12-B/C: a rejection stays in the same modal with a clear retry action. */
  it("VEN-HOLD-12-B keeps one modal open with a clear error and permits retry", async () => {
    let submissions = 0;
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path === `/venues/${VENUE_ID}/booking-requests`) {
        submissions += 1;
        if (submissions === 1) throw new Error("Lead time must be at least 336 hours.");
        return {
          id: "hold-2",
          start: event.startDateTime,
          end: event.endDateTime,
          bookingReference: "VB-HOLD0002",
        } as never;
      }
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage();
    const button = await screen.findByRole("button", {
      name: "Submit booking request",
    });
    await user.click(screen.getByRole("checkbox", { name: /Request holding/ }));
    await user.click(button);
    await user.click(screen.getByRole("button", { name: "Confirm request" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Request not submitted");
    expect(alert).toHaveTextContent(
      "Lead time must be at least 336 hours.",
    );
    expect(screen.getAllByRole("dialog", { name: "Confirm tentative hold request" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Retry request" }));
    await waitFor(() => expect(submissions).toBe(2));
    expect(
      await screen.findByText(/submitted for Venue Staff approval/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Confirm tentative hold request" })).not.toBeInTheDocument();
  });

  /** VEN-HOLD-09-SUP-LOOKUP: ordinary Pending requests for this event and venue prevent duplicate hold submission. */
  it("VEN-HOLD-09-SUP-LOOKUP treats a same-pair ordinary Pending request as active", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [existingBooking()] as never;
      return venue as never;
    });
    renderPage();

    expect(await screen.findByRole("region", { name: "Existing venue booking request" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Request tentative hold" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Tentative hold request pending Venue Staff approval/)).not.toBeInTheDocument();
  });

  /** VEN-HOLD-09-SUP-LOOKUP: the request action remains hidden until duplicate lookup completes. */
  it("VEN-HOLD-09-SUP-LOOKUP waits for the existing-request check before showing the submit form", async () => {
    let resolveBookingRows: ((rows: ReturnType<typeof existingBooking>[]) => void) | undefined;
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine")
        return await new Promise<ReturnType<typeof existingBooking>[]>((resolve) => {
          resolveBookingRows = resolve;
        }) as never;
      return venue as never;
    });
    renderPage();

    expect(await screen.findByText("Checking for an existing booking request…")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Review booking request" })).not.toBeInTheDocument();

    await waitFor(() => expect(resolveBookingRows).toBeTypeOf("function"));
    const resolveRows = resolveBookingRows;
    await act(async () => resolveRows?.([]));
    expect(await screen.findByRole("region", { name: "Review booking request" })).toBeInTheDocument();
  });

  /** VEN-HOLD-09-SUP-LOOKUP: Pending requests remain duplicate blockers even if an expiry value is stale. */
  it("VEN-HOLD-09-SUP-LOOKUP keeps a same-pair Pending hold visible despite a past expiry value", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine")
        return [existingBooking({ requestKind: "tentative_hold", holdExpiresAt: "2000-01-01T00:00:00.000Z" })] as never;
      return venue as never;
    });
    renderPage();

    expect(await screen.findByText(/Tentative hold request pending Venue Staff approval/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Review booking request" })).not.toBeInTheDocument();
  });

  /** VEN-HOLD-09-SUP-LOOKUP: an approved tentative hold with an elapsed expiry is no longer Active. */
  it("VEN-HOLD-09-SUP-LOOKUP allows a new request after an approved hold expires", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine")
        return [existingBooking({ status: "approved", requestKind: "tentative_hold", holdExpiresAt: "2000-01-01T00:00:00.000Z" })] as never;
      return venue as never;
    });
    renderPage();

    const bookingReview = await screen.findByRole("region", {
      name: "Review booking request",
    });
    expect(within(bookingReview).getByRole("checkbox", { name: /Request holding/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Existing venue booking request" })).not.toBeInTheDocument();
  });

  /** VEN-HOLD-09-SUP-LOOKUP/06-A: a live tentative hold remains visible as Pending and clearly inactive until approval. */
  it("VEN-HOLD-09-SUP-LOOKUP shows an unexpired tentative hold as Pending and not active", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine")
        return [existingBooking({ requestKind: "tentative_hold", holdExpiresAt: "2099-01-01T00:00:00.000Z" })] as never;
      return venue as never;
    });
    renderPage();

    expect(await screen.findByText(/Tentative hold request pending Venue Staff approval/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Request tentative hold" })).not.toBeInTheDocument();
  });

  /** VEN-HOLD-04-A: after approval, the event detail identifies the active hold and its expiry. */
  it("VEN-HOLD-04-A shows an approved tentative hold as active until its expiry", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine")
        return [existingBooking({
          status: "approved",
          requestKind: "tentative_hold",
          holdExpiresAt: "2030-10-31T12:00:00.000Z",
        })] as never;
      return venue as never;
    });
    renderPage();

    expect(await screen.findByText(/Tentative hold approved and active until/)).toBeInTheDocument();
    expect(screen.queryByText(/pending Venue Staff approval/)).not.toBeInTheDocument();
  });

  /** VEN-HOLD-12-C: a non-Error submission rejection shows a retryable fallback message. */
  it("VEN-HOLD-12-C reports the fallback when submission rejects with a non-Error value", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path === `/venues/${VENUE_ID}/booking-requests`) throw "unavailable";
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: /Request holding/ }));
    await user.click(await screen.findByRole("button", { name: "Submit booking request" }));
    await user.click(screen.getByRole("button", { name: "Confirm request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to submit the tentative hold request. Try again.",
    );
    expect(screen.getByRole("button", { name: "Submit booking request" })).toBeEnabled();
  });

  /** VEN-HOLD-01-SUP-STALE: a confirmation whose event is no longer selected safely refuses submission. */
  it("VEN-HOLD-01-SUP-STALE ignores confirmation after the selected event disappears", async () => {
    const user = userEvent.setup();
    renderPage();
    const review = await screen.findByRole("region", { name: "Review booking request" });
    await user.click(within(review).getByRole("checkbox", { name: /Request holding/ }));
    await user.click(within(review).getByRole("button", { name: "Submit booking request" }));
    useAppStore.setState({ events: [] });
    await user.click(screen.getByRole("button", { name: "Confirm request" }));

    expect(apiMock).not.toHaveBeenCalledWith(
      `/venues/${VENUE_ID}/booking-requests`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  /** VEN-HOLD-04-SUP-CLOSE: the dialog close affordance closes an idle confirmation without submitting. */
  it("VEN-HOLD-04-SUP-CLOSE closes an idle confirmation using its close control", async () => {
    const user = userEvent.setup();
    renderPage();
    const review = await screen.findByRole("region", { name: "Review booking request" });
    await user.click(within(review).getByRole("checkbox", { name: /Request holding/ }));
    await user.click(within(review).getByRole("button", { name: "Submit booking request" }));
    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    expect(screen.queryByRole("dialog", { name: "Confirm tentative hold request" })).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      `/venues/${VENUE_ID}/booking-requests`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  /** VEN-HOLD-04-SUP-CLOSE: closing is ignored while the confirmed request is in flight. */
  it("VEN-HOLD-04-SUP-CLOSE keeps the dialog open while a request is submitting", async () => {
    let releaseSubmission: (() => void) | undefined;
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path === `/venues/${VENUE_ID}/booking-requests`)
        return await new Promise<unknown>((resolve) => {
          releaseSubmission = () => resolve({
            id: "hold-in-flight",
            start: event.startDateTime,
            end: event.endDateTime,
            bookingReference: "VB-HOLD0003",
          });
        }) as never;
      return venue as never;
    });
    const user = userEvent.setup();
    renderPage();
    const review = await screen.findByRole("region", { name: "Review booking request" });
    await user.click(within(review).getByRole("checkbox", { name: /Request holding/ }));
    await user.click(within(review).getByRole("button", { name: "Submit booking request" }));
    await user.click(screen.getByRole("button", { name: "Confirm request" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Submitting hold request…" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true));
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("dialog", { name: "Confirm tentative hold request" })).toBeInTheDocument();
    releaseSubmission?.();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirm tentative hold request" })).not.toBeInTheDocument());
  });

  /** VEN-HOLD-DEC-08-A: the venue schedule labels the occupied interval as a tentative hold for its full setup and turnaround range. */
  it("VEN-HOLD-DEC-08-A renders the tentative hold label and occupied interval in the schedule", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      return {
        ...venue,
        reservations: [{
          id: "active-hold",
          eventName: "Showcase",
          start: "2030-11-20T01:30:00.000Z",
          end: "2030-11-20T04:45:00.000Z",
          status: "tentative",
          holdExpiresAt: "2030-11-15T01:00:00.000Z",
          affectedByUnavailablePeriod: false,
        }],
      } as never;
    });
    renderPage(false, "venue_staff");
    const calendar = await screen.findByRole("region", { name: "Venue schedule calendar" });
    expect(within(calendar).getByText("Tentative hold: Showcase · hold expires 2030-11-15T01:00:00.000Z")).toBeInTheDocument();
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("20 Nov 2030, 9:30 am – 12:45 pm");
    expect(row).toHaveTextContent("Tentative hold");
  });

  /** VEN-HOLD-DEC-08-B: a pending request without an approved hold is absent from the blocking schedule. */
  it("VEN-HOLD-DEC-08-B does not render a Pending request as a calendar hold", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      return { ...venue, reservations: [] } as never;
    });
    renderPage(false, "venue_staff");
    const calendar = await screen.findByRole("region", { name: "Venue schedule calendar" });
    expect(within(calendar).queryByText(/Tentative hold/)).not.toBeInTheDocument();
    expect(screen.getByText("No upcoming bookings or active tentative holds.")).toBeInTheDocument();
  });

  /** VEN-HOLD-DEC-08-BND-1: a hold spanning the setup or turnaround edge remains a blocking calendar interval. */
  it("VEN-HOLD-DEC-08-BND-1 blocks the complete setup-through-turnaround interval", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      return {
        ...venue,
        reservations: [{
          id: "edge-hold",
          eventName: "Edge rehearsal",
          start: "2030-11-20T01:30:00.000Z",
          end: "2030-11-20T04:45:00.000Z",
          status: "tentative",
          holdExpiresAt: "2030-11-15T01:00:00.000Z",
          affectedByUnavailablePeriod: false,
        }],
      } as never;
    });
    renderPage(false, "venue_staff");
    expect(await screen.findByText("Edge rehearsal")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("20 Nov 2030, 9:30 am – 12:45 pm");
  });

  /** A reservation flagged by the API as overlapping an unavailable period displays that impact in the venue record. */
  it("shows when a reservation is affected by an unavailable period", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      return {
        ...venue,
        reservations: [{
          id: "affected-booking",
          eventName: "Affected rehearsal",
          start: "2030-11-20T02:00:00.000Z",
          end: "2030-11-20T04:00:00.000Z",
          status: "booked",
          affectedByUnavailablePeriod: true,
        }],
      } as never;
    });
    renderPage(false, "venue_staff");

    const reservation = await screen.findByRole("listitem");
    expect(within(reservation).getByText("Affected rehearsal")).toBeInTheDocument();
    expect(within(reservation).getByText("Affected by an unavailable period")).toBeInTheDocument();
  });

  /** VEN-HOLD-DEC-12-A: conversion refreshes the visible schedule as a confirmed booking. */
  it("VEN-HOLD-DEC-12-A converts the active hold to a confirmed calendar booking", async () => {
    const user = userEvent.setup();
    let reservations: Array<Record<string, unknown>> = [{
      id: "convert-hold",
      eventName: "Converted showcase",
      start: "2030-11-20T01:30:00.000Z",
      end: "2030-11-20T04:45:00.000Z",
      status: "tentative",
      holdExpiresAt: "2030-11-15T01:00:00.000Z",
      affectedByUnavailablePeriod: false,
    }];
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path.endsWith("/convert")) {
        reservations = [{ ...reservations[0], status: "booked" }];
        return {} as never;
      }
      return { ...venue, reservations } as never;
    });
    renderPage(false, "venue_staff");
    expect(await screen.findByRole("button", { name: "Convert to Booking" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Convert to Booking" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Convert tentative hold to confirmed booking?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Convert to Booking" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Convert tentative hold to confirmed booking?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Convert to Booking" }));
    await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
    await waitFor(() => expect(screen.getByRole("listitem")).toHaveTextContent("Confirmed booking"));
    expect(screen.queryByRole("button", { name: "Convert to Booking" })).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(`/venues/bookings/${encodeURIComponent("convert-hold")}/convert`, { method: "POST" });
  });

  /** VEN-HOLD-DEC-13-A: releasing a hold removes its active calendar block while retaining unrelated reservations. */
  it("VEN-HOLD-DEC-13-A releases only the selected hold and refreshes the schedule", async () => {
    const user = userEvent.setup();
    let reservations: Array<Record<string, unknown>> = [
      { id: "release-hold", eventName: "Released showcase", start: "2030-11-20T01:30:00.000Z", end: "2030-11-20T04:45:00.000Z", status: "tentative", holdExpiresAt: "2030-11-15T01:00:00.000Z", affectedByUnavailablePeriod: false },
      { id: "other-booking", eventName: "Other confirmed event", start: "2030-11-21T01:30:00.000Z", end: "2030-11-21T04:00:00.000Z", status: "booked", affectedByUnavailablePeriod: false },
    ];
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path.endsWith("/release")) {
        reservations = reservations.filter((row) => row.id !== "release-hold");
        return { id: "release-hold", status: "released" } as never;
      }
      return { ...venue, reservations } as never;
    });
    renderPage(false, "venue_staff");
    await user.click(await screen.findByRole("button", { name: "Release Hold" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Release this tentative hold?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Release Hold" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Release this tentative hold?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Release Hold" }));
    await user.click(screen.getByRole("button", { name: "Release hold" }));
    await waitFor(() => expect(screen.queryByText("Released showcase")).not.toBeInTheDocument());
    expect(screen.getAllByText("Other confirmed event", { exact: false }).length).toBeGreaterThan(0);
    expect(apiMock).toHaveBeenCalledWith(`/venues/bookings/${encodeURIComponent("release-hold")}/release`, { method: "POST" });
  });

  /** VEN-HOLD-DEC-12-B: a failed calendar conversion leaves the active hold visible and reports the service error. */
  it("VEN-HOLD-DEC-12-B keeps the active schedule hold when conversion fails", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path.endsWith("/convert")) throw new Error("Conversion refused by server.");
      return { ...venue, reservations: [{
        id: "convert-error-hold", eventName: "Conversion error rehearsal",
        start: "2030-11-20T01:30:00.000Z", end: "2030-11-20T04:45:00.000Z",
        status: "tentative", holdExpiresAt: "2030-11-15T01:00:00.000Z", affectedByUnavailablePeriod: false,
      }] } as never;
    });
    renderPage(false, "venue_staff");
    await user.click(await screen.findByRole("button", { name: "Convert to Booking" }));
    await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
    expect(await screen.findByText("Conversion refused by server.")).toBeInTheDocument();
    expect(screen.getByText("Conversion error rehearsal")).toBeInTheDocument();
  });

  /** VEN-HOLD-DEC-13-B: a failed calendar release leaves the active hold visible and reports the service error. */
  it("VEN-HOLD-DEC-13-B keeps the active schedule hold when release fails", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path.endsWith("/release")) throw new Error("Release refused by server.");
      return { ...venue, reservations: [{
        id: "release-error-hold", eventName: "Release error rehearsal",
        start: "2030-11-20T01:30:00.000Z", end: "2030-11-20T04:45:00.000Z",
        status: "tentative", holdExpiresAt: "2030-11-15T01:00:00.000Z", affectedByUnavailablePeriod: false,
      }] } as never;
    });
    renderPage(false, "venue_staff");
    await user.click(await screen.findByRole("button", { name: "Release Hold" }));
    await user.click(screen.getByRole("button", { name: "Release hold" }));
    expect(await screen.findByText("Release refused by server.")).toBeInTheDocument();
    expect(screen.getByText("Release error rehearsal")).toBeInTheDocument();
  });

  /** VEN-HOLD-DEC-13-B: a non-Error release rejection displays the page fallback and leaves the hold in the schedule. */
  it("VEN-HOLD-DEC-13-B reports the release fallback for a non-Error rejection", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path.endsWith("/release")) throw { code: "RELEASE_FAILED" };
      return { ...venue, reservations: [{
        id: "release-fallback-hold", eventName: "Release fallback rehearsal",
        start: "2030-11-20T01:30:00.000Z", end: "2030-11-20T04:45:00.000Z",
        status: "tentative", holdExpiresAt: "2030-11-15T01:00:00.000Z", affectedByUnavailablePeriod: false,
      }] } as never;
    });
    renderPage(false, "venue_staff");
    await user.click(await screen.findByRole("button", { name: "Release Hold" }));
    await user.click(screen.getByRole("button", { name: "Release hold" }));

    expect(await screen.findByText("Unable to release this hold.")).toBeInTheDocument();
    expect(screen.getByText("Release fallback rehearsal")).toBeInTheDocument();
  });

  /** VEN-HOLD-DEC-12-B: a non-Error conversion rejection displays the page fallback and retains the active hold. */
  it("VEN-HOLD-DEC-12-B reports the conversion fallback for a non-Error rejection", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path.endsWith("/convert")) throw { code: "CONVERSION_FAILED" };
      return { ...venue, reservations: [{
        id: "convert-fallback-hold", eventName: "Conversion fallback rehearsal",
        start: "2030-11-20T01:30:00.000Z", end: "2030-11-20T04:45:00.000Z",
        status: "tentative", holdExpiresAt: "2030-11-15T01:00:00.000Z", affectedByUnavailablePeriod: false,
      }] } as never;
    });
    renderPage(false, "venue_staff");
    await user.click(await screen.findByRole("button", { name: "Convert to Booking" }));
    await user.click(screen.getByRole("button", { name: "Confirm conversion" }));

    expect(await screen.findByText("Unable to convert this hold.")).toBeInTheDocument();
    expect(screen.getByText("Conversion fallback rehearsal")).toBeInTheDocument();
  });

  /** VEN-HOLD-DEC-12-A: the confirmation cannot be dismissed while conversion is in flight. */
  it("VEN-HOLD-DEC-12-A keeps conversion confirmation open until the request settles", async () => {
    const user = userEvent.setup();
    let resolveConversion: ((value: unknown) => void) | undefined;
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path.endsWith("/convert")) return await new Promise<unknown>((resolve) => { resolveConversion = resolve; }) as never;
      return { ...venue, reservations: [{
        id: "convert-close-guard", eventName: "Close guard rehearsal",
        start: "2030-11-20T01:30:00.000Z", end: "2030-11-20T04:45:00.000Z",
        status: "tentative", holdExpiresAt: "2030-11-15T01:00:00.000Z", affectedByUnavailablePeriod: false,
      }] } as never;
    });
    renderPage(false, "venue_staff");
    await user.click(await screen.findByRole("button", { name: "Convert to Booking" }));
    await user.click(screen.getByRole("button", { name: "Confirm conversion" }));
    expect(await screen.findByRole("button", { name: "Converting…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("dialog", { name: "Convert tentative hold to confirmed booking?" })).toBeInTheDocument();

    resolveConversion?.({ id: "convert-close-guard", status: "converted" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Convert tentative hold to confirmed booking?" })).not.toBeInTheDocument());
  });

  /** VEN-HOLD-DEC-13-A: the release confirmation cannot be dismissed while release is in flight. */
  it("VEN-HOLD-DEC-13-A keeps release confirmation open until the request settles", async () => {
    const user = userEvent.setup();
    let resolveRelease: ((value: unknown) => void) | undefined;
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/bookings/mine") return [] as never;
      if (path.endsWith("/release")) return await new Promise<unknown>((resolve) => { resolveRelease = resolve; }) as never;
      return { ...venue, reservations: [{
        id: "release-close-guard", eventName: "Release close guard rehearsal",
        start: "2030-11-20T01:30:00.000Z", end: "2030-11-20T04:45:00.000Z",
        status: "tentative", holdExpiresAt: "2030-11-15T01:00:00.000Z", affectedByUnavailablePeriod: false,
      }] } as never;
    });
    renderPage(false, "venue_staff");
    await user.click(await screen.findByRole("button", { name: "Release Hold" }));
    await user.click(screen.getByRole("button", { name: "Release hold" }));
    expect(await screen.findByRole("button", { name: "Releasing…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("dialog", { name: "Release this tentative hold?" })).toBeInTheDocument();

    resolveRelease?.({ id: "release-close-guard", status: "released" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Release this tentative hold?" })).not.toBeInTheDocument());
  });
});
