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
  operatingInformation: string;
  operatingDays: string[];
  operatingStartTime: string;
  operatingEndTime: string;
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
export type VenueCreateInput = Omit<Venue, "id">;

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

/** A persisted inventory record created by Technical Support (SPM-111). */
export interface EquipmentRecord {
  id: string;
  name: string;
  type: "Audio" | "Visual" | "Furniture" | "Lighting" | "Other";
  quantity: number;
  maintenanceStatus: "Active" | "Under Maintenance" | "Retired";
  location: string;
  /** SPM-119: booking availability, independent of maintenanceStatus. Defaults to true. */
  isAvailable?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** SPM-119 AC5/AC7: one row of the shared equipment availability audit trail. */
export interface EquipmentAuditEntry {
  id: string;
  equipmentId: string;
  equipmentName: string;
  equipmentType: EquipmentRecord["type"];
  location: string;
  maintenanceStatus: EquipmentRecord["maintenanceStatus"];
  quantity: number;
  isAvailable: boolean;
  changeType: "Marked unavailable" | "Reactivated";
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

export type RegistrationStatus = "registered" | "withdrawn";

export interface Registration {
  id: string;
  eventId: string;
  attendeeId: string;
  attendeeName: string;
  status: RegistrationStatus;
  registeredAt: string;
  /** Instant of the withdrawal (SPM-120); set once by the server, absent while registered. */
  withdrawnAt?: string;
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
