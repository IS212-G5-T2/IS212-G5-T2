import { describe, expect, it } from 'vitest';
import { buildChecklist } from './checklist.js';
import type { EquipmentFact, VenueBookingFact } from './readiness.js';

const now = new Date('2026-10-13T00:00:00Z');
const booking = (over: Partial<VenueBookingFact> = {}): VenueBookingFact => ({
  id: 'b1',
  venueName: 'Main Hall',
  status: 'approved',
  holdExpiresAt: null,
  venueUnavailable: false,
  requestedAt: '2026-10-10T00:00:00.000Z',
  ...over,
});
const line = (over: Partial<EquipmentFact> = {}): EquipmentFact => ({
  id: 'e1',
  name: 'Projector',
  quantity: 1,
  status: 'Reserved',
  ...over,
});
const build = (
  venueBookings: VenueBookingFact[],
  equipment: EquipmentFact[],
  extra: { needs?: string; confirmedAt?: Date | null } = {},
) =>
  buildChecklist({
    snapshot: { venueBookings, equipment },
    equipmentNeeds: extra.needs ?? 'Projector',
    equipmentConfirmedAt: extra.confirmedAt ?? null,
    safety: { status: 'not_requested' },
    now,
  });

describe('buildChecklist', () => {
  it('reports no venue request and blocks the safety check', () => {
    const result = build([], [line()]);
    expect(result.venue.status).toBe('not_requested');
    expect(result.canRequestSafetyCheck).toBe(false);
    expect(result.blocking).toEqual(['venue']);
  });

  it('treats a pending booking as pending and an approved one as confirmed', () => {
    expect(build([booking({ status: 'pending' })], [line()]).venue.status).toBe('pending');
    expect(build([booking()], [line()]).venue.status).toBe('confirmed');
  });

  it('does not confirm an approved booking whose venue became unavailable', () => {
    expect(build([booking({ venueUnavailable: true })], [line()]).venue.status).not.toBe('confirmed');
  });

  it('allows a safety check once venue and reserved equipment are confirmed', () => {
    const result = build([booking()], [line()]);
    expect(result.equipment.status).toBe('confirmed');
    expect(result.canRequestSafetyCheck).toBe(true);
    expect(result.blocking).toEqual([]);
  });

  // SAFETY-RESET-01 (rule level): while venue or equipment is pending, the safety check is not
  // requested, even if a stale safety record is passed in. Kills: a page showing an approval
  // that no longer covers the pending arrangements.
  it('reports the safety check as not requested while equipment is pending, even with an approval passed in', () => {
    const result = buildChecklist({
      snapshot: { venueBookings: [booking()], equipment: [line({ status: 'Requested' })] },
      equipmentNeeds: 'Projector',
      equipmentConfirmedAt: null,
      safety: { status: 'approved', approverName: 'Safety Officer 1' },
      now,
    });
    expect(result.safetyCheck).toEqual({ status: 'not_requested' });
    expect(result.canRequestSafetyCheck).toBe(false);
  });

  it('keeps equipment pending while any line is not reserved', () => {
    const result = build([booking()], [line(), line({ id: 'e2', status: 'Requested' })]);
    expect(result.equipment.status).toBe('pending');
    expect(result.blocking).toEqual(['equipment']);
  });

  it('requires the no-equipment confirmation when none is listed', () => {
    const open = build([booking()], [], { needs: 'None' });
    expect(open.equipment.required).toBe(false);
    expect(open.canRequestSafetyCheck).toBe(false);
    const done = build([booking()], [], { needs: '', confirmedAt: now });
    expect(done.equipment.confirmedByCoordinator).toBe(true);
    expect(done.canRequestSafetyCheck).toBe(true);
  });

  it('reports a rejected venue booking as unavailable, not pending', () => {
    const result = build([booking({ status: 'rejected' })], [line()]);
    expect(result.venue.status).toBe('unavailable');
    expect(result.blocking).toEqual(['venue']);
  });

  it('reports a venue blocked for the window as unavailable', () => {
    expect(build([booking({ venueUnavailable: true })], [line()]).venue.status).toBe('unavailable');
  });

  it('reports an unavailable equipment line as unavailable', () => {
    const result = build([booking()], [line({ status: 'Unavailable' })]);
    expect(result.equipment.status).toBe('unavailable');
    expect(result.blocking).toEqual(['equipment']);
  });

  it('lists every venue request with its own status and confirms only when all are confirmed', () => {
    const mixed = build([booking({ id: 'b1', venueName: 'Main Hall' }), booking({ id: 'b2', venueName: 'Breakout Room 1', status: 'pending' })], [line()]);
    expect(mixed.venue.items.map((item) => [item.venueName, item.status])).toEqual([
      ['Main Hall', 'confirmed'],
      ['Breakout Room 1', 'pending'],
    ]);
    expect(mixed.venue.status).toBe('pending');
    expect(mixed.blocking).toEqual(['venue']);

    const both = build([booking({ id: 'b1' }), booking({ id: 'b2', venueName: 'Breakout Room 1' })], [line()]);
    expect(both.venue.status).toBe('confirmed');
    expect(both.blocking).toEqual([]);
  });

  it('shows unavailable over pending when one venue request is unavailable', () => {
    const result = build([booking({ id: 'b1', status: 'rejected' }), booking({ id: 'b2', venueName: 'Breakout Room 1', status: 'pending' })], [line()]);
    expect(result.venue.status).toBe('unavailable');
    expect(result.venue.items.map((item) => item.status)).toEqual(['unavailable', 'pending']);
  });

  it('lists every equipment request and keeps the section pending until all are reserved', () => {
    const result = build([booking()], [line({ id: 'e1' }), line({ id: 'e2', name: 'Microphone', quantity: 2, status: 'Requested' })]);
    expect(result.equipment.items.map((item) => [item.name, item.quantity, item.status])).toEqual([
      ['Projector', 1, 'confirmed'],
      ['Microphone', 2, 'pending'],
    ]);
    expect(result.equipment.status).toBe('pending');
  });

  it('ignores cancelled equipment lines', () => {
    expect(build([booking()], [line({ status: 'Cancelled' })]).equipment.status).toBe('not_requested');
  });
});
