import { describe, expect, it } from "vitest";
import { homePathByRole, navByRole, navigationForUser, roleLabels } from "./navConfig";

describe("organiser navigation", () => {
  // The requests route is presented as My Drafts after submitted items move to My Events.
  it("labels the requests destination as My Drafts", () => {
    expect(navByRole.organiser).toContainEqual(
      expect.objectContaining({ label: "My Drafts", to: "/requests" }),
    );
    expect(navByRole.organiser.some((item) => item.label === "My Requests")).toBe(
      false,
    );
  });
});

describe("venue staff navigation", () => {
  // SPM-50 / AC1: Venue Staff can discover the protected venue creation route in navigation.
  it("links to Create Venue", () => {
    expect(navByRole.venue_staff).toContainEqual(
      expect.objectContaining({ label: "Create Venue", to: "/venues/create" }),
    );
  });

  /** SPM54-ROUTE-RETIRE-01: users reach availability through event-linked Venue Records, not the retired local-store route. */
  it("SPM54-ROUTE-RETIRE-01 does not expose the retired venue availability route in navigation", () => {
    expect(navByRole.coordinator.some((item) => item.to === "/venues/availability")).toBe(false);
    expect(navByRole.venue_staff.some((item) => item.to === "/venues/availability")).toBe(false);
  });

  // SPM-51: Coordinators reach the catalogue from Search Venues rather than a generic sidebar item.
  it("keeps venue catalogue out of coordinator navigation", () => {
    expect(navByRole.coordinator.some((item) => item.label === "Venues" || item.to === "/venues")).toBe(false);
    expect(navByRole.coordinator).toContainEqual(
      expect.objectContaining({ label: "Venue Records", to: "/venue-records" }),
    );
  });

  // SPM-124: multi-role users keep Venue Staff records and creation without restoring the generic Venues link.
  it("keeps Venue Staff records available to a dual-role user without the Venues link", () => {
    const items = navigationForUser({
      role: "coordinator",
      roles: ["coordinator", "venue_staff"],
    });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Venue Records", to: "/venue-records" }),
        expect.objectContaining({ label: "Create Venue", to: "/venues/create" }),
      ]),
    );
    expect(items.some((item) => item.label === "Venues" || item.to === "/venues")).toBe(false);
    expect(items.some((item) => item.to === "/venues/availability")).toBe(false);
  });
});

describe("technical support navigation", () => {
  /** EQUIP-AVAIL-01: Technical Support can discover both the inventory and the event-window checker. */
  it("links to Equipment Inventory and Equipment Availability separately", () => {
    expect(navByRole.tech_support).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Equipment Inventory", to: "/equipment/inventory" }),
      expect.objectContaining({ label: "Equipment Availability", to: "/equipment/availability" }),
    ]));
  });

  // EQUIP-VIEW-01-C (AC1). Kills: the nav config entry for tech_support being
  // removed, relabeled, or pointed at the wrong route. This checks the config
  // data only; no test anywhere renders Sidebar to prove it turns this entry
  // into a clickable link. Lower risk (Sidebar.tsx maps every navByRole entry
  // generically, with no tech_support-specific branching) but not yet proven.
  it("EQUIP-VIEW-01-C links to Equipment Availability", () => {
    expect(navByRole.tech_support).toContainEqual(
      expect.objectContaining({
        label: "Equipment Availability",
        to: "/equipment/availability",
      }),
    );
  });
});

describe("safety officer navigation", () => {
  /** SAFETY-LOGIN-02-C: Navigation sidebar exposes exactly Safety Review -> /safety/events for Safety Officer. */
  it("SAFETY-LOGIN-02-C navigation sidebar shows exactly Safety Review -> /safety/events", () => {
    const items = navByRole.safety_officer;
    expect(items).toContainEqual(
      expect.objectContaining({ label: "Safety Review", to: "/safety/events" }),
    );
    const destinations = items.map((item) => item.to);
    expect(destinations).toEqual(["/safety/events"]);
    expect(homePathByRole.safety_officer).toBe("/safety/events");
    expect(roleLabels.safety_officer).toBe("Safety Officer");
  });
});
