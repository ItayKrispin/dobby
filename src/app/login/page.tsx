"use client";

import { Eye, EyeOff } from "lucide-react";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        throw new Error(json.error || "ההתחברות נכשלה");
      }
      const next = searchParams.get("next") || "/dashboard/jobs";
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
        className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1 text-center">
          <p className="text-sm font-semibold text-primary">Dobby</p>
          <h1 className="text-2xl font-bold tracking-tight">כניסה ללוח הבקרה</h1>
          <p className="text-base text-muted-foreground">
            הזינו את הסיסמה כדי לנהל שיחות ובקשות עבודה
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-base text-muted-foreground">סיסמה</span>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pe-12"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute end-1.5 top-1/2 -translate-y-1/2"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
            >
              {showPassword ? (
                <EyeOff className="size-5" />
              ) : (
                <Eye className="size-5" />
              )}
            </Button>
          </div>
        </label>
        {error && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={busy || !password.trim()}>
          {busy ? "מתחבר..." : "כניסה"}
        </Button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center p-6 text-base text-muted-foreground">
          טוען...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
