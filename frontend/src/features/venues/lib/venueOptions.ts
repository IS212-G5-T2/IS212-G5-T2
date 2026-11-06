export const FACILITY_OPTIONS = [
  "Catering",
  "AV System",
  "Parking",
  "Stage",
  "Projector",
  "Whiteboard",
  "Wi-Fi",
  "Wired network",
  "Video conferencing",
  "Lectern",
  "Power outlets",
] as const;

export const ROOM_LAYOUT_OPTIONS = [
  "Theatre",
  "Classroom",
  "Seminar Room",
  "Banquet",
  "Boardroom",
  "U-shape",
  "Standing",
  "Cabaret",
  "Hollow square",
] as const;

/** Venue accessibility feature labels as stored and returned by the venue API. */
export const ACCESSIBILITY_OPTIONS = [
  "Wheelchair access",
  "Accessible restrooms",
  "Hearing loop",
  "Elevator access",
] as const;
