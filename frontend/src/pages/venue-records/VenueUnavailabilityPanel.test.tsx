import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/utils/api";
import { VenueUnavailabilityPanel } from "./VenueUnavailabilityPanel";

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);
const id = "00000000-0000-4000-8000-000000000122";
const onSaved = vi.fn();

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function renderPanel(periods: Array<{ id: string; start: string; end: string; reason: string; current?: boolean }> = [], canManage = true) {
  return render(<VenueUnavailabilityPanel venueId={id} periods={periods} canManage={canManage} onSaved={onSaved} />);
}

describe("SPM-122 venue unavailable period controls", () => {
  // VEN-UNAVAIL-01-A/02-A/04-A: a selected venue receives the exact reviewed period.
  it("reviews and saves a free-text period, then lists affected events", async () => {
    // Arrange: the server returns a saved period and one affected event.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({ period: { id: "p1", start: "2030-01-12T04:15:00.000Z", end: "2030-01-12T04:45:00.000Z", reason: "Air-conditioning inspection" }, affectedBookings: [{ id: "b1", eventName: "Welcome Event", start: "2030-01-12T05:00:00.000Z", end: "2030-01-12T06:00:00.000Z" }] });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Mark unavailable" }));
    await user.type(screen.getByLabelText(/Unavailable start/), "2030-01-12T12:15");
    await user.type(screen.getByLabelText(/Unavailable end/), "2030-01-12T12:45");
    await user.type(screen.getByLabelText(/Reason/), "Air-conditioning inspection");

    // Act: review before the network write, then confirm explicitly.
    await user.click(screen.getByRole("button", { name: "Review unavailability" }));
    expect(apiMock).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm unavailability for this venue from 12 Jan 2030, 12:15pm – 12:45pm. Reason: Air-conditioning inspection")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm unavailability" }));

    // Assert the venue path, free-text payload and affected event display.
    expect(apiMock).toHaveBeenCalledWith(`/venues/${id}/unavailable-periods`, expect.objectContaining({ method: "POST", body: expect.stringContaining("Air-conditioning inspection") }));
    const sent = JSON.parse(apiMock.mock.calls[0][1]?.body as string) as { start: string; end: string; reason: string };
    expect(sent.start).toMatch(/Z$/);
    expect(sent.end).toMatch(/Z$/);
    expect([new Date(sent.start).getHours(), new Date(sent.start).getMinutes()]).toEqual([12, 15]);
    expect([new Date(sent.end).getHours(), new Date(sent.end).getMinutes()]).toEqual([12, 45]);
    expect(sent.reason).toBe("Air-conditioning inspection");
    expect(within(await screen.findByRole("region", { name: "Affected bookings" })).getByText(/Welcome Event/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  // VEN-UNAVAIL-03-A: cancellation before confirmation causes no write.
  it("cancels a reviewed period without saving", async () => {
    // Arrange a fully entered period.
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Mark unavailable" }));
    await user.type(screen.getByLabelText(/Unavailable start/), "2030-01-12T12:15");
    await user.type(screen.getByLabelText(/Unavailable end/), "2030-01-12T12:45");
    await user.type(screen.getByLabelText(/Reason/), "Maintenance");
    await user.click(screen.getByRole("button", { name: "Review unavailability" }));

    // Act and assert the pending action closes without any API write.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Confirm unavailability" })).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-01-B/02-B: invalid intervals and whitespace reasons block review.
  it("blocks reversed times and a whitespace-only reason with field errors", async () => {
    // Arrange invalid values.
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Mark unavailable" }));
    await user.type(screen.getByLabelText(/Unavailable start/), "2030-01-12T14:00");
    await user.type(screen.getByLabelText(/Unavailable end/), "2030-01-12T13:00");
    await user.type(screen.getByLabelText(/Reason/), "   ");

    // Act and assert both errors and zero network writes.
    await user.click(screen.getByRole("button", { name: "Review unavailability" }));
    expect(screen.getByText("End date and time must be after start date and time.")).toBeInTheDocument();
    expect(screen.getByText("A reason is required.")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-01-B/02-B: an untouched form must identify every missing required field.
  it("blocks review when both date-times and the reason are missing", async () => {
    // Arrange the untouched form and attempt to review it.
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Mark unavailable" }));
    await user.click(screen.getByRole("button", { name: "Review unavailability" }));

    // Assert all field errors and no persistence request.
    expect(screen.getByText("Enter a valid start date and time.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid end date and time.")).toBeInTheDocument();
    expect(screen.getByText("A reason is required.")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-05-A/B: an active period may end early while another stays intact.
  it("shows a dated reason and ends only the selected active period", async () => {
    // Arrange two periods, only the first marked current by the server.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({ period: { id: "p1", start: "2030-01-12T11:00:00.000Z", end: "2030-01-12T12:00:00.000Z", reason: "Maintenance" } });
    renderPanel([
      { id: "p1", start: "2030-01-12T11:00:00.000Z", end: "2030-01-12T13:00:00.000Z", reason: "Maintenance", current: true },
      { id: "p2", start: "2030-01-13T11:00:00.000Z", end: "2030-01-13T13:00:00.000Z", reason: "Renovation" },
    ]);
    expect(screen.getByText(/Maintenance/)).toBeInTheDocument();
    expect(screen.getByText(/Renovation/)).toBeInTheDocument();

    // Act: opening the confirmation alone must not write; then confirm p1.
    await user.click(screen.getByRole("button", { name: "End early" }));
    expect(apiMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm early end" }));

    // Assert only p1 is sent and the server's effective end is visible.
    expect(apiMock).toHaveBeenCalledWith(`/venues/${id}/unavailable-periods/p1/end`, { method: "POST" });
    expect(screen.getByText(/Ended early.*Maintenance/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  // VEN-UNAVAIL-05-A: cancelling early-end confirmation leaves the active period untouched.
  it("cancels an early-end confirmation without a write", async () => {
    // Arrange an active period and open its confirmation.
    const user = userEvent.setup();
    renderPanel([{ id: "p1", start: "2030-01-12T11:00:00.000Z", end: "2030-01-12T13:00:00.000Z", reason: "Maintenance", current: true }]);
    await user.click(screen.getByRole("button", { name: "End early" }));

    // Act and assert that cancellation does not call the API or refresh the venue.
    await user.click(screen.getByRole("button", { name: "Cancel early end" }));
    expect(apiMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "End early" })).toBeInTheDocument();
  });

  // VEN-UNAVAIL-04-A/07-C: a saved period with no conflicts is reported truthfully.
  it("shows an empty affected-booking result after a successful save", async () => {
    // Arrange a valid form and a server response with zero existing bookings.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({ period: { id: "p1" }, affectedBookings: [] });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Mark unavailable" }));
    await user.type(screen.getByLabelText(/Unavailable start/), "2030-01-12T12:15");
    await user.type(screen.getByLabelText(/Unavailable end/), "2030-01-12T12:45");
    await user.type(screen.getByLabelText(/Reason/), "Inspection");
    await user.click(screen.getByRole("button", { name: "Review unavailability" }));

    // Act and assert the zero-conflict result after the actual save request.
    await user.click(screen.getByRole("button", { name: "Confirm unavailability" }));
    expect(await screen.findByText("No existing bookings are affected.")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  // VEN-UNAVAIL-04-A/05-A: a rejected write must not claim success or refresh stale data.
  it("shows a server validation error and keeps the period unsaved", async () => {
    // Arrange a valid-looking form that the server rejects with a field error.
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("Check the unavailable period.", { reason: "A reason is required." }, undefined, 400));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Mark unavailable" }));
    await user.type(screen.getByLabelText(/Unavailable start/), "2030-01-12T12:15");
    await user.type(screen.getByLabelText(/Unavailable end/), "2030-01-12T12:45");
    await user.type(screen.getByLabelText(/Reason/), "Inspection");
    await user.click(screen.getByRole("button", { name: "Review unavailability" }));

    // Act and assert the field error appears without a success result.
    await user.click(screen.getByRole("button", { name: "Confirm unavailability" }));
    expect(await screen.findByText("A reason is required.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Affected bookings" })).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-04-A: a transport failure cannot be mistaken for a completed save.
  it("shows a connection failure without claiming the period was saved", async () => {
    // Arrange a valid form and a non-API transport exception.
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new Error("Connection dropped"));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Mark unavailable" }));
    await user.type(screen.getByLabelText(/Unavailable start/), "2030-01-12T12:15");
    await user.type(screen.getByLabelText(/Unavailable end/), "2030-01-12T12:45");
    await user.type(screen.getByLabelText(/Reason/), "Inspection");
    await user.click(screen.getByRole("button", { name: "Review unavailability" }));

    // Act and assert the failure message and absence of success side effects.
    await user.click(screen.getByRole("button", { name: "Confirm unavailability" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save the unavailable period.");
    expect(screen.queryByRole("region", { name: "Affected bookings" })).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-04-A: a server rejection without field detail remains visible to staff.
  it("shows a form-level server rejection", async () => {
    // Arrange a valid review and a server error without a field-error map.
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("Unable to save right now.", undefined, undefined, 503));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Mark unavailable" }));
    await user.type(screen.getByLabelText(/Unavailable start/), "2030-01-12T12:15");
    await user.type(screen.getByLabelText(/Unavailable end/), "2030-01-12T12:45");
    await user.type(screen.getByLabelText(/Reason/), "Inspection");
    await user.click(screen.getByRole("button", { name: "Review unavailability" }));

    // Act and assert an explicit failure instead of a false saved state.
    await user.click(screen.getByRole("button", { name: "Confirm unavailability" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save right now.");
    expect(onSaved).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-05-A: a failed early-end request must leave the venue state intact.
  it("shows an early-end failure without reporting a shortened period", async () => {
    // Arrange an active period and a rejected server request.
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("Unavailable period not found.", undefined, undefined, 404));
    renderPanel([{ id: "p1", start: "2030-01-12T11:00:00.000Z", end: "2030-01-12T13:00:00.000Z", reason: "Maintenance", current: true }]);
    await user.click(screen.getByRole("button", { name: "End early" }));

    // Act and assert the original period remains and no successful end is shown.
    await user.click(screen.getByRole("button", { name: "Confirm early end" }));
    expect(await screen.findByText("Unavailable period not found.")).toBeInTheDocument();
    expect(screen.queryByText(/Ended early:/)).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-05-A: an unexpected early-end failure is still visible.
  it("shows a generic early-end failure without refreshing", async () => {
    // Arrange an active period and a transport exception.
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new Error("Connection dropped"));
    renderPanel([{ id: "p1", start: "2030-01-12T11:00:00.000Z", end: "2030-01-12T13:00:00.000Z", reason: "Maintenance", current: true }]);
    await user.click(screen.getByRole("button", { name: "End early" }));

    // Act and assert that no success is reported.
    await user.click(screen.getByRole("button", { name: "Confirm early end" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to end the unavailable period.");
    expect(onSaved).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-04-SEC-1: non-staff readers see periods but no write controls.
  it("shows availability to a non-staff reader without management actions", () => {
    // Arrange and assert read-only controls.
    renderPanel([{ id: "p1", start: "2030-01-12T11:00:00.000Z", end: "2030-01-12T13:00:00.000Z", reason: "Maintenance" }], false);
    expect(screen.getByText(/Maintenance/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark unavailable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End early" })).not.toBeInTheDocument();
  });
});
