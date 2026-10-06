// SPM-80 Coordinator Updates Availability: Settings page component tests.
// ACs: AC1 (coordinators reach availability on Settings), AC2 (save
// Unavailable), AC3 (view and change at any time), AC4 (confirmation on save).
// Test cases: COOR-AVAIL-01-A/B/C/D, 02-C, 03-C/D/F, 04-A/B/C/D/BND-1.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "@/components/layout/TopNav";
import { useAppStore } from "@/store/useAppStore";
import type { User } from "@/types";
import { SettingsPage } from "./SettingsPage";

const { getMyAvailability, saveMyAvailability } = vi.hoisted(() => ({
  getMyAvailability: vi.fn(),
  saveMyAvailability: vi.fn(),
}));

vi.mock("@/utils/availability-api", () => ({ getMyAvailability, saveMyAvailability }));

const coordinator: User = {
  id: "coord-1",
  name: "Coordinator One",
  email: "coordinator1@example.test",
  role: "coordinator",
  roles: ["coordinator"],
};

function renderSettings(user: User = coordinator) {
  useAppStore.setState({ currentUser: user });
  return render(<SettingsPage />);
}

// A save that stays pending until the test resolves it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  // Fresh mocks per test; by default the coordinator is available and saves echo the value sent.
  getMyAvailability.mockReset();
  saveMyAvailability.mockReset();
  getMyAvailability.mockResolvedValue({ available: true });
  saveMyAvailability.mockImplementation(async (available: boolean) => ({ available }));
});

describe("AC1: coordinators reach availability on the Settings page", () => {
  // The availability section is part of the coordinator's Settings page.
  it("COOR-AVAIL-01-A shows a coordinator their availability and a Save button on Settings", async () => {
    // Act: open Settings as a coordinator.
    renderSettings();

    // Assert: heading, current status, both choices and Save are shown.
    expect(screen.getByRole("heading", { name: "Availability" })).toBeInTheDocument();
    expect(await screen.findByText("Current status: Available")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Available" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save availability" })).toBeInTheDocument();
  });

  // The coordinator role counts even when it is not the account's display role.
  it("COOR-AVAIL-01-B shows availability to a Coordinator + Venue Staff account", async () => {
    // Arrange: Coor_Venue-style account whose display role is venue staff.
    const coorVenue: User = { ...coordinator, role: "venue_staff", roles: ["venue_staff", "coordinator"] };

    // Act: open Settings.
    renderSettings(coorVenue);

    // Assert: the section shows and availability is loaded once.
    expect(await screen.findByText("Current status: Available")).toBeInTheDocument();
    expect(getMyAvailability).toHaveBeenCalledTimes(1);
  });

  // Other roles keep the plain Settings page and never ask for availability.
  it("COOR-AVAIL-01-C hides availability from an organiser and never loads it", () => {
    // Arrange: an organiser without the coordinator role.
    const organiser: User = { ...coordinator, id: "org-1", role: "organiser", roles: ["organiser"] };

    // Act: open Settings.
    renderSettings(organiser);

    // Assert: Settings shows, availability does not, and nothing is requested.
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Availability" })).not.toBeInTheDocument();
    expect(getMyAvailability).not.toHaveBeenCalled();
  });

  // The profile menu's Settings link is how a coordinator gets there.
  it("COOR-AVAIL-01-D reaches Settings from the profile menu", async () => {
    // Arrange: a coordinator on the events page with the top bar shown.
    const user = userEvent.setup();
    useAppStore.setState({ currentUser: coordinator });
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <TopNav onMenuClick={() => {}} />
        <Routes>
          <Route path="/events" element={<p>Events page</p>} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Act: open the profile menu and choose Settings.
    await user.click(screen.getByRole("button", { name: "Open profile menu" }));
    await user.click(screen.getByRole("link", { name: /Settings/ }));

    // Assert: the Settings page with availability is shown and the menu has closed.
    expect(await screen.findByText("Current status: Available")).toBeInTheDocument();
    expect(screen.queryByText("Events page")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Profile menu" })).not.toBeInTheDocument();
  });
});

describe("AC2: mark yourself unavailable", () => {
  // Choosing Unavailable and saving sends false to the API.
  it("COOR-AVAIL-02-C saves Unavailable through the availability API", async () => {
    // Arrange: a loaded, available coordinator.
    const user = userEvent.setup();
    renderSettings();
    await screen.findByText("Current status: Available");

    // Act: choose Unavailable and save.
    await user.click(screen.getByRole("radio", { name: "Unavailable" }));
    await user.click(screen.getByRole("button", { name: "Save availability" }));

    // Assert: false is sent once and the saved status updates.
    expect(saveMyAvailability).toHaveBeenCalledTimes(1);
    expect(saveMyAvailability).toHaveBeenCalledWith(false);
    expect(await screen.findByText("Current status: Unavailable")).toBeInTheDocument();
  });
});

describe("AC3: view and change availability at any time", () => {
  // The page reflects what is saved, not a hard-coded default.
  it("COOR-AVAIL-03-C shows the saved status when the page opens", async () => {
    // Arrange: the coordinator is saved as unavailable.
    getMyAvailability.mockResolvedValue({ available: false });

    // Act: open Settings.
    renderSettings();

    // Assert: Unavailable is shown and selected.
    expect(await screen.findByText("Current status: Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Unavailable" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Available" })).not.toBeChecked();
  });

  // A coordinator can change their mind straight away.
  it("COOR-AVAIL-03-D lets the coordinator switch back to Available in the same visit", async () => {
    // Arrange: a loaded, available coordinator.
    const user = userEvent.setup();
    renderSettings();
    await screen.findByText("Current status: Available");

    // Act: save Unavailable, then save Available.
    await user.click(screen.getByRole("radio", { name: "Unavailable" }));
    await user.click(screen.getByRole("button", { name: "Save availability" }));
    await screen.findByText("Current status: Unavailable");
    await user.click(screen.getByRole("radio", { name: "Available" }));
    await user.click(screen.getByRole("button", { name: "Save availability" }));

    // Assert: two saves in order, ending Available.
    expect(saveMyAvailability.mock.calls).toEqual([[false], [true]]);
    expect(await screen.findByText("Current status: Available")).toBeInTheDocument();
  });

  // If loading fails the page must not pretend to know the status.
  it("COOR-AVAIL-03-F shows an error with Retry and disables Save when loading fails", async () => {
    // Arrange: the first load fails, the retry succeeds.
    const user = userEvent.setup();
    getMyAvailability
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ available: false });
    renderSettings();

    // Assert: an error with Retry, no guessed status, Save disabled.
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your availability.");
    expect(screen.queryByText(/Current status:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save availability" })).toBeDisabled();

    // Act: retry.
    await user.click(screen.getByRole("button", { name: "Retry" }));

    // Assert: the saved status loads and Save is enabled.
    expect(await screen.findByText("Current status: Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save availability" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AC4: confirmation after saving", () => {
  // The confirmation names the new status.
  it("COOR-AVAIL-04-A confirms a saved Unavailable status", async () => {
    // Arrange: a loaded, available coordinator.
    const user = userEvent.setup();
    renderSettings();
    await screen.findByText("Current status: Available");

    // Act: save Unavailable.
    await user.click(screen.getByRole("radio", { name: "Unavailable" }));
    await user.click(screen.getByRole("button", { name: "Save availability" }));

    // Assert: the unavailable confirmation is shown.
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Availability saved. You are now unavailable for new event assignments.",
    );
  });

  // Switching back to Available is confirmed too.
  it("COOR-AVAIL-04-B confirms a saved Available status", async () => {
    // Arrange: a loaded, unavailable coordinator.
    const user = userEvent.setup();
    getMyAvailability.mockResolvedValue({ available: false });
    renderSettings();
    await screen.findByText("Current status: Unavailable");

    // Act: save Available.
    await user.click(screen.getByRole("radio", { name: "Available" }));
    await user.click(screen.getByRole("button", { name: "Save availability" }));

    // Assert: the available confirmation is shown.
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Availability saved. You are now available for new event assignments.",
    );
  });

  // A failed save is reported and nothing is claimed as saved.
  it("COOR-AVAIL-04-C shows an error and keeps the saved status when saving fails", async () => {
    // Arrange: a loaded, available coordinator whose save will fail.
    const user = userEvent.setup();
    saveMyAvailability.mockRejectedValue(new Error("offline"));
    renderSettings();
    await screen.findByText("Current status: Available");

    // Act: try to save Unavailable.
    await user.click(screen.getByRole("radio", { name: "Unavailable" }));
    await user.click(screen.getByRole("button", { name: "Save availability" }));

    // Assert: error shown, no confirmation, saved status unchanged.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save your availability. Please try again.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Current status: Available")).toBeInTheDocument();
  });

  // Only a completed save earns a confirmation.
  it("COOR-AVAIL-04-D shows no confirmation before anything is saved", async () => {
    // Arrange + Act: load the page, then change the choice without saving.
    const user = userEvent.setup();
    renderSettings();
    await screen.findByText("Current status: Available");
    expect(screen.queryByText(/Availability saved/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Unavailable" }));

    // Assert: still no confirmation, and the saved status has not changed.
    expect(screen.queryByText(/Availability saved/)).not.toBeInTheDocument();
    expect(screen.getByText("Current status: Available")).toBeInTheDocument();
  });

  // Double-clicking Save must not send two requests.
  it("COOR-AVAIL-04-BND-1 disables Save while saving so only one request is sent", async () => {
    // Arrange: a save that stays pending.
    const user = userEvent.setup();
    const pending = deferred<{ available: boolean }>();
    saveMyAvailability.mockReturnValue(pending.promise);
    renderSettings();
    await screen.findByText("Current status: Available");
    await user.click(screen.getByRole("radio", { name: "Unavailable" }));

    // Act: click Save, then click again while it is still saving.
    await user.click(screen.getByRole("button", { name: "Save availability" }));
    const saving = screen.getByRole("button", { name: "Saving…" });
    expect(saving).toBeDisabled();
    await user.click(saving);

    // Assert: one request; the confirmation appears once it finishes.
    expect(saveMyAvailability).toHaveBeenCalledTimes(1);
    pending.resolve({ available: false });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Availability saved. You are now unavailable for new event assignments.",
      ),
    );
  });
});
