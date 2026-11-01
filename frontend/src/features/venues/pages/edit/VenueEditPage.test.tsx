import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const IMAGE_A_URL = `data:image/png;base64,${btoa("stored-image")}`;

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
        <Route path="/venue-records" element={<p>Venue records list</p>} />
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
  /** VEN-UPD-01-A VEN-UPD-01-UI-A: AC1 — opening the edit form pre-fills every editable field (details, operating info, durations, accessibility, facilities, layouts, image) and sends no save request. */
  it("VEN-UPD-01-UI-A pre-fills the form with current venue values after load", async () => {
    const storedImage = { name: "hall.png", type: "image/png", size: 12, dataUrl: IMAGE_A_URL };
    apiMock.mockResolvedValue({ ...venue, image: storedImage } as unknown as ReturnType<typeof api>);
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());

    // Step 1: every detail field shows the stored value.
    expect((screen.getByLabelText(/Venue name/i) as HTMLInputElement).value).toBe(venue.name);
    expect((screen.getByLabelText(/Location/i) as HTMLInputElement).value).toBe(venue.location);
    expect((screen.getByLabelText(/Capacity/i) as HTMLInputElement).value).toBe(String(venue.capacity));
    expect((screen.getByLabelText(/Operating information/i) as HTMLTextAreaElement).value).toBe(venue.operatingInformation);
    expect((screen.getByLabelText(/Setup time/i) as HTMLInputElement).value).toBe(String(venue.setupTimeMinutes));
    expect((screen.getByLabelText(/Turnaround time/i) as HTMLInputElement).value).toBe(String(venue.turnaroundTimeMinutes));
    // Accessibility: only the stored option is selected.
    expect(screen.getByLabelText("Wheelchair access")).toBeChecked();
    expect(screen.getByLabelText("Hearing loop")).not.toBeChecked();
    expect(screen.getByLabelText("Elevator access")).not.toBeChecked();

    // Step 2: stored facilities, layouts and image are shown.
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByLabelText("AV System")).toBeChecked();
    expect(screen.getByLabelText("Catering")).not.toBeChecked();
    expect(screen.getByLabelText("Theatre")).toBeChecked();
    expect(screen.getByLabelText("Classroom")).not.toBeChecked();
    expect(screen.getByAltText("Venue preview")).toHaveAttribute("src", IMAGE_A_URL);
    expect(screen.getByText("hall.png")).toBeInTheDocument();

    // Opening (and paging through) the form must not save anything: only the one GET happened.
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith(`/venues/${venue.id}`);
    expect(apiMock.mock.calls.some(([, init]) => (init as { method?: string } | undefined)?.method === "PATCH")).toBe(false);
  });

  /** VEN-UPD-01-B VEN-UPD-01-UI-B: load failure shows an error message. */
  it("VEN-UPD-01-UI-B shows an error when venue load fails", async () => {
    apiMock.mockRejectedValueOnce(new Error("network"));
    renderEdit();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/not found|could not be loaded/i),
    );
  });

  /** VEN-UPD-05-A VEN-UPD-05-UI-A: AC5 — submitting the form calls the PATCH endpoint and shows the success message. */
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

  /** VEN-UPD-03-UI-A: AC3 — clearing a required field and clicking Continue shows that field's own error, stays on step 1, sends no save request and leaves the stored record unchanged on reload. */
  it.each([
    ["Venue name", /Venue name/i, "Venue name is required."],
    ["Location", /^Location/i, "Location is required."],
    ["Operating information", /Operating information/i, "Operating information is required."],
  ])("VEN-UPD-03-UI-A shows a field-specific error when %s is cleared before Continue", async (_field, label, message) => {
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());

    await user.clear(screen.getByLabelText(label));
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    // The message names the cleared field and is attached to it; no other field is flagged.
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(message);
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("button", { name: /Save changes/i })).toBeNull();
    // Nothing was sent to the server except the initial load.
    expect(apiMock).toHaveBeenCalledTimes(1);

    // Reloading the page re-reads the stored row, which is still the original venue.
    cleanup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    expect((screen.getByLabelText(/Venue name/i) as HTMLInputElement).value).toBe(venue.name);
    expect((screen.getByLabelText(/^Location/i) as HTMLInputElement).value).toBe(venue.location);
    expect((screen.getByLabelText(/Operating information/i) as HTMLTextAreaElement).value).toBe(venue.operatingInformation);
    expect(apiMock.mock.calls.every(([path, init]) => path === `/venues/${venue.id}` && !init)).toBe(true);
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

  /** VEN-UPD-07-B VEN-UPD-07-UI-B: AC7 — navigating directly to another staff member's edit URL shows a forbidden message instead of the form. */
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

  /** VEN-UPD-05-B VEN-UPD-05-UI-B: AC5 — a failed save shows an error, not a success message. */
  it("VEN-UPD-05-UI-B shows an error message when the save fails", async () => {
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>) // GET
      .mockRejectedValueOnce(new Error("network"));

    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(await screen.findByRole("button", { name: /Save changes/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Venue updated successfully/i)).toBeNull();
  });

  /** VEN-UPD-02-C VEN-UPD-02-C-UI: AC2 — the image field is present on the edit form's second step. */
  it("VEN-UPD-02-C-UI renders a file input for replacing the venue image", async () => {
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByLabelText(/Venue image/i)).toBeInTheDocument();
  });

  /** VEN-UPD-02-C VEN-UPD-02-C-UI: AC2 — uploading image A, replacing it with distinct image B and saving sends only image B with every other field unchanged; reopening the form shows image B. */
  it("VEN-UPD-02-C-UI replaces image A with image B, saves it and shows B after reopening", async () => {
    const fileA = new File(["image-a-bytes"], "a.png", { type: "image/png" });
    const fileB = new File(["image-b-bytes-longer"], "b.png", { type: "image/png" });
    const urlA = `data:image/png;base64,${btoa("image-a-bytes")}`;
    const urlB = `data:image/png;base64,${btoa("image-b-bytes-longer")}`;
    expect(urlA).not.toBe(urlB);
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>) // GET (no image yet)
      .mockResolvedValueOnce({
        venue,
        message: "Venue updated successfully.",
        affectedBookings: [],
        capacityBookings: [],
      } as unknown as ReturnType<typeof api>); // PATCH

    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.queryByAltText("Venue preview")).toBeNull();

    // Upload image A, then replace it with image B.
    await user.upload(screen.getByLabelText(/Venue image/i), fileA);
    expect(await screen.findByAltText("Venue preview")).toHaveAttribute("src", urlA);
    expect(screen.getByText("a.png")).toBeInTheDocument();
    await user.upload(screen.getByLabelText(/Venue image/i), fileB);
    await waitFor(() => expect(screen.getByAltText("Venue preview")).toHaveAttribute("src", urlB));
    expect(screen.getByText("b.png")).toBeInTheDocument();
    expect(screen.queryByText("a.png")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Venue updated successfully/i));

    // The PATCH body carries image B and the unchanged values of every other field.
    const patch = apiMock.mock.calls.find(([, init]) => (init as { method?: string } | undefined)?.method === "PATCH");
    expect(patch?.[0]).toBe(`/venues/${venue.id}`);
    const body = JSON.parse((patch?.[1] as { body: string }).body);
    expect(body.image).toEqual({ name: "b.png", type: "image/png", size: fileB.size, dataUrl: urlB });
    expect({ ...body, image: undefined }).toEqual({
      image: undefined,
      name: venue.name,
      location: venue.location,
      capacity: venue.capacity,
      facilities: venue.facilities,
      accessibility: venue.accessibility,
      layouts: venue.layouts,
      operatingInformation: venue.operatingInformation,
      setupTimeMinutes: venue.setupTimeMinutes,
      turnaroundTimeMinutes: venue.turnaroundTimeMinutes,
    });

    // Reopening the form after the save loads the stored record: image B is shown, not A.
    cleanup();
    apiMock.mockResolvedValueOnce({ ...venue, image: body.image } as unknown as ReturnType<typeof api>);
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByAltText("Venue preview")).toHaveAttribute("src", urlB);
  });

  /** VEN-UPD-02-C VEN-UPD-02-C-UI: AC2 — a non-image file and an oversize image are rejected with a message and do not replace the stored image. */
  it("VEN-UPD-02-C-UI rejects a non-image file and an oversize image without changing the current image", async () => {
    const storedImage = { name: "hall.png", type: "image/png", size: 12, dataUrl: IMAGE_A_URL };
    apiMock.mockResolvedValue({ ...venue, image: storedImage } as unknown as ReturnType<typeof api>);
    const user = userEvent.setup({ applyAccept: false });
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await user.upload(screen.getByLabelText(/Venue image/i), new File(["plain"], "notes.txt", { type: "text/plain" }));
    expect(await screen.findByText("Choose an image file.")).toBeInTheDocument();
    expect(screen.getByAltText("Venue preview")).toHaveAttribute("src", IMAGE_A_URL);

    const oversize = new File(["x"], "huge.png", { type: "image/png" });
    Object.defineProperty(oversize, "size", { value: 5 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText(/Venue image/i), oversize);
    expect(await screen.findByText("Image must be 5 MB or smaller.")).toBeInTheDocument();
    expect(screen.getByAltText("Venue preview")).toHaveAttribute("src", IMAGE_A_URL);
    expect(screen.getByText("hall.png")).toBeInTheDocument();
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

  /** VEN-UPD-03-C VEN-UPD-03-D VEN-UPD-03-UI-C: AC3 — an out-of-range capacity or an invalid setup/turnaround duration is refused on step 1 with that field's message, and nothing is saved. */
  it.each([
    ["Capacity", "0", "Enter a whole number from 1 to 1000000."],
    ["Capacity", "1000001", "Enter a whole number from 1 to 1000000."],
    ["Capacity", "2.5", "Enter a whole number from 1 to 1000000."],
    ["Setup time", "-1", "Enter a valid duration in whole minutes (0 or more)."],
    ["Turnaround time", "2.5", "Enter a valid duration in whole minutes (0 or more)."],
  ])("VEN-UPD-03-UI-C refuses %s = %s on Continue with the field's message", async (label, value, message) => {
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());

    const input = screen.getByLabelText(new RegExp(label, "i"));
    await user.clear(input);
    await user.type(input, value);
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: /Save changes/i })).toBeNull();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  /** VEN-UPD-05-A VEN-UPD-05-UI-C: AC2/AC5 — every edited field, accessibility, facility and layout selection is sent in the PATCH body. */
  it("VEN-UPD-05-UI-C sends every edited field in the PATCH request", async () => {
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>) // GET
      .mockResolvedValueOnce({
        venue,
        message: "Venue updated successfully.",
        affectedBookings: [],
        capacityBookings: [],
      } as unknown as ReturnType<typeof api>); // PATCH
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());

    // Step 1: change every detail field and swap the accessibility selection.
    const replace = async (label: RegExp, value: string) => {
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
    };
    await replace(/Venue name/i, "Orchid Hall Annex");
    await replace(/^Location/i, "Block B Level 1");
    await replace(/Capacity/i, "150");
    await replace(/Operating information/i, "Open daily");
    await replace(/Setup time/i, "60");
    await replace(/Turnaround time/i, "70");
    await user.click(screen.getByLabelText("Hearing loop"));
    await user.click(screen.getByLabelText("Wheelchair access"));
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 2: add one facility and one layout, drop none.
    await user.click(screen.getByLabelText("Catering"));
    await user.click(screen.getByLabelText("Classroom"));
    await user.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Venue updated successfully/i));

    const patch = apiMock.mock.calls.find(([, init]) => (init as { method?: string } | undefined)?.method === "PATCH");
    expect(JSON.parse((patch?.[1] as { body: string }).body)).toEqual({
      name: "Orchid Hall Annex",
      location: "Block B Level 1",
      capacity: 150,
      facilities: ["AV System", "Catering"],
      accessibility: ["Hearing loop"],
      layouts: ["Theatre", "Classroom"],
      operatingInformation: "Open daily",
      setupTimeMinutes: 60,
      turnaroundTimeMinutes: 70,
    });
  });

  /** VEN-UPD-05-A VEN-UPD-05-UI-D: AC5 — Cancel and Back to venues return to the venue list, Continue editing reopens the form and Back keeps the entries. */
  it("VEN-UPD-05-UI-D offers Cancel, Back, Back to venues and Continue editing controls", async () => {
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>) // GET
      .mockResolvedValueOnce({
        venue,
        message: "Venue updated successfully.",
        affectedBookings: [],
        capacityBookings: [],
      } as unknown as ReturnType<typeof api>); // PATCH
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());

    // Back from step 2 returns to step 1 with the entries intact.
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    expect((screen.getByLabelText(/Venue name/i) as HTMLInputElement).value).toBe(venue.name);

    // Save, then Continue editing shows the form again where it was left (step 2).
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(screen.getByRole("button", { name: /Save changes/i }));
    await user.click(await screen.findByRole("button", { name: /Continue editing/i }));
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeInTheDocument();
    expect(screen.queryByText(/Venue updated successfully/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Back$/i }));

    // Cancel leaves for the list without another request.
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(await screen.findByText("Venue records list")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /** VEN-UPD-05-A VEN-UPD-05-UI-D: AC5 — Back to venues on the success message returns to the venue list. */
  it("VEN-UPD-05-UI-D leaves for the venue list from the success message", async () => {
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>) // GET
      .mockResolvedValueOnce({
        venue,
        message: "Venue updated successfully.",
        affectedBookings: [],
        capacityBookings: [],
      } as unknown as ReturnType<typeof api>); // PATCH
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(screen.getByRole("button", { name: /Save changes/i }));
    await user.click(await screen.findByRole("button", { name: /Back to venues/i }));
    expect(await screen.findByText("Venue records list")).toBeInTheDocument();
  });

  /** VEN-UPD-01-UI-SUP: branch — component rendered without a route :id param sets loadError immediately (covers the !id guard in the load useEffect). */
  it("VEN-UPD-01-UI-SUP shows load error when rendered without a venue id in the route", async () => {
    render(
      <MemoryRouter initialEntries={["/venue-records/edit"]}>
        <Routes>
          <Route path="/venue-records/edit" element={<VenueEditPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/not found|could not be loaded/i),
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  /** VEN-UPD-02-C-UI-SUP: branch — file picker dismissed with no file selected; selectImage returns early without error (covers the !file guard). */
  it("VEN-UPD-02-C-UI-SUP shows no error when the file picker is cancelled without a file", async () => {
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    fireEvent.change(screen.getByLabelText(/Venue image/i), { target: { files: [] } });
    // No image error should appear
    expect(screen.queryByText(/Choose an image file/i)).toBeNull();
    expect(screen.queryByText(/Image must be/i)).toBeNull();
  });

  /** VEN-UPD-05-UI-SUP: branch — a second submit fired while the first PATCH is still pending is discarded (covers the busy guard). */
  it("VEN-UPD-05-UI-SUP ignores a second submit while the first request is still pending", async () => {
    let resolvePatch!: (v: unknown) => void;
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>)
      .mockReturnValueOnce(new Promise((res) => { resolvePatch = res; }) as unknown as ReturnType<typeof api>);

    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    // First click starts the PATCH and sets busy=true
    await user.click(await screen.findByRole("button", { name: /Save Changes/i }));
    // While busy, fire submit again via the form element (button is disabled)
    fireEvent.submit(document.querySelector("form")!);
    // Only GET + one PATCH — no duplicate
    expect(apiMock).toHaveBeenCalledTimes(2);

    resolvePatch({ venue, message: "Venue updated successfully.", affectedBookings: [], capacityBookings: [] });
  });

  /** VEN-UPD-03-UI-D: AC3 — submitting step 2 with no facility selected shows the "choose a facility" error and does not call the API. */
  it("VEN-UPD-03-UI-D shows a facilities error when no facility is selected before Save", async () => {
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    // Deselect the only pre-filled facility
    await user.click(screen.getByLabelText("AV System"));
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Choose at least one facility.");
    expect(apiMock).toHaveBeenCalledTimes(1); // only the initial GET
  });

  /** VEN-UPD-03-UI-E: AC3 — submitting step 2 with no room layout selected shows the "choose a layout" error and does not call the API. */
  it("VEN-UPD-03-UI-E shows a layouts error when no room layout is selected before Save", async () => {
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    // Deselect the only pre-filled layout
    await user.click(screen.getByLabelText("Theatre"));
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Choose at least one room layout.");
    expect(apiMock).toHaveBeenCalledTimes(1); // only the initial GET
  });

  /** VEN-UPD-05-UI-E: AC5 — ApiError with no per-field errors shows a form-level message and leaves the user on step 2 (no navigation to step 1). */
  it("VEN-UPD-05-UI-E shows a form-level error and stays on step 2 when the server returns no field details", async () => {
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>)
      .mockRejectedValueOnce(new ApiError("Internal server error.", undefined, undefined, 500));

    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(await screen.findByRole("button", { name: /Save Changes/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Internal server error."),
    );
    // No navigation to step 1 — the Save Changes button is still visible
    expect(screen.getByRole("button", { name: /Save Changes/i })).toBeInTheDocument();
  });

  /** VEN-UPD-02-C VEN-UPD-02-C-UI: AC2 — removing the image sends no image, and an unreadable file shows a message without changing the image. */
  it("VEN-UPD-02-C-UI removes the stored image and reports an unreadable file", async () => {
    const storedImage = { name: "hall.png", type: "image/png", size: 12, dataUrl: IMAGE_A_URL };
    apiMock
      .mockResolvedValueOnce({ ...venue, image: storedImage } as unknown as ReturnType<typeof api>) // GET
      .mockResolvedValueOnce({
        venue,
        message: "Venue updated successfully.",
        affectedBookings: [],
        capacityBookings: [],
      } as unknown as ReturnType<typeof api>); // PATCH
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    // An unreadable file leaves the stored image in place and explains why.
    const readerSpy = vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>));
    });
    await user.upload(screen.getByLabelText(/Venue image/i), new File(["x"], "broken.png", { type: "image/png" }));
    expect(await screen.findByText("The image could not be read. Try another file.")).toBeInTheDocument();
    expect(screen.getByAltText("Venue preview")).toHaveAttribute("src", IMAGE_A_URL);
    readerSpy.mockRestore();

    // Removing the image drops the preview, and the saved request carries no image.
    await user.click(screen.getByRole("button", { name: /Remove/i }));
    expect(screen.queryByAltText("Venue preview")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Venue updated successfully/i));
    const patch = apiMock.mock.calls.find(([, init]) => (init as { method?: string } | undefined)?.method === "PATCH");
    expect(JSON.parse((patch?.[1] as { body: string }).body)).not.toHaveProperty("image");
  });
});

/*
 * SPM-125 AC8 and AC9: after a venue edit, Venue Staff see which listed bookings' Event Coordinators were notified.
 * Frontend unit tests with the API stubbed; the Venue Staff member is a fixture, not a live login.
 */
describe("SPM-125 notified Coordinators after a venue edit", () => {
  const listed = (bookingId: string, eventName: string, coordinatorNotified?: boolean): AffectedBooking => ({
    bookingId,
    eventName,
    start: "2030-03-01T10:00:00.000Z",
    end: "2030-03-01T12:00:00.000Z",
    status: "approved",
    ...(coordinatorNotified ? { coordinatorNotified } : {}),
  });

  async function saveWith(affectedBookings: AffectedBooking[], capacityBookings: AffectedBooking[]) {
    apiMock
      .mockResolvedValueOnce(venue as unknown as ReturnType<typeof api>)
      .mockResolvedValueOnce({ venue, message: "Venue updated successfully.", affectedBookings, capacityBookings } as unknown as ReturnType<typeof api>);
    const user = userEvent.setup();
    renderEdit();
    await waitFor(() => expect(screen.queryByText(/Loading venue/i)).toBeNull());
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(await screen.findByRole("button", { name: /Save changes/i }));
    await screen.findByText("Venue updated successfully.");
  }

  /**
   * VEN-IMPACT-08-E (AC8): a booking made to conflict by the setup or turnaround change is marked "Coordinator
   * notified", and the list says how many Coordinators were notified.
   * Kills: the edit result hiding that Coordinators were notified.
   */
  it("VEN-IMPACT-08-E marks the conflicting bookings whose Coordinators were notified", async () => {
    await saveWith([listed("bk-1", "Workshop", true), listed("bk-2", "Seminar", true)], []);

    expect(screen.getByText("Workshop").closest("li")).toHaveTextContent("Coordinator notified");
    expect(screen.getByText("The Event Coordinators of 2 bookings have been notified in-app.")).toBeInTheDocument();
  });

  /**
   * VEN-IMPACT-09-E (AC9): after a capacity change, a notified booking is marked and the count is singular for one;
   * a booking that was not notified (ended, or no Coordinator) is not marked.
   * Kills: marking every listed booking as notified.
   */
  it("VEN-IMPACT-09-E marks only the capacity bookings whose Coordinators were notified", async () => {
    await saveWith([], [listed("bk-1", "Tech Conference", true), listed("bk-2", "Past Seminar")]);

    expect(screen.getByText("Tech Conference").closest("li")).toHaveTextContent("Coordinator notified");
    expect(screen.getByText("Past Seminar").closest("li")).not.toHaveTextContent("Coordinator notified");
    expect(screen.getByText("The Event Coordinator of 1 booking has been notified in-app.")).toBeInTheDocument();
  });

  /** VEN-IMPACT-09-BND-2 (AC9): when no listed booking was notified, the result says why. */
  it("VEN-IMPACT-09-BND-2 says no Coordinator was notified when no listed booking could be", async () => {
    await saveWith([], [listed("bk-2", "Past Seminar")]);

    expect(
      screen.getByText("No Event Coordinator was notified: these bookings have ended or have no assigned Coordinator."),
    ).toBeInTheDocument();
  });
});
