import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileAsDataUrl } from "./uploads";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function installReader(result: string | null, error: DOMException | null) {
  let instance: {
    onload: ((event: ProgressEvent<FileReader>) => unknown) | null;
    onerror: ((event: ProgressEvent<FileReader>) => unknown) | null;
  };
  const readAsDataURL = vi.fn();
  class MockFileReader {
    result = result;
    error = error;
    onload: ((event: ProgressEvent<FileReader>) => unknown) | null = null;
    onerror: ((event: ProgressEvent<FileReader>) => unknown) | null = null;

    constructor() {
      instance = this;
    }

    readAsDataURL(file: File) {
      readAsDataURL(file);
      if (error) instance.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
      else instance.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
    }
  }
  vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader);
  return { readAsDataURL };
}

describe("readFileAsDataUrl", () => {
  // Shared upload behavior must retain file metadata and the browser's encoded contents.
  it("resolves with a generated ID, file metadata, and data URL", async () => {
    const { readAsDataURL } = installReader("data:image/png;base64,aGVsbG8=", null);
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("upload-uuid") });
    const file = new File(["hello"], "venue.png", { type: "image/png" });

    await expect(readFileAsDataUrl(file)).resolves.toEqual({
      id: "upload-uuid",
      name: "venue.png",
      type: "image/png",
      size: 5,
      dataUrl: "data:image/png;base64,aGVsbG8=",
    });
    expect(readAsDataURL).toHaveBeenCalledWith(file);
  });

  // Untyped browser files must get a stable upload MIME fallback.
  it("uses application/octet-stream when the browser reports no file type", async () => {
    installReader("data:application/octet-stream;base64,eA==", null);
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("fallback-uuid") });
    const file = new File(["x"], "unknown", { type: "" });

    await expect(readFileAsDataUrl(file)).resolves.toMatchObject({
      type: "application/octet-stream",
      size: 1,
    });
  });

  // Read errors must reject so each calling form can present its own retryable error.
  it("rejects with the FileReader error when reading fails", async () => {
    const failure = new DOMException("Unreadable file", "NotReadableError");
    installReader(null, failure);

    await expect(
      readFileAsDataUrl(new File(["x"], "broken.png", { type: "image/png" })),
    ).rejects.toBe(failure);
  });
});
