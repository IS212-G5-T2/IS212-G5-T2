import { useThemeStore } from "@/store/useThemeStore";

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <span className="flex items-center gap-3">
        <span aria-hidden="true">{isDark ? "🌙" : "☀️"}</span>
        <span>{isDark ? "Dark mode" : "Light mode"}</span>
      </span>
      <span
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-gray-300 transition-colors dark:bg-primary-600"
        aria-hidden="true"
      >
        <span
          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: isDark ? "translateX(18px)" : "translateX(4px)" }}
        />
      </span>
    </button>
  );
}
