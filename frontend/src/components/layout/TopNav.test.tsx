// Top bar profile menu.
// SPM-30 (AC2: the signed-in user is correctly identified): USER-LOGIN-02-E/F/G.
// SPM-80 (AC3: a coordinator can view their availability at any time): COOR-AVAIL-03-J/K/L/M/N.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { useThemeStore } from "@/store/useThemeStore";
import type { User } from "@/types";
import { TopNav } from "./TopNav";

const { getMyAvailability } = vi.hoisted(() => ({ getMyAvailability: vi.fn() }));

vi.mock("@/features/account/api/availability-api", () => ({ getMyAvailability, saveMyAvailability: vi.fn() }));

const coordinator: User = {
  id: "coord-1",
  name: "Coordinator 1",
  email: "coordinator1@connectsphere.test",
  role: "coordinator",
  roles: ["coordinator"],
};

const organiser: User = {
  id: "org-1",
  name: "Organiser 1",
  email: "organiser1@connectsphere.test",
  role: "organiser",
  roles: ["organiser"],
};

function renderTopNav(user: User = coordinator) {
  useAppStore.setState({ currentUser: user });
  return render(
    <MemoryRouter>
      <TopNav onMenuClick={vi.fn()} />
    </MemoryRouter>,
  );
}

// A promise the test settles by hand, to control the order loads finish in.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Opens the menu from the avatar and returns the menu panel.
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open profile menu" }));
  return screen.getByRole("region", { name: "Profile menu" });
}

beforeEach(() => {
  // Fresh mocks per test; coordinators are available unless a test says otherwise.
  getMyAvailability.mockReset();
  getMyAvailability.mockResolvedValue({ available: true });
  useThemeStore.setState({ theme: "light" });
});

describe("SPM-30 AC2: the signed-in user is identified in the top bar", () => {
  // The avatar shows the first letter of the first and last words of the display name.
  it.each([
    ["Coordinator 1", "C1"],
    ["Ei Chaw Zin", "EZ"],
    ["Coor_Venue", "CV"],
    ["attendee", "A"],
    ["", "?"],
  ])("USER-LOGIN-02-E shows %j as the initials %s", (name, initials) => {
    // Act: render the top bar for that user.
    renderTopNav({ ...organiser, name });

    // Assert: the avatar button shows the initials; the old "Signed in as" text is gone.
    expect(screen.getByRole("button", { name: "Open profile menu" })).toHaveTextContent(initials);
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });

  // The avatar opens a menu with the user's name, Settings and the theme switch.
  it("USER-LOGIN-02-F opens a profile menu with the name, Settings and theme, and closes it", async () => {
    // Arrange: an organiser's top bar.
    const user = userEvent.setup();
    renderTopNav(organiser);
    const avatar = screen.getByRole("button", { name: "Open profile menu" });
    expect(avatar).toHaveAttribute("aria-expanded", "false");

    // Act: open the menu.
    const menu = await openMenu(user);

    // Assert: name, Settings link, theme switch; no role switching offered.
    expect(avatar).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByText("Organiser 1")).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings");
    expect(within(menu).getByRole("switch")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /switch mock user role/i })).not.toBeInTheDocument();

    // Act + Assert: Escape closes it.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Profile menu" })).not.toBeInTheDocument();

    // Act + Assert: a click outside closes it too.
    await openMenu(user);
    await user.click(document.body);
    expect(screen.queryByRole("region", { name: "Profile menu" })).not.toBeInTheDocument();
  });

  // Light/dark mode now lives in the profile menu.
  it("USER-LOGIN-02-G switches between light and dark mode from the profile menu", async () => {
    // Arrange: light mode, menu open.
    const user = userEvent.setup();
    renderTopNav(organiser);
    const menu = await openMenu(user);
    const toggle = within(menu).getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    // Act: flip the switch.
    await user.click(toggle);

    // Assert: dark mode is on.
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(within(menu).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});

describe("SPM-80 AC3: a coordinator sees their availability in the profile menu", () => {
  // Available is a green label in place of the email.
  it("COOR-AVAIL-03-J shows a green Available label instead of the email", async () => {
    // Arrange + Act: an available coordinator opens the menu.
    const user = userEvent.setup();
    renderTopNav();
    const menu = await openMenu(user);

    // Assert: green Available label, email not shown.
    const label = await within(menu).findByText("Available");
    expect(label).toHaveClass("bg-success-100");
    expect(within(menu).queryByText("coordinator1@connectsphere.test")).not.toBeInTheDocument();
  });

  // Unavailable is a grey label.
  it("COOR-AVAIL-03-K shows a grey Unavailable label", async () => {
    // Arrange: the coordinator is saved as unavailable.
    const user = userEvent.setup();
    getMyAvailability.mockResolvedValue({ available: false });
    renderTopNav();

    // Act: open the menu.
    const menu = await openMenu(user);

    // Assert: grey Unavailable label, not green.
    const label = await within(menu).findByText("Unavailable");
    expect(label).toHaveClass("bg-gray-100");
    expect(label).not.toHaveClass("bg-success-100");
  });

  // The label reflects what is saved now, e.g. after a change on Settings.
  it("COOR-AVAIL-03-L shows the latest saved status each time the menu opens", async () => {
    // Arrange: available at first, unavailable after a change saved elsewhere.
    const user = userEvent.setup();
    getMyAvailability
      .mockResolvedValueOnce({ available: true })
      .mockResolvedValueOnce({ available: false });
    renderTopNav();
    expect(await within(await openMenu(user)).findByText("Available")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    // Act: reopen the menu.
    const menu = await openMenu(user);

    // Assert: the new status is loaded and shown.
    expect(await within(menu).findByText("Unavailable")).toBeInTheDocument();
    expect(getMyAvailability).toHaveBeenCalledTimes(2);
  });

  // Other roles have no availability; they keep their email.
  it("COOR-AVAIL-03-M shows a non-coordinator their email and never loads availability", async () => {
    // Arrange + Act: an organiser opens the menu.
    const user = userEvent.setup();
    renderTopNav(organiser);
    const menu = await openMenu(user);

    // Assert: email shown, no label, nothing requested.
    expect(within(menu).getByText("organiser1@connectsphere.test")).toBeInTheDocument();
    expect(within(menu).queryByText(/^(Available|Unavailable)$/)).not.toBeInTheDocument();
    expect(getMyAvailability).not.toHaveBeenCalled();
  });

  // If the status can't be loaded, show the email rather than guess.
  it("COOR-AVAIL-03-N shows the email instead of guessing when the status cannot load", async () => {
    // Arrange: a load the test fails on purpose.
    const user = userEvent.setup();
    const load = deferred<{ available: boolean }>();
    getMyAvailability.mockReturnValue(load.promise);
    renderTopNav();

    // Act: open the menu, then make the load fail and let it settle.
    const menu = await openMenu(user);
    expect(getMyAvailability).toHaveBeenCalledTimes(1);
    await act(async () => {
      load.reject(new Error("offline"));
      await load.promise.catch(() => undefined);
    });

    // Assert: after the failure the email is shown and no status is guessed.
    expect(within(menu).getByText("coordinator1@connectsphere.test")).toBeInTheDocument();
    expect(within(menu).queryByText(/^(Available|Unavailable)$/)).not.toBeInTheDocument();
  });

  // A slow load from an earlier opening must not overwrite a newer one.
  it("COOR-AVAIL-03-Q ignores a slow load from an earlier opening that finishes last", async () => {
    // Arrange: the first opening's load is slow; the second's is fast.
    const user = userEvent.setup();
    const slow = deferred<{ available: boolean }>();
    const fast = deferred<{ available: boolean }>();
    getMyAvailability.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    renderTopNav();

    // Act: open (slow load starts), close, reopen (fast load starts).
    await openMenu(user);
    await user.keyboard("{Escape}");
    const menu = await openMenu(user);

    // Act: the newer load finishes first (unavailable), then the older one (available).
    await act(async () => {
      fast.resolve({ available: false });
      await fast.promise;
    });
    expect(within(menu).getByText("Unavailable")).toBeInTheDocument();
    await act(async () => {
      slow.resolve({ available: true });
      await slow.promise;
    });

    // Assert: the newer status stays; the late, older one is ignored.
    expect(within(menu).getByText("Unavailable")).toBeInTheDocument();
    expect(within(menu).queryByText("Available")).not.toBeInTheDocument();
  });
});
