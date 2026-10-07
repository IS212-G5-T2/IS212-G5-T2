export type UserRole =
  | "organiser"
  | "coordinator"
  | "venue_staff"
  | "tech_support"
  | "attendee";

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
export function hasRole(user: Pick<User, "role"> & Partial<Pick<User, "roles">>, role: UserRole): boolean {
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

export interface ChangeRequest {
  id: string;
  eventId: string;
  requestedBy: string;
  summary: string;
  fields: Array<"date_time" | "attendance" | "venue" | "equipment" | "other">;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
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
  coordinatorId?: string;
  coordinatorName?: string;
  venueId?: string;
  venueName?: string;
  attachments?: EventAttachment[];
  rejectionReason?: string;
  changeRequests: ChangeRequest[];
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
  operatingHours: string;
}

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

export interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  totalQuantity: number;
}

export type EquipmentRequestStatus =
  | "requested"
  | "checking"
  | "reserved"
  | "unavailable";

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

export type RegistrationStatus = "registered" | "withdrawn";

export interface Registration {
  id: string;
  eventId: string;
  attendeeId: string;
  attendeeName: string;
  status: RegistrationStatus;
  registeredAt: string;
}

export type NotificationType =
  | "submission"
  | "clarification"
  | "approval"
  | "rejection"
  | "coordinator_assignment"
  | "venue_booking"
  | "event_change"
  | "registration"
  | "confirmation"
  | "cancellation";

export interface Notification {
  id: string;
  audienceRole: UserRole;
  audienceUserId?: string;
  type: NotificationType;
  message: string;
  relatedEventId?: string;
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
  field: string;
  originalValue: unknown;
  proposedValue: unknown;
  /** The value the event ended up with: proposed if Applied, original if Rejected. */
  resolvedValue: unknown;
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
  updatedAt: string;
}

export interface ResolveChangeRequest {
  changeId: string;
  decision: "confirm" | "reject";
  bookingId?: string;
}
