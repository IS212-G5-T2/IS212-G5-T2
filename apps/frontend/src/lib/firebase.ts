import { initializeApp } from "firebase/app";
import { FirebaseError } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

type FirebaseEnvironment = Pick<
  ImportMetaEnv,
  | "VITE_FIREBASE_API_KEY"
  | "VITE_FIREBASE_AUTH_DOMAIN"
  | "VITE_FIREBASE_PROJECT_ID"
  | "VITE_FIREBASE_STORAGE_BUCKET"
  | "VITE_FIREBASE_MESSAGING_SENDER_ID"
  | "VITE_FIREBASE_APP_ID"
>;

export function getFirebaseConfig(
  environment: FirebaseEnvironment = import.meta.env,
) {
  return {
    apiKey: environment.VITE_FIREBASE_API_KEY,
    authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: environment.VITE_FIREBASE_PROJECT_ID,
    storageBucket: environment.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: environment.VITE_FIREBASE_APP_ID,
  };
}

export function warnForMissingFirebaseConfig(
  config: ReturnType<typeof getFirebaseConfig>,
  isDevelopment = import.meta.env.DEV,
  warn: (message: string) => void = console.warn,
): void {
  const missingKeys = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0 && isDevelopment) {
    warn(
      `[firebase] Missing config value(s): ${missingKeys.join(", ")}. ` +
        "Copy apps/frontend/.env.example to .env and fill in your Firebase project's web app config.",
    );
  }
}

const firebaseConfig = getFirebaseConfig();
warnForMissingFirebaseConfig(firebaseConfig);
export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

/**
 * Connects the browser SDK to the local Auth Emulator only when explicitly
 * enabled. Real Firebase remains the default for staging and production.
 */
export function connectToAuthEmulatorIfEnabled(
  authInstance: Auth,
  environment: Pick<
    ImportMetaEnv,
    "VITE_USE_FIREBASE_AUTH_EMULATOR" | "VITE_FIREBASE_AUTH_EMULATOR_URL"
  > = import.meta.env,
): void {
  if (environment.VITE_USE_FIREBASE_AUTH_EMULATOR !== "true") {
    return;
  }

  const emulatorUrl = environment.VITE_FIREBASE_AUTH_EMULATOR_URL;

  if (!emulatorUrl) {
    throw new Error(
      "VITE_FIREBASE_AUTH_EMULATOR_URL is required when the Firebase Auth Emulator is enabled.",
    );
  }

  connectAuthEmulator(authInstance, emulatorUrl);
}

connectToAuthEmulatorIfEnabled(auth);

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/user-disabled": "This account has been disabled. Contact your administrator.",
  "auth/user-not-found": "We couldn't find an account with those details.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/configuration-not-found":
    "Firebase Authentication isn't configured for this project yet (enable the Email/Password sign-in provider in the Firebase console).",
};

/** Maps a Firebase Auth error to a short, user-facing message. */
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return AUTH_ERROR_MESSAGES[error.code] ?? "We couldn't sign you in. Please try again.";
  }
  return "We couldn't sign you in. Please try again.";
}
