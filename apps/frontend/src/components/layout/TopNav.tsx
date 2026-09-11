import { useAppStore } from "@/store/useAppStore";

export function TopNav({ onMenuClick }: { onMenuClick: () => void }) {
  const currentUser = useAppStore((s) => s.currentUser);

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
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Signed in as{" "}
          <span className="font-medium text-gray-800 dark:text-gray-200">{currentUser.name}</span>
        </span>
      </div>
    </header>
  );
}
