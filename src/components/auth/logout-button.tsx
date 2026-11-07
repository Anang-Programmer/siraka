"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err, "Gagal keluar. Silakan coba lagi."));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleLogout}
        disabled={loading}
        className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
      >
        {loading ? "Keluar..." : "Logout"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
