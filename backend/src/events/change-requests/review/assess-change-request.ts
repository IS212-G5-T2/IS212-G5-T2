/*
 * SPM-65 AC3 and AC9: what a change request would affect, assessed with the same rules the
 * coordinator's own updates use (SPM-49/85: assessVenueBookings, equipmentImpacts), plus the
 * event's registrations. Pure: the caller loads the rows. Nothing here writes anything, so the
 * coordinator can preview conflicts without changing the event or its bookings (agreed: read-only
 * preview).
 *
 * - Venue bookings and equipment reservations: only active arrangements are assessed; each one the
 *   requested values are incompatible with is listed once, with every reason (de-duplicated). This
 *   is also the "arrangements to re-check" list stored when the request is approved (AC9).
 * - Registrations: an expected attendance below the number already registered is a conflict, and a
 *   date/time change is reported with the number of registered and waitlisted attendees it affects.
 */
import { assessVenueBookings } from '../../planning/helpers/event-impact.js';
import {
  activeEquipmentOnly,
  activeOnly,
  equipmentImpacts,
  proposalFor,
  sameValue,
} from '../../planning/event-planning.service.js';
import type {
  EquipmentArrangementRow,
  PlanningEventRow,
  VenueBookingRow,
} from '../../planning/event-planning.repository.js';
import {
  FIELD_POLICY,
  type EventFieldKey,
  type EventUpdatePatch,
} from '../../planning/dto/event-update-input.js';

export interface ArrangementImpact {
  kind: 'venue' | 'equipment';
  /** The venue booking or equipment reservation id. */
  refId: string;
  name: string;
  details: string[];
}

export interface RegistrationCounts {
  registered: number;
  waitlisted: number;
}

export interface ChangeAssessment {
  venueBookings: ArrangementImpact[];
  equipment: ArrangementImpact[];
  registrations: RegistrationCounts & { details: string[] };
  hasConflicts: boolean;
}

function addDetails(
  target: Map<string, ArrangementImpact>,
  impact: ArrangementImpact,
) {
  const existing = target.get(impact.refId);
  if (!existing) {
    target.set(impact.refId, {
      ...impact,
      details: [...new Set(impact.details)],
    });
    return;
  }
  for (const detail of impact.details)
    if (!existing.details.includes(detail)) existing.details.push(detail);
}

export function assessChangeRequest(
  patch: EventUpdatePatch,
  event: PlanningEventRow,
  bookings: VenueBookingRow[],
  equipment: EquipmentArrangementRow[],
  counts: RegistrationCounts,
): ChangeAssessment {
  const changed = (Object.keys(patch) as EventFieldKey[]).filter(
    (field) => !sameValue(field, event[field], patch[field]),
  );
  const activeBookings = activeOnly(bookings);
  const activeEquipment = activeEquipmentOnly(equipment);
  const venues = new Map<string, ArrangementImpact>();
  const items = new Map<string, ArrangementImpact>();

  for (const field of changed) {
    if (FIELD_POLICY[field] !== 'review_if_impacting') continue;
    for (const impact of assessVenueBookings(
      proposalFor(field, patch, event),
      activeBookings,
    ))
      if (impact.impacted)
        addDetails(venues, {
          kind: 'venue',
          refId: impact.bookingId,
          name: impact.venueName,
          details: impact.conflicts.map((conflict) => conflict.detail),
        });
    for (const impact of equipmentImpacts(field, patch, event, activeEquipment))
      addDetails(items, {
        kind: 'equipment',
        refId: impact.arrangementId,
        name: `${impact.name} × ${impact.quantity}`,
        details: [impact.detail],
      });
  }

  const details: string[] = [];
  const attendance = patch.expectedAttendance;
  if (
    changed.includes('expectedAttendance') &&
    attendance !== undefined &&
    attendance < counts.registered
  )
    details.push(
      `${counts.registered} attendees are already registered; the requested attendance is ${attendance}`,
    );
  const total = counts.registered + counts.waitlisted;
  if (
    (changed.includes('startDateTime') || changed.includes('endDateTime')) &&
    total > 0
  )
    details.push(
      `${total} registered attendee${total === 1 ? '' : 's'} (${counts.registered} registered, ${counts.waitlisted} waitlisted) will be affected by the new date/time`,
    );

  const venueBookings = [...venues.values()];
  const equipmentList = [...items.values()];
  return {
    venueBookings,
    equipment: equipmentList,
    registrations: { ...counts, details },
    hasConflicts:
      venueBookings.length > 0 ||
      equipmentList.length > 0 ||
      details.length > 0,
  };
}
