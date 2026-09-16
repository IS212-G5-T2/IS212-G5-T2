import type { UserRole } from "@/types";

/**
 * Maps trusted Firebase custom-claim values to the role names used by the UI.
 * Order determines the active UI role when a user holds more than one claim.
 */
const roleByClaim: ReadonlyArray<{ claim: string; role: UserRole }> = [
  { claim: "ORGANISER", role: "organiser" },
  { claim: "COORDINATOR", role: "coordinator" },
  { claim: "VENUE_STAFF", role: "venue_staff" },
  { claim: "TECH_SUPPORT", role: "tech_support" },
  { claim: "ATTENDEE", role: "attendee" },
];

/**
 * Converts verified Firebase custom claims into the UI's current role.
 *
 * @param claims - The `roles` value from a verified Firebase ID-token result.
 * @returns The highest-priority supported UI role, or `undefined` when no
 * supported role claim is present.
 */
export function getRoleFromFirebaseClaims(claims: unknown): UserRole | undefined {
  if (!Array.isArray(claims)) {
    return undefined;
  }

  const normalizedClaims = new Set(
    claims
      .filter((claim): claim is string => typeof claim === "string")
      .map((claim) => claim.trim().toUpperCase()),
  );

  return roleByClaim.find(({ claim }) => normalizedClaims.has(claim))?.role;
}
