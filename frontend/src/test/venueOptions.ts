/*
 * Test double for useVenueOptions (features/venues/api/venue-options-api.ts):
 * the current backend venue-schema lists, loaded, unless a test sets another
 * state. Use with
 *   vi.mock("@/features/venues/api/venue-options-api", () => venueOptionsModuleMock());
 * and change `venueOptionsState` inside a test to simulate loading or failure.
 */
import {
  ACCESSIBILITY_OPTIONS,
  FACILITY_OPTIONS,
} from "@/features/venues/lib/venueOptions";
import type { VenueOptionsState } from "@/features/venues/api/venue-options-api";

export const LOADED_VENUE_OPTIONS: VenueOptionsState = {
  status: "loaded",
  facilities: [...FACILITY_OPTIONS],
  accessibility: [...ACCESSIBILITY_OPTIONS],
  error: "",
};

export const venueOptionsState: {
  current: VenueOptionsState;
  retry: () => void;
} = {
  current: LOADED_VENUE_OPTIONS,
  retry: () => {},
};

export function resetVenueOptions() {
  venueOptionsState.current = LOADED_VENUE_OPTIONS;
  venueOptionsState.retry = () => {};
}

export function venueOptionsModuleMock() {
  return {
    useVenueOptions: () => ({
      ...venueOptionsState.current,
      retry: venueOptionsState.retry,
    }),
  };
}
