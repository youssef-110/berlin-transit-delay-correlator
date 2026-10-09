"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo, Spinner } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Something went wrong");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error – please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md animate-fade-up">
        <Link href="/" className="mb-8 inline-block"><Logo size={38} /></Link>
        <div className="glass p-7">
          <h1 className="text-2xl font-bold tracking-tight text-white">{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isLogin ? "Sign in to your transit dashboard." : "Track your commute and get smart delay alerts."}
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">Email</span>
              <input id="auth-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">Password</span>
              <input
                id="auth-password"
                className="input"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={isLogin ? 1 : 10}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? "••••••••••" : "At least 10 characters"}
              />
            </label>
            {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">{error}</div>}
            <button id="auth-submit" type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? <Spinner /> : null}
              {isLogin ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-400">
            {isLogin ? "New to VBB Pulse? " : "Already registered? "}
            <Link href={isLogin ? "/register" : "/login"} className="font-semibold text-indigo-300 hover:text-indigo-200" id="auth-switch">
              {isLogin ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
