import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAppStore } from "@/store/useAppStore";
import { navByRole } from "./navConfig";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const role = useAppStore((s) => s.currentUser.role);
  const items = navByRole[role];

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-gray-900/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-gray-200 bg-white transition-transform lg:static lg:translate-x-0 dark:border-gray-800 dark:bg-gray-900",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Primary navigation"
      >
        <div className="flex h-16 items-center gap-2 border-b border-gray-100 px-5 dark:border-gray-800">
          <span className="text-xl" aria-hidden="true">🌐</span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">ConnectSphere</span>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary-50 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                )
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 space-y-1 border-t border-gray-100 px-3 py-4 dark:border-gray-800">
          <ThemeToggle />
          <NavLink
            to="/settings"
            onClick={onCloseMobile}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                isActive
                  ? "bg-primary-50 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              )
            }
          >
            <span aria-hidden="true">⚙️</span>
            <span>Settings</span>
          </NavLink>
        </div>
      </aside>
    </>
  );
}
