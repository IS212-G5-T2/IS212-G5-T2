import { useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/FormControls";
import { BookingCard } from "@/components/domain/BookingCard";
import { BookingDetailModal } from "@/components/domain/BookingDetailModal";
import type { Booking } from "@/types";

export function BookingsPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const bookings = useAppStore((s) => s.bookings);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selected, setSelected] = useState<Booking | null>(null);

  const filtered = useMemo(() => {
    let scoped = bookings;
    if (currentUser.role === "coordinator") {
      scoped = bookings.filter((b) => b.requestedBy === currentUser.name);
    }
    if (statusFilter) {
      scoped = scoped.filter((b) => b.status === statusFilter);
    }
    return scoped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [bookings, currentUser, statusFilter]);

  return (
    <div>
      <PageHeader
        title="Venue Booking Requests"
        description={
          currentUser.role === "venue_staff"
            ? "Feature 10, 11 — Review pending requests, approve or reject, and resolve conflicts."
            : "Feature 9 — Track the booking requests you've submitted to Venue Staff."
        }
      />

      <div className="mb-4 max-w-xs">
        <Select
          label="Status filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No bookings match this filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((b) => (
            <BookingCard key={b.id} booking={b} onReview={setSelected} />
          ))}
        </div>
      )}

      <BookingDetailModal booking={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
