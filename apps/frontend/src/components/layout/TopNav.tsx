import { useState } from "react";
import { MOCK_USERS, useAppStore } from "@/store/useAppStore";
import { roleLabels } from "./navConfig";

export function TopNav({ onMenuClick }: { onMenuClick: () => void }) {
  const [open, setOpen] = useState(false);
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-md p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
          aria-label="Open navigation menu"
        >
          ☰
        </button>
        <span className="text-sm text-gray-500">Event planning workspace</span>
      </div>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Switch mock user role"
          onClick={() => setOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          title={`${currentUser.name} (${roleLabels[currentUser.role]})`}
        >
          {currentUser.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <p className="px-3 py-2 text-xs font-medium uppercase text-gray-400">
              Mock profile
            </p>
            {MOCK_USERS.map((user) => (
              <button
                key={user.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setCurrentUser(user);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <span>
                  <span className="block font-medium">{user.name}</span>
                  <span className="text-xs text-gray-500">
                    {roleLabels[user.role]}
                  </span>
                </span>
                {user.id === currentUser.id && (
                  <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                    Current
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
