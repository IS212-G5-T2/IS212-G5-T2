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

  /** EVENT-UPDATE-08-D: a failure that is not an Error still shows a readable message. */
  it("EVENT-UPDATE-08-D gives a general message for a non-Error failure", async () => {
    apiMock.mockRejectedValueOnce("boom");
    const failed = renderHook(() => useVenueOptions());
    await waitFor(() => expect(failed.result.current.status).toBe("error"));
    expect(failed.result.current.error).toBe("Could not load the options.");
  });

  /** EVENT-UPDATE-08-D: after a retry, a slow reply to the earlier request does not overwrite the newer options. */
  it("EVENT-UPDATE-08-D ignores a stale reply that arrives after a retry", async () => {
    let resolveFirst!: (value: unknown) => void;
    apiMock
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)) as never)
      .mockResolvedValueOnce(RESPONSE);
    const { result } = renderHook(() => useVenueOptions());
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    await act(async () =>
      resolveFirst({
        facilities: [{ label: "Stale", value: "Stale" }],
        accessibility: [],
      }),
    );
    expect(result.current.facilities).toEqual(["Wi-Fi", "Lectern"]);
  });

  /** EVENT-UPDATE-08-D: after a retry, a slow failure of the earlier request does not replace the loaded options. */
  it("EVENT-UPDATE-08-D ignores a stale failure that arrives after a retry", async () => {
    let rejectFirst!: (reason: unknown) => void;
    apiMock
      .mockReturnValueOnce(new Promise((_r, j) => (rejectFirst = j)) as never)
      .mockResolvedValueOnce(RESPONSE);
    const { result } = renderHook(() => useVenueOptions());
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    await act(async () => rejectFirst(new Error("Network down")));
    expect(result.current.status).toBe("loaded");
    expect(result.current.error).toBe("");
  });
});
