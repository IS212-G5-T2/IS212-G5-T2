export type UserRole =
  | "organiser"
  | "coordinator"
  | "venue_staff"
  | "tech_support"
  | "attendee"
  /** SPM-123: the single Event Coordinator Lead, never also a coordinator. */
  | "coordinator_lead";

export interface User {
  id: string;
  name: string;
  /** Every role granted by the server; optional only while legacy fixtures migrate. */
  roles?: UserRole[];
  /** Primary display/navigation role retained while the UI gains a role switcher. */
  role: UserRole;
  email: string;
}

/** Checks every server-granted role, with a legacy fallback for test fixtures. */
export function hasRole(
  user: Pick<User, "role"> & Partial<Pick<User, "roles">>,
  role: UserRole,
): boolean {
  return user.roles?.includes(role) ?? user.role === role;
}

export type EventStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "planning"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected";

export interface VenueRequirements {
  minCapacity: number;
  accessibility: string[];
  facilities: string[];
  layout: string;
}

export interface EventAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

/** SPM-64: the event details an organiser may ask to change. */
export type ChangeRequestField =
  | "description"
  | "startDateTime"
  | "endDateTime"
  | "expectedAttendance"
  | "layout"
  | "facilities"
  | "accessibility"
  | "equipmentNeeds";

/** SPM-65: Closed = the event was cancelled while the request was pending. */
export type ChangeRequestStatus = "Pending" | "Approved" | "Denied" | "Withdrawn" | "Closed";

/** One requested change: the value when the request was made and the value asked for. */
export interface RequestedChange {
  field: ChangeRequestField;
  originalValue: unknown;
  proposedValue: unknown;
}

/** SPM-64: an organiser's change request, as GET/POST /api/events/:id/change-requests return it. */
export interface ChangeRequest {
  id: string;
  eventId: string;
  eventName: string;
  status: ChangeRequestStatus;
  changes: RequestedChange[];
  reason?: string;
  /** Past approval: approving any change resets the event's safety check. */
  requiresSafetyCheck: boolean;
  requestedBy: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  /** SPM-65: the coordinator's reason for a denial, or why a request was closed. */
  decisionReason?: string;
  /** SPM-65 AC1: the event's organiser. */
  organiserName?: string;
  /** SPM-65 AC9: arrangements to re-check after approval. */
  recheck: RecheckItem[];
  /** SPM-65 AC8: approving reset the event's safety check. */
  safetyCheckReset: boolean;
}

/** SPM-65 AC3: one venue booking or equipment reservation the requested values conflict with. */
export interface ArrangementImpact {
  kind: "venue" | "equipment";
  refId: string;
  name: string;
  details: string[];
}

/** SPM-65 AC9: an affected arrangement the coordinator ticks off once re-checked. */
export interface RecheckItem extends ArrangementImpact {
  id: string;
  checkedAt?: string;
  checkedBy?: string;
}

/** SPM-65 AC3: GET /api/events/:id/change-requests/:requestId/conflicts (read-only). */
export interface ChangeRequestConflicts {
  requestId: string;
  venueBookings: ArrangementImpact[];
  equipment: ArrangementImpact[];
  registrations: { registered: number; waitlisted: number; details: string[] };
  hasConflicts: boolean;
}

/** SPM-65 AC4/AC8: POST .../approve. */
export interface ChangeRequestApproval {
  request: ChangeRequest;
  eventStatus: EventStatus;
  safetyCheckReset: boolean;
}

/** SPM-65 AC10: one audit log entry. */
export interface ChangeRequestAuditEntry {
  id: string;
  changeRequestId: string;
  outcome: "Approved" | "Denied" | "Withdrawn" | "Closed";
  changes: RequestedChange[];
  requestedBy: string;
  decidedBy: string;
  reason?: string;
  decidedAt: string;
}

/** Body of POST /api/events/:id/change-requests. */
export interface ChangeRequestSubmission {
  changes: Partial<Record<ChangeRequestField, unknown>>;
  reason?: string;
}

/** SPM-48 AC6, AC7: the safety state on a queue card. RESET: the check was reset and must be requested again. */
export type QueueSafety = "AWAITING_CHECK" | "CHANGES_REQUESTED" | "REJECTED" | "RESET" | "CLEARED";

/** SPM-48 AC5: why an event needs the coordinator's action. */
export type QueueAction =
  | "AWAITING_REVIEW"
  | "SAFETY_CHANGES_REQUESTED"
  | "SAFETY_REJECTED"
  | "SAFETY_RESET"
  | "VENUE_UNAVAILABLE"
  | "HOLD_EXPIRED";

/** SPM-48 AC8: a tentative venue hold and whether it is still active. */
export interface QueueHold {
  venueName: string;
  expiresAt: string;
  state: "ACTIVE" | "EXPIRED";
}

/** SPM-48: what the coordinator's queue shows on one event (backend src/events/queue/queue-indicators.ts). */
export interface QueueIndicators {
  safety: QueueSafety | null;
  holds: QueueHold[];
  /** AC9: venues of active bookings that an unavailable period now overlaps. */
  unavailableVenues: string[];
  actions: QueueAction[];
  needsAction: boolean;
}

export interface EventRecord {
  id: string;
  name: string;
  purpose: string;
  description: string;
  organiserId: string;
  organiserName: string;
  status: EventStatus;
  startDateTime: string;
  endDateTime: string;
  expectedAttendance: number;
  venueRequirements: VenueRequirements;
  equipmentNeeds: string;
  registrationEnabled: boolean;
  /** ISO timestamp at which attendee registration becomes available. */
  registrationOpensAt?: string;
  /** ISO timestamp after which attendee registration is no longer available. */
  registrationClosesAt?: string;
  /** Server-computed: the registration window is open right now (SPM-61). */
  registrationOpen?: boolean;
  /** The signed-in attendee's own registration status, on the browse list only (SPM-61). */
  myRegistrationStatus?: RegistrationStatus;
  /** Registration capacity remaining; separate from venue capacity. */
  availableRegistrationSpots?: number;
  /** SPM-138: the registration limit (the capacity counted against Confirmed attendees). */
  registrationLimit?: number;
  /** SPM-138: Confirmed attendees have reached the limit. */
  isFull?: boolean;
  /** SPM-138: the waitlist can be joined now (full and open for registration). */
  waitlistAvailable?: boolean;
  /** SPM-138: places left (limit minus Confirmed, never below zero). */
  availableSpots?: number;
  coordinatorId?: string;
  coordinatorName?: string;
  /** SPM-94 AC2: Submitted and not yet assigned to a Coordinator. */
  awaitingCoordinatorAssignment?: boolean;
  /** SPM-94 AC3: at most one safety indicator; null when there is none. */
  safetyIndicator?: "AWAITING_CHECK" | "CHANGES_REQUESTED" | "CLEARED" | null;
  /** SPM-94 cards: the latest venue request (pending, approved, rejected or released), organiser and coordinator only. */
  venueRequestStatus?: "pending" | "approved" | "rejected" | "released" | "cancelled" | null;
  /** SPM-94 cards: every equipment reservation status, organiser and coordinator only. */
  equipmentStatuses?: string[];
  /** SPM-46: who the current coordinator received the event from, and when. */
  reassignedFrom?: { coordinatorName: string; reassignedAt: string };
  /** SPM-48: the coordinator queue's indicators (GET /coordinator/queue only). */
  queue?: QueueIndicators;
  venueId?: string;
  venueName?: string;
  attachments?: EventAttachment[];
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type CommentType = "clarification" | "reply";
export type CommentAuthorRole = "coordinator" | "organiser";

export interface EventComment {
  id: string;
  eventId: string;
  parentId: string | null;
  type: CommentType;
  authorId: string;
  authorName: string;
  authorRole: CommentAuthorRole;
  message: string;
  awaitingReply: boolean;
  resolved: boolean;
  createdAt: string;
}

export interface Venue {
  id: string;
  name: string;
  location: string;
  capacity: number;
  facilities: string[];
  accessibility: string[];
  layouts: string[];
  operatingInformation: string;
  setupTimeMinutes: number;
  turnaroundTimeMinutes: number;
  image?: VenueImage;
}

export interface VenueImage {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

/** Venue details supplied by staff before the backend generates its UUID. */
export type VenueCreateInput = Omit<
  Venue,
  "id"
>;

export type BookingStatus = "pending" | "approved" | "rejected";

export interface BookingConflict {
  withBookingId: string;
  eventName: string;
  start: string;
  end: string;
}

export interface Booking {
  id: string;
  eventId: string;
  eventName: string;
  venueId: string;
  venueName: string;
  requestedBy: string;
  start: string;
  end: string;
  status: BookingStatus;
  conflict?: BookingConflict;
  rejectionReason?: string;
  createdAt: string;
}

/** A pending venue booking request shown to Venue Staff for review (SPM-55 AC1). */
export interface PendingBookingRequest {
  id: string;
  eventId: string;
  eventName: string;
  eventStart: string;
  eventEnd: string;
  coordinatorName: string;
  venueName: string;
  bookingReference: string;
  specialRequest?: string;
  start: string;
  end: string;
  status: BookingStatus;
  requestKind?: "booking" | "tentative_hold";
  holdExpiresAt?: string;
  holdExpired?: boolean;
  rejectionReason?: string;
  /** SPM-159 AC13: current venue setup changed while the hold request was pending. */
  reassessmentRequired?: boolean;
}

/** Full occupied time reported when Venue Staff approval is blocked (SPM-56 AC6). */
export interface VenueBookingConflict {
  id: string;
  reason: string;
  kind: "booking" | "unavailable";
  start: string;
  end: string;
  occupiedStart: string;
  occupiedEnd: string;
  status?: "approved" | "pending";
  requestKind?: "booking" | "tentative_hold";
  holdExpiresAt?: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  totalQuantity: number;
}

/** A persisted inventory record created by Technical Support (SPM-111). */
export type EquipmentMaintenanceStatus = "Active" | "Under Maintenance" | "Retired";

export interface EquipmentRecord {
  id: string;
  name: string;
  type: "Audio" | "Visual" | "Furniture" | "Lighting" | "Other";
  activeQuantity: number;
  underMaintenanceQuantity: number;
  retiredQuantity: number;
  /** Derived total across all three maintenance-status buckets. */
  quantity: number;
  location: string;
  /** SPM-119: manual availability flag, independent of the status quantities. Defaults to true. */
  isAvailable?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** SPM-118/119: one row of the shared equipment change audit trail. */
export interface EquipmentAuditEntry {
  id: string;
  equipmentId: string;
  equipmentName: string;
  equipmentType: EquipmentRecord["type"];
  location: string;
  maintenanceStatus: EquipmentMaintenanceStatus;
  activeQuantity: number;
  underMaintenanceQuantity: number;
  retiredQuantity: number;
  quantity: number;
  isAvailable: boolean;
  changeType: "Marked unavailable" | "Reactivated" | "Equipment record updated";
  reason: string | null;
  changedBy: string;
  timestamp: string;
}

export type EquipmentRequestStatus =
  "requested" | "checking" | "reserved" | "unavailable";

export interface EquipmentRequest {
  id: string;
  eventId: string;
  eventName: string;
  equipmentId: string;
  equipmentName: string;
  quantity: number;
  technicalRequirements: string;
  status: EquipmentRequestStatus;
  start: string;
  end: string;
  createdAt: string;
}

/** SPM-138: the answer to POST /events/:id/waitlist (201). The position is read back from the server. */
export interface WaitlistJoinResult {
  registrationId: string;
  status: "waitlisted";
  position: number;
  message: string;
}

/** Lower-case API values (D3). "waitlisted" and "removed" are SPM-138 waitlist states. */
export type RegistrationStatus = "registered" | "withdrawn" | "cancelled" | "waitlisted" | "removed";

export interface Registration {
  id: string;
  eventId: string;
  attendeeId: string;
  attendeeName: string;
  status: RegistrationStatus;
  registeredAt: string;
  /** Instant of the withdrawal (SPM-120); set once by the server, absent while registered. */
  withdrawnAt?: string;
  /** SPM-138: the owner's own waitlist position; null for every other entry (the key is always present). */
  waitlistPosition?: number | null;
  /** SPM-138: when the attendee joined the waitlist (ISO instant). Set for a waitlisted entry only. */
  joinedAt?: string;
  /** Details captured at registration (SPM-61); absent on older records. */
  fullName?: string;
  email?: string;
  contactNumber?: string;
  specialRequirements?: string;
}

export type NotificationType =
  | "submission"
  | "clarification"
  | "approval"
  | "rejection"
  | "coordinator_assignment"
  | "coordinator_reassignment"
  | "coordinator_unassignment"
  | "coordinator_unavailable"
  | "coordinator_change_request"
  /** SPM-65: the organiser's change request was approved or denied. */
  | "change_request_approved"
  | "change_request_denied"
  | "venue_booking"
  | "event_change"
  | "registration"
  | "confirmation"
  | "cancellation"
  /** SPM-138 AC9: an attendee was promoted from the waitlist to a place (MSG-WL-05). */
  | "WaitlistPromoted"
  /** SPM-138 AC12: a waiting entry was cancelled with its event (MSG-WL-06). */
  | "EventCancelled";

export interface Notification {
  id: string;
  audienceRole: UserRole;
  audienceUserId?: string;
  type: NotificationType;
  message: string;
  relatedEventId?: string;
  /** The related event's current name (SPM-88); null or absent when there is no event. */
  relatedEventName?: string | null;
  read: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// SPM-97 / SPM-49 / SPM-85: event information during the planning phase.
// Mirrors backend/src/events/event-planning.service.ts responses.

/**
 * How a coordinator's change to a field is handled (SPM-49 AC2):
 * - "direct": always applied immediately.
 * - "conditional": applied immediately while it satisfies `condition` (stays
 *   compatible with every existing booking/arrangement); otherwise flagged.
 * - "needs_review": any change is flagged for review.
 */
export type PlanningFieldMode = "direct" | "conditional" | "needs_review";

export type PlanningFieldCondition =
  | { kind: "within_window"; start: string; end: string }
  | { kind: "max_attendance"; max: number }
  | { kind: "remove_only" };

export interface PlanningEditableField {
  field: string;
  mode: PlanningFieldMode;
  condition?: PlanningFieldCondition;
}

export interface PlanningVenueBooking {
  id: string;
  venueId?: string;
  venueName: string;
  capacity?: number;
  start: string;
  end: string;
  /** "Unavailable": the venue was lost and a replacement is required. */
  status: "Booked" | "Unavailable" | "Cancelled";
  /** The request itself: pending (awaiting approval), approved, rejected or released. */
  requestStatus?: "pending" | "approved" | "rejected" | "released";
}

export interface PlanningEquipmentArrangement {
  id: string;
  name: string;
  quantity: number;
  status: string;
}

export interface BookingImpactConflict {
  /**
   * "window": the new time falls outside what the booking holds, so the
   * booking must change. "requirements": layout/facility suitability must be
   * re-checked by hand.
   */
  kind: "window" | "overlap" | "turnaround" | "capacity" | "requirements";
  withBookingId?: string;
  detail: string;
}

export interface BookingImpact {
  bookingId: string;
  venueId?: string;
  venueName: string;
  impacted: boolean;
  conflicts: BookingImpactConflict[];
  /** Per-booking decision already recorded for this venue booking (SPM-85 AC7). */
  decision?: "Applied" | "Rejected";
  decidedBy?: string;
  decidedAt?: string;
}

export interface EquipmentImpact {
  arrangementId: string;
  name: string;
  quantity: number;
  detail: string;
}

export interface FlaggedChange {
  id: string;
  kind: "booking_conflict";
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  status: "Needs Review";
  /** Present for the assigned coordinator only; hidden from the organiser. */
  impacts?: BookingImpact[];
  equipmentImpacts?: EquipmentImpact[];
  proposedBy?: string;
  createdAt?: string;
}

export interface ReplacementRequired {
  id: string;
  kind: "replacement_venue_required";
  field: "venue";
  bookingId: string;
  venueName: string;
  status: "Needs Review";
}

export type PendingChange = FlaggedChange | ReplacementRequired;

export interface ChangeHistoryEntry {
  id: string;
  /**
   * SPM-156: "direct_update" for a change applied immediately (SPM-49 AC3/AC5),
   * "change_request" for a change applied by approving an organiser's change
   * request (SPM-65 AC4), "booking_conflict" for a flagged change that was
   * confirmed or rejected (SPM-85 AC6). Absent from older responses; treat as
   * "booking_conflict".
   */
  kind?: "booking_conflict" | "direct_update" | "change_request";
  field: string;
  originalValue: unknown;
  proposedValue: unknown;
  /** The value the event ended up with: proposed if Applied, original if Rejected. */
  resolvedValue: unknown;
  /** Who asked for the change: the coordinator, or the organiser for a change request (SPM-156). */
  proposedBy?: string;
  resolvedBy: string;
  resolvedAt: string;
  status: "Applied" | "Rejected";
}

export interface PlanningView {
  event: EventRecord;
  venueBookings: PlanningVenueBooking[];
  equipmentArrangements: PlanningEquipmentArrangement[];
  pendingChanges: PendingChange[];
  /** True for the organiser, and for everyone once the event is confirmed. */
  readOnly: boolean;
  editableFields: PlanningEditableField[];
  lastUpdatedAt: string;
}

/** Fields a coordinator may change during planning (PATCH /events/:id/planning). */
export type PlanningUpdatePatch = Partial<{
  name: string;
  purpose: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  expectedAttendance: number;
  layout: string;
  facilities: string[];
  accessibility: string[];
  equipmentNeeds: string;
}>;

export interface PlanningUpdateResult {
  event: EventRecord;
  applied: string[];
  flagged: FlaggedChange[];
  /** True when applying these changes removed an existing safety check (SPM-135). */
  safetyCheckReset?: boolean;
  updatedAt: string;
}

export interface ResolveChangeRequest {
  changeId: string;
  decision: "confirm" | "reject";
  bookingId?: string;
}
