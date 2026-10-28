// Story: SPM-159 Request a Tentative Hold on a Venue (Coordinator)
// The venue summary shown on every event list, detail and planning page.
import { describe, expect, it } from 'vitest';
import { VENUE_SUMMARY_SQL } from './venue-summary.js';

const sql = VENUE_SUMMARY_SQL.replace(/\s+/g, ' ');

describe('VEN-HOLD-04-SUP-EVENTS VENUE_SUMMARY_SQL', () => {
  /** SPM-159: an approved tentative hold is labelled (hold) while running and (hold expired) afterwards, never the plain confirmed name. */
  it('labels an approved tentative hold (hold) or (hold expired) ahead of the confirmed label', () => {
    const expired = sql.indexOf("THEN v.name || ' (hold expired)'");
    const active = sql.indexOf("THEN v.name || ' (hold)'");
    const confirmed = sql.indexOf("WHEN b.status = 'approved' AND NOT");
    expect(expired).toBeGreaterThan(-1);
    expect(active).toBeGreaterThan(expired);
    expect(confirmed).toBeGreaterThan(active);
    expect(sql).toContain("b.status = 'approved' AND b.request_kind = 'tentative_hold' AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at <= now()");
    expect(sql).toContain("b.status = 'approved' AND b.request_kind = 'tentative_hold' AND (b.hold_expires_at IS NULL OR b.hold_expires_at > now())");
  });

  /** Released bookings stay out; pending and rejected keep their labels. */
  it('keeps the pending, unavailable and released rules', () => {
    expect(sql).toContain("WHEN b.status = 'pending' THEN v.name || ' (pending)'");
    expect(sql).toContain("ELSE v.name || ' (unavailable)'");
    expect(sql).toContain("b.status <> 'released'");
  });
});
