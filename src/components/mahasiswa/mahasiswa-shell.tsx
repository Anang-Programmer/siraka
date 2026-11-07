"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type MahasiswaShellProps = {
  children: ReactNode;
  fullName: string;
};

type NavIconName = "home" | "rooms" | "calendar" | "inbox";

type NavItem = {
  label: string;
  href: string;
  icon: NavIconName;
  exact?: boolean;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/mahasiswa", icon: "home", exact: true },
  { label: "Informasi Ruangan", href: "/dashboard/mahasiswa/rooms", icon: "rooms" },
  { label: "Jadwal & Ketersediaan", href: "/dashboard/mahasiswa/schedule", icon: "calendar" },
  { label: "Pengajuan Kebutuhan", href: "/dashboard/mahasiswa/requests", icon: "inbox" },
];

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "home") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></svg>;
  }
  if (name === "rooms") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 8h3M8 12h3M8 16h3" /></svg>;
  }
  if (name === "calendar") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 4h16l2 11v4H2v-4L4 4Z" /><path d="M2 15h6l2 2h4l2-2h6" /></svg>;
}

function isActivePath(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function MahasiswaShell({
  children,
  fullName,
}: MahasiswaShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const activeItem = navItems.find((item) => isActivePath(pathname, item));

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
      setLogoutError(getErrorMessage(error, "Gagal keluar. Silakan coba lagi."));
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <aside className="z-20 flex w-full flex-col border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-3 px-5 py-5 lg:px-6 lg:py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold tracking-wide text-white">S</div>
          <div className="min-w-0">
            <p className="text-base font-bold tracking-tight text-slate-900">SIRAKA</p>
            <p className="text-xs text-slate-500">Portal Mahasiswa</p>
          </div>
        </div>

        <div className="hidden px-6 pb-3 lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Menu Utama</p>
        </div>

        <nav aria-label="Navigasi Mahasiswa" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-4">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:w-full ${
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span className="h-5 w-5 shrink-0"><NavIcon name={item.icon} /></span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t border-slate-100 p-4 lg:block">
          <div className="mb-3 rounded-xl bg-slate-50 px-3 py-3">
            <p className="truncate text-sm font-semibold text-slate-800">{fullName}</p>
            <p className="mt-0.5 text-xs text-slate-500">Akun Mahasiswa</p>
          </div>
          {logoutError && <p role="alert" className="mb-2 text-xs text-red-600">{logoutError}</p>}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center justify-center rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? "Keluar..." : "Keluar"}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 pb-3 lg:hidden">
          {logoutError ? (
            <p role="alert" className="text-xs text-red-600">{logoutError}</p>
          ) : (
            <span className="truncate text-xs text-slate-400">Masuk sebagai {fullName}</span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {loggingOut ? "Keluar..." : "Keluar"}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 lg:ml-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400">SIRAKA / Mahasiswa</p>
              <h1 className="mt-0.5 text-base font-semibold text-slate-900">{activeItem?.label ?? "Portal Mahasiswa"}</h1>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">Mahasiswa</span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
