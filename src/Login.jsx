import React, { useState } from "react";
import { LogIn } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { C } from "./lib.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4" style={{ background: C.bg, fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>
      <div className="w-full max-w-sm rounded-xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="text-[10px] uppercase tracking-[0.15em] font-semibold mb-1" style={{ color: "#5B9BD5" }}>Workforce Rotation</div>
        <h1 className="text-xl font-semibold mb-6" style={{ color: C.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>Sprint Command Centre</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: C.textMuted }}>Email</span>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="px-3 py-2 rounded-md text-sm outline-none" style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.textPrimary }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: C.textMuted }}>Password</span>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="px-3 py-2 rounded-md text-sm outline-none" style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.textPrimary }}
            />
          </label>
          {error && (
            <div className="text-xs px-3 py-2 rounded-md" style={{ background: C.overdue + "16", color: C.overdue, border: `1px solid ${C.overdue}40` }}>{error}</div>
          )}
          <button
            type="submit" disabled={loading}
            className="mt-2 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
            style={{ background: "#5B9BD5", color: "#0A0E13" }}
          >
            <LogIn size={15} /> {loading ? "Signing in\u2026" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
