
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

const navigation = [
  { label: "Dashboard", href: "/dashboard/admin" },
  { label: "Data Ruangan", href: "/dashboard/admin/rooms" },
  { label: "Booking", href: "/dashboard/admin/bookings" },
  { label: "Data Kelas", href: "/dashboard/admin/classes" },
  { label: "Pengguna", href: "/dashboard/admin/users" },
  { label: "Persetujuan Komting", href: "/dashboard/admin/registrations"},
];

export default function AdminShell({
  children,
  adminName,
}: {
  children: ReactNode;
  adminName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);


  async function handleLogout() {
    setLoggingOut(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      router.replace("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout:", err);
      setError(getErrorMessage(err, "Gagal melakukan logout."));
      setLoggingOut(false);
    }
  }


  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="flex w-full flex-col border-b bg-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="border-b px-6 py-5">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            SIRAKA
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Admin Panel
          </p>
        </div>

        <nav className="flex gap-1 overflow-x-auto p-3 md:flex-1 md:flex-col">
          {navigation.map((item) => {
            const active =
              item.href === "/dashboard/admin"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t p-4 md:block">
          <p className="text-xs text-slate-400">
            Sistem Informasi Penjadwalan
          </p>
          <p className="mt-1 text-xs text-slate-400">
            SIRAKA · UNIMED
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b bg-white px-5 py-4 md:px-8">
          <div>
            <p className="text-xs text-slate-500">
              Administrator
            </p>
            <p className="text-sm font-semibold text-slate-800">
              {adminName}
            </p>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loggingOut ? "Keluar..." : "Logout"}
          </button>
        </header>

        <main className="p-5 md:p-8">
          {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}
