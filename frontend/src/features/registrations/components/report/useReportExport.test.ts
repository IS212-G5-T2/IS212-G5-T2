/*
 * SPM-63 AC4 export hook: a 401 ends the session (the user is sent to login); any other failure is shown as text.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/api";
import { useReportExport } from "@/features/registrations/components/report/useReportExport";
import { downloadReportExport, saveDownloadedFile } from "@/features/registrations/lib/registrationReport";

vi.mock("@/features/registrations/lib/registrationReport", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadReportExport: vi.fn(),
  saveDownloadedFile: vi.fn(),
}));
const downloadMock = vi.mocked(downloadReportExport);
const saveMock = vi.mocked(saveDownloadedFile);

beforeEach(() => {
  downloadMock.mockReset();
  saveMock.mockReset();
  useAppStore.setState({ isAuthenticated: true });
});
afterEach(() => {
  useAppStore.setState({ isAuthenticated: true });
});

describe("SPM-63 AC4: the export hook", () => {
  it("saves the file when the download succeeds", async () => {
    const blob = new Blob(["a,b"]);
    downloadMock.mockResolvedValue({ blob, filename: "EVT-101_registrations.csv" });
    const { result } = renderHook(() => useReportExport("EVT-101"));
    await act(() => result.current.exportAs("csv"));
    expect(saveMock).toHaveBeenCalledWith(blob, "EVT-101_registrations.csv");
    expect(result.current.exportError).toBe("");
  });

  // Kills: a 401 that does not end the session, or a 403 that does.
  it("a 401 ends the session", async () => {
    downloadMock.mockRejectedValue(new ApiError("Authentication required.", undefined, undefined, 401));
    const { result } = renderHook(() => useReportExport("EVT-101"));
    await act(() => result.current.exportAs("pdf"));
    expect(useAppStore.getState().isAuthenticated).toBe(false);
  });

  it("a 403 keeps the session and shows the server's message", async () => {
    downloadMock.mockRejectedValue(new ApiError("You do not have access to this event's registrations.", undefined, undefined, 403));
    const { result } = renderHook(() => useReportExport("EVT-101"));
    await act(() => result.current.exportAs("csv"));
    expect(useAppStore.getState().isAuthenticated).toBe(true);
    expect(result.current.exportError).toBe("You do not have access to this event's registrations.");
  });

  // Kills: a non-Error value shown as its string form, or the generic text missing.
  it("shows the generic failure text when the thrown value is not an Error", async () => {
    downloadMock.mockRejectedValue("network");
    const { result } = renderHook(() => useReportExport("EVT-101"));
    await act(() => result.current.exportAs("csv"));
    expect(result.current.exportError).toBe("The export failed. Please try again.");
    await waitFor(() => expect(result.current.downloading).toBeNull());
  });
});
