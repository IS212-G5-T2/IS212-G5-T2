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

export type PlanningFieldMode = "direct" | "needs_review";

export interface PlanningVenueBooking { 
  id: string; 
  venueName: string; 
  start: string; 
  end: string; 
  status: "Booked" | "Unavailable"; 
}

export interface PlanningEquipmentArrangement { 
  id: string; 
  name: string; 
  quantity: number; 
  status: string; 
}

export interface BookingImpactConflict { 
  kind: "overlap" | "turnaround" | "capacity"; 
  withBookingId?: string; 
  detail: string; 
}

export interface BookingImpact { 
  bookingId: string; 
  venueName: string; 
  impacted: boolean; 
  conflicts: BookingImpactConflict[]; 
}

export interface FlaggedChange { 
  id: string; 
  kind: "booking_conflict"; 
  field: string; 
  currentValue: unknown; 
  proposedValue: unknown; 
  status: "Needs Review"; 
  impacts: BookingImpact[]; 
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
  readOnly: boolean; 
  editableFields: Array<{ field: string; mode: PlanningFieldMode }>; 
  lastUpdatedAt: string; 
}