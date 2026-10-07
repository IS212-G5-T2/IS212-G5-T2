import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAppStore } from "@/store/useAppStore";
import { hasRole } from "@/types";
import { getMyAvailability } from "@/utils/availability-api";

// First letter of the first and last words, e.g. "Coordinator 1" -> "C1".
function initials(name: string): string {
  const words = name.split(/[\s_]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function Avatar({ name, size }: { name: string; size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary-600 font-semibold text-white",
        size === "sm" ? "h-9 w-9 text-sm" : "h-12 w-12 text-base",
      )}
    >
      {initials(name)}
    </span>
  );
}

// SPM-30 identity in the top bar, plus the SPM-80 availability label for
// coordinators. Availability is loaded each time the menu opens, so it shows
// a change saved on the Settings page without a page reload.
export function ProfileMenu() {
  const user = useAppStore((s) => s.currentUser);
  const isCoordinator = hasRole(user, "coordinator");
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isCoordinator) return;
    let active = true;
    setAvailable(null);
    getMyAvailability()
      .then((result) => {
        if (active) setAvailable(result.available);
      })
      .catch(() => {
        if (active) setAvailable(null);
      });
    return () => {
      active = false;
    };
  }, [open, isCoordinator]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open profile menu"
        aria-haspopup="true"
        aria-expanded={open}
        className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        <Avatar name={user.name} size="sm" />
      </button>
      {open && (
        <div
          role="region"
          aria-label="Profile menu"
          className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="m-2 flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{user.name}</p>
              {isCoordinator && available !== null ? (
                <span
                  className={clsx(
                    "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                    available
                      ? "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
                  )}
                >
                  {available ? "Available" : "Unavailable"}
                </span>
              ) : (
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
              )}
            </div>
          </div>
          <div className="space-y-1 border-t border-gray-100 p-2 dark:border-gray-700">
            <NavLink
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <span aria-hidden="true">⚙️</span>
              <span>Settings</span>
            </NavLink>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
