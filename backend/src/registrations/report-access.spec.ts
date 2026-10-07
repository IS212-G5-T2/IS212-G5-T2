/*
 * Story: SPM-63 View Registration Information (Organiser and Coordinator), the one access rule.
 * ACs: AC1 (managers see the report), AC5 (everyone else does not).
 * Test cases: VIEW-REG-INFO-01-A / 01-C (allowed), 05-A / 05-B / 05-D (refused).
 *
 * canViewEventRegistrations is the single gate behind the report and both exports (R1, R3). It is pure: it
 * takes the verified identity and the event's two owner columns. Identities and events are literals here;
 * the labels COO-01, ORG-01 ... stand for the UUIDs the real tables hold.
 */
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { canViewEventRegistrations } from './report-access.js';

const COO_01 = 'coo-01-uid';
const COO_02 = 'coo-02-uid';
const ORG_01 = 'org-01-uid';
const ORG_02 = 'org-02-uid';
const ATT_01 = 'att-01-uid';
// EVT-101: coordinator COO-01, owned by ORG-01.
const EVT_101 = { coordinatorId: COO_01, organiserId: ORG_01 };

const user = (uid: string, ...roles: AuthenticatedUser['roles']): AuthenticatedUser => ({ uid, roles });

describe('SPM-63 AC1: the assigned coordinator and the owning organiser may view', () => {
  // VIEW-REG-INFO-01-A
  // Oracle (SPEC 01-A, R1): COO-01 is assigned to EVT-101.
  // Kills: M2 variant in the other direction (the assignment lookup on the wrong column refuses the real coordinator).
  it('VIEW-REG-INFO-01-A: the assigned coordinator is allowed', () => {
    // Arrange / Act
    const allowed = canViewEventRegistrations(user(COO_01, 'COORDINATOR'), EVT_101);

    // Assert
    expect(allowed).toBe(true);
  });

  // VIEW-REG-INFO-01-C
  // Oracle (SPEC 01-C, R1): ORG-01 owns EVT-101.
  // Kills: ownership not honoured.
  it('VIEW-REG-INFO-01-C: the owning organiser is allowed', () => {
    // Arrange / Act
    const allowed = canViewEventRegistrations(user(ORG_01, 'ORGANISER'), EVT_101);

    // Assert
    expect(allowed).toBe(true);
  });
});

describe('SPM-63 AC5: nobody else may view', () => {
  // VIEW-REG-INFO-05-A
  // Oracle (SPEC 05-A): COO-02 is assigned to a different event, so EVT-101's coordinator is not COO-02.
  // Kills: M2 the assignment check removed (any coordinator allowed); the coordinator role alone grants access.
  it('VIEW-REG-INFO-05-A: a coordinator who is not assigned is refused', () => {
    // Arrange / Act
    const allowed = canViewEventRegistrations(user(COO_02, 'COORDINATOR'), EVT_101);

    // Assert
    expect(allowed).toBe(false);
  });

  // VIEW-REG-INFO-05-B
  // Oracle (SPEC 05-B): ORG-02 does not own EVT-101.
  // Kills: M3 the ownership check removed (any organiser allowed).
  it('VIEW-REG-INFO-05-B: an organiser who does not own the event is refused', () => {
    // Arrange / Act
    const allowed = canViewEventRegistrations(user(ORG_02, 'ORGANISER'), EVT_101);

    // Assert
    expect(allowed).toBe(false);
  });

  // VIEW-REG-INFO-05-D
  // Oracle (SPEC 05-D A): ATT-01 holds a Confirmed registration on EVT-101 yet is neither role.
  // Kills: M7 a registered attendee allowed.
  it('VIEW-REG-INFO-05-D: an attendee is refused', () => {
    // Arrange / Act
    const allowed = canViewEventRegistrations(user(ATT_01, 'ATTENDEE'), EVT_101);

    // Assert
    expect(allowed).toBe(false);
  });

  // VIEW-REG-INFO-05-A-ROLE
  // Oracle (derived from R1): the id must be compared with the column for the user's own role. A coordinator
  // whose uid happens to equal the event's organiser_id is not a manager.
  // Kills: ownership compared to the wrong column (coordinator matched on organiser_id).
  it('VIEW-REG-INFO-05-A-ROLE: a coordinator whose id matches the organiser column is refused', () => {
    // Arrange: the event is owned by uid COO_02 as organiser, but COO_02 only holds the COORDINATOR role.
    const event = { coordinatorId: COO_01, organiserId: COO_02 };

    // Act
    const allowed = canViewEventRegistrations(user(COO_02, 'COORDINATOR'), event);

    // Assert
    expect(allowed).toBe(false);
  });

  // VIEW-REG-INFO-05-B-ROLE
  // Oracle (derived from R1): the mirror case; an organiser whose uid equals the coordinator column.
  // Kills: assignment compared to the wrong column (organiser matched on coordinator_id).
  it('VIEW-REG-INFO-05-B-ROLE: an organiser whose id matches the coordinator column is refused', () => {
    // Arrange
    const event = { coordinatorId: ORG_02, organiserId: ORG_01 };

    // Act
    const allowed = canViewEventRegistrations(user(ORG_02, 'ORGANISER'), event);

    // Assert
    expect(allowed).toBe(false);
  });

  // VIEW-REG-INFO-05-A-NULL
  // Oracle (derived): an event with no coordinator yet (coordinator_id NULL) matches nobody.
  // Kills: null === undefined style matches; a coordinator with an undefined-like id passing.
  it('VIEW-REG-INFO-05-A-NULL: an unassigned event is not viewable by a coordinator', () => {
    // Arrange
    const event = { coordinatorId: null, organiserId: ORG_01 };

    // Act
    const allowed = canViewEventRegistrations(user(COO_01, 'COORDINATOR'), event);

    // Assert
    expect(allowed).toBe(false);
  });

  // VIEW-REG-INFO-05-A-ROLE
  // Oracle (derived): the role check is on the verified token roles; no role means no access, even with a matching id.
  // Kills: the id match alone granting access.
  it('VIEW-REG-INFO-05-A-ROLE: a matching id without any role is refused', () => {
    // Arrange / Act
    const allowed = canViewEventRegistrations(user(COO_01), EVT_101);

    // Assert
    expect(allowed).toBe(false);
  });

  // VIEW-REG-INFO-01-C-BOTH
  // Oracle (derived from D3): a user holding BOTH roles is a manager if either test passes (here: as organiser).
  // Kills: an AND between the two rules instead of OR.
  it('VIEW-REG-INFO-01-C-BOTH: a dual-role user is allowed when either rule holds', () => {
    // Arrange: ORG_01 is the owner; the same account also holds COORDINATOR but is not assigned.
    const dual = user(ORG_01, 'COORDINATOR', 'ORGANISER');

    // Act
    const allowed = canViewEventRegistrations(dual, EVT_101);

    // Assert
    expect(allowed).toBe(true);
  });
});

// ASSUMPTION index
// (none: every oracle is SPEC or derived from D3 / R1)
