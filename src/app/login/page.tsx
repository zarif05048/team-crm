"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    null,
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 p-4">
      {/* soft heartbeat-cyan glow, echoing the Hijraa logo */}
      <div className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-accent-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-20%] left-[-10%] h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />

      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white p-8 shadow-2xl shadow-brand-950/50">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Hijraa Clinic"
            className="mb-3 h-20 w-auto object-contain"
          />
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">
            Marketing CRM
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "signin"
              ? "Sign in to your shared inbox"
              : "Create your account"}
          </p>
        </div>

        <form action={formAction} className="space-y-3">
          {mode === "signup" && (
            <Input name="full_name" placeholder="Full name" autoComplete="name" />
          )}
          <Input
            name="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
          <Input
            name="password"
            type="password"
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
          />

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-sm text-brand-600 hover:underline"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
