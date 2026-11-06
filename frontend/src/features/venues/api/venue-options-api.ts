/*
 * Facility and accessibility options for every event form: Create Event
 * (SPM-36/SPM-144), Update Event Information (SPM-49) and Request a Change
 * (SPM-64). The backend venue schema (`GET /api/venues/options`) is the single
 * source; no event form keeps its own list, so a value the backend no longer
 * accepts can never be offered or shown as a choice.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/utils/api";

export type VenueOption = { label: string; value: string };

export interface VenueOptions {
  facilities: VenueOption[];
  accessibility: VenueOption[];
}

export const VENUE_OPTIONS_INVALID =
  "Facility and accessibility options response is invalid.";

function isOptionList(options: unknown): options is VenueOption[] {
  return (
    Array.isArray(options) &&
    options.every(
      (option) =>
        option &&
        typeof option.label === "string" &&
        typeof option.value === "string",
    )
  );
}

/** Reads the supported options; rejects with VENUE_OPTIONS_INVALID when the response has the wrong shape. */
export async function fetchVenueOptions(): Promise<VenueOptions> {
  const result = await api<Partial<VenueOptions>>("/venues/options");
  if (!isOptionList(result?.facilities) || !isOptionList(result?.accessibility))
    throw new Error(VENUE_OPTIONS_INVALID);
  return { facilities: result.facilities, accessibility: result.accessibility };
}

export type VenueOptionsState =
  | {
      status: "loading";
      facilities: string[];
      accessibility: string[];
      error: "";
    }
  | {
      status: "loaded";
      facilities: string[];
      accessibility: string[];
      error: "";
    }
  | {
      status: "error";
      facilities: string[];
      accessibility: string[];
      error: string;
    };

const LOADING: VenueOptionsState = {
  status: "loading",
  facilities: [],
  accessibility: [],
  error: "",
};

/**
 * The supported facility and accessibility values (each option's `value`), loaded
 * once per mount, with `retry` after a failure.
 */
export function useVenueOptions(): VenueOptionsState & { retry: () => void } {
  const [state, setState] = useState<VenueOptionsState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchVenueOptions()
      .then((options) => {
        if (active)
          setState({
            status: "loaded",
            facilities: options.facilities.map(({ value }) => value),
            accessibility: options.accessibility.map(({ value }) => value),
            error: "",
          });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            status: "error",
            facilities: [],
            accessibility: [],
            error:
              error instanceof Error
                ? error.message
                : "Could not load the options.",
          });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState(LOADING);
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
