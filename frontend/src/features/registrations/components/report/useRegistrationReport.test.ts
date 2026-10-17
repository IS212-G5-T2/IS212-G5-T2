/*
 * SPM-63 AC6 report hook, the error paths. A session that ends or a page that closes must not be changed by a
 * late response.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/api";
import { useRegistrationReport } from "@/features/registrations/components/report/useRegistrationReport";
import { fetchRegistrationReport } from "@/features/registrations/lib/registrationReport";

vi.mock("@/features/registrations/lib/registrationReport", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRegistrationReport: vi.fn(),
}));
const fetchMock = vi.mocked(fetchRegistrationReport);

beforeEach(() => {
  fetchMock.mockReset();
  useAppStore.setState({ isAuthenticated: true });
});
afterEach(() => {
  useAppStore.setState({ isAuthenticated: true });
});

describe("SPM-63 AC6: the report hook's error paths", () => {
  // Kills: a non-Error failure shown as its string form, or the generic message missing.
  it("shows the generic load message when the first load fails with a non-Error value", async () => {
    fetchMock.mockRejectedValue("offline");
    const { result } = renderHook(() => useRegistrationReport("EVT-101"));
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "error", message: "We couldn't load the registration report." }),
    );
  });

  // Kills: the guard after unmount removed, so a late 401 ends a session from a page that is already closed.
  it("a 401 that arrives after the page has closed does not end the session", async () => {
    let reject!: (error: unknown) => void;
    fetchMock.mockReturnValue(new Promise((_resolve, rej) => (reject = rej)));
    const { unmount } = renderHook(() => useRegistrationReport("EVT-101"));
    unmount();
    reject(new ApiError("Authentication required.", undefined, undefined, 401));
    await Promise.resolve();
    await Promise.resolve();
    expect(useAppStore.getState().isAuthenticated).toBe(true);
  });
});
