import { create } from "zustand";
import type { User as FirebaseUser } from "firebase/auth";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, getAuthErrorMessage } from "@/lib/firebase";
import { api } from "@/utils/api";
import { getRoleFromFirebaseClaims } from "@/lib/firebaseRoles";
import type {
  Booking,
  ChangeRequest,
  EquipmentItem,
  EquipmentRequest,
  EventRecord,
  EventStatus,
  Notification,
  Registration,
  User,
  Venue,
} from "@/types";

let idCounter = 1000;
let authRevision = 0;
const nextId = (prefix: string) => `${prefix}-${idCounter++}`;

// Placeholder identity shown before sign-in and restored on sign-out. It is
// never used for authorization because unauthenticated routes are guarded.
const PLACEHOLDER_USER: User = {
  id: "current-user",
  name: "Current User",
  email: "",
  role: "attendee",
};

interface AppState {
  currentUser: User;
  isAuthenticated: boolean;
  // True until Firebase's initial auth state (e.g. a persisted session from a
  // previous visit) has resolved. Route guards and the login page use this to
  // avoid flashing the wrong screen while Firebase starts up.
  authLoading: boolean;
  events: EventRecord[];
  venues: Venue[];
  bookings: Booking[];
  equipment: EquipmentItem[];
  equipmentRequests: EquipmentRequest[];
  registrations: Registration[];
  notifications: Notification[];

  createDraftEvent: (data: Partial<EventRecord>) => EventRecord;
  updateEvent: (id: string, data: Partial<EventRecord>) => void;
  submitEvent: (id: string) => void;
  assignCoordinator: (id: string, coordinatorId: string, coordinatorName: string) => void;
  setEventStatus: (id: string, status: EventStatus) => void;
  requestEventChange: (eventId: string, cr: Omit<ChangeRequest, "id" | "eventId" | "status" | "createdAt">) => void;
  reviewChangeRequest: (eventId: string, crId: string, decision: "approved" | "rejected") => void;

  submitBookingRequest: (data: Omit<Booking, "id" | "status" | "createdAt" | "conflict">) => void;
  reviewBooking: (id: string, decision: "approved" | "rejected", reason?: string) => void;

  requestEquipment: (data: Omit<EquipmentRequest, "id" | "status" | "createdAt">) => void;
  reviewEquipmentRequest: (id: string, decision: "reserved" | "unavailable") => void;

  registerForEvent: (eventId: string) => void;
  withdrawRegistration: (eventId: string) => void;

  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  /** Called by the Firebase onAuthStateChanged listener wired up in App.tsx. */
  setAuthUser: (firebaseUser: FirebaseUser | null) => Promise<void>;

  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  pushNotification: (n: Omit<Notification, "id" | "read" | "createdAt">) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: PLACEHOLDER_USER,
  isAuthenticated: false,
  authLoading: true,
  events: [],
  venues: [],
  bookings: [],
  equipment: [],
  equipmentRequests: [],
  registrations: [],
  notifications: [],

  createDraftEvent: (data) => {
    const user = get().currentUser;
    const record: EventRecord = {
      id: nextId("e"),
      name: data.name ?? "Untitled Event",
      purpose: data.purpose ?? "",
      description: data.description ?? "",
      organiserId: user.id,
      organiserName: user.name,
      status: "draft",
      startDateTime: data.startDateTime ?? new Date().toISOString(),
      endDateTime: data.endDateTime ?? new Date().toISOString(),
      expectedAttendance: data.expectedAttendance ?? 0,
      venueRequirements: data.venueRequirements ?? {
        minCapacity: 0,
        accessibility: [],
        facilities: [],
        layout: "",
      },
      equipmentNeeds: data.equipmentNeeds ?? "",
      attachments: data.attachments ?? [],
      registrationEnabled: data.registrationEnabled ?? false,
      changeRequests: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({ events: [record, ...s.events] }));
    return record;
  },

  updateEvent: (id, data) => {
    set((s) => ({
      events: s.events.map((e) =>
        e.id === id ? { ...e, ...data, updatedAt: new Date().toISOString() } : e
      ),
    }));
  },

  submitEvent: (id) => {
    set((s) => ({
      events: s.events.map((e) =>
        e.id === id
          ? { ...e, status: "submitted" as EventStatus, updatedAt: new Date().toISOString() }
          : e
      ),
    }));
    const event = get().events.find((e) => e.id === id);
    if (event) {
      get().pushNotification({
        audienceRole: "coordinator",
        type: "submission",
        message: `"${event.name}" was submitted for review.`,
        relatedEventId: id,
      });
    }
  },

  assignCoordinator: (id, coordinatorId, coordinatorName) => {
    // Optimistically reflect the claim so the UI updates immediately.
    set((s) => ({
      events: s.events.map((e) =>
        e.id === id
          ? {
              ...e,
              coordinatorId,
              coordinatorName,
              status: e.status === "submitted" ? "under_review" : e.status,
              updatedAt: new Date().toISOString(),
            }
          : e
      ),
    }));
    // Persist the assignment so it survives a reload: the detail page refetches
    // GET /events/:id on mount, which now returns the stored coordinator. Fire
    // and forget — the optimistic state above already matches what the server
    // writes (submitted -> under_review), so no reconciliation is needed here.
    api(`/events/${id}/assign`, {
      method: "POST",
      body: JSON.stringify({ coordinatorId, coordinatorName }),
    }).catch(() => {
      /* Optimistic state stands; a later refetch will resurface any drift. */
    });
    const event = get().events.find((e) => e.id === id);
    if (event) {
      get().pushNotification({
        audienceRole: "organiser",
        audienceUserId: event.organiserId,
        type: "coordinator_assignment",
        message: `${coordinatorName} was assigned to "${event.name}".`,
        relatedEventId: id,
      });
    }
  },

  setEventStatus: (id, status) => {
    set((s) => ({
      events: s.events.map((e) =>
        e.id === id ? { ...e, status, updatedAt: new Date().toISOString() } : e
      ),
    }));
  },

  requestEventChange: (eventId, cr) => {
    const record: ChangeRequest = {
      ...cr,
      id: nextId("cr"),
      eventId,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    set((s) => ({
      events: s.events.map((e) =>
        e.id === eventId ? { ...e, changeRequests: [record, ...e.changeRequests] } : e
      ),
    }));
    const event = get().events.find((e) => e.id === eventId);
    if (event) {
      get().pushNotification({
        audienceRole: "coordinator",
        type: "event_change",
        message: `Change request submitted for "${event.name}": ${cr.summary}`,
        relatedEventId: eventId,
      });
    }
  },

  reviewChangeRequest: (eventId, crId, decision) => {
    set((s) => ({
      events: s.events.map((e) =>
        e.id === eventId
          ? {
              ...e,
              changeRequests: e.changeRequests.map((cr) =>
                cr.id === crId ? { ...cr, status: decision } : cr
              ),
            }
          : e
      ),
    }));
    const event = get().events.find((e) => e.id === eventId);
    const cr = event?.changeRequests.find((c) => c.id === crId);
    if (event && cr) {
      const cascades = cr.fields.filter((f) => f === "venue" || f === "equipment" || f === "date_time");
      if (decision === "approved" && cascades.length > 0) {
        if (cascades.includes("venue") || cascades.includes("date_time")) {
          get().pushNotification({
            audienceRole: "venue_staff",
            type: "event_change",
            message: `"${event.name}" changed — please re-confirm venue booking.`,
            relatedEventId: eventId,
          });
        }
        if (cascades.includes("equipment") || cascades.includes("date_time")) {
          get().pushNotification({
            audienceRole: "tech_support",
            type: "event_change",
            message: `"${event.name}" changed — please re-check equipment reservations.`,
            relatedEventId: eventId,
          });
        }
      }
      get().pushNotification({
        audienceRole: "organiser",
        audienceUserId: event.organiserId,
        type: "event_change",
        message: `Your change request for "${event.name}" was ${decision}.`,
        relatedEventId: eventId,
      });
    }
  },

  submitBookingRequest: (data) => {
    const overlapping = get().bookings.find(
      (b) =>
        b.venueId === data.venueId &&
        b.status === "approved" &&
        new Date(data.start) < new Date(b.end) &&
        new Date(data.end) > new Date(b.start)
    );
    const booking: Booking = {
      ...data,
      id: nextId("b"),
      status: "pending",
      createdAt: new Date().toISOString(),
      conflict: overlapping
        ? {
            withBookingId: overlapping.id,
            eventName: overlapping.eventName,
            start: overlapping.start,
            end: overlapping.end,
          }
        : undefined,
    };
    set((s) => ({ bookings: [booking, ...s.bookings] }));
    get().pushNotification({
      audienceRole: "venue_staff",
      type: "venue_booking",
      message: `New venue booking request for "${data.eventName}"${overlapping ? " has a conflict warning." : "."}`,
      relatedEventId: data.eventId,
    });
  },

  reviewBooking: (id, decision, reason) => {
    const booking = get().bookings.find((b) => b.id === id);
    set((s) => ({
      bookings: s.bookings.map((b) =>
        b.id === id ? { ...b, status: decision, rejectionReason: reason } : b
      ),
    }));
    if (booking) {
      if (decision === "approved") {
        get().updateEvent(booking.eventId, {
          venueId: booking.venueId,
          venueName: booking.venueName,
          status: "confirmed",
        });
      }
      get().pushNotification({
        audienceRole: "coordinator",
        type: "venue_booking",
        message: `Booking for "${booking.eventName}" at ${booking.venueName} was ${decision}${
          decision === "rejected" && reason ? `: ${reason}` : "."
        }`,
        relatedEventId: booking.eventId,
      });
    }
  },

  requestEquipment: (data) => {
    const record: EquipmentRequest = {
      ...data,
      id: nextId("eqr"),
      status: "requested",
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ equipmentRequests: [record, ...s.equipmentRequests] }));
    get().pushNotification({
      audienceRole: "tech_support",
      type: "event_change",
      message: `New equipment request (${data.equipmentName} x${data.quantity}) for "${data.eventName}".`,
      relatedEventId: data.eventId,
    });
  },

  reviewEquipmentRequest: (id, decision) => {
    const req = get().equipmentRequests.find((r) => r.id === id);
    set((s) => ({
      equipmentRequests: s.equipmentRequests.map((r) =>
        r.id === id ? { ...r, status: decision } : r
      ),
    }));
    if (req) {
      get().pushNotification({
        audienceRole: "coordinator",
        type: "event_change",
        message: `Equipment request (${req.equipmentName}) for "${req.eventName}" is ${
          decision === "reserved" ? "reserved" : "unavailable"
        }.`,
        relatedEventId: req.eventId,
      });
    }
  },

  registerForEvent: (eventId) => {
    const user = get().currentUser;
    const event = get().events.find((candidate) => candidate.id === eventId);

    // Registration is an attendee-only action. Keep the policy beside the
    // mutation so a caller cannot register on behalf of another user merely by
    // bypassing the EventDetailPage button.
    if (!get().isAuthenticated || user.role !== "attendee" || !event?.registrationEnabled) {
      return;
    }

    const existing = get().registrations.find(
      (r) => r.eventId === eventId && r.attendeeId === user.id
    );
    if (existing) {
      set((s) => ({
        registrations: s.registrations.map((r) =>
          r.id === existing.id ? { ...r, status: "registered" } : r
        ),
      }));
    } else {
      const record: Registration = {
        id: nextId("r"),
        eventId,
        attendeeId: user.id,
        attendeeName: user.name,
        status: "registered",
        registeredAt: new Date().toISOString(),
      };
      set((s) => ({ registrations: [record, ...s.registrations] }));
    }
    if (event) {
      get().pushNotification({
        audienceRole: "coordinator",
        type: "registration",
        message: `${user.name} registered for "${event.name}".`,
        relatedEventId: eventId,
      });
    }
  },

  withdrawRegistration: (eventId) => {
    const user = get().currentUser;

    // Only the authenticated attendee who owns a registration may withdraw it.
    if (!get().isAuthenticated || user.role !== "attendee") {
      return;
    }

    set((s) => ({
      registrations: s.registrations.map((r) =>
        r.eventId === eventId && r.attendeeId === user.id
          ? { ...r, status: "withdrawn" }
          : r
      ),
    }));
  },

  // Firebase Authentication (Email/Password provider). A user must exist in
  // the Firebase project and the provider must be enabled in the console —
  // see apps/frontend/README.md for setup.
  login: async (email, password) => {
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await get().setAuthUser(credential.user);

      if (!get().isAuthenticated) {
        return {
          success: false,
          error: "Your account does not have a supported ConnectSphere role.",
        };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: getAuthErrorMessage(error) };
    }
  },

  logout: async () => {
    await signOut(auth);
  },

  setAuthUser: async (firebaseUser) => {
    const revision = ++authRevision;
    // Remove account-owned event data before resolving a new session or sign-out.
    set({ events: [] });
    if (!firebaseUser) {
      set({ isAuthenticated: false, authLoading: false, currentUser: PLACEHOLDER_USER });
      return;
    }

    set({ authLoading: true });

    try {
      const tokenResult = await firebaseUser.getIdTokenResult();
      if (revision !== authRevision) return;
      const role = getRoleFromFirebaseClaims(tokenResult.claims.roles);

      if (!role) {
        set({ isAuthenticated: false, authLoading: false, currentUser: PLACEHOLDER_USER });
        return;
      }

      set({
        isAuthenticated: true,
        authLoading: false,
        currentUser: {
          id: firebaseUser.uid,
          name: firebaseUser.displayName ?? firebaseUser.email ?? "Signed-in user",
          email: firebaseUser.email ?? "",
          role,
        },
      });
    } catch {
      if (revision !== authRevision) return;
      set({ isAuthenticated: false, authLoading: false, currentUser: PLACEHOLDER_USER });
    }
  },

  markNotificationRead: (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  },

  markAllNotificationsRead: () => {
    const role = get().currentUser.role;
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.audienceRole === role ? { ...n, read: true } : n
      ),
    }));
  },

  pushNotification: (n) => {
    const record: Notification = {
      ...n,
      id: nextId("n"),
      read: false,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ notifications: [record, ...s.notifications] }));
  },
}));
