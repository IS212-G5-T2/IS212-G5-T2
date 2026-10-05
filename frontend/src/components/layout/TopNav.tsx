import { ProfileMenu } from "./ProfileMenu";

export function TopNav({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
        aria-label="Open navigation menu"
      >
        ☰
      </button>
      <div className="ml-auto">
        <ProfileMenu />
      </div>
    </header>
  );
}
