// Sidebar sign-out.
// SPM-30 (AC1: sign in and out with email and password): USER-LOGIN-01-F.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { Sidebar } from "./Sidebar";

const logout = vi.fn();

beforeEach(() => {
  // A signed-in coordinator whose logout succeeds.
  logout.mockReset();
  logout.mockResolvedValue(undefined);
  useAppStore.setState({
    currentUser: {
      id: "coord-1",
      name: "Coordinator 1",
      email: "coordinator1@connectsphere.test",
      role: "coordinator",
      roles: ["coordinator"],
    },
    logout,
  });
});

describe("SPM-30: signing out from the sidebar", () => {
  // Log out sits at the bottom of the sidebar, where Settings used to be.
  it("USER-LOGIN-01-F logs out from the sidebar and returns to the login page", async () => {
    // Arrange: the sidebar on the events page.
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Sidebar mobileOpen={false} onCloseMobile={vi.fn()} />
        <Routes>
          <Route path="/events" element={<p>Events page</p>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    // Assert: Settings and the theme switch have moved to the profile menu.
    expect(screen.queryByRole("link", { name: /Settings/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    // Act: log out.
    await user.click(screen.getByRole("button", { name: "Log out" }));

    // Assert: the session is ended and the login page is shown.
    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });
});
