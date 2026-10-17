/*
 * Story: the attendee list shows "Confirmed" only for a registration. The event's own status badge is not shown to an
 * attendee for a published event, so a card with no registration carries no "Confirmed" text.
 * Test cases: CARD-BADGE-01 to 08 (state, and the non-attendee view that must not change).
 *
 * ASSUMPTION index:
 *  - A-PUBLISHED: an approved or confirmed event is "published" for an attendee, not a registration (EventCard header).
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EventCard } from "@/features/events/pages/list/EventCard";
import { buildGala } from "@/features/events/pages/detail/registration/waitlist.fixtures";
import type { EventRecord } from "@/types";

const renderCard = (event: EventRecord, props: { attendeeView?: boolean; registrationStatus?: "registered" | "waitlisted" | "withdrawn" } = {}) =>
  render(
    <MemoryRouter>
      <EventCard event={event} {...props} />
    </MemoryRouter>,
  );

describe("CARD-BADGE-09: a registration on a cancelled event shows the red Cancelled badge, not Confirmed", () => {
  // Kills: BADGE-M9 (the registration badge kept on a cancelled event: green Confirmed beside the red Cancelled)
  it("CARD-BADGE-09-A-STATE: a registered attendee on a cancelled event sees one Cancelled badge and no Confirmed badge", () => {
    renderCard(buildGala({ status: "cancelled" }), { attendeeView: true, registrationStatus: "registered" });

    expect(screen.getAllByText("Cancelled")).toHaveLength(1);
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
  });
});

describe("CARD-BADGE-01 to 04: the attendee card shows Confirmed only for a registration", () => {
  // Kills: BADGE-M1
  it("CARD-BADGE-01-A-STATE: an unregistered attendee sees no Confirmed badge on a Confirmed event", () => {
    renderCard(buildGala({ status: "confirmed" }), { attendeeView: true });

    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
  });

  // Kills: BADGE-M1, BADGE-M4, F13
  it("CARD-BADGE-02-A-STATE: a registered attendee sees exactly one Confirmed badge", () => {
    renderCard(buildGala({ status: "confirmed" }), { attendeeView: true, registrationStatus: "registered" });

    expect(screen.getAllByText("Confirmed")).toHaveLength(1);
  });

  // Kills: BADGE-M1, BADGE-M4, F12
  it("CARD-BADGE-03-A-STATE: a waitlisted attendee sees Waitlisted and no Confirmed badge", () => {
    renderCard(buildGala({ status: "confirmed" }), { attendeeView: true, registrationStatus: "waitlisted" });

    expect(screen.getByText("Waitlisted")).toBeInTheDocument();
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
  });

  // Kills: BADGE-M1, BADGE-M4
  it("CARD-BADGE-04-A-STATE: a withdrawn attendee sees Withdrawn and no Confirmed badge", () => {
    renderCard(buildGala({ status: "confirmed" }), { attendeeView: true, registrationStatus: "withdrawn" });

    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
  });
});

describe("CARD-BADGE-05 to 07: the attendee card keeps the Completed and Cancelled event badges", () => {
  // Kills: BADGE-M2, BADGE-M4, F13
  it("CARD-BADGE-06-A-STATE: a completed event keeps its Completed badge for an attendee", () => {
    renderCard(buildGala({ status: "completed" }), { attendeeView: true, registrationStatus: "registered" });

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getAllByText("Confirmed")).toHaveLength(1);
  });

  // Kills: BADGE-M2
  it("CARD-BADGE-07-A-STATE: a cancelled event keeps its Cancelled badge for an attendee", () => {
    renderCard(buildGala({ status: "cancelled" }), { attendeeView: true });

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});

describe("CARD-BADGE-08: the non-attendee view is unchanged", () => {
  // Kills: BADGE-M3
  it("CARD-BADGE-08-A-STATE: a coordinator sees the Confirmed event status and no registration badge", () => {
    renderCard(buildGala({ status: "confirmed" }));

    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.queryByText("Waitlisted")).not.toBeInTheDocument();
  });

  // Kills: BADGE-M3
  it("CARD-BADGE-08-B-STATE: a non-attendee sees the Approved event status", () => {
    renderCard(buildGala({ status: "approved" }));

    expect(screen.getByText("Approved")).toBeInTheDocument();
  });
});
