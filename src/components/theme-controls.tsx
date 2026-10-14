"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyTheme, setThemePreference, themePreference, THEME_EVENT, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

const choices = [
  { value: "light", label: "Light", icon: Sun, description: "Bright, clear and familiar." },
  { value: "dark", label: "Dark", icon: Moon, description: "A calmer view for late shifts." },
  { value: "system", label: "System", icon: Monitor, description: "Follow your device’s appearance." },
] as const;

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}
const preferenceSnapshot = () => themePreference(document.documentElement.dataset.themePreference);
const resolvedSnapshot = () => document.documentElement.dataset.theme === "dark";
const serverPreference = () => "system" as ThemePreference;
const serverResolved = () => false;

export function ThemeController() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followDevice = () => {
      if (preferenceSnapshot() === "system") applyTheme("system");
    };
    const syncTabs = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(themePreference(event.newValue));
    };
    applyTheme(preferenceSnapshot());
    media.addEventListener("change", followDevice);
    window.addEventListener("storage", syncTabs);
    return () => {
      media.removeEventListener("change", followDevice);
      window.removeEventListener("storage", syncTabs);
    };
  }, []);
  return null;
}

/** Compact switch remains accessible when mobile chat hides the sidebar. */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, resolvedSnapshot, serverResolved);
  const Icon = dark ? Sun : Moon;
  return (
    <button type="button" onClick={() => setThemePreference(dark ? "light" : "dark")}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      title={`Switch to ${dark ? "light" : "dark"} mode`}
      className={cn("theme-toggle inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-surface text-slate-600 hover:border-brand-400 hover:text-primary", className)}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function SidebarAppearance() {
  const preference = useSyncExternalStore(subscribe, preferenceSnapshot, serverPreference);
  return (
    <div className="mb-4 w-full">
      <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-2.5 lg:block">
        <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
          <Sparkles className="h-3 w-3 text-cyan-300" /> Appearance
        </p>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Color theme">
          {choices.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" aria-pressed={preference === value}
              aria-label={`Use ${label.toLowerCase()} theme`} onClick={() => setThemePreference(value)}
              className={cn("flex flex-col items-center gap-1.5 rounded-xl py-2 text-[10px] font-medium transition-colors",
                preference === value ? "bg-white/15 text-white shadow-sm ring-1 ring-cyan-300/30" : "text-white/50 hover:bg-white/5 hover:text-white")}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-center lg:hidden"><ThemeToggle className="border-white/10 bg-white/5 text-white/70 hover:text-white" /></div>
    </div>
  );
}

export function AppearanceSettings() {
  const preference = useSyncExternalStore(subscribe, preferenceSnapshot, serverPreference);
  return (
    <section className="appearance-panel overflow-hidden rounded-2xl border border-slate-200 bg-surface p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary"><Sparkles className="h-5 w-5" /></div>
        <div><h2 className="text-base font-semibold text-slate-900">Make yourself comfortable</h2>
          <p className="mt-1 text-sm text-slate-500">Choose your workspace’s look. Saved on this device.</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Workspace appearance">
        {choices.map(({ value, label, icon: Icon, description }) => (
          <button key={value} type="button" aria-pressed={preference === value} aria-label={`Use ${label.toLowerCase()} mode`}
            onClick={() => setThemePreference(value)}
            className={cn("appearance-choice rounded-2xl border p-3 text-left transition-colors",
              preference === value ? "border-brand-400 bg-brand-50 ring-2 ring-brand-400/15" : "border-slate-200 hover:border-slate-300")}>
            <div className={`theme-preview theme-preview-${value}`} aria-hidden="true"><span /><div><i /><i /><i /></div></div>
            <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Icon className="h-4 w-4 text-slate-500" />{label}
              {preference === value && <Check className="ml-auto h-4 w-4 text-primary" />}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
