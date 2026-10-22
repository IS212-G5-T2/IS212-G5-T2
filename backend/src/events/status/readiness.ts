/*
 * SPM-135 AC1 to AC3: the readiness rule for confirming an event (D6, D7).
 * Pure: the caller supplies the arrangements snapshot and the time, so the
 * same rule runs in the confirming transaction, in the arrangements-status
 * endpoint and in unit tests. Fail closed: missing data is outstanding.
 */

export type OutstandingType = 'venue' | 'equipment' | 'safety';

export interface OutstandingItem {
  type: OutstandingType;
  label: string;
  detail: string;
  state: string;
}

export interface VenueBookingFact {
  id: string;
  venueName: string;
  /** released belongs to a cancelled event; cancelled is an individually cancelled venue request. */
  status: 'pending' | 'approved' | 'rejected' | 'released' | 'cancelled';
  /** Pending bookings with a hold expiry are tentative holds (SPM-132/133). */
  holdExpiresAt: Date | null;
  /** An approved booking whose venue is flagged unavailable for the window. */
  venueUnavailable: boolean;
  /** ISO slot times; carried for the organiser view, not used by the rule. */
  start?: string;
  end?: string;
  /** ISO time the request was made. */
  requestedAt?: string;
}

export interface EquipmentFact {
  id: string;
  name: string;
  quantity: number;
  status: string;
  requestedAt?: string;
}

export interface SafetyFact {
  /** SPM-126 outcome; `undefined` on the snapshot means no safety record exists. */
  state: 'Approved' | 'Awaiting Check' | 'Changes Requested' | 'Rejected';
}

export interface ReadinessSnapshot {
  venueBookings: VenueBookingFact[];
  equipment: EquipmentFact[];
  safety: SafetyFact | undefined;
  /**
   * The coordinator confirmed that no equipment is needed (events.equipment_confirmed_at).
   * Without active equipment lines this is the only way equipment is satisfied.
   */
  equipmentNoneConfirmed?: boolean;
}

export interface ReadinessResult {
  ready: boolean;
  outstanding: OutstandingItem[];
}

// Equipment lines that no longer hold anything for the event (PO confirmed 22 Oct 2026, SC-136-012).
const INACTIVE_EQUIPMENT = new Set(['Cancelled', 'Released']);

const VENUE_LABEL = 'Venue booking approval';
const EQUIPMENT_LABEL = 'Equipment reservation';
const SAFETY_LABEL = 'Safety Officer approval';

const byId = <T extends { id: string }>(a: T, b: T) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function venueItem(
  booking: VenueBookingFact,
  now: Date,
): OutstandingItem | undefined {
  if (booking.status === 'approved') {
    if (!booking.venueUnavailable) return undefined;
    return {
      type: 'venue',
      label: VENUE_LABEL,
      detail: `${booking.venueName} (Venue unavailable)`,
      state: 'Venue unavailable',
    };
  }
  if (booking.status === 'rejected') {
    return {
      type: 'venue',
      label: VENUE_LABEL,
      detail: `${booking.venueName} (Rejected)`,
      state: 'Rejected',
    };
  }
  // pending: a hold that has not expired, a hold that has expired, or a plain pending request
  if (booking.holdExpiresAt === null) {
    return {
      type: 'venue',
      label: VENUE_LABEL,
      detail: `${booking.venueName} (Pending)`,
      state: 'Pending',
    };
  }
  const expired = booking.holdExpiresAt.getTime() <= now.getTime();
  const state = expired ? 'Hold expired' : 'Hold';
  return {
    type: 'venue',
    label: VENUE_LABEL,
    detail: `${booking.venueName} (${state})`,
    state,
  };
}

function equipmentItem(line: EquipmentFact): OutstandingItem | undefined {
  if (INACTIVE_EQUIPMENT.has(line.status) || line.status === 'Reserved')
    return undefined;
  return {
    type: 'equipment',
    label: EQUIPMENT_LABEL,
    detail: `${line.name} x${line.quantity} (${line.status})`,
    state: line.status,
  };
}

function safetyItem(
  safety: SafetyFact | undefined,
): OutstandingItem | undefined {
  if (safety?.state === 'Approved') return undefined;
  if (safety === undefined) {
    // Wording confirmed by the PO on 22 Oct 2026 (SC-136-011): no record is still awaiting a check.
    return {
      type: 'safety',
      label: SAFETY_LABEL,
      detail: 'Awaiting check',
      state: 'No record',
    };
  }
  if (safety.state === 'Changes Requested') {
    return {
      type: 'safety',
      label: SAFETY_LABEL,
      detail: 'Changes requested',
      state: 'Changes Requested',
    };
  }
  if (safety.state === 'Awaiting Check') {
    return {
      type: 'safety',
      label: SAFETY_LABEL,
      detail: 'Awaiting check',
      state: 'Awaiting Check',
    };
  }
  return {
    type: 'safety',
    label: SAFETY_LABEL,
    detail: 'Rejected',
    state: 'Rejected',
  };
}

export function evaluateReadiness(
  snapshot: ReadinessSnapshot,
  now: Date,
): ReadinessResult {
  const outstanding: OutstandingItem[] = [];

  // Zero bookings is outstanding, never vacuously approved (F6, M18).
  const activeVenueBookings = snapshot.venueBookings.filter(
    (booking) =>
      booking.status !== 'released' && booking.status !== 'cancelled',
  );
  if (
    activeVenueBookings.length === 0 &&
    (snapshot.venueBookings.length === 0 ||
      snapshot.venueBookings.some((booking) => booking.status === 'cancelled'))
  ) {
    outstanding.push({
      type: 'venue',
      label: VENUE_LABEL,
      detail: 'None requested',
      state: 'None requested',
    });
  }
  for (const booking of [...activeVenueBookings].sort(byId)) {
    const item = venueItem(booking, now);
    if (item) outstanding.push(item);
  }
  for (const line of [...snapshot.equipment].sort(byId)) {
    const item = equipmentItem(line);
    if (item) outstanding.push(item);
  }
  // Equipment is satisfied by reserved lines, or by an explicit "none needed" confirmation.
  // Zero active lines with no confirmation is outstanding, as an unrequested request is (EQUIPMENT-GATE-01).
  const hasActiveEquipment = snapshot.equipment.some(
    (line) => !INACTIVE_EQUIPMENT.has(line.status),
  );
  if (!hasActiveEquipment && !snapshot.equipmentNoneConfirmed)
    outstanding.push({
      type: 'equipment',
      label: EQUIPMENT_LABEL,
      detail: 'None requested',
      state: 'Not requested',
    });
  const safety = safetyItem(snapshot.safety);
  if (safety) outstanding.push(safety);

  return { ready: outstanding.length === 0, outstanding };
}

/** The visible text of one outstanding item (D7): `${label}: ${detail}`. */
export function formatOutstanding(item: OutstandingItem): string {
  return `${item.label}: ${item.detail}`;
}
