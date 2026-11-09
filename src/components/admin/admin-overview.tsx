"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type Metrics = {
  rooms: number;
  classes: number;
  users: number;
  pending: number;
  approved: number;
  schedules: number;
};

type Booking = {
  id: string;
  title: string;
  booking_type: string;
  status: string;
  starts_at: string;
  created_at: string;
};

type IconName =
  | "rooms"
  | "classes"
  | "users"
  | "calendar"
  | "clock"
  | "check"
  | "arrow"
  | "refresh";

const initialMetrics: Metrics = {
  rooms: 0,
  classes: 0,
  users: 0,
  pending: 0,
  approved: 0,
  schedules: 0,
};

const bookingTypeLabels: Record<string, string> = {
  instant: "Instant",
  regular: "Regular",
  krs_priority: "Prioritas KRS",
};

const statusConfig: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  pending: {
    label: "Menunggu",
    color: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  under_review: {
    label: "Sedang Ditinjau",
    color: "bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  approved: {
    label: "Disetujui",
    color: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Ditolak",
    color: "bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
  cancelled: {
    label: "Dibatalkan",
    color: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
  completed: {
    label: "Selesai",
    color: "bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
  },
};

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    rooms: (
      <>
        <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
        <path d="M15 9h4a1 1 0 0 1 1 1v11M2 21h20" />
        <path d="M8 8h3M8 12h3M8 16h3" />
      </>
    ),
    classes: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2" />
        <path d="M16 4a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.7" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 7a7 7 0 0 1 11.5-1L20 9" />
        <path d="M4 15l2.5 3A7 7 0 0 0 18 17" />
      </>
    ),
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

function formatDateTime(value: string) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value)) + " WIB"
  );
}

export default function AdminOverview() {
  const controllerRef = useRef<AbortController | null>(null);

  const [metrics, setMetrics] =
    useState<Metrics>(initialMetrics);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

    const loadDashboard = useCallback(() => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    const fetchDashboard = async () => {
      const supabase = createClient();

      const [
        roomResult,
        classResult,
        userResult,
        pendingResult,
        approvedResult,
        scheduleResult,
        bookingResult,
      ] = await Promise.all([
        supabase
          .from("rooms")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("classes")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),

        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),

        supabase
          .from("room_schedules")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),

        supabase
          .from("bookings")
          .select(
            "id, title, booking_type, status, starts_at, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (signal.aborted) return;

      const results = [
        roomResult,
        classResult,
        userResult,
        pendingResult,
        approvedResult,
        scheduleResult,
        bookingResult,
      ];

      const failed = results.find((result) => result.error);

      if (failed?.error) throw failed.error;

      return {
        metrics: {
          rooms: roomResult.count ?? 0,
          classes: classResult.count ?? 0,
          users: userResult.count ?? 0,
          pending: pendingResult.count ?? 0,
          approved: approvedResult.count ?? 0,
          schedules: scheduleResult.count ?? 0,
        },
        bookings: (bookingResult.data ?? []) as Booking[],
      };
    };

    return fetchDashboard()
      .then((result) => {
        if (signal.aborted || !result) return;

        setMetrics(result.metrics);
        setBookings(result.bookings);
        setError("");
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;

        console.error("Load Admin dashboard:", err);

        setError(
          getErrorMessage(
            err,
            "Gagal mengambil data dashboard.",
          ),
        );
      })
      .finally(() => {
        if (!signal.aborted) {
          setLoading(false);
        }
      });
  }, []);

  function refreshDashboard() {
    setLoading(true);
    setError("");

    return loadDashboard();
  }

  useEffect(() => {
    void loadDashboard();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadDashboard]);

  const ready = !loading && !error;

  const metricsCards: {
    label: string;
    value: number;
    description: string;
    icon: IconName;
    color: string;
    href?: string;
  }[] = [
    {
      label: "Total Ruangan",
      value: metrics.rooms,
      description: "Seluruh ruangan terdaftar",
      icon: "rooms",
      color: "bg-sky-50 text-sky-700",
      href: "/dashboard/admin/rooms",
    },
    {
      label: "Total Kelas",
      value: metrics.classes,
      description: "Seluruh kelas terdaftar",
      icon: "classes",
      color: "bg-indigo-50 text-indigo-700",
      href: "/dashboard/admin/classes",
    },
    {
      label: "Total Pengguna",
      value: metrics.users,
      description: "Seluruh profil dalam sistem",
      icon: "users",
      color: "bg-teal-50 text-teal-700",
      href: "/dashboard/admin/users",
    },
    {
      label: "Pengajuan Pending",
      value: metrics.pending,
      description: "Booking berstatus pending",
      icon: "clock",
      color: "bg-amber-50 text-amber-800",
      href: "/dashboard/admin/bookings",
    },
    {
      label: "Booking Disetujui",
      value: metrics.approved,
      description: "Seluruh booking berstatus approved",
      icon: "check",
      color: "bg-emerald-50 text-emerald-700",
      href: "/dashboard/admin/bookings",
    },
    {
      label: "Jadwal Aktif",
      value: metrics.schedules,
      description: "Data jadwal berstatus active",
      icon: "calendar",
      color: "bg-violet-50 text-violet-700",
    },
  ];

  const quickActions: {
    title: string;
    description: string;
    href: string;
    icon: IconName;
    color: string;
  }[] = [
    {
      title: "Tinjau Booking",
      description:
        "Periksa pengajuan ruangan dan berikan keputusan.",
      href: "/dashboard/admin/bookings",
      icon: "calendar",
      color: "bg-sky-50 text-sky-700",
    },
    {
      title: "Kelola Ruangan",
      description:
        "Perbarui fasilitas, kapasitas, dan data ruangan.",
      href: "/dashboard/admin/rooms",
      icon: "rooms",
      color: "bg-teal-50 text-teal-700",
    },
    {
      title: "Persetujuan Komting",
      description:
        "Tinjau pendaftaran ketua tingkat untuk setiap kelas.",
      href: "/dashboard/admin/registrations",
      icon: "users",
      color: "bg-indigo-50 text-indigo-700",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            Workspace / Ringkasan Sistem
          </p>

          <h1 className="mt-2 font-heading text-2xl font-bold text-primary sm:text-2xl">
            Dashboard Admin
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void refreshDashboard()}
          disabled={loading}
          className="btn-outline w-fit rounded-md text-xs shadow-none"
        >
          <Icon
            name="refresh"
            className={`h-4 w-4 ${
              loading ? "animate-spin" : ""
            }`}
          />

          {loading ? "Memuat..." : "Muat Ulang"}
        </button>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700"
        >
          {error}
        </p>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <p className="text-sm text-muted">Pantau pengajuan dan kelola data fasilitas kampus.</p>
        <div className="flex flex-wrap gap-2"><Link href="/dashboard/admin/bookings" className="btn-primary">Tinjau Booking</Link><Link href="/dashboard/admin/rooms" className="btn-outline">Kelola Ruangan</Link></div>
      </section>

      <section>
        <div className="mb-5 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-6 w-1 rounded-full bg-secondary"
          />

          <div>
            <h2 className="font-heading text-lg font-bold text-primary">
              Ringkasan Sistem
            </h2>

            <p className="mt-1 text-xs text-muted">
              Data fasilitas, pengguna, dan reservasi SIRAKA.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metricsCards.map((card) => {
            const content = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold text-muted">
                    {card.label}
                  </h3>

                  <span
                    className={`rounded-md p-2 ${card.color}`}
                  >
                    <Icon
                      name={card.icon}
                      className="h-5 w-5"
                    />
                  </span>
                </div>

                <p className="mt-4 font-heading text-3xl font-bold text-primary">
                  {ready ? card.value : "—"}
                </p>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] leading-6 text-muted">
                    {card.description}
                  </p>

                  {card.href && (
                    <Icon
                      name="arrow"
                      className="h-4 w-4 shrink-0 text-slate-400"
                    />
                  )}
                </div>
              </>
            );

            const className =
              "rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 sm:p-4";

            return card.href ? (
              <Link
                key={card.label}
                href={card.href}
                className={`${className} transition hover:border-secondary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
              >
                {content}
              </Link>
            ) : (
              <div key={card.label} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-6 w-1 rounded-full bg-secondary"
          />

          <h2 className="font-heading text-lg font-bold text-primary">
            Akses Cepat
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex flex-col rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 transition hover:border-secondary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-lg ${action.color}`}
                >
                  <Icon
                    name={action.icon}
                    className="h-6 w-6"
                  />
                </span>

                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition group-hover:bg-primary group-hover:text-white">
                  <Icon
                    name="arrow"
                    className="h-4 w-4"
                  />
                </span>
              </div>

              <h3 className="mt-5 font-heading text-sm font-bold text-primary">
                {action.title}
              </h3>

              <p className="mt-2 text-xs leading-7 text-muted">
                {action.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-none shadow-slate-200/20">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:p-4">
          <div>
            <h2 className="font-heading text-base font-bold text-primary">
              Pengajuan Terbaru
            </h2>

            <p className="mt-2 text-xs text-muted">
              Lima pengajuan peminjaman terakhir.
            </p>
          </div>

          <Link
            href="/dashboard/admin/bookings"
            className="inline-flex w-fit items-center gap-2 rounded-md text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Lihat Semua
            <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div
            role="status"
            className="p-12 text-center text-sm text-muted"
          >
            Memuat pengajuan terbaru...
          </div>
        ) : error ? (
          <p className="p-10 text-center text-sm text-muted">
            Data belum dapat dimuat. Silakan tekan Muat Ulang.
          </p>
        ) : bookings.length === 0 ? (
          <div className="p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-primary">
              <Icon name="calendar" className="h-7 w-7" />
            </span>

            <h3 className="mt-4 text-sm font-bold text-primary">
              Belum ada pengajuan peminjaman
            </h3>

            <p className="mt-2 text-xs leading-6 text-muted">
              Booking yang diajukan Komting akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-190 border-collapse text-left">
              <caption className="sr-only">
                Lima pengajuan booking terbaru
              </caption>

              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-4 py-4">
                    Pengajuan
                  </th>
                  <th scope="col" className="px-4 py-4">
                    Jenis Booking
                  </th>
                  <th scope="col" className="px-4 py-4">
                    Mulai Penggunaan
                  </th>
                  <th scope="col" className="px-4 py-4">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {bookings.map((booking) => {
                  const status =
                    statusConfig[booking.status] ?? {
                      label: booking.status,
                      color: "bg-slate-100 text-slate-600",
                      dot: "bg-slate-400",
                    };

                  return (
                    <tr
                      key={booking.id}
                      className="transition hover:bg-slate-50/70"
                    >
                      <th
                        scope="row"
                        className="max-w-xs px-4 py-5 text-left font-normal"
                      >
                        <p className="warp-break-word text-xs font-bold leading-6 text-primary">
                          {booking.title}
                        </p>

                        <p className="mt-1 text-[10px] leading-6 text-muted">
                          Diajukan{" "}
                          {formatDateTime(booking.created_at)}
                        </p>
                      </th>

                      <td className="px-4 py-5">
                        <span className="whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-primary">
                          {bookingTypeLabels[
                            booking.booking_type
                          ] ?? booking.booking_type}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-5 text-xs text-muted">
                        {formatDateTime(booking.starts_at)}
                      </td>

                      <td className="px-4 py-5">
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-semibold ${status.color}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                          />
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}