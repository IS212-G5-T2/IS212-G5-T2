export const accessibilityOptions = [
  { id: 'wheelchair-access', label: 'Wheelchair access' },
  { id: 'accessible-restrooms', label: 'Accessible restrooms' },
  { id: 'hearing-loop', label: 'Hearing loop' },
  { id: 'elevator-access', label: 'Elevator access' },
] as const;

export const accessibilityLabels: readonly string[] = accessibilityOptions.map(
  ({ label }) => label,
);
