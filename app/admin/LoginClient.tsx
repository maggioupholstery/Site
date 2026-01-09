"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginClient() {
  const sp = useSearchParams();
  const nextPath = useMemo(() => sp.get("next") || "/admin/quotes", [sp]);

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onLogin() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next: nextPath }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok) throw new Error(json?.error || text || "Login failed");

      // Redirect after cookie set
      window.location.href = json?.next || nextPath;
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Admin Login</h1>
        <p className="mt-2 text-zinc-400">Enter the admin password to continue.</p>

        <Card className="mt-6 rounded-[2rem] border-zinc-900 bg-zinc-950/70">
          <CardContent className="p-6 space-y-4">
            <label className="text-sm">
              <div className="text-zinc-300 mb-1">Password</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
                placeholder="••••••••"
              />
            </label>

            {err && <div className="text-sm text-red-300">{err}</div>}

            <Button
              onClick={onLogin}
              disabled={loading || !password}
              className="rounded-2xl h-11 w-full"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>

            <div className="text-xs text-zinc-500">
              Tip: set{" "}
              <span className="text-zinc-300 font-mono">ADMIN_PASSWORD</span> in
              Vercel Environment Variables.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
