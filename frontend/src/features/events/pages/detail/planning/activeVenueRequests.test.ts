import { describe, expect, it } from "vitest";
import { activeVenueRequests } from "./activeVenueRequests";

describe("activeVenueRequests", () => {
  /** VEN-BKG-09-A: cancelled venue history is omitted while pending and confirmed venue requests remain active. */
  it("VEN-BKG-09-A filters only cancelled venue requests from the event's active list", () => {
    const requests = [
      { id: "pending", status: "pending" },
      { id: "confirmed", status: "confirmed" },
      { id: "cancelled", status: "cancelled" },
      { id: "rejected", status: "rejected" },
    ];

    expect(activeVenueRequests(requests)).toEqual([
      { id: "pending", status: "pending" },
      { id: "confirmed", status: "confirmed" },
      { id: "rejected", status: "rejected" },
    ]);
  });

  /** VEN-BKG-09-A: an empty active event venue list stays empty after filtering cancelled history. */
  it("VEN-BKG-09-A returns an empty list when every venue request is cancelled", () => {
    expect(activeVenueRequests([{ id: "cancelled", status: "cancelled" }])).toEqual([]);
  });
});
