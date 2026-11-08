"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";

type DashboardSummary = {
  fullName: string;
  classLabel: string;
  pendingBookings: number;
  approvedBookings: number;
  pendingRegistrations: number;
  pendingStudentRequests: number;
  activeStudents: number;
  inactiveStudents: number;
};

type IconName =
  | "calendar"
  | "inbox"
  | "clock"
  | "approval"
  | "users"
  | "settings"
  | "arrow"
  | "refresh";

const quickActions: {
  title: string;
  description: string;
  href: string;
  icon: IconName;
  color: string;
}[] = [
  {
    title: "Ajukan Booking",
    description:
      "Siapkan ruangan untuk perkuliahan dan kegiatan kelas.",
    href: "/dashboard/komting/bookings/new",
    icon: "calendar",
    color: "bg-sky-50 text-sky-700",
  },
  {
    title: "Pengajuan Mahasiswa",
    description:
      "Tinjau kebutuhan ruangan yang disampaikan anggota kelas.",
    href: "/dashboard/komting/student-requests",
    icon: "inbox",
    color: "bg-teal-50 text-teal-700",
  },
  {
    title: "Status Booking",
    description:
      "Pantau proses peninjauan dan status reservasi ruangan.",
    href: "/dashboard/komting/bookings",
    icon: "clock",
    color: "bg-indigo-50 text-indigo-700",
  },
  {
    title: "Persetujuan Mahasiswa",
    description:
      "Periksa pendaftaran mahasiswa yang ingin bergabung.",
    href: "/dashboard/komting/registrations",
    icon: "approval",
    color: "bg-amber-50 text-amber-800",
  },
  {
    title: "Daftar Mahasiswa",
    description:
      "Lihat anggota kelas dan kelola status akun mahasiswa.",
    href: "/dashboard/komting/students",
    icon: "users",
    color: "bg-emerald-50 text-emerald-700",
  },
  {
    title: "Pengaturan Akun",
    description:
      "Periksa informasi profil dan perbarui kata sandi akun.",
    href: "/dashboard/komting/settings",
    icon: "settings",
    color: "bg-slate-100 text-primary",
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
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4M17 3v4M3 10h18M12 13v5M9.5 15.5h5" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 4h16l2 11v4H2v-4L4 4Z" />
        <path d="M2 15h6l2 2h4l2-2h6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    approval: (
      <>
        <circle cx="8" cy="7" r="3" />
        <path d="M2 21v-2a6 6 0 0 1 12 0v2" />
        <path d="m15 10 2 2 5-5" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2" />
        <path d="M16 4a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.7" />
      </>
    ),
    settings: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle
          cx="8"
          cy="6"
          r="2"
          fill="currentColor"
          stroke="none"
        />
        <circle
          cx="16"
          cy="12"
          r="2"
          fill="currentColor"
          stroke="none"
        />
        <circle
          cx="10"
          cy="18"
          r="2"
          fill="currentColor"
          stroke="none"
        />
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

export default function KomtingDashboard() {
  const controllerRef = useRef<AbortController | null>(null);

  const [summary, setSummary] =
    useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

    const loadDashboard = useCallback(() => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const { signal } = controller;

    const fetchDashboard = async () => {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (signal.aborted) return;
      if (authError) throw authError;

      if (!user) {
        throw new Error(
          "Sesi login tidak ditemukan. Silakan login ulang.",
        );
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("full_name, class_id")
          .eq("id", user.id)
          .single();

      if (signal.aborted) return;
      if (profileError) throw profileError;

      if (!profile.class_id) {
        throw new Error("Akun Komting belum memiliki kelas.");
      }

      const [
        classResult,
        pendingBookingResult,
        approvedBookingResult,
        registrationResult,
        requestResult,
        studentResult,
      ] = await Promise.all([
        supabase
          .from("classes")
          .select("class_code, class_name")
          .eq("id", profile.class_id)
          .single(),

        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("requester_id", user.id)
          .in("status", ["pending", "under_review"]),

        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("requester_id", user.id)
          .eq("status", "approved"),

        supabase
          .from("registration_requests")
          .select("id", { count: "exact", head: true })
          .eq("class_id", profile.class_id)
          .eq("requested_role", "mahasiswa")
          .eq("status", "pending"),

        supabase
          .from("student_room_requests")
          .select("id", { count: "exact", head: true })
          .eq("class_id", profile.class_id)
          .eq("status", "pending"),

        supabase.rpc("get_komting_student_directory"),
      ]);

      if (signal.aborted) return;

      const queryError =
        classResult.error ||
        pendingBookingResult.error ||
        approvedBookingResult.error ||
        registrationResult.error ||
        requestResult.error ||
        studentResult.error;

      if (queryError) throw queryError;

      const students = (studentResult.data ?? []) as {
        is_active: boolean;
      }[];

      const activeStudents = students.filter(
        (student) => student.is_active,
      ).length;

      return {
        fullName: profile.full_name,
        classLabel: classResult.data
          ? `${classResult.data.class_code} · ${classResult.data.class_name}`
          : "Kelas Komting",
        pendingBookings: pendingBookingResult.count ?? 0,
        approvedBookings: approvedBookingResult.count ?? 0,
        pendingRegistrations: registrationResult.count ?? 0,
        pendingStudentRequests: requestResult.count ?? 0,
        activeStudents,
        inactiveStudents: students.length - activeStudents,
      };
    };

    return fetchDashboard()
      .then((result) => {
        if (signal.aborted || !result) return;

        setSummary(result);
        setError("");
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;

        console.error("Load Komting dashboard:", err);

        setError(
          getErrorMessage(
            err,
            "Gagal memuat dashboard Komting.",
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

  const ready = !loading && !error && summary !== null;

  const displayName =
    summary?.fullName?.trim() || "Komting";

  const attentionCount = summary
    ? summary.pendingStudentRequests +
      summary.pendingRegistrations
    : 0;

  const stats: {
    label: string;
    value: number;
    description: string;
    href: string;
    icon: IconName;
    color: string;
  }[] = [
    {
      label: "Pengajuan Mahasiswa",
      value: summary?.pendingStudentRequests ?? 0,
      description: "Menunggu tanggapanmu",
      href: "/dashboard/komting/student-requests",
      icon: "inbox",
      color: "bg-teal-50 text-teal-700",
    },
    {
      label: "Pendaftaran Mahasiswa",
      value: summary?.pendingRegistrations ?? 0,
      description: "Perlu verifikasi kelas",
      href: "/dashboard/komting/registrations",
      icon: "approval",
      color: "bg-sky-50 text-sky-700",
    },
    {
      label: "Booking Menunggu",
      value: summary?.pendingBookings ?? 0,
      description: "Menunggu atau sedang ditinjau",
      href: "/dashboard/komting/bookings",
      icon: "clock",
      color: "bg-amber-50 text-amber-800",
    },
    {
      label: "Booking Disetujui",
      value: summary?.approvedBookings ?? 0,
      description: "Total booking milikmu yang disetujui",
      href: "/dashboard/komting/bookings",
      icon: "calendar",
      color: "bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            Workspace / Ringkasan
          </p>

          <h1 className="mt-2 font-heading text-2xl font-bold text-primary sm:text-2xl">
            Dashboard Komting
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
        <div><p className="text-sm font-semibold text-primary">{loading ? "Memuat akun..." : displayName}</p><p className="mt-1 text-xs text-muted">{ready ? summary.classLabel : "Memuat kelas..."}</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/dashboard/komting/bookings/new" className="btn-primary">Ajukan Booking</Link><Link href="/dashboard/komting/student-requests" className="btn-outline">Pengajuan Mahasiswa</Link></div>
      </section>

      <section>
        <div className="mb-5 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-6 w-1 rounded-full bg-secondary"
          />

          <div>
            <h2 className="font-heading text-lg font-bold text-primary">
              Ringkasan Aktivitas
            </h2>

            <p className="mt-1 text-xs text-muted">
              Pantau hal yang perlu ditindaklanjuti.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="group rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 transition hover:border-secondary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold leading-5 text-muted">
                  {stat.label}
                </h3>

                <span
                  className={`shrink-0 rounded-md p-2 ${stat.color}`}
                >
                  <Icon name={stat.icon} className="h-4 w-4" />
                </span>
              </div>

              <p className="mt-5 font-heading text-3xl font-bold text-primary">
                {ready ? stat.value : "—"}
              </p>

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-[10px] leading-5 text-muted">
                  {stat.description}
                </p>

                <Icon
                  name="arrow"
                  className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-primary"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200/80 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-base font-bold text-primary">
              Perlu Perhatian
            </h2>

            <span className="rounded-md bg-amber-50 p-2 text-amber-800">
              <Icon name="inbox" />
            </span>
          </div>

          <p className="mt-4 text-sm font-bold text-primary">
            {!ready
              ? "Memuat ringkasan..."
              : attentionCount > 0
                ? `${attentionCount} pengajuan menunggu tindakanmu`
                : "Tidak ada pengajuan yang menunggu"}
          </p>

          <p className="mt-2 text-xs leading-7 text-muted">
            Tinjau kebutuhan ruangan mahasiswa dan pendaftaran
            anggota kelas melalui halaman terkait.
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link
              href="/dashboard/komting/student-requests"
              className="btn-outline rounded-md text-xs"
            >
              Pengajuan Mahasiswa
            </Link>

            <Link
              href="/dashboard/komting/registrations"
              className="btn-outline rounded-md text-xs"
            >
              Pendaftaran Mahasiswa
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-base font-bold text-primary">
              Keanggotaan Kelas
            </h2>

            <Link
              href="/dashboard/komting/students"
              className="rounded-md text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Kelola →
            </Link>
          </div>

          <p className="mt-2 text-xs leading-7 text-muted">
            Mahasiswa yang berada di bawah koordinasimu.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-4">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                />
                Mahasiswa Aktif
              </span>

              <p className="mt-3 font-heading text-2xl font-bold text-primary">
                {ready ? summary.activeStudents : "—"}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-slate-400"
                />
                Mahasiswa Nonaktif
              </span>

              <p className="mt-3 font-heading text-2xl font-bold text-primary">
                {ready ? summary.inactiveStudents : "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-6 w-1 rounded-full bg-secondary"
          />

          <div>
            <h2 className="font-heading text-lg font-bold text-primary">
              Akses Cepat
            </h2>

            <p className="mt-1 text-xs text-muted">
              Pilih pekerjaan yang ingin kamu lakukan.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex flex-col rounded-lg border border-slate-200/80 bg-white p-4 shadow-none shadow-slate-200/20 transition hover:border-secondary/40 hover:shadow-md hover:shadow-slate-200/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-lg ${action.color}`}
                >
                  <Icon name={action.icon} className="h-6 w-6" />
                </span>

                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition group-hover:bg-primary group-hover:text-white">
                  <Icon name="arrow" className="h-4 w-4" />
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
    </div>
  );
}