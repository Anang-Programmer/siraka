"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type IconName =
  | "menu"
  | "close"
  | "home"
  | "rooms"
  | "calendar"
  | "inbox"
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
    href: "/dashboard/mahasiswa",
    icon: "home",
    exact: true,
  },
  {
    label: "Informasi Ruangan",
    description: "Eksplorasi fasilitas kampus",
    href: "/dashboard/mahasiswa/rooms",
    icon: "rooms",
  },
  {
    label: "Jadwal & Ketersediaan",
    description: "Temukan waktu yang tepat",
    href: "/dashboard/mahasiswa/schedule",
    icon: "calendar",
  },
  {
    label: "Pengajuan Kebutuhan",
    description: "Koordinasikan kebutuhanmu",
    href: "/dashboard/mahasiswa/requests",
    icon: "inbox",
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
    menu: <path d="M5 6h14M5 12h14M5 18h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-7h6v7" />
      </>
    ),
    rooms: (
      <>
        <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
        <path d="M15 9h4a1 1 0 0 1 1 1v11M2 21h20" />
        <path d="M8 8h3M8 12h3M8 16h3" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3.5 10h17" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 4h16l2 11v4H2v-4L4 4Z" />
        <path d="M2 15h6l2 2h4l2-2h6" />
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
  return item.exact
    ? pathname === item.href
    : pathname === item.href ||
        pathname.startsWith(`${item.href}/`);
}

export default function MahasiswaShell({
  children,
  fullName,
}: {
  children: ReactNode;
  fullName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const displayName = fullName.trim() || "Mahasiswa";

  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

  const activeItem = navigation.find((item) =>
    isActive(pathname, item),
  );

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (mobileOpen && !dialog.open) {
      dialog.showModal();
    }

    if (!mobileOpen && dialog.open) {
      dialog.close();
    }
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");

    function handleResize() {
      if (query.matches) {
        dialogRef.current?.close();
        setMobileOpen(false);
      }
    }

    handleResize();
    query.addEventListener("change", handleResize);

    return () => {
      query.removeEventListener("change", handleResize);
    };
  }, []);

  useEffect(() => {
    // State mobileOpen diperbarui melalui event onClose dialog.
    dialogRef.current?.close();
  }, [pathname]);

  function closeMobile() {
    dialogRef.current?.close();
    setMobileOpen(false);
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      closeMobile();
      router.replace("/login");
      router.refresh();
    } catch (err) {
      console.error("Mahasiswa logout:", err);

      setLogoutError(
        getErrorMessage(err, "Gagal keluar. Silakan coba lagi."),
      );

      setLoggingOut(false);
    }
  }

  function fullSidebar(mobile: boolean) {
    return (
      <div className="flex min-h-full flex-col bg-[#122D46] text-white">
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-7">
          <Link
            href="/dashboard/mahasiswa"
            onClick={() => {
              if (mobile) closeMobile();
            }}
            className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white p-2">
              <Image
                src="/images/logo/logo.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
                priority
              />
            </span>

            <span>
              <span className="block font-heading text-xl font-extrabold tracking-wider">
                SIRAKA
              </span>

              <span className="mt-1 block text-[10px] text-slate-300">
                Panel Mahasiswa
              </span>
            </span>
          </Link>

          {mobile && (
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Tutup menu"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            >
              <Icon name="close" />
            </button>
          )}
        </div>

        <div className="mx-5 shrink-0 border-t border-white/10" />

        <p className="shrink-0 px-6 pb-4 pt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Workspace Mahasiswa
        </p>

        <nav
          aria-label={
            mobile
              ? "Navigasi Mahasiswa seluler lengkap"
              : "Navigasi Mahasiswa"
          }
          className="flex shrink-0 flex-col gap-2 px-3 pb-6"
        >
          {navigation.map((item) => {
            const active = isActive(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (mobile) closeMobile();
                }}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  active
                    ? "bg-white text-[#122D46] shadow-sm"
                    : "text-slate-300 hover:bg-white hover:text-[#122D46]"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
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
                    className={`mt-1 block text-[10px] leading-5 ${
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

        <div aria-hidden="true" className="min-h-5 flex-1" />

        <div className="mx-4 mb-5 shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <span className="inline-flex rounded-lg bg-cyan-300/10 p-2 text-cyan-200">
            <Icon name="inbox" />
          </span>

          <p className="mt-3 text-sm font-bold">
            Ada rencana kegiatan.
          </p>

          <p className="mt-2 text-[11px] leading-6 text-slate-300">
            Sampaikan kebutuhan ruanganmu dan koordinasikan bersama Komting.
          </p>
          <Link
            href="/dashboard/mahasiswa/requests"
            onClick={() => { if (mobile) closeMobile(); }}
            className="mt-4 inline-flex min-h-10 items-center rounded-lg text-xs font-bold text-cyan-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Ajukan kebutuhan
          </Link>
        </div>

        <div className="shrink-0 border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-xs font-bold text-cyan-200"
            >
              {initials}
            </span>

            <div className="min-w-0 flex-1">
              <p
                title={displayName}
                className="truncate text-xs font-bold"
              >
                {displayName}
              </p>

              <p className="mt-1 text-[10px] text-slate-400">
                Mahasiswa
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              aria-label="Keluar dari akun"
              title="Keluar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F6FA] text-ink">
      <a
        href="#mahasiswa-main-content"
        className="sr-only fixed left-20 top-4 z-50 rounded-xl bg-white px-4 py-3 text-sm font-bold text-primary shadow-lg focus:not-sr-only"
      >
        Lewati navigasi
      </a>

      <aside
        aria-label="Sidebar Mahasiswa desktop"
        className="fixed inset-y-0 left-0 z-30 hidden w-72 overflow-y-auto bg-[#122D46] lg:block"
      >
        {fullSidebar(false)}
      </aside>

      <aside
        aria-label="Sidebar Mahasiswa seluler"
        className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col overflow-y-auto bg-[#122D46] text-white lg:hidden"
      >
        <div className="flex shrink-0 flex-col items-center gap-3 px-2 py-4">
          <Link
            href="/dashboard/mahasiswa"
            aria-label="Dashboard SIRAKA"
            title="Dashboard SIRAKA"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Image
              src="/images/logo/logo.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
          </Link>

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu lengkap"
            aria-expanded={mobileOpen}
            aria-controls="mahasiswa-mobile-menu"
            aria-haspopup="dialog"
            title="Buka menu"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
          >
            <Icon name="menu" className="h-6 w-6" />
          </button>
        </div>

        <div className="mx-3 shrink-0 border-t border-white/10" />

        <nav
          aria-label="Navigasi ikon Mahasiswa"
          className="flex shrink-0 flex-col items-center gap-2 py-4"
        >
          {navigation.map((item) => {
            const active = isActive(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  active
                    ? "bg-white text-[#122D46]"
                    : "text-slate-300 hover:bg-white hover:text-[#122D46]"
                }`}
              >
                <Icon name={item.icon} />
              </Link>
            );
          })}
        </nav>

        <div aria-hidden="true" className="min-h-4 flex-1" />

        <div className="flex shrink-0 flex-col items-center gap-3 border-t border-white/10 px-2 py-4">
          <span
            aria-hidden="true"
            title={displayName}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-300/15 text-[10px] font-bold text-cyan-100"
          >
            {initials}
          </span>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            aria-label="Keluar dari akun"
            title="Keluar"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50"
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <dialog
        ref={dialogRef}
        id="mahasiswa-mobile-menu"
        aria-label="Menu lengkap Mahasiswa"
        onCancel={() => setMobileOpen(false)}
        onClose={() => {
          setMobileOpen(false);

          if (!window.matchMedia("(min-width: 1024px)").matches) {
            menuButtonRef.current?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;

          const rect = event.currentTarget.getBoundingClientRect();

          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          ) {
            closeMobile();
          }
        }}
        className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-[min(288px,90vw)] max-w-none overflow-y-auto border-0 bg-[#122D46] p-0 text-white shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm"
      >
        {fullSidebar(true)}
      </dialog>

      <div className="ml-16 flex min-h-screen min-w-0 flex-col lg:ml-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
          <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
                <span>SIRAKA</span>
                <span aria-hidden="true">/</span>
                <span className="text-muted">Portal Mahasiswa</span>
              </p>

              <p className="mt-1.5 truncate font-heading text-sm font-extrabold text-primary sm:text-base">
                {activeItem?.label ?? "Panel Mahasiswa"}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-primary sm:inline-flex">
                Mahasiswa
              </span>

              <span
                aria-hidden="true"
                className="hidden h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-bold text-white ring-4 ring-slate-100 lg:flex"
              >
                {initials}
              </span>
            </div>
          </div>
        </header>

        <main
          id="mahasiswa-main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 scroll-mt-24 px-3 py-5 focus:outline-none sm:px-6 sm:py-8 lg:px-10 lg:py-9"
        >
          {loggingOut && (
            <p role="status" className="sr-only">
              Keluar dari akun...
            </p>
          )}

          {logoutError && (
            <p
              role="alert"
              className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
            >
              {logoutError}
            </p>
          )}

          {children}
        </main>

        <footer className="px-3 pb-6 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
            <p className="text-[10px] text-muted">
              Â© 2026 SIRAKA. Universitas Negeri Medan.
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