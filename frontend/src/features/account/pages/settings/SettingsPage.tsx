import { PageHeader } from "@/components/ui/PageHeader";
import { CoordinatorAvailability } from "@/features/account/pages/settings/CoordinatorAvailability";
import { useAppStore } from "@/store/useAppStore";
import { hasRole } from "@/types";

export function SettingsPage() {
  const user = useAppStore((s) => s.currentUser);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Settings" />
      {/* SPM-80: any account holding the coordinator role, including multi-role ones. */}
      {hasRole(user, "coordinator") && <CoordinatorAvailability />}
    </div>
  );
}
