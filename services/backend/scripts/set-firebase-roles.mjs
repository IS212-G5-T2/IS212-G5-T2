import { readFile } from 'node:fs/promises';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Maps a Firebase Authentication user email to the application roles granted
 * through Firebase custom claims.
 *
 * @typedef {object} RoleAssignment
 * @property {string} email Firebase Authentication email address to update.
 * @property {string[]} roles Supported application role names to assign.
 */

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  throw new Error(
    'Set FIREBASE_SERVICE_ACCOUNT_PATH to the absolute path of your Firebase service-account JSON file.',
  );
}

/**
 * Manual Firebase user-to-role mappings for local integration testing.
 * Replace the email addresses with users that exist in the Firebase project.
 *
 * @type {RoleAssignment[]}
 */
const roleAssignments = [
  { email: 'org_venue@connectsphere.sg', roles: ['ORGANISER', 'VENUE_STAFF'] },
  { email: 'coor_tech@connectsphere.sg', roles: ['COORDINATOR', 'TECH_SUPPORT'] },
  { email: 'organiser@connectsphere.sg', roles: ['ORGANISER'] },
  { email: 'coordinator@connectsphere.sg', roles: ['COORDINATOR'] },
  { email: 'venue_staff@connectsphere.sg', roles: ['VENUE_STAFF'] },
  { email: 'technical_support@connectsphere.sg', roles: ['TECH_SUPPORT'] },
  { email: 'attendee@connectsphere.sg', roles: ['ATTENDEE'] },
];

const supportedRoles = new Set([
  'ORGANISER',
  'COORDINATOR',
  'VENUE_STAFF',
  'TECH_SUPPORT',
  'ATTENDEE',
]);

/**
 * Validates manual assignments before any Firebase user claims are changed.
 *
 * @param {RoleAssignment[]} assignments User-to-role mappings to validate.
 * @param {Set<string>} permittedRoles Role names accepted by the backend.
 * @throws {Error} When an email remains a placeholder or a role is unsupported.
 * @returns {void}
 */
function validateRoleAssignments(assignments, permittedRoles) {
  if (assignments.some(({ email }) => email.endsWith('@example.com'))) {
    throw new Error(
      'Replace all placeholder @example.com addresses in scripts/set-firebase-roles.mjs before running it.',
    );
  }

  if (
    assignments.some(
      ({ roles }) => roles.length === 0 || roles.some((role) => !permittedRoles.has(role)),
    )
  ) {
    throw new Error('Each user must have at least one supported role.');
  }
}

validateRoleAssignments(roleAssignments, supportedRoles);

/**
 * Assigns application roles while preserving each user's unrelated Firebase
 * custom claims. Firebase replaces the full custom-claims object on update.
 *
 * @param {import('firebase-admin/auth').Auth} firebaseAuth Firebase Admin Auth client.
 * @param {RoleAssignment[]} assignments User-to-role mappings to apply.
 * @returns {Promise<void>}
 */
async function assignRoles(firebaseAuth, assignments) {
  for (const { email, roles } of assignments) {
    const user = await firebaseAuth.getUserByEmail(email);

    await firebaseAuth.setCustomUserClaims(user.uid, {
      ...(user.customClaims ?? {}),
      roles,
    });

    console.log(`Assigned ${roles.join(', ')} to ${email} (${user.uid})`);
  }
}

const serviceAccount = JSON.parse(await readFile(serviceAccountPath, 'utf8'));
const app = initializeApp({ credential: cert(serviceAccount) });
const firebaseAuth = getAuth(app);

await assignRoles(firebaseAuth, roleAssignments);

console.log('Done. Each affected user must sign out and back in to refresh their Firebase ID token.');
