import { initializeApp } from "firebase/app";
import { FirebaseError } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0 && import.meta.env.DEV) {
  // Surfaced only in dev so a missing/misconfigured .env is obvious locally
  // instead of failing silently at sign-in time.
  // eslint-disable-next-line no-console
  console.warn(
    `[firebase] Missing config value(s): ${missingKeys.join(", ")}. ` +
      "Copy apps/frontend/.env.example to .env and fill in your Firebase project's web app config."
  );
}

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

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
