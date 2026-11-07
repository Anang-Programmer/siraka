"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("SIRAKA page error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div role="alert" className="w-full max-w-lg space-y-4 rounded-xl border bg-white p-6">
        <h1 className="text-xl font-semibold">Halaman belum dapat dimuat</h1>
        <p className="text-sm text-slate-600">
          Terjadi kegagalan saat memuat halaman atau memeriksa akses.
          Ini tidak selalu berarti akun Anda tidak terdaftar. Silakan coba lagi.
        </p>
        {error.digest && <p className="text-xs text-slate-500">Referensi error: {error.digest}</p>}
        <button onClick={reset} className="rounded-lg bg-slate-900 px-4 py-2 text-white">
          Coba Lagi
        </button>
      </div>
    </main>
  );
}
