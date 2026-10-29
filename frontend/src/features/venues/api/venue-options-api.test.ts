import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import {
  VENUE_OPTIONS_INVALID,
  fetchVenueOptions,
  useVenueOptions,
} from "./venue-options-api";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const RESPONSE = {
  facilities: [
    { label: "Wi-Fi", value: "Wi-Fi" },
    { label: "Lectern", value: "Lectern" },
  ],
  accessibility: [{ label: "Wheelchair access", value: "Wheelchair access" }],
};

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * SPM-156 follow-up — every event form reads facility and accessibility choices
 * from GET /api/venues/options (the backend venue schema), never a local list.
 * Confluence ID: EVENT-UPDATE-08-D.
 */
describe("fetchVenueOptions", () => {
  it("EVENT-UPDATE-08-D reads the options from the venue schema endpoint", async () => {
    apiMock.mockResolvedValue(RESPONSE);
    await expect(fetchVenueOptions()).resolves.toEqual(RESPONSE);
    expect(apiMock).toHaveBeenCalledWith("/venues/options");
  });

  it.each([
    ["no body", undefined],
    ["a missing list", { facilities: RESPONSE.facilities }],
    [
      "a malformed option",
      { facilities: [{ label: "Wi-Fi" }], accessibility: [] },
    ],
  ])(
    "EVENT-UPDATE-08-D rejects a response with %s",
    async (_label, response) => {
      apiMock.mockResolvedValue(response);
      await expect(fetchVenueOptions()).rejects.toThrow(VENUE_OPTIONS_INVALID);
    },
  );
});

describe("useVenueOptions", () => {
  it("EVENT-UPDATE-08-D loads the option values", async () => {
    apiMock.mockResolvedValue(RESPONSE);
    const { result } = renderHook(() => useVenueOptions());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(result.current.facilities).toEqual(["Wi-Fi", "Lectern"]);
    expect(result.current.accessibility).toEqual(["Wheelchair access"]);
  });

  it("EVENT-UPDATE-08-D reports a failure and loads again on retry", async () => {
    apiMock
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce(RESPONSE);
    const { result } = renderHook(() => useVenueOptions());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Network down");
    expect(result.current.facilities).toEqual([]);
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("EVENT-UPDATE-08-D gives a general message for a non-Error failure and ignores a late reply after unmount", async () => {
    apiMock.mockRejectedValueOnce("boom");
    const failed = renderHook(() => useVenueOptions());
    await waitFor(() => expect(failed.result.current.status).toBe("error"));
    expect(failed.result.current.error).toBe("Could not load the options.");

    let resolve!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((r) => (resolve = r)) as never);
    const late = renderHook(() => useVenueOptions());
    late.unmount();
    await act(async () => resolve(RESPONSE));
    expect(late.result.current.status).toBe("loading");
  });
});
