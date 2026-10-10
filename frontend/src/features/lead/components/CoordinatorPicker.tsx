import type { LeadCoordinator } from "@/features/lead/api/lead-api";

/** Coordinator choices shared by assignment and reassignment workflows. */
export function CoordinatorPicker({
  id,
  label,
  coordinators,
  value,
  onChange,
  disabled = false,
  currentCoordinatorId,
}: {
  id: string;
  label: string;
  coordinators: LeadCoordinator[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  currentCoordinatorId?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">Choose a coordinator</option>
        {coordinators.map((coordinator) => {
          const isCurrent = coordinator.id === currentCoordinatorId;
          const suffix = isCurrent
            ? "current"
            : coordinator.available
              ? `${coordinator.activeAssignments} active`
              : "Unavailable";
          return (
            <option key={coordinator.id} value={coordinator.id} disabled={isCurrent || !coordinator.available}>
              {`${coordinator.name} (${suffix})`}
            </option>
          );
        })}
      </select>
    </div>
  );
}
