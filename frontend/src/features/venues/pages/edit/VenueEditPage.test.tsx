import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { VenueEditPage } from "./VenueEditPage";
import { api, ApiError } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import type { Venue, AffectedBooking } from "@/types";

vi.mock("@/utils/api", async (original) => ({
  ...(await original<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const venue: Venue = {
  id: "b9c6f700-85b1-4a79-96d8-5f5c3fd616fb",
  ownerId: "staff-1",
  name: "Orchid Hall",
  location: "Block A Level 2",
  capacity: 120,
  facilities: ["AV System"],
  accessibility: ["Wheelchair access"],
  layouts: ["Theatre"],
  operatingInformation: "Weekdays only",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};

function renderEdit(id = venue.id) {
  return render(
    <MemoryRouter initialEntries={[`/venue-records/${id}/edit`]}>
      <Routes>
        <Route path="/venue-records/:id/edit" element={<VenueEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: true,
    currentUser: { id: "staff-1", name: "Venue Staff 1", email: "staff@example.test", role: "venue_staff" },
    venues: [],
  });
  // Default: GET /venues/:id returns the venue
  apiMock.mockResolvedValue(venue as unknown as ReturnType<typeof api>);
});
afterEach(cleanup);

describe("SPM-121 VenueEditPage", () => {
  /** VEN-UPD-01-UI-A: AC1 — the form pre-fills with the current venue values on load. */
  it("VEN-UPD-01-UI-A pre-fills the form with current venue values after load", async () => {
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    expect((screen.getByLabelText(/Venue name/i) as HTMLInputElement).value).toBe(venue.name);
    expect((screen.getByLabelText(/Location/i) as HTMLInputElement).value).toBe(venue.location);
    expect((screen.getByLabelText(/Capacity/i) as HTMLInputElement).value).toBe(String(venue.capacity));
  });

  /** VEN-UPD-01-UI-B: load failure shows an error message. */
  it("VEN-UPD-01-UI-B shows an error when venue load fails", async () => {
    apiMock.mockRejectedValueOnce(new Error("network"));
    renderEdit();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/not found|could not be loaded/i),
    );
  });

  /** VEN-UPD-05-UI-A: AC5 — submitting the form calls the PATCH endpoint and shows the success message. */
  it("VEN-UPD-05-UI-A calls PATCH and shows success message after submission", async () => {
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>) // GET (pre-fill)
      .mockResolvedValueOnce({
        venue,
        message: "Venue updated successfully.",
        affectedBookings: [],
        capacityBookings: [],
      } as unknown as ReturnType<typeof api>); // PATCH (submit)

    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());

    // Step 1 fields are pre-filled; click Continue to advance to step 2
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    // Step 2: click Save changes
    await user.click(await screen.findByRole("button", { name: /Save changes/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Venue updated successfully/i),
    );
    expect(apiMock).toHaveBeenCalledWith(
      `/venues/${venue.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  /** VEN-UPD-03-UI-A: AC3 — clearing a required field and clicking Continue shows a validation error. */
  it("VEN-UPD-03-UI-A shows a validation error when a required field is cleared before Continue", async () => {
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());

    // Clear the pre-filled venue name
    const nameInput = screen.getByLabelText(/Venue name/i);
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    // Validation error should appear; step 2 heading should not
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save changes/i })).toBeNull();
  });

  /** VEN-UPD-09-UI-A: AC9 — capacity bookings list is shown when server returns capacityBookings. */
  it("VEN-UPD-09-UI-A shows affected capacity bookings when returned from server", async () => {
    const booking: AffectedBooking = {
      bookingId: "bk-1",
      eventName: "Tech Conference",
      start: "2030-03-01T10:00:00.000Z",
      end: "2030-03-01T12:00:00.000Z",
      status: "pending",
    };
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>) // GET
      .mockResolvedValueOnce({
        venue,
        message: "Venue updated successfully.",
        affectedBookings: [],
        capacityBookings: [booking],
      } as unknown as ReturnType<typeof api>); // PATCH

    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(await screen.findByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(screen.getByText("Tech Conference")).toBeInTheDocument());
  });

  /** VEN-UPD-07-UI-B: AC7 — navigating directly to another staff member's edit URL shows a forbidden message instead of the form. */
  it("VEN-UPD-07-UI-B blocks non-owner from accessing the edit form by URL", async () => {
    const otherVenue = { ...venue, ownerId: "other-staff-99" };
    apiMock.mockResolvedValueOnce(otherVenue as unknown as ReturnType<typeof api>);
    renderEdit();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/only edit venues you created/i),
    );
    expect(screen.queryByLabelText(/Venue name/i)).toBeNull();
  });

  /** VEN-UPD-04-UI-A: AC4 — duplicate venue name returns 409 and shows the "already exists" message. */
  it("VEN-UPD-04-UI-A shows the duplicate-name error message on 409", async () => {
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>) // GET
      .mockRejectedValueOnce(
        new ApiError(
          "A venue with this name and location already exists.",
          { name: "Use a different venue name or location.", location: "Use a different venue name or location." },
          undefined,
          409,
        ),
      );

    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(await screen.findByRole("button", { name: /Save changes/i }));

    await waitFor(() =>
      expect(screen.getByText(/already exists/i)).toBeInTheDocument(),
    );
  });

  /** VEN-UPD-08-UI-A: AC8 — affected bookings list is shown when timing changes. */
  it("VEN-UPD-08-UI-A shows affected bookings when timing change causes new overlaps", async () => {
    const booking: AffectedBooking = {
      bookingId: "bk-overlap",
      eventName: "Design Summit",
      start: "2030-05-01T09:00:00.000Z",
      end: "2030-05-01T11:00:00.000Z",
      status: "approved",
    };
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>) // GET
      .mockResolvedValueOnce({
        venue,
        message: "Venue updated successfully.",
        affectedBookings: [booking],
        capacityBookings: [],
      } as unknown as ReturnType<typeof api>); // PATCH

    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(await screen.findByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(screen.getByText("Design Summit")).toBeInTheDocument());
    expect(screen.getByText(/affected by the changed setup or turnaround/i)).toBeInTheDocument();
  });
});
