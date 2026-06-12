"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import {
  createMember,
  updateMemberRole,
  removeMember,
} from "@/app/(app)/settings/actions";
import type { Profile, Role } from "@/lib/types";

type Member = Pick<Profile, "id" | "full_name" | "email" | "role">;

export function TeamManager({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "agent" as Role,
  });
  const [error, setError] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const add = () => {
    setError(null);
    start(async () => {
      const res = await createMember(
        form.full_name,
        form.email,
        form.password,
        form.role,
      );
      if (res.ok) {
        setForm({ full_name: "", email: "", password: "", role: "agent" });
        setShowAdd(false);
        refresh();
      } else setError(res.error ?? "Failed to add member.");
    });
  };

  const changeRole = (id: string, role: Role) =>
    start(async () => {
      const res = await updateMemberRole(id, role);
      if (!res.ok) setError(res.error ?? "Failed.");
      refresh();
    });

  const remove = (id: string, name: string) => {
    if (!confirm(`Remove ${name}? They will lose access immediately.`)) return;
    start(async () => {
      const res = await removeMember(id);
      if (!res.ok) setError(res.error ?? "Failed.");
      refresh();
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-800">
            Team members
          </h2>
          <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-500">
            {members.length}
          </span>
        </div>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
          <UserPlus className="h-4 w-4" /> Add member
        </Button>
      </header>

      {error && (
        <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {showAdd && (
        <div className="grid gap-2 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-2">
          <Input
            placeholder="Full name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <Input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            placeholder="Temporary password (min 6)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as Role })
            }
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
          >
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
          <div className="sm:col-span-2">
            <Button onClick={add} disabled={pending} className="w-full sm:w-auto">
              {pending ? "Creating…" : "Create account"}
            </Button>
            <span className="ml-2 text-xs text-slate-400">
              Share the email + password with your teammate to log in.
            </span>
          </div>
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {members.map((m) => {
          const isSelf = m.id === currentUserId;
          return (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.full_name ?? m.email} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {m.full_name ?? m.email}
                  {isSelf && (
                    <span className="ml-1 text-xs text-slate-400">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-400">{m.email}</p>
              </div>
              <select
                value={m.role}
                disabled={pending || isSelf}
                onChange={(e) => changeRole(m.id, e.target.value as Role)}
                className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 disabled:opacity-50"
              >
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
              {!isSelf && (
                <button
                  type="button"
                  onClick={() => remove(m.id, m.full_name ?? m.email ?? "member")}
                  disabled={pending}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove member"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
