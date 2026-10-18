import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell responsive content sizing", () => {
  it("allows main content and its flex ancestors to shrink below intrinsic child widths", () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveClass("min-w-0");
    expect(main.parentElement).toHaveClass("min-w-0");
    expect(main.firstElementChild).toHaveClass("w-full", "min-w-0", "max-w-6xl");
  });
});
