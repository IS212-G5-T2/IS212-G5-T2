import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmedArrangementsPanel } from "@/features/events/pages/detail/planning/ConfirmedArrangementsPanel";
import { api } from "@/utils/api";

/*
 * Colour dots on the confirmed arrangements panel (UI only; the SPM-135 area, not an SPM-155 acceptance criterion and
 * not a row of the SPM-155 matrix): Venue, Equipment and Safety Officer Approval each carry a dot, green when
 * confirmed, yellow when requested, checking, reserved or pending, red when not requested or not in effect; a group
 * shows the worst state of its items. A red dot is titled with the item's own status, first letter capitalised and
 * the rest as the server wrote it (Released, Unavailable, Rejected ...); a group with nothing in it (and a blank
 * state) is titled None requested, and Venue or Equipment with nothing in it also reads None requested under its
 * heading. The HTTP layer is mocked; the panel is real. The class names are the design tokens
 * the page already uses for success, warning and danger.
 */

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000201";

const GREEN = ["bg-success-500", "Confirmed"] as const;
const YELLOW = ["bg-warning-500", "Reserved or pending"] as const;
const RED = "bg-danger-500";
const NONE_REQUESTED = "None requested";

const slot = { start: "2026-11-05T02:00:00.000Z", end: "2026-11-05T04:00:00.000Z" };
const venue = (status: string) => ({ venueName: "Main Hall", ...slot, status });
const line = (name: string, status: string) => ({ name, quantity: 1, status });

function respond(parts: { venueBookings?: readonly unknown[]; equipment?: readonly unknown[]; safety?: string }) {
  apiMock.mockResolvedValue({
    eventId: EVENT_ID,
    status: "Confirmed",
    venueBookings: [...(parts.venueBookings ?? [venue("Approved")])],
    equipment: [...(parts.equipment ?? [line("Projector", "Reserved")])],
    safety: { state: parts.safety ?? "Approved" },
  });
}

/** The dot of the heading with this name: its colour class and its title. */
async function dotOf(name: string) {
  const heading = await screen.findByRole("heading", { name });
  const dot = heading.querySelector("span[title]") as HTMLElement;
  return { dot, title: dot.getAttribute("title"), classes: dot.className };
}

beforeEach(() => apiMock.mockReset());
afterEach(cleanup);

describe("Confirmed arrangements dots (UI only)", () => {
  /** the Venue dot follows the worst booking state; no booking is red. */
  it.each([
    ["one Approved booking", [venue("Approved")], GREEN],
    ["one Pending booking", [venue("Pending")], YELLOW],
    ["an Approved and a Pending booking (the worse one shows)", [venue("Approved"), venue("Pending")], YELLOW],
    ["a Pending and an Approved booking (order does not matter)", [venue("Pending"), venue("Approved")], YELLOW],
    ["an Approved and a Released booking", [venue("Approved"), venue("Released")], [RED, "Released"]],
    ["a Released booking", [venue("Released")], [RED, "Released"]],
    ["an Unknown booking", [venue("Wibble")], [RED, "Wibble"]],
    ["a lower-case released booking", [venue("released")], [RED, "Released"]],
    ["a booking whose status is two words with a capital inside", [venue("not Available")], [RED, "Not Available"]],
    ["no booking", [], [RED, NONE_REQUESTED]],
  ] as const)("the Venue dot with %s", async (_label, venueBookings, [colour, title]) => {
    // Arrange / Act
    respond({ venueBookings });
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    const dot = await dotOf("Venue");

    // Assert: the colour class and the title; the dot is hidden from assistive technology
    expect(dot.classes).toContain(colour);
    expect(dot.title).toBe(title);
    expect(dot.dot).toHaveAttribute("aria-hidden", "true");
  });

  /** the Equipment dot: Reserved, Requested and Checking are yellow; Released, Unavailable and none are red; mixed shows the worst. */
  it.each([
    ["one Reserved line", [line("Projector", "Reserved")], YELLOW],
    ["one Requested line", [line("Projector", "Requested")], YELLOW],
    ["one Checking line", [line("Projector", "Checking")], YELLOW],
    ["a Requested and a Checking line", [line("Projector", "Requested"), line("Microphone", "Checking")], YELLOW],
    ["one Unavailable line", [line("Projector", "Unavailable")], [RED, "Unavailable"]],
    ["a Reserved and an Unavailable line", [line("Projector", "Reserved"), line("Microphone", "Unavailable")], [RED, "Unavailable"]],
    ["a Reserved and a Released line", [line("Projector", "Reserved"), line("Microphone", "Released")], [RED, "Released"]],
    ["a Released line", [line("Projector", "Released")], [RED, "Released"]],
    ["a lower-case unavailable line", [line("Projector", "unavailable")], [RED, "Unavailable"]],
    ["no line", [], [RED, NONE_REQUESTED]],
  ] as const)("the Equipment dot with %s", async (_label, equipment, [colour, title]) => {
    // Arrange / Act
    respond({ equipment });
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    const dot = await dotOf("Equipment");

    // Assert
    expect(dot.classes).toContain(colour);
    expect(dot.title).toBe(title);
  });

  /** the Safety Officer Approval dot follows the safety state, case and spaces ignored. */
  it.each([
    ["Approved", GREEN],
    [" approved ", GREEN],
    ["Confirmed", GREEN],
    ["Awaiting check", YELLOW],
    ["Changes requested", YELLOW],
    ["Pending", YELLOW],
    ["Reserved", YELLOW],
    ["Rejected", [RED, "Rejected"]],
    ["Not requested", [RED, "Not requested"]],
    ["Something else", [RED, "Something else"]],
    ["rejected by officer", [RED, "Rejected by officer"]],
  ] as const)("the Safety Officer Approval dot for state %j", async (state, [colour, title]) => {
    // Arrange / Act
    respond({ safety: state });
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    const dot = await dotOf("Safety Officer Approval");

    // Assert: the dot, and the state text is still shown under the heading
    expect(dot.classes).toContain(colour);
    expect(dot.title).toBe(title);
    expect(screen.getByText(state.trim())).toBeInTheDocument();
  });

  /** each heading has its own dot, so the three tones are independent. */
  it("Venue, Equipment and Safety Officer Approval each show their own tone", async () => {
    // Arrange: venue confirmed, equipment released, safety pending review
    respond({ venueBookings: [venue("Approved")], equipment: [line("Projector", "Released")], safety: "Awaiting check" });

    // Act
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);

    // Assert
    expect((await dotOf("Venue")).classes).toContain(GREEN[0]);
    expect((await dotOf("Equipment")).classes).toContain(RED);
    expect((await dotOf("Safety Officer Approval")).classes).toContain(YELLOW[0]);
  });

  /** a Safety Officer Approval state that is blank has a red dot titled None requested (no empty title). */
  it("a blank Safety Officer Approval state is red and titled None requested", async () => {
    // Arrange / Act
    respond({ safety: "   " });
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    const dot = await dotOf("Safety Officer Approval");

    // Assert
    expect(dot.classes).toContain(RED);
    expect(dot.title).toBe(NONE_REQUESTED);
  });

  /** an empty Venue or Equipment group says None requested under its heading, and its dot stays red. */
  it.each([
    ["Venue", { venueBookings: [] }, "Equipment"],
    ["Equipment", { equipment: [] }, "Venue"],
  ] as const)("an empty %s group reads None requested with a red dot", async (name, parts, other) => {
    // Arrange / Act
    respond(parts);
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    const dot = await dotOf(name);

    // Assert: the text sits in the group of that heading, the dot is red, and the other group (which has an item) does not say it
    const group = screen.getByRole("heading", { name }).parentElement as HTMLElement;
    expect(within(group).getByText("None requested")).toBeInTheDocument();
    expect(dot.classes).toContain(RED);
    const otherGroup = screen.getByRole("heading", { name: other }).parentElement as HTMLElement;
    expect(within(otherGroup).queryByText("None requested")).not.toBeInTheDocument();
    expect(screen.getAllByText("None requested")).toHaveLength(1);
  });

  /** a group that has items shows them and not None requested. */
  it("groups with items list them and do not say None requested", async () => {
    // Arrange / Act
    respond({ venueBookings: [venue("Approved")], equipment: [line("Projector", "Reserved")] });
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    await dotOf("Venue");

    // Assert
    expect(screen.queryByText("None requested")).not.toBeInTheDocument();
    expect(screen.getByText(/Main Hall: .* \(Approved\)/)).toBeInTheDocument();
    expect(screen.getByText("Projector x1 (Reserved)")).toBeInTheDocument();
  });
});
