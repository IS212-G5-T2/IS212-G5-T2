import { FirebaseError } from "firebase/app";
import { connectAuthEmulator } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectToAuthEmulatorIfEnabled,
  getAuthErrorMessage,
  getFirebaseConfig,
  warnForMissingFirebaseConfig,
} from "./firebase";

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return {
    ...actual,
    connectAuthEmulator: vi.fn(),
  };
});

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
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

describe("Firebase configuration", () => {
  const configuredEnvironment = {
    VITE_FIREBASE_API_KEY: "fake-api-key",
    VITE_FIREBASE_AUTH_DOMAIN: "demo-is212.firebaseapp.com",
    VITE_FIREBASE_PROJECT_ID: "demo-is212",
    VITE_FIREBASE_STORAGE_BUCKET: "demo-is212.appspot.com",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
    VITE_FIREBASE_APP_ID: "1:000000000000:web:local",
  };

  it("uses the configured Firebase Auth domain from the runtime environment", () => {
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "demo-is212.firebaseapp.com");

    expect(getFirebaseConfig().authDomain).toBe(
      "demo-is212.firebaseapp.com",
    );
  });

  it("warns in development when Firebase configuration is incomplete", () => {
    const warn = vi.fn();
    const config = getFirebaseConfig({
      ...configuredEnvironment,
      VITE_FIREBASE_AUTH_DOMAIN: "",
    });

    warnForMissingFirebaseConfig(config, true, warn);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("authDomain"),
    );
  });

  it("does not warn about incomplete configuration outside development", () => {
    const warn = vi.fn();
    const config = getFirebaseConfig({
      ...configuredEnvironment,
      VITE_FIREBASE_AUTH_DOMAIN: "",
    });

    warnForMissingFirebaseConfig(config, false, warn);

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("getAuthErrorMessage", () => {
  it("maps known Firebase Auth errors", () => {
    expect(
      getAuthErrorMessage(
        new FirebaseError("auth/wrong-password", "Wrong password"),
      ),
    ).toBe("Incorrect email or password.");
  });

  it("uses the generic message for unknown Firebase and non-Firebase errors", () => {
    expect(
      getAuthErrorMessage(new FirebaseError("auth/future-error", "Unknown")),
    ).toBe("We couldn't sign you in. Please try again.");
    expect(getAuthErrorMessage(new Error("Unknown"))).toBe(
      "We couldn't sign you in. Please try again.",
    );
  });
});
