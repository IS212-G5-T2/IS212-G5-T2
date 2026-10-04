export const facilityOptions = [
  { name: 'Catering', category: 'Amenities' },
  { name: 'AV System', category: 'Audio and video' },
  { name: 'Parking', category: 'Amenities' },
  { name: 'Stage', category: 'Room features' },
  { name: 'Projector', category: 'Presentation' },
  { name: 'Whiteboard', category: 'Presentation' },
  { name: 'Wi-Fi', category: 'Connectivity' },
  { name: 'Wired network', category: 'Connectivity' },
  { name: 'Video conferencing', category: 'Audio and video' },
  { name: 'Lectern', category: 'Room features' },
  { name: 'Power outlets', category: 'Room features' },
] as const;

export const roomLayoutOptions = [
  'Theatre',
  'Classroom',
  'Seminar Room',
  'Banquet',
  'Boardroom',
  'U-shape',
  'Standing',
  'Cabaret',
  'Hollow square',
] as const;

export const facilityNames: readonly string[] = facilityOptions.map(
  ({ name }) => name,
);
export const roomLayoutNames: readonly string[] = roomLayoutOptions;
