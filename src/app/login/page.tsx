"use client";

import { useActionState, useState } from "react";
import { MessageCircle } from "lucide-react";
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <MessageCircle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Team CRM</h1>
          <p className="text-sm text-slate-500">
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
          className="mt-4 w-full text-center text-sm text-emerald-600 hover:underline"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
