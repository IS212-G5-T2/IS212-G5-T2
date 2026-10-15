/*
 * Story: SPM-138 Join Waiting List When Event Is at Capacity (the waiting list panel).
 * ACs: AC1 (join control when full), AC3 (the waiting indicator), AC4 (the confirmation banner built from name and position).
 * Test cases: JOIN-WAITLIST-01-A-FE, 01-C-FE-ALERT, 01-E-FE, 01-E-FE-PENDING, 04-A-FE.
 *
 * ASSUMPTION index:
 *  - A-TXT: "You are on the waiting list" is the waiting indicator copy (F20).
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
  indicator: false,
  onDismissBanner: () => undefined,
};

describe("JOIN-WAITLIST-01-A/E/C and 04-A: the waiting list panel (AC1, AC3, AC4)", () => {
  /**
   * Oracle (01-A FE): an empty list with the window open offers "Join Waiting List" enabled; there is no Register here.
   */
  // Kills: F23 (Join control always disabled)
  it("JOIN-WAITLIST-01-A-FE: a full event offers an enabled Join Waiting List control and no Register control", () => {
    render(<WaitlistPanel {...baseProps} onJoin={() => undefined} />);

    expect(screen.getByRole("button", { name: "Join Waiting List" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });

  /**
   * Oracle (01-E FE, pending): while the join request is in flight the control is disabled, so a second click cannot send a request.
   */
  // Kills: F3 (Join not disabled while pending)
  it("JOIN-WAITLIST-01-E-FE-STATE-PENDING: the Join control is disabled while the request is pending", () => {
    render(<WaitlistPanel {...baseProps} pending onJoin={() => undefined} />);

    expect(screen.getByRole("button", { name: "Join Waiting List" })).toBeDisabled();
  });

  /**
   * Oracle (01-E FE): an attendee already on the list sees the waiting indicator, never the Join control.
   */
  // Kills: F21 (indicator copy), F25 (indicator never shown)
  it("JOIN-WAITLIST-01-E-FE-STATE: a waiting attendee sees the indicator and no Join control", () => {
    render(<WaitlistPanel {...baseProps} indicator />);

    expect(screen.getByText("You are on the waiting list")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join Waiting List" })).not.toBeInTheDocument();
  });

  /**
   * Oracle (01-C A FE): a refused join shows the server's refusal in an alert (MSG-WL-03 is the example).
   */
  // Kills: F24 (refusal not in an alert)
  it("JOIN-WAITLIST-01-C-FE-ERR-ALERT: a refused join is announced in an alert", () => {
    render(<WaitlistPanel {...baseProps} onJoin={() => undefined} error="This event still has available spots. Please register directly." />);

    expect(screen.getByRole("alert")).toHaveTextContent("This event still has available spots. Please register directly.");
  });

  /**
   * Oracle (04-A FE): the banner reads exactly MSG-WL-01 with the event name and the response position; it is dismissible;
   * after a reload (the panel is mounted again without a joined position) it is gone.
   */
  // Kills: F4 (banner without position), F5 (Dismiss does nothing), F19 (MSG-WL-01 copy)
  it("JOIN-WAITLIST-04-A-FE-STATE: the confirmation banner shows the position and can be dismissed", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<WaitlistPanel {...baseProps} indicator joinedPosition={1} onDismissBanner={onDismiss} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "You have joined the waiting list for Gala Waitlist Night. Your position is 1.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    rerender(<WaitlistPanel {...baseProps} indicator joinedPosition={null} />);
    expect(screen.queryByText(/You have joined the waiting list/)).not.toBeInTheDocument();
  });
});
