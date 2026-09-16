import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Firebase modules are imported by the Zustand store during test-module
// evaluation. Supply inert Web SDK configuration before that import happens so
// tests never try to initialize Auth with an empty local or CI API key. Tests
// that need environment variations can still override these values with
// vi.stubEnv().
vi.stubEnv("VITE_FIREBASE_API_KEY", "test-api-key");
vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "test-project");
vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", "test-project.appspot.com");
vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "000000000000");
vi.stubEnv("VITE_FIREBASE_APP_ID", "1:000000000000:web:test");
