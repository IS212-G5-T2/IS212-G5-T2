import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmedArrangementsPanel } from "@/features/events/pages/detail/planning/ConfirmedArrangementsPanel";
import { api } from "@/utils/api";

/*
 * SPM-155 colour dots on the confirmed arrangements (commit 02e56aa3): Venue, Equipment and Safety Officer Approval
 * each carry a dot, green when confirmed, yellow when reserved or pending, red when not requested or not in effect;
 * a group shows the worst state of its items. The HTTP layer is mocked; the panel is real.
 * Test case: CANCEL-REQUEST-04-SUP-DOTS (the dots show what a cancellation released: a released arrangement is red).
 * Oracle tier: DERIVED (the user's UI decision of 1 Nov 2026: green confirmed, yellow reserved or pending, red not
 * requested). The class names are the design tokens the page already uses for success, warning and danger.
 * Mutant IDs in each "Kills:" line are defined in frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000201";

const GREEN = ["bg-success-500", "Confirmed"] as const;
const YELLOW = ["bg-warning-500", "Reserved or pending"] as const;
const RED = ["bg-danger-500", "Not requested"] as const;

const slot = { start: "2026-11-05T02:00:00.000Z", end: "2026-11-05T04:00:00.000Z" };
const venue = (status: string) => ({ venueName: "Main Hall", ...slot, status });
const line = (name: string, status: string) => ({ name, quantity: 1, status });

function respond(parts: { venueBookings?: unknown[]; equipment?: unknown[]; safety?: string }) {
  apiMock.mockResolvedValue({
    eventId: EVENT_ID,
    status: "Confirmed",
    venueBookings: parts.venueBookings ?? [venue("Approved")],
    equipment: parts.equipment ?? [line("Projector", "Reserved")],
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

describe("SPM-155 arrangement dots (CANCEL-REQUEST-04-SUP-DOTS)", () => {
  // Kills: FM84, FM85, FM86, FM88, FM89, FM92, FM93
  /** CANCEL-REQUEST-04-SUP-DOTS (DERIVED): the Venue dot follows the worst booking state; no booking is red. */
  it.each([
    ["one Approved booking", [venue("Approved")], GREEN],
    ["one Pending booking", [venue("Pending")], YELLOW],
    ["an Approved and a Pending booking (the worse one shows)", [venue("Approved"), venue("Pending")], YELLOW],
    ["a Pending and an Approved booking (order does not matter)", [venue("Pending"), venue("Approved")], YELLOW],
    ["an Approved and a Released booking", [venue("Approved"), venue("Released")], RED],
    ["a Released booking", [venue("Released")], RED],
    ["no booking", [], RED],
  ] as const)("CANCEL-REQUEST-04-SUP-DOTS: the Venue dot with %s", async (_label, venueBookings, [colour, title]) => {
    // Arrange / Act
    respond({ venueBookings: [...venueBookings] });
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    const dot = await dotOf("Venue");

    // Assert: the colour class and the title; the dot is hidden from assistive technology
    expect(dot.classes).toContain(colour);
    expect(dot.title).toBe(title);
    expect(dot.dot).toHaveAttribute("aria-hidden", "true");
  });

  // Kills: FM84, FM85, FM86, FM87, FM89, FM91, FM92, FM96, FM97, FM98
  /** CANCEL-REQUEST-04-SUP-DOTS (DERIVED): the Equipment dot: Reserved, Requested and Checking are yellow; Released, Unavailable and none are red; mixed shows the worst. */
  it.each([
    ["one Reserved line", [line("Projector", "Reserved")], YELLOW],
    ["one Requested line", [line("Projector", "Requested")], YELLOW],
    ["one Checking line", [line("Projector", "Checking")], YELLOW],
    ["a Requested and a Checking line", [line("Projector", "Requested"), line("Microphone", "Checking")], YELLOW],
    ["one Unavailable line", [line("Projector", "Unavailable")], RED],
    ["a Reserved and an Unavailable line", [line("Projector", "Reserved"), line("Microphone", "Unavailable")], RED],
    ["a Reserved and a Released line", [line("Projector", "Reserved"), line("Microphone", "Released")], RED],
    ["a Released line", [line("Projector", "Released")], RED],
    ["no line", [], RED],
  ] as const)("CANCEL-REQUEST-04-SUP-DOTS: the Equipment dot with %s", async (_label, equipment, [colour, title]) => {
    // Arrange / Act
    respond({ equipment: [...equipment] });
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    const dot = await dotOf("Equipment");

    // Assert
    expect(dot.classes).toContain(colour);
    expect(dot.title).toBe(title);
  });

  // Kills: FM84, FM87, FM88, FM89, FM90, FM92
  /** CANCEL-REQUEST-04-SUP-DOTS (DERIVED): the Safety Officer Approval dot follows the safety state, case and spaces ignored. */
  it.each([
    ["Approved", GREEN],
    [" approved ", GREEN],
    ["Confirmed", GREEN],
    ["Awaiting check", YELLOW],
    ["Changes requested", YELLOW],
    ["Pending", YELLOW],
    ["Reserved", YELLOW],
    ["Rejected", RED],
    ["Not requested", RED],
    ["Something else", RED],
  ] as const)("CANCEL-REQUEST-04-SUP-DOTS: the Safety Officer Approval dot for state %j", async (state, [colour, title]) => {
    // Arrange / Act
    respond({ safety: state });
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);
    const dot = await dotOf("Safety Officer Approval");

    // Assert: the dot, and the state text is still shown under the heading
    expect(dot.classes).toContain(colour);
    expect(dot.title).toBe(title);
    expect(screen.getByText(state.trim())).toBeInTheDocument();
  });

  // Kills: FM84, FM88, FM89, FM90, FM91
  /** CANCEL-REQUEST-04-SUP-DOTS (DERIVED): each heading has its own dot, so the three tones are independent. */
  it("CANCEL-REQUEST-04-SUP-DOTS: Venue, Equipment and Safety Officer Approval each show their own tone", async () => {
    // Arrange: venue confirmed, equipment released, safety pending review
    respond({ venueBookings: [venue("Approved")], equipment: [line("Projector", "Released")], safety: "Awaiting check" });

    // Act
    render(<ConfirmedArrangementsPanel eventId={EVENT_ID} />);

    // Assert
    expect((await dotOf("Venue")).classes).toContain(GREEN[0]);
    expect((await dotOf("Equipment")).classes).toContain(RED[0]);
    expect((await dotOf("Safety Officer Approval")).classes).toContain(YELLOW[0]);
  });
});
