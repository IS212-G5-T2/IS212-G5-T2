// Story: SPM-159 Request a Tentative Hold on a Venue (Coordinator)
// The shared "approved tentative hold" rule used by readiness, checklist, queue, venue summary and event planning.
import { describe, expect, it } from 'vitest';
import {
  activeApprovedHoldSql,
  approvedHoldState,
  confirmedBookingSql,
  expiredApprovedHoldSql,
  occupiesVenueSql,
} from './venue-unavailable.js';

const NOW = new Date('2030-01-10T12:00:00.000Z');
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('VEN-HOLD-04-SUP-EVENTS approvedHoldState', () => {
  const hold = (holdExpiresAt: Date | null, extra: Record<string, unknown> = {}) => ({
    status: 'approved',
    requestKind: 'tentative_hold',
    holdExpiresAt,
    ...extra,
  });

  /** SPM-159: an approved hold is active before its expiry and expired from the expiry instant on. */
  it('is active before the expiry and expired from the expiry instant', () => {
    expect(approvedHoldState(hold(new Date(NOW.getTime() + 1)), NOW)).toBe('active');
    expect(approvedHoldState(hold(NOW), NOW)).toBe('expired');
    expect(approvedHoldState(hold(new Date(NOW.getTime() - 1)), NOW)).toBe('expired');
  });

  /** SPM-159: fail closed, an approved hold with no recorded expiry is active and never confirmed. */
  it('treats an approved hold with no expiry as active', () => {
    expect(approvedHoldState(hold(null), NOW)).toBe('active');
  });

  /** SPM-159: only approved tentative holds have a hold state; everything else is null. */
  it('is null for ordinary, pending, rejected and unflagged bookings', () => {
    const future = new Date(NOW.getTime() + 1000);
    expect(approvedHoldState(hold(future, { requestKind: 'booking' }), NOW)).toBeNull();
    expect(approvedHoldState(hold(future, { requestKind: undefined }), NOW)).toBeNull();
    expect(approvedHoldState(hold(future, { requestKind: null }), NOW)).toBeNull();
    expect(approvedHoldState(hold(future, { status: 'pending' }), NOW)).toBeNull();
    expect(approvedHoldState(hold(future, { status: 'rejected' }), NOW)).toBeNull();
  });
});

describe('VEN-HOLD-04-SUP-EVENTS hold SQL fragments', () => {
  /** SPM-159: the fragments take the row alias and compare the expiry with the SQL clock, exclusive at the expiry. */
  it('builds the expired, active, confirmed and occupying predicates for an alias', () => {
    expect(normalize(expiredApprovedHoldSql('n'))).toBe(
      "(n.status = 'approved' AND n.request_kind = 'tentative_hold' AND n.hold_expires_at IS NOT NULL AND n.hold_expires_at <= now())",
    );
    expect(normalize(activeApprovedHoldSql('n'))).toBe(
      "(n.status = 'approved' AND n.request_kind = 'tentative_hold' AND (n.hold_expires_at IS NULL OR n.hold_expires_at > now()))",
    );
    expect(confirmedBookingSql('n')).toBe("(n.status = 'approved' AND n.request_kind <> 'tentative_hold')");
    expect(normalize(occupiesVenueSql('n'))).toBe(`(n.status = 'approved' AND NOT ${normalize(expiredApprovedHoldSql('n'))})`);
  });

  /** SPM-159: the alias defaults to the booking alias `b` used by the events queries. */
  it('defaults to the alias b', () => {
    expect(expiredApprovedHoldSql()).toContain('b.hold_expires_at');
    expect(activeApprovedHoldSql()).toContain('b.hold_expires_at');
    expect(confirmedBookingSql()).toContain('b.request_kind');
    expect(occupiesVenueSql()).toContain('b.status');
  });
});
