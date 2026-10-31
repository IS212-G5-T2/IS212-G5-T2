/*
 * SPM-135 planning checklist: what the coordinator's planning page shows for
 * venues, equipment and the safety check, and whether a safety check may be
 * requested. Pure, built on the same readiness rule as Confirm so the page and
 * the confirm gate cannot disagree about "confirmed".
 */
import {
  type EquipmentFact,
  type ReadinessSnapshot,
  type VenueBookingFact,
  hasApprovedReplacementForRejectedBooking,
} from './readiness.js';
import type { SafetyCheckView } from './safety-check.source.js';
import { approvedHoldState } from '../venue-unavailable.js';

export type RequestStatus =
  'not_requested' | 'pending' | 'confirmed' | 'unavailable';
export type Prerequisite = 'venue' | 'equipment';

export interface ChecklistInput {
  snapshot: Omit<ReadinessSnapshot, 'safety'>;
  /** The event's free-text equipment requirements; blank or "None" means no equipment. */
  equipmentNeeds: string;
  equipmentConfirmedAt: Date | null;
  safety: SafetyCheckView;
  now: Date;
}

export interface VenueRequestItem {
  id: string;
  venueName: string;
  status: RequestStatus;
  /** SPM-159: an approved tentative hold is shown as "Hold" or "Hold expired", never as confirmed. */
  holdState?: 'Hold' | 'Hold expired';
  requestedDate?: string;
}

export interface EquipmentRequestItem {
  id: string;
  name: string;
  quantity: number;
  status: RequestStatus;
  requestedDate?: string;
}

/** Each request has its own status; a section is confirmed only when every request is. */
export interface PlanningChecklist {
  venue: {
    status: RequestStatus;
    items: VenueRequestItem[];
    requestedDate?: string;
  };
  equipment: {
    /** False when the event lists no equipment: the coordinator confirms "none" instead. */
    required: boolean;
    status: RequestStatus;
    items: EquipmentRequestItem[];
    requestedDate?: string;
    confirmedByCoordinator: boolean;
    confirmedDate?: string;
  };
  safetyCheck: SafetyCheckView;
  canRequestSafetyCheck: boolean;
  /** Prerequisites still blocking a safety check request. */
  blocking: Prerequisite[];
}

const INACTIVE = new Set(['Cancelled', 'Released']);
const UNAVAILABLE_EQUIPMENT = new Set(['unavailable', 'rejected']);

export function equipmentRequired(equipmentNeeds: string): boolean {
  const text = equipmentNeeds.trim().toLowerCase();
  return text !== '' && text !== 'none';
}

const earliest = (times: Array<string | undefined>) =>
  times.filter((t): t is string => !!t).sort()[0];

// A rejected booking, or one whose venue is blocked for the window, needs a replacement request.
// SPM-159: an approved hold is not confirmed. A running hold is pending the coordinator's confirmed booking; an
// expired hold has released the venue and needs a replacement request.
function venueRequestStatus(booking: VenueBookingFact, now: Date): RequestStatus {
  if (booking.status === 'rejected') return 'unavailable';
  const hold = approvedHoldState(booking, now);
  if (hold) return hold === 'expired' ? 'unavailable' : 'pending';
  if (booking.status === 'approved')
    return booking.venueUnavailable ? 'unavailable' : 'confirmed';
  return 'pending';
}

function equipmentRequestStatus(line: EquipmentFact): RequestStatus {
  if (UNAVAILABLE_EQUIPMENT.has(line.status.toLowerCase()))
    return 'unavailable';
  return line.status === 'Reserved' ? 'confirmed' : 'pending';
}

/** Unavailable beats pending, and pending beats confirmed, across every request. */
function combined(statuses: RequestStatus[]): RequestStatus {
  if (statuses.includes('unavailable')) return 'unavailable';
  if (statuses.includes('pending')) return 'pending';
  return 'confirmed';
}

export function buildChecklist(input: ChecklistInput): PlanningChecklist {
  const { snapshot, equipmentNeeds, equipmentConfirmedAt, safety } = input;

  // Removed requests are history, not current arrangements. Rejected history is non-blocking only when a confirmed
  // ordinary booking replaces that same venue and overlapping slot, matching Confirm readiness.
  const activeBookings = snapshot.venueBookings.filter(
    (b) => b.status !== 'released' && b.status !== 'cancelled',
  );
  const bookings = activeBookings.filter(
    (booking) => !(booking.status === 'rejected' && hasApprovedReplacementForRejectedBooking(booking, activeBookings)),
  );
  const venueItems: VenueRequestItem[] = bookings.map((b) => {
    const hold = approvedHoldState(b, input.now);
    return {
      id: b.id,
      venueName: b.venueName,
      status: venueRequestStatus(b, input.now),
      ...(hold ? { holdState: hold === 'expired' ? ('Hold expired' as const) : ('Hold' as const) } : {}),
      ...(b.requestedAt ? { requestedDate: b.requestedAt } : {}),
    };
  });
  const venueStatus: RequestStatus =
    bookings.length === 0
      ? 'not_requested'
      : combined(venueItems.map((item) => item.status));

  const lines = snapshot.equipment.filter((line) => !INACTIVE.has(line.status));
  const noneConfirmed = lines.length === 0 && equipmentConfirmedAt !== null;
  const equipmentItems: EquipmentRequestItem[] = lines.map((l) => ({
    id: l.id,
    name: l.name,
    quantity: l.quantity,
    status: equipmentRequestStatus(l),
    ...(l.requestedAt ? { requestedDate: l.requestedAt } : {}),
  }));
  const equipmentStatus: RequestStatus =
    lines.length === 0
      ? 'not_requested'
      : combined(equipmentItems.map((item) => item.status));
  const equipmentConfirmed = equipmentStatus === 'confirmed' || noneConfirmed;

  const blocking: Prerequisite[] = [];
  if (venueStatus !== 'confirmed') blocking.push('venue');
  if (!equipmentConfirmed) blocking.push('equipment');

  const venueRequestedAt = earliest(bookings.map((b) => b.requestedAt));
  const equipmentRequestedAt = earliest(lines.map((l) => l.requestedAt));

  return {
    venue: {
      status: venueStatus,
      items: venueItems,
      ...(venueRequestedAt ? { requestedDate: venueRequestedAt } : {}),
    },
    equipment: {
      required: equipmentRequired(equipmentNeeds),
      status: equipmentStatus,
      items: equipmentItems,
      ...(equipmentRequestedAt ? { requestedDate: equipmentRequestedAt } : {}),
      confirmedByCoordinator: noneConfirmed,
      ...(noneConfirmed
        ? { confirmedDate: equipmentConfirmedAt!.toISOString() }
        : {}),
    },
    // A safety check only stands while venue and equipment are confirmed (SAFETY-RESET-01).
    // A "not requested" check keeps its reset reason so the page can say why a re-request is needed.
    safetyCheck:
      blocking.length === 0 || safety.status === 'not_requested'
        ? safety
        : { status: 'not_requested' },
    canRequestSafetyCheck: blocking.length === 0,
    blocking,
  };
}
