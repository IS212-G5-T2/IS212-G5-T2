import { connectAuthEmulator } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectToAuthEmulatorIfEnabled } from "./firebase";

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return {
    ...actual,
    connectAuthEmulator: vi.fn(),
  };
});

describe("connectToAuthEmulatorIfEnabled", () => {
  beforeEach(() => {
    vi.mocked(connectAuthEmulator).mockReset();
  });

  it("connects to the configured emulator only when enabled", () => {
    const auth = {} as never;

    connectToAuthEmulatorIfEnabled(auth, {
      VITE_USE_FIREBASE_AUTH_EMULATOR: "true",
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://localhost:9099",
    });

    expect(connectAuthEmulator).toHaveBeenCalledWith(auth, "http://localhost:9099");
  });

  it("leaves the real Firebase connection unchanged when disabled", () => {
    connectToAuthEmulatorIfEnabled({} as never, {
      VITE_USE_FIREBASE_AUTH_EMULATOR: "false",
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://localhost:9099",
    });

    expect(connectAuthEmulator).not.toHaveBeenCalled();
  });

  it("rejects an enabled emulator without a URL", () => {
    expect(() =>
      connectToAuthEmulatorIfEnabled({} as never, {
        VITE_USE_FIREBASE_AUTH_EMULATOR: "true",
      }),
    ).toThrow("VITE_FIREBASE_AUTH_EMULATOR_URL is required");
  });
});
