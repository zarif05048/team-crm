"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

/**
 * WhatsApp-style "search in this conversation".
 *
 * The search box lives in the thread header but the matches are found by the
 * Timeline (the only component that knows what is on screen), so the state is
 * shared through this context:
 *
 *   ThreadSearchProvider  — holds the query and which match is selected
 *     ThreadSearchToggle  — the 🔍 button in the thread header
 *     ThreadSearchBar     — the input + match counter + up/down navigation
 *     Timeline            — reports matching item keys, highlights them
 *
 * Matching is client-side over the messages already loaded in the thread (the
 * newest 300 — the same set the thread renders), so typing costs no Supabase
 * egress.
 */

interface ThreadSearchValue {
  open: boolean;
  /** Raw text in the input, for the field itself. */
  input: string;
  /** Lowercased + trimmed, for matching. "" when closed or empty. */
  query: string;
  /** Timeline item keys that match, oldest → newest. */
  matches: string[];
  /** Key of the match currently selected, or null. */
  activeKey: string | null;
  setInput: (value: string) => void;
  openSearch: () => void;
  closeSearch: () => void;
  reportMatches: (keys: string[]) => void;
  /** +1 = next match downwards (newer), -1 = previous match upwards (older). */
  step: (delta: 1 | -1) => void;
}

const noop = () => {};

const INERT: ThreadSearchValue = {
  open: false,
  input: "",
  query: "",
  matches: [],
  activeKey: null,
  setInput: noop,
  openSearch: noop,
  closeSearch: noop,
  reportMatches: noop,
  step: noop,
};

const ThreadSearchContext = createContext<ThreadSearchValue>(INERT);
const InputRefContext =
  createContext<React.RefObject<HTMLInputElement | null> | null>(null);

/** Timeline (and anything else in the thread) reads the live search state. */
export function useThreadSearch(): ThreadSearchValue {
  return useContext(ThreadSearchContext);
}

export function ThreadSearchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [matches, setMatches] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const query = open ? input.trim().toLowerCase() : "";

  const openSearch = useCallback(() => {
    setOpen(true);
    // Already open: refocus and select, so a second Ctrl+F starts a new search.
    requestAnimationFrame(() => inputRef.current?.select());
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setInput("");
    setMatches([]);
    setActiveKey(null);
  }, []);

  const reportMatches = useCallback((keys: string[]) => {
    setMatches((prev) =>
      prev.length === keys.length && prev.every((k, i) => k === keys[i])
        ? prev
        : keys,
    );
    // Keep the selected match while it still matches; otherwise select the
    // newest one (bottom of the thread), like WhatsApp does.
    setActiveKey((prev) =>
      prev && keys.includes(prev) ? prev : (keys[keys.length - 1] ?? null),
    );
  }, []);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (matches.length === 0) return;
      setActiveKey((prev) => {
        const current = prev ? matches.indexOf(prev) : -1;
        const next =
          current === -1
            ? matches.length - 1
            : (current + delta + matches.length) % matches.length;
        return matches[next];
      });
    },
    [matches],
  );

  // Ctrl/Cmd+F opens the in-conversation search instead of the browser's find
  // bar (which cannot count matches or jump between them); Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "Escape" && open) {
        closeSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openSearch, closeSearch]);

  const value = useMemo<ThreadSearchValue>(
    () => ({
      open,
      input,
      query,
      matches,
      activeKey,
      setInput,
      openSearch,
      closeSearch,
      reportMatches,
      step,
    }),
    [
      open,
      input,
      query,
      matches,
      activeKey,
      openSearch,
      closeSearch,
      reportMatches,
      step,
    ],
  );

  return (
    <ThreadSearchContext.Provider value={value}>
      <InputRefContext.Provider value={inputRef}>
        {children}
      </InputRefContext.Provider>
    </ThreadSearchContext.Provider>
  );
}

/** 🔍 button for the thread header. */
export function ThreadSearchToggle() {
  const { open, openSearch, closeSearch } = useThreadSearch();
  return (
    <button
      type="button"
      onClick={open ? closeSearch : openSearch}
      title="Search in this conversation (Ctrl+F)"
      aria-label="Search in this conversation"
      aria-pressed={open}
      className={
        open
          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700"
          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
      }
    >
      <Search className="h-4 w-4" />
    </button>
  );
}

/** The search bar itself — renders nothing until the search is opened. */
export function ThreadSearchBar() {
  const { open, input, query, matches, activeKey, setInput, closeSearch, step } =
    useThreadSearch();
  const inputRef = useContext(InputRefContext);

  if (!open) return null;

  const position = activeKey ? matches.indexOf(activeKey) + 1 : 0;
  const counter = !query
    ? "Type to search"
    : matches.length === 0
      ? "No results"
      : `${position} of ${matches.length}`;

  return (
    <div
      role="search"
      className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2 sm:gap-2 sm:px-4"
    >
      <Search className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
      <input
        ref={inputRef}
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // Enter walks up the history (older), Shift+Enter comes back down.
            step(e.shiftKey ? 1 : -1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            closeSearch();
          }
        }}
        placeholder="Search in this conversation…"
        title="Searches the messages and internal notes loaded in this thread (newest 300)"
        aria-label="Search in this conversation"
        className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      <span
        className={
          query && matches.length === 0
            ? "shrink-0 text-xs font-medium text-amber-600"
            : "shrink-0 text-xs text-slate-500"
        }
      >
        {counter}
      </span>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={matches.length === 0}
        title="Previous (older) match — Enter"
        aria-label="Previous match"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={matches.length === 0}
        title="Next (newer) match — Shift+Enter"
        aria-label="Next match"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={closeSearch}
        title="Close search (Esc)"
        aria-label="Close search"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
