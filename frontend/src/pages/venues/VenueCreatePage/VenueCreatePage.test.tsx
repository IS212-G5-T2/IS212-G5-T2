import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireRole } from "@/components/auth/RequireRole";
import { VenueCreatePage } from "./VenueCreatePage";
import { VenuesPage } from "../../VenuesPage";
import { useAppStore } from "@/store/useAppStore";
import { api, ApiError } from "@/utils/api";
import { readFileAsDataUrl } from "@/utils/uploads";
import type { Venue, VenueCreateInput } from "@/types";

vi.mock("@/utils/api", async (original) => ({
  ...(await original<object>()),
  api: vi.fn(),
}));
vi.mock("@/utils/uploads", () => ({ readFileAsDataUrl: vi.fn() }));

const apiMock = vi.mocked(api);
const readFileMock = vi.mocked(readFileAsDataUrl);
const venue: Venue = {
  id: "b9c6f700-85b1-4a79-96d8-5f5c3fd616fb",
  name: "Orchid Hall Test",
  location: "Test Building Level 3",
  capacity: 120,
  facilities: ["AV System", "Wi-Fi"],
  accessibility: ["Wheelchair access"],
  layouts: ["Classroom", "Theatre"],
  operatingHours: "08:00–22:00",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};
const venueInput: VenueCreateInput = {
  name: venue.name,
  location: venue.location,
  capacity: venue.capacity,
  facilities: venue.facilities,
  accessibility: venue.accessibility,
  layouts: venue.layouts,
  operatingHours: venue.operatingHours,
  setupTimeMinutes: venue.setupTimeMinutes,
  turnaroundTimeMinutes: venue.turnaroundTimeMinutes,
};
const locationValues = {
  "Venue name": venue.name,
  Location: venue.location,
  Capacity: String(venue.capacity),
  "Operating information": venue.operatingHours,
  "Setup time (minutes)": String(venue.setupTimeMinutes),
  "Turnaround time (minutes)": String(venue.turnaroundTimeMinutes),
};

function renderRoutes(initial = "/venues/create") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/events" element={<p>Events home</p>} />
        <Route element={<RequireRole allowedRoles={["coordinator", "venue_staff"]} />}>
          <Route path="/venues" element={<VenuesPage />} />
        </Route>
        <Route element={<RequireRole allowedRoles={["venue_staff"]} />}>
          <Route path="/venues/create" element={<VenueCreatePage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

async function fillVenueDetails(user: ReturnType<typeof userEvent.setup>) {
  // Enter every required venue field and retain the existing accessibility selection style.
  for (const [label, value] of Object.entries(locationValues))
    await user.type(screen.getByLabelText(label, { exact: false }), value);
  await user.click(screen.getByLabelText("Wheelchair access"));
}

async function continueToOptions(user: ReturnType<typeof userEvent.setup>) {
  // Complete the first page before entering normalized venue options.
  await fillVenueDetails(user);
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

async function selectOptions(user: ReturnType<typeof userEvent.setup>) {
  // Select the exact facility and layout records expected in the API payload.
  for (const option of [...venue.facilities, ...venue.layouts])
    await user.click(screen.getByLabelText(option));
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  // Complete both pages of the venue wizard.
  await continueToOptions(user);
  await selectOptions(user);
}

beforeEach(() => {
  vi.resetAllMocks();
  apiMock.mockResolvedValue([]);
  readFileMock.mockResolvedValue({
    id: "upload-1",
    name: "orchid-hall.png",
    type: "image/png",
    size: 4,
    dataUrl: "data:image/png;base64,dGVzdA==",
  });
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: true,
    currentUser: {
      id: "staff-1",
      name: "Venue Staff 1",
      email: "staff@example.test",
      role: "venue_staff",
    },
    venues: [],
  });
});
afterEach(cleanup);

describe("SPM-50 venue creation", () => {
  // SPM-50 / VEN-CRE-01-A: staff can open venue creation without entering a generated identifier.
  it("opens location details without an identifier field", () => {
    renderRoutes();

    expect(screen.getByRole("heading", { name: "Create Venue" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Venue details" })).toBeTruthy();
    expect(screen.queryByLabelText(/venue identifier/i)).toBeNull();
    expect(screen.getByText(/generated automatically/i)).toBeTruthy();
    expect(screen.getByLabelText("Operating information", { exact: false })).toBeInstanceOf(
      HTMLTextAreaElement,
    );
    expect(
      screen.getAllByLabelText("Location", { exact: false }),
    ).toHaveLength(1);
  });

  // SPM-50 / VEN-CRE-01-B / AC1: a Coordinator cannot use the Venue Staff creation route.
  it("denies a Coordinator the creation flow", () => {
    useAppStore.setState({
      currentUser: {
        id: "coord-1",
        name: "Coordinator 1",
        email: "coord@example.test",
        role: "coordinator",
      },
    });

    renderRoutes();

    expect(screen.queryByRole("heading", { name: "Create Venue" })).toBeNull();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // SPM-50 / VEN-CRE-02-A, VEN-CRE-02-B: first-page data survives moving forward and back.
  it("retains location and accessibility details across pages", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await continueToOptions(user);

    expect(screen.getByRole("heading", { name: /facilities & room layouts/i })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back" }));

    for (const [label, value] of Object.entries(locationValues))
      expect(
        screen.getByLabelText(label, { exact: false }),
      ).toHaveProperty("value", value);
    expect(screen.getByLabelText("Wheelchair access")).toHaveProperty("checked", true);
  });

  // SPM-50 / VEN-CRE-03-A: missing venue fields and accessibility block the next page.
  it("reports every missing first-page value", async () => {
    const user = userEvent.setup();
    renderRoutes();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getAllByRole("alert")).toHaveLength(7);
    expect(screen.queryByRole("heading", { name: /facilities & room layouts/i })).toBeNull();
  });

  // SPM-50 / VEN-CRE-03-A: every required venue field independently prevents progression.
  it.each(Object.entries(locationValues))("rejects a missing %s", async (label) => {
    const user = userEvent.setup();
    renderRoutes();
    await fillVenueDetails(user);
    await user.clear(
      screen.getByLabelText(label, { exact: false }),
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: /facilities & room layouts/i })).toBeNull();
  });

  // SPM-50 / VEN-CRE-03-A: accessibility remains a required first-page checkbox selection.
  it("rejects a missing accessibility selection", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fillVenueDetails(user);
    await user.click(screen.getByLabelText("Wheelchair access"));

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Choose at least one accessibility feature.")).toBeTruthy();
  });

  // SPM-50 / AC3: numeric boundaries are enforced before continuing.
  it("rejects invalid capacity and duration values", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fillVenueDetails(user);
    await user.clear(screen.getByLabelText(/capacity/i));
    await user.type(screen.getByLabelText(/capacity/i), "0");
    await user.clear(screen.getByLabelText(/setup time/i));
    await user.type(screen.getByLabelText(/setup time/i), "-1");
    fireEvent.change(screen.getByLabelText(/turnaround time/i), { target: { value: "1.5" } });

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText(/whole number from 1 to 1000000/i)).toBeTruthy();
    expect(screen.getAllByText(/valid duration in whole minutes/i)).toHaveLength(2);
  });

  // SPM-50 / AC3: capacity above the supported upper boundary is rejected.
  it("rejects an excessive capacity", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fillVenueDetails(user);
    await user.clear(screen.getByLabelText(/capacity/i));
    await user.type(screen.getByLabelText(/capacity/i), "1000001");

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText(/whole number from 1 to 1000000/i)).toBeTruthy();
  });

  // SPM-50 / VEN-CRE-03-A: each normalized relationship requires at least one selection.
  it("requires facilities and room layouts on the second page", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await continueToOptions(user);

    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    expect(screen.getByText("Choose at least one facility.")).toBeTruthy();
    expect(screen.getByText("Choose at least one room layout.")).toBeTruthy();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // SPM-50 / VEN-CRE-03-C: correcting both relationship selections clears their errors.
  it("clears facility and layout errors after correction", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await continueToOptions(user);
    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    await user.click(screen.getByLabelText("AV System"));
    await user.click(screen.getByLabelText("Classroom"));

    expect(screen.queryByText("Choose at least one facility.")).toBeNull();
    expect(screen.queryByText("Choose at least one room layout.")).toBeNull();
  });

  // SPM-50 / VEN-CRE-07-A: successful creation redirects Venue Staff to the catalogue with confirmation.
  it("creates a venue then redirects to the catalogue", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fill(user);
    apiMock.mockResolvedValueOnce({ venue, message: "Venue created successfully." });

    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    expect(await screen.findByRole("heading", { name: "Venue Catalogue" })).toBeTruthy();
    expect(await screen.findByRole("status")).toHaveTextContent("Venue created successfully.");
    expect(apiMock).toHaveBeenCalledWith("/venues", {
      method: "POST",
      body: JSON.stringify(venueInput),
    });
    expect(JSON.parse(apiMock.mock.calls[0][1]!.body as string)).not.toHaveProperty("id");
  });

  // SPM-50 follow-up: a valid optional image is previewed and included in creation.
  it("reuses the shared image upload flow", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fill(user);
    const file = new File(["test"], "orchid-hall.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/venue image/i), file);
    apiMock.mockResolvedValueOnce({ venue, message: "Venue created successfully." });

    expect(await screen.findByAltText("Venue preview")).toBeTruthy();
    expect(readFileMock).toHaveBeenCalledWith(file);
    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    expect(JSON.parse(apiMock.mock.calls[0][1]!.body as string)).toMatchObject({
      image: {
        name: "orchid-hall.png",
        type: "image/png",
        size: 4,
        dataUrl: "data:image/png;base64,dGVzdA==",
      },
    });
  });

  // SPM-50 image follow-up: removing a preview excludes the optional image from creation.
  it("removes a selected image before submission", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fill(user);
    await user.upload(
      screen.getByLabelText(/venue image/i),
      new File(["test"], "orchid-hall.png", { type: "image/png" }),
    );
    await screen.findByAltText("Venue preview");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    apiMock.mockResolvedValueOnce({ venue, message: "Venue created successfully." });
    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    expect(JSON.parse(apiMock.mock.calls[0][1]!.body as string)).not.toHaveProperty("image");
  });

  // SPM-50 image follow-up: images above the backend's five-megabyte limit are blocked locally.
  it("rejects an oversized image upload", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await continueToOptions(user);
    const file = new File(["test"], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 + 1 });

    fireEvent.change(screen.getByLabelText(/venue image/i), {
      target: { files: [file] },
    });

    expect(screen.getByText("Image must be 5 MB or smaller.")).toBeTruthy();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  // SPM-50 image follow-up: a FileReader failure is visible and does not discard the form.
  it("shows a retryable error when the selected image cannot be read", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await continueToOptions(user);
    readFileMock.mockRejectedValueOnce(new Error("read failed"));
    await user.upload(
      screen.getByLabelText(/venue image/i),
      new File(["test"], "unreadable.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText("The image could not be read. Try another file."),
    ).toBeTruthy();
    expect(screen.getByLabelText(/venue image/i)).toBeTruthy();
  });

  // SPM-50 follow-up: non-image files are rejected before reading or submission.
  it("rejects a non-image upload", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await continueToOptions(user);

    fireEvent.change(screen.getByLabelText(/venue image/i), {
      target: {
        files: [new File(["test"], "notes.txt", { type: "text/plain" })],
      },
    });

    expect(screen.getByText("Choose an image file.")).toBeTruthy();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  // SPM-50 image follow-up: cancelling the file chooser leaves the optional image unset.
  it("ignores a file selection with no file", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await continueToOptions(user);

    fireEvent.change(screen.getByLabelText(/venue image/i), {
      target: { files: [] },
    });

    expect(screen.queryByText("Choose an image file.")).toBeNull();
    expect(screen.queryByText("The image could not be read. Try another file.")).toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  // SPM-50 / VEN-CRE-04-B: server field errors remain visible on their owning page.
  it("returns to venue details for a server validation error", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fill(user);
    apiMock.mockRejectedValueOnce(
      new ApiError("Check the venue details.", { location: "Location is unavailable." }),
    );

    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    expect(await screen.findByText("Location is unavailable.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Venue details" })).toBeTruthy();
  });

  // SPM-50 duplicate prevention: a duplicate natural key displays both backend field errors on Venue details.
  it("shows a duplicate venue name and location conflict", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fill(user);
    apiMock.mockRejectedValueOnce(
      new ApiError("A venue with this name and location already exists.", {
        name: "Use a different venue name or location.",
        location: "Use a different venue name or location.",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    expect(await screen.findAllByText("Use a different venue name or location.")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Venue details" })).toBeTruthy();
  });

  // SPM-50 / AC5: a persistence error without a field map stays visible as a form error.
  it("shows a form-level persistence error", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fill(user);
    apiMock.mockRejectedValueOnce(new ApiError("Unable to save the venue."));

    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save the venue.");
  });

  // SPM-50 / AC5: a second submit during a pending write cannot create a duplicate venue.
  it("ignores a duplicate submit while creation is pending", async () => {
    let resolve!: (value: unknown) => void;
    apiMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const user = userEvent.setup();
    const view = renderRoutes();
    await fill(user);

    await user.click(screen.getByRole("button", { name: "Create Venue" }));
    fireEvent.submit(view.container.querySelector("form")!);

    expect(apiMock).toHaveBeenCalledTimes(1);
    resolve({ venue, message: "Venue created successfully." });
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  // SPM-50 / AC4: an unexpected persistence failure is visible and retryable.
  it("shows a retryable message after an unexpected failure", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fill(user);
    apiMock.mockRejectedValueOnce(new Error("offline"));

    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create");
  });

  // SPM-50 / VEN-CRE-07-B: a failed creation remains in the form instead of redirecting.
  it("keeps the user in the form after a failed creation", async () => {
    const user = userEvent.setup();
    renderRoutes();
    await fill(user);
    apiMock.mockRejectedValueOnce(new ApiError("Unable to save the venue."));

    await user.click(screen.getByRole("button", { name: "Create Venue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save the venue.");
    expect(screen.getByRole("heading", { name: "Create Venue" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Venue Catalogue" })).toBeNull();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
});
