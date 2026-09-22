import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EquipmentReservationForm } from "@/components/domain/EquipmentReservationForm";
import { formatDateRange } from "@/utils/format";

export function EquipmentRequestsPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const events = useAppStore((s) => s.events);
  const equipment = useAppStore((s) => s.equipment);
  const equipmentRequests = useAppStore((s) => s.equipmentRequests);
  const reviewEquipmentRequest = useAppStore((s) => s.reviewEquipmentRequest);

  const [formOpen, setFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const eligibleEvents = events.filter((e) =>
    ["approved", "planning", "confirmed"].includes(e.status)
  );

  const filtered = statusFilter
    ? equipmentRequests.filter((r) => r.status === statusFilter)
    : equipmentRequests;

  const availabilityFor = (equipmentId: string, quantity: number, excludeId: string) => {
    const item = equipment.find((eq) => eq.id === equipmentId);
    if (!item) return { ok: true, remaining: 0 };
    const reserved = equipmentRequests
      .filter((r) => r.equipmentId === equipmentId && r.status === "reserved" && r.id !== excludeId)
      .reduce((sum, r) => sum + r.quantity, 0);
    const remaining = item.totalQuantity - reserved;
    return { ok: remaining >= quantity, remaining };
  };

  return (
    <div>
      <PageHeader
        title="Equipment Requests"
        description={
          currentUser.role === "tech_support"
            ? "Feature 12, 13 — Review requested equipment and reserve what's available."
            : "Feature 12 — Record equipment needed for your events."
        }
        actions={
          currentUser.role === "coordinator" ? (
            <Button onClick={() => setFormOpen(true)}>+ Request Equipment</Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-xs">
        <Select
          label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "requested", label: "Requested" },
            { value: "reserved", label: "Reserved" },
            { value: "unavailable", label: "Unavailable" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No equipment requests match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const availability = availabilityFor(r.equipmentId, r.quantity, r.id);
            return (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {r.equipmentName} × {r.quantity}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">for "{r.eventName}"</p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatDateRange(r.start, r.end)}</p>
                      {r.technicalRequirements && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{r.technicalRequirements}</p>
                      )}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>

                  {currentUser.role === "tech_support" && r.status === "requested" && (
                    <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                      <p
                        className={`mb-2 text-xs font-medium ${
                          availability.ok ? "text-success-700 dark:text-success-300" : "text-danger-700 dark:text-danger-400"
                        }`}
                      >
                        {availability.ok
                          ? `Available: ${availability.remaining} in stock after existing reservations.`
                          : `Insufficient stock — only ${availability.remaining} available.`}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={!availability.ok}
                          onClick={() => reviewEquipmentRequest(r.id, "reserved")}
                        >
                          Reserve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => reviewEquipmentRequest(r.id, "unavailable")}
                        >
                          Mark Unavailable
                        </Button>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <EquipmentReservationForm open={formOpen} onClose={() => setFormOpen(false)} events={eligibleEvents} />
    </div>
  );
}
