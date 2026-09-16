import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { TopNav } from "./TopNav";

afterEach(cleanup);

beforeEach(() => {
  useAppStore.setState({
    currentUser: {
      id: "organiser-1",
      name: "Signed-in Organiser",
      email: "organiser@example.test",
      role: "organiser",
    },
  });
});

describe("TopNav", () => {
  it("shows the Firebase-derived signed-in user without offering role switching", () => {
    render(
      <MemoryRouter>
        <TopNav onMenuClick={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/signed in as/i)).toHaveTextContent("Signed-in Organiser");
    expect(screen.queryByRole("button", { name: /switch mock user role/i })).not.toBeInTheDocument();
  });
});
