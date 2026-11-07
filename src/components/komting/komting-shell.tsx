"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type IconName =
  | "home"
  | "booking"
  | "clock"
  | "users"
  | "approval"
  | "inbox"
  | "settings"
  | "logout"
  | "arrow";

type NavItem = {
  label: string;
  description: string;
  href: string;
  icon: IconName;
  exact?: boolean;
};

const navigation: NavItem[] = [
  {
    label: "Dashboard",
    description: "Ringkasan aktivitas kelas",
    href: "/dashboard/komting",
    icon: "home",
    exact: true,
  },
  {
    label: "Ajukan Booking",
    description: "Reservasi ruangan untuk kelas",
    href: "/dashboard/komting/bookings/new",
    icon: "booking",
    exact: true,
  },
  {
    label: "Status Booking",
    description: "Pantau pengajuan reservasi",
    href: "/dashboard/komting/bookings",
    icon: "clock",
    exact: true,
  },
  {
    label: "Pengajuan Mahasiswa",
    description: "Tinjau kebutuhan anggota kelas",
    href: "/dashboard/komting/student-requests",
    icon: "inbox",
  },
  {
    label: "Daftar Mahasiswa",
    description: "Kelola anggota kelas",
    href: "/dashboard/komting/students",
    icon: "users",
  },
  {
    label: "Persetujuan Mahasiswa",
    description: "Verifikasi pendaftaran anggota",
    href: "/dashboard/komting/registrations",
    icon: "approval",
  },
  {
    label: "Pengaturan",
    description: "Informasi dan preferensi akun",
    href: "/dashboard/komting/settings",
    icon: "settings",
  },
];

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-7h6v7" />
      </>
    ),
    booking: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4M17 3v4M3 10h18M12 13v5M9.5 15.5h5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2" />
        <path d="M16 4a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.7" />
      </>
    ),
    approval: (
      <>
        <circle cx="8" cy="7" r="3" />
        <path d="M2 21v-2a6 6 0 0 1 12 0v2" />
        <path d="m15 10 2 2 5-5" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 4h16l2 11v4H2v-4L4 4Z" />
        <path d="M2 15h6l2 2h4l2-2h6" />
      </>
    ),
    settings: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
        <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
        <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
      </>
    ),
    logout: (
      <>
        <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
        <path d="M9 12h12m-4-4 4 4-4 4" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`)
  );
}

export default function KomtingShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const activeItem = navigation.find((item) =>
    isActive(pathname, item),
  );

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
      console.error("Komting sign out:", error);

      setSignOutError(
        getErrorMessage(error, "Gagal keluar. Silakan coba lagi."),
      );

      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F3F6FA] text-ink">
      <a
        href="#komting-main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-xl bg-white px-4 py-3 text-sm font-bold text-primary shadow-lg focus:not-sr-only"
      >
        Lewati navigasi
      </a>

      <aside className="relative flex w-full flex-col bg-[#122D46] text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-72 lg:overflow-y-auto">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top_left,rgba(41,169,184,0.18),transparent_70%)]"
        />

        <Link
          href="/dashboard/komting"
          className="relative flex shrink-0 items-center gap-3 px-6 py-6 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white lg:px-7 lg:py-8"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-black/10">
            <Image
              src="/images/logo/logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
          </div>

          <div>
            <p className="font-heading text-xl font-extrabold tracking-[0.08em]">
              SIRAKA
            </p>

            <p className="mt-0.5 text-[12px] font-medium tracking-wide text-slate-300">
              Panel Komisaris Tingkat
            </p>
          </div>
        </Link>

        <div className="relative mx-6 hidden shrink-0 border-t border-white/10 lg:block" />

        <div className="relative hidden shrink-0 px-7 pb-4 pt-6 lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
            Workspace Komting
          </p>
        </div>

        <nav
          aria-label="Navigasi Komting"
          className="relative flex shrink-0 gap-2 overflow-x-auto px-4 pb-4 lg:flex-col lg:overflow-visible lg:pb-6"
        >
          {navigation.map((item) => {
            const active = isActive(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex shrink-0 items-center gap-3 rounded-2xl px-3 py-3 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:w-full lg:px-4 ${
                  active
                    ? "bg-white text-[#122D46] shadow-lg shadow-black/10"
                    : "text-slate-300 hover:bg-white hover:text-[#122D46]"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    active
                      ? "bg-slate-100"
                      : "bg-white/5 group-hover:bg-slate-100"
                  }`}
                >
                  <Icon name={item.icon} />
                </span>

                <span className="min-w-0">
                  <span className="block text-xs font-bold">
                    {item.label}
                  </span>

                  <span
                    className={`mt-1 hidden text-[10px] transition-colors lg:block ${
                      active
                        ? "text-slate-500"
                        : "text-slate-400 group-hover:text-slate-500"
                    }`}
                  >
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div
          aria-hidden="true"
          className="hidden lg:block lg:min-h-5 lg:flex-1"
        />

        <div className="relative mx-5 mb-5 hidden shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5 lg:block">
          <span className="inline-flex rounded-lg bg-cyan-300/10 p-2 text-cyan-200">
            <Icon name="booking" className="h-4 w-4" />
          </span>

          <p className="mt-3 font-heading text-sm font-bold">
            Siapkan kegiatan kelas.
          </p>

          <p className="mt-2 text-[11px] leading-5 text-slate-300">
            Ajukan kebutuhan ruangan dan pantau status reservasi
            kelasmu.
          </p>

          <Link
            href="/dashboard/komting/bookings/new"
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg text-[11px] font-bold text-cyan-200 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Ajukan booking
            <Icon name="arrow" className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="relative shrink-0 border-t border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200 ring-1 ring-inset ring-cyan-200/20"
            >
              <Icon name="users" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white">
                Akun Komting
              </p>

              <p className="mt-1 text-[10px] text-slate-400">
                Kelola aktivitas kelas
              </p>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-label={
                signingOut ? "Sedang keluar" : "Keluar dari akun"
              }
              aria-describedby={
                signOutError ? "komting-signout-error" : undefined
              }
              title="Keluar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>

          {signingOut && (
            <p role="status" className="mt-3 text-xs text-slate-300">
              Keluar dari akun...
            </p>
          )}

          {signOutError && (
            <p
              id="komting-signout-error"
              role="alert"
              className="mt-3 rounded-lg bg-red-400/10 p-3 text-xs leading-5 text-red-200"
            >
              {signOutError}
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col lg:ml-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
          <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
                <span>SIRAKA</span>
                <span aria-hidden="true">/</span>
                <span className="text-muted">Panel Komting</span>
              </p>

              <p className="mt-1.5 truncate font-heading text-base font-extrabold text-primary">
                {activeItem?.label ?? "Panel Komting"}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-primary sm:inline-flex">
                Komisaris Tingkat
              </span>

              <div
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-bold text-white ring-4 ring-slate-100"
              >
                KT
              </div>
            </div>
          </div>
        </header>

        <main
          id="komting-main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 scroll-mt-24 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-10 lg:py-9"
        >
          {children}
        </main>

        <footer className="px-4 pb-6 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
            <p className="text-[10px] text-muted">
              © 2026 SIRAKA. Universitas Negeri Medan.
            </p>

            <p className="text-[10px] text-slate-400">
              Sistem Penjadwalan &amp; Peminjaman Ruangan
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}