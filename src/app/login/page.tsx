"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Login — a white card over the campus photograph (Design §5.0), the one place
 * the brand's photographic treatment appears.
 *
 * Accounts are role-based: people sign in as a position, not as themselves
 * (DR-06), which is why the hint below names an address rather than a person.
 */
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [kataSandi, setKataSandi] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);

  async function masuk(e: React.FormEvent) {
    e.preventDefault();
    setMemuat(true);
    setGalat(null);

    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email,
      password: kataSandi,
    });

    if (error) {
      setGalat("Email atau kata sandi tidak cocok.");
      setMemuat(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: "var(--midnight)" }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6">
          <div
            className="text-lg font-semibold tracking-tight"
            style={{ color: "var(--midnight)" }}
          >
            SIM KERJA SAMA
          </div>
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Universitas Kristen Petra
          </div>
        </div>

        <form onSubmit={masuk} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dekan-fti@petra.ac.id"
              className="w-full rounded-lg border px-3 py-2 text-sm border-[var(--border)] focus:border-[var(--status-progress)]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Kata Sandi</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={kataSandi}
              onChange={(e) => setKataSandi(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm border-[var(--border)] focus:border-[var(--status-progress)]"
            />
          </label>

          {galat ? (
            <p role="alert" className="text-sm" style={{ color: "var(--action-danger)" }}>
              {galat}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={memuat}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--midnight)" }}
          >
            {memuat ? "Memproses…" : "Masuk"}
          </button>
        </form>

        <p className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
          Akun mengikuti jabatan, bukan orang — pergantian pejabat tidak
          memerlukan akun baru.
        </p>
      </div>
    </main>
  );
}
