export type ThemePreference = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "hijraa-crm-theme";
export const THEME_EVENT = "hijraa-theme-change";

export function themePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function applyTheme(preference: ThemePreference): void {
  const dark = preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#f4f6fd");
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function setThemePreference(preference: ThemePreference): void {
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* private browsing: still apply this session */ }
  applyTheme(preference);
}

// Runs before the body is painted, so saved dark mode never flashes white.
// No user input or credentials are interpolated into this script.
export const THEME_BOOTSTRAP = `(()=>{let p="system";try{const s=localStorage.getItem("${THEME_STORAGE_KEY}");if(s==="dark"||s==="light")p=s;}catch{}const d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);const r=document.documentElement;r.dataset.themePreference=p;r.dataset.theme=d?"dark":"light";r.style.colorScheme=d?"dark":"light";document.querySelector('meta[name="theme-color"]')?.setAttribute("content",d?"#000000":"#f4f6fd");})();`;
