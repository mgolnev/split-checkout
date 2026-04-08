"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setErr("Неверный пароль");
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="admin-login flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Split Checkout</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Вход в админку</h1>
        <p className="mt-2 text-sm text-slate-600">
          Пароль задаётся в переменной <code className="rounded bg-slate-100 px-1 font-mono text-xs">ADMIN_PASSWORD</code>{" "}
          в <code className="rounded bg-slate-100 px-1 font-mono text-xs">.env</code>.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="admin-password" className="sr-only">
              Пароль
            </label>
            <input
              id="admin-password"
              type="password"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
          </div>
          <button type="submit" className="admin-btn-primary w-full py-2.5">
            Войти
          </button>
        </form>
      </div>
    </main>
  );
}
