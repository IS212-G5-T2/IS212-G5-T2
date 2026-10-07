import { describe, expect, it } from "vitest";
import { navByRole, navigationForUser } from "./navConfig";

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

  // SPM-124: multi-role users receive the union of each role's navigation, not a primary-role subset.
  it("keeps Coordinator planning and Venue Staff records available to a dual-role user", () => {
    const items = navigationForUser({
      role: "coordinator",
      roles: ["coordinator", "venue_staff"],
    });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Venues", to: "/venues" }),
        expect.objectContaining({ label: "Venue Records", to: "/venue-records" }),
        expect.objectContaining({ label: "Create Venue", to: "/venues/create" }),
      ]),
    );
    expect(items.filter((item) => item.to === "/venues/availability")).toHaveLength(1);
  });
});

describe("technical support navigation", () => {
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
