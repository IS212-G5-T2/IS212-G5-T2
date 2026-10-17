/*
 * Story: registration status cards (SPM-62 details, SPM-138 waitlist). One layout for the two active states; only the
 * headline, the waitlist notice and the action change. Spec: registration-status-cards-ui-spec.
 * Test cases: CARD-01 to 03 (the two states and the position notice); the action is asserted in the dialog tests.
 *
 * ASSUMPTION index:
 *  - A-JOINED: a waitlisted entry shows "Joined waitlist on" from the server's joinedAt (added to the record for waitlisted rows).
 *    A missing joinedAt shows the "not provided" text rather than a guessed time.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RegistrationStatusCard } from "./RegistrationStatusCard";
import { buildRegistered, buildWaitlisted } from "./waitlist.fixtures";

const region = () => screen.getByRole("region", { name: /Registration details|Waitlist registration/ });

describe("CARD-01: the confirmed card (headline, details, action, footer)", () => {
  // Kills: CARD-M5, F38
  it("CARD-01-A-STATE: a registered attendee sees the headline, the details and the Withdraw action", () => {
    render(
      <RegistrationStatusCard
        variant="confirmed"
        registration={buildRegistered("ATT-04", { id: "REG-9001", fullName: "Alice Tan", email: "alice@example.com", contactNumber: "91234567", registeredAt: "2026-10-03T04:00:00.000Z" })}
        onAction={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "You're registered" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    expect(screen.getByText("Full name")).toBeInTheDocument();
    expect(screen.getByText("Alice Tan")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("91234567")).toBeInTheDocument();
    expect(screen.getByText("Registered on")).toBeInTheDocument();
    expect(screen.getByText("3 Oct 2026, 12:00")).toBeInTheDocument();
    expect(screen.getByText("REG-9001")).toBeInTheDocument();
    // No waitlist notice on the confirmed card.
    expect(screen.queryByText(/in line/)).not.toBeInTheDocument();
  });
});

describe("CARD-02: the waitlisted card (headline, notice, join time, action)", () => {
  // Kills: CARD-COPY, CARD-M6, CARD-M8, CARD-M12, F38
  it("CARD-02-A-STATE: a waitlisted attendee sees the headline, the position notice, the join time and Leave waitlist", () => {
    render(
      <RegistrationStatusCard
        variant="waitlisted"
        registration={buildWaitlisted("ATT-05", 2, { joinedAt: "2026-10-14T04:00:00.000Z" })}
        onAction={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "You're on the waitlist" })).toBeInTheDocument();
    expect(screen.getByText("You're #2 in line")).toBeInTheDocument();
    expect(screen.getByText("We'll notify you if a spot opens up.")).toBeInTheDocument();
    expect(screen.getByText("Joined waitlist on")).toBeInTheDocument();
    expect(screen.getByText("14 Oct 2026, 12:00")).toBeInTheDocument();
    expect(screen.queryByText("Registered on")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave waitlist" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
  });

  // Kills: CARD-M6, CARD-M9
  it("CARD-02-B-ASSUMED: a waitlisted entry with no join time shows the not-provided text, not a time", () => {
    render(<RegistrationStatusCard variant="waitlisted" registration={buildWaitlisted("ATT-05", 1)} onAction={() => undefined} />);

    expect(screen.getByText("Joined waitlist on")).toBeInTheDocument();
    expect(screen.getByText("Not provided")).toBeInTheDocument();
  });
});

describe("CARD-03: the position notice and the action (boundary and interaction)", () => {
  // Kills: CARD-M7
  it("CARD-03-A-BND: a waitlisted entry with no position shows no notice", () => {
    render(<RegistrationStatusCard variant="waitlisted" registration={buildWaitlisted("ATT-05", null)} onAction={() => undefined} />);

    expect(screen.queryByText(/in line/)).not.toBeInTheDocument();
    expect(screen.queryByText("We'll notify you if a spot opens up.")).not.toBeInTheDocument();
  });

  // Kills: CARD-M8, CARD-M10
  it("CARD-03-B-INT: the action calls the handler for both variants", async () => {
    const onAction = vi.fn();
    const u = userEvent.setup();
    const { unmount } = render(<RegistrationStatusCard variant="confirmed" registration={buildRegistered("ATT-04")} onAction={onAction} />);
    await u.click(screen.getByRole("button", { name: "Withdraw" }));
    unmount();

    render(<RegistrationStatusCard variant="waitlisted" registration={buildWaitlisted("ATT-05", 1)} onAction={onAction} />);
    await u.click(screen.getByRole("button", { name: "Leave waitlist" }));

    expect(onAction).toHaveBeenCalledTimes(2);
  });

  // Kills: CARD-M11
  it("CARD-03-C-STATE: once the event has started the action is replaced by its explanation", () => {
    render(
      <RegistrationStatusCard
        variant="confirmed"
        registration={buildRegistered("ATT-04")}
        onAction={() => undefined}
        actionHidden
        actionHiddenText="This event has already started, so the registration can no longer be withdrawn."
      />,
    );

    expect(screen.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
    expect(within(region()).getByText("This event has already started, so the registration can no longer be withdrawn.")).toBeInTheDocument();
  });
});
