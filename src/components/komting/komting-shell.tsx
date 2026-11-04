"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type NavIconName = "home" | "booking" | "clock" | "users" | "user-check" | "inbox" | "settings";

type NavItem = {
  label: string;
  href: string;
  icon: NavIconName;
  exact?: boolean;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/komting", icon: "home", exact: true },
  { label: "Ajukan Booking", href: "/dashboard/komting/bookings/new", icon: "booking", exact: true },
  { label: "Status Booking", href: "/dashboard/komting/bookings", icon: "clock", exact: true },
  { label: "Pengajuan Mahasiswa", href: "/dashboard/komting/student-requests", icon: "inbox", exact: true },
  { label: "Daftar Mahasiswa", href: "/dashboard/komting/students", icon: "users", exact: true },
  { label: "Persetujuan Mahasiswa", href: "/dashboard/komting/registrations", icon: "user-check" },
  { label: "Pengaturan", href: "/dashboard/komting/settings", icon: "settings", exact: true },
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
  if (name === "booking") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17M12 13v5M9.5 15.5h5" /></svg>;
  }
  if (name === "clock") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
  }
  if (name === "user-check") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="4" /><path d="m16 9 2 2 4-4" /></svg>;
  }
  if (name === "inbox") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 4h16l2 11v4H2v-4L4 4Z" /><path d="M2 15h6l2 2h4l2-2h6" /></svg>;
  }
  if (name === "settings") {
    return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 3.1-.2-.1a1.7 1.7 0 0 0-1.8.1l-.2.1h-3.6l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.2.1-3.1-1.8.1-.2a1.7 1.7 0 0 0-.1-1.8l-.1-.2v-3.6l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.2 1.8-3.1.2.1a1.7 1.7 0 0 0 1.8-.1l.2-.1h3.6l.1.2a1.7 1.7 0 0 0 1.6 1l.2-.1 3.1 1.8-.1.2a1.7 1.7 0 0 0 .1 1.8l.1.2v3.6Z" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="4" /><path d="M18 8a4 4 0 0 1 0 7.75M22 20v-1.5a4 4 0 0 0-3-3.87" /></svg>;
}

function isActivePath(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function KomtingShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const activeItem = navItems.find((item) => isActivePath(pathname, item));

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Komting sign out error:", error);
      setSignOutError(getErrorMessage(error, "Gagal keluar. Silakan coba lagi."));
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <aside className="z-20 flex w-full flex-col border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-3 px-5 py-5 lg:px-6 lg:py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold tracking-wide text-white">S</div>
          <div className="min-w-0"><p className="text-base font-bold tracking-tight text-slate-900">SIRAKA</p><p className="text-xs text-slate-500">Panel Ketua Tingkat</p></div>
        </div>
        <div className="hidden px-6 pb-3 lg:block"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Menu Utama</p></div>
        <nav aria-label="Navigasi Komting" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-4">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:w-full ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                <span className="h-5 w-5 shrink-0"><NavIcon name={item.icon} /></span><span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-slate-100 p-4 lg:block">
          <div className="mb-3 rounded-xl bg-slate-50 px-3 py-3"><p className="text-sm font-semibold text-slate-800">Akun Komting</p><p className="mt-0.5 text-xs text-slate-500">Kelola booking dan data kelas</p></div>
          {signOutError && <p role="alert" className="mb-2 text-xs text-red-600">{signOutError}</p>}
          <button type="button" onClick={handleSignOut} disabled={signingOut} className="flex w-full items-center justify-center rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60">{signingOut ? "Keluar..." : "Keluar"}</button>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pb-3 lg:hidden">
          {signOutError ? <p role="alert" className="text-xs text-red-600">{signOutError}</p> : <span className="text-xs text-slate-400">Masuk sebagai Komting</span>}
          <button type="button" onClick={handleSignOut} disabled={signingOut} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60">{signingOut ? "Keluar..." : "Keluar"}</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 lg:ml-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div><p className="text-xs font-medium text-slate-400">SIRAKA / Komting</p><h1 className="mt-0.5 text-base font-semibold text-slate-900">{activeItem?.label ?? "Panel Komting"}</h1></div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">Ketua Tingkat</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
