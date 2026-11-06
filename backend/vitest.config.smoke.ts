import { defineConfig } from 'vitest/config';

/**
 * Post-delivery smoke suite, unit tier. Run with `npm run test:smoke:unit`.
 *
 * This is an allow-list of existing spec files; none of them is edited or tagged in place. To add or
 * remove one, change `include` below and the table in docs/ci/smoke.md. Each entry says why it is here.
 */
const SMOKE_UNIT_SPECS = [
  // Auth: credentials -> server-side session -> logout; the gate in front of every endpoint.
  'src/auth/authentication/auth.service.spec.ts',
  // Auth: session cookie -> authenticated request user, and rejection of absent/empty/expired sessions.
  'src/auth/authentication/authentication.middleware.spec.ts',
  // Authorisation: role/permission predicate that fails closed for denied, missing and malformed rows.
  'src/auth/authorization/repository/rbac.repository.spec.ts',
  // Booking conflict detection: setup/turnaround overlap, boundary minutes, race after availability read.
  'src/venues/repository/venues.repository.spec.ts',
  // Event status transitions: routing, Confirmed handler, compare-and-set races, invalid transitions.
  'src/events/status/status.service.spec.ts',
  // Safety gate / Confirm readiness rules: venue, equipment and safety must all be satisfied; fails closed.
  'src/events/status/readiness.spec.ts',
  // Safety Officer queue and approve/reject/changes decisions.
  'src/events/safety-officer/safety-officer.service.spec.ts',
  // Cancellation transition: authorisation order, cancellable set, transaction and notices.
  'src/events/cancel/cancel-event.service.spec.ts',
  // Registration capacity math: window open/close boundaries, N-1 vs N places, duplicates.
  'src/registrations/registrations.service.spec.ts',
];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: SMOKE_UNIT_SPECS,
  },
});
