import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_USERS, useAppStore } from "@/store/useAppStore";
import { TopNav } from "./TopNav";

afterEach(cleanup);

beforeEach(() => {
  useAppStore.setState({ currentUser: MOCK_USERS[1] });
});

describe("TopNav", () => {
  // Second story mock RBAC prep
  it("switches between mock Coordinator, Organiser, Venue Staff, Tech Support, and Admin profiles", async () => {
    const user = userEvent.setup();
    render(<TopNav onMenuClick={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /switch mock user role/i }));

    expect(screen.getByRole("menuitem", { name: /demo coordinator/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /demo organiser/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /demo venue staff/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /demo tech support/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /demo admin/i })).toBeTruthy();

    await user.click(screen.getByRole("menuitem", { name: /demo coordinator/i }));

    expect(useAppStore.getState().currentUser).toMatchObject({
      id: "coordinator-1",
      role: "coordinator",
    });
  });
});
