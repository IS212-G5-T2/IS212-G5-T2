/*
 * Story: SPM-138 Join Waitlist When Event Is at Capacity (the waitlist panel).
 * ACs: AC1 (join control when full), AC3 (the waiting indicator), AC4 (the confirmation banner built from name and position).
 * Test cases: JOIN-WAITLIST-01-A-FE, 01-C-FE-ALERT, 01-E-FE, 01-E-FE-PENDING, 04-A-FE.
 *
 * ASSUMPTION index:
 *  - A-TXT: "You are on the waitlist" is the waiting  copy (F20).
 *  - The banner is built here from the event name and the response position, never from the server message (D14).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WaitlistPanel } from "./WaitlistPanel";

const baseProps = {
  eventName: "Gala Waitlist Night",
  pending: false,
  error: "",
  joinedPosition: null as number | null,
  onDismissBanner: () => undefined,
};

describe("JOIN-WAITLIST-01-A/E/C and 04-A: the waitlist panel (AC1, AC3, AC4)", () => {
  /**
   * Oracle (01-A FE): an empty list with the window open offers "Join Waitlist" enabled; there is no Register here.
   */
  // Kills: F23
  it("JOIN-WAITLIST-01-A-FE: a full event offers an enabled Join Waitlist control and no Register control", () => {
    render(<WaitlistPanel {...baseProps} onJoin={() => undefined} />);

    expect(screen.getByRole("button", { name: "Join Waitlist" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });

  /**
   * Oracle (01-E FE, pending): while the join request is in flight the control is disabled, so a second click cannot send a request.
   */
  // Kills: F3
  it("JOIN-WAITLIST-01-E-FE-STATE-PENDING: the Join control is disabled while the request is pending", () => {
    render(<WaitlistPanel {...baseProps} pending onJoin={() => undefined} />);

    expect(screen.getByRole("button", { name: "Join Waitlist" })).toBeDisabled();
  });

  /**
   * Oracle (01-E FE): the panel offers no Join control without a join handler, so an attendee already on the waitlist (the
   * card carries that status) sees no second control here.
   */
  // Kills: PANEL-M
  it("JOIN-WAITLIST-01-E-FE-STATE: without a join handler the panel shows no Join control", () => {
    render(<WaitlistPanel {...baseProps} />);

    expect(screen.queryByRole("button", { name: "Join Waitlist" })).not.toBeInTheDocument();
  });

  /**
   * Oracle (01-C A FE): a refused join shows the server's refusal in an alert (MSG-WL-03 is the example).
   */
  // Kills: F24
  it("JOIN-WAITLIST-01-C-FE-ERR-ALERT: a refused join is announced in an alert", () => {
    render(<WaitlistPanel {...baseProps} onJoin={() => undefined} error="This event still has available spots. Please register directly." />);

    expect(screen.getByRole("alert")).toHaveTextContent("This event still has available spots. Please register directly.");
  });

  /**
   * Oracle (04-A FE): the banner reads exactly MSG-WL-01 with the event name and the response position; it is dismissible;
   * after a reload (the panel is mounted again without a joined position) it is gone.
   */
  // Kills: F4, F5, F19
  it("JOIN-WAITLIST-04-A-FE-STATE: the confirmation banner shows the position and can be dismissed", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<WaitlistPanel {...baseProps}  joinedPosition={1} onDismissBanner={onDismiss} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "You have joined the waitlist for Gala Waitlist Night. Your position is 1.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    rerender(<WaitlistPanel {...baseProps}  joinedPosition={null} />);
    expect(screen.queryByText(/You have joined the waitlist/)).not.toBeInTheDocument();
  });
});
