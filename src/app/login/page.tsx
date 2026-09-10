"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Login failed");
      }
      const next = searchParams.get("next") || "/dashboard";
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהתחברות");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Dobby</h1>
          <p className="text-sm text-muted-foreground">כניסה ללוח הבקרה</p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">סיסמה</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
            autoFocus
          />
        </label>
        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button className="min-h-11 w-full" disabled={busy || !password.trim()}>
          {busy ? "מתחבר..." : "כניסה"}
        </Button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-6 text-center">טוען...</main>}>
      <LoginForm />
    </Suspense>
  );
}
