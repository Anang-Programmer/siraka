"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { useCurrentTime } from "@/lib/hooks/use-current-time";

type Profile = {
  id: string;
  full_name: string;
  student_number: string | null;
  class_id: string | null;
  role: string;
  is_active: boolean;
};

type StudentClass = {
  class_code: string;
  class_name: string;
  study_program: string;
};

type Booking = {
  id: string;
  title: string;
  purpose: string | null;
  activity_type: string | null;
  room_id: string;
  starts_at: string;
  ends_at: string;
};

type Room = {
  id: string;
  room_code: string;
  room_name: string;
  building: string | null;
};

type IconName = "calendar" | "rooms" | "request" | "arrow" | "refresh";

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
        <path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" />
      </>
    ),
    rooms: (
      <>
        <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
        <path d="M15 9h4a1 1 0 0 1 1 1v11M2 21h20" />
        <path d="M8 8h3M8 12h3M8 16h3" />
      </>
    ),
    request: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" />
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

function jakartaDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}

function dateLabel(value: string | number) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function activityLabel(value: string | null) {
  const label = value?.replace(/_/g, " ") || "Kegiatan kelas";

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ScheduleSection({
  title,
  description,
  bookings,
  rooms,
  loading,
  failed,
  showDate = false,
}: {
  title: string;
  description: string;
  bookings: Booking[];
  rooms: Room[];
  loading: boolean;
  failed: boolean;
  showDate?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
        <div>
          <h2 className="font-heading text-base font-extrabold text-primary">
            {title}
          </h2>

          <p className="mt-1 text-xs leading-6 text-muted">
            {description}
          </p>
        </div>

        <Link
          href="/dashboard/mahasiswa/schedule"
          className="inline-flex w-fit shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-primary transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          Lihat jadwal
          <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <p
          role="status"
          className="px-6 py-12 text-center text-sm text-muted"
        >
          Memuat jadwal...
        </p>
      ) : failed ? (
        <p className="px-6 py-12 text-center text-sm text-muted">
          Jadwal belum dapat dimuat. Silakan muat ulang.
        </p>
      ) : bookings.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F5FA] text-primary/60">
            <Icon name="calendar" className="h-6 w-6" />
          </span>

          <h3 className="mt-4 text-sm font-bold text-primary">
            {showDate
              ? "Belum ada jadwal mendatang"
              : "Belum ada kegiatan hari ini"}
          </h3>

          <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-muted">
            Kegiatan kelas yang telah disetujui akan muncul di sini.
            Kamu bisa memeriksa jadwal ruangan melalui menu
            ketersediaan.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {bookings.map((booking) => {
            const room = rooms.find(
              (item) => item.id === booking.room_id,
            );

            const day = new Intl.DateTimeFormat("id-ID", {
              timeZone: "Asia/Jakarta",
              day: "2-digit",
            }).format(new Date(booking.starts_at));

            const month = new Intl.DateTimeFormat("id-ID", {
              timeZone: "Asia/Jakarta",
              month: "short",
            }).format(new Date(booking.starts_at));

            return (
              <article
                key={booking.id}
                className="flex flex-col gap-4 p-5 transition hover:bg-slate-50/60 sm:flex-row sm:items-center sm:p-6"
              >
                <div
                  aria-hidden="true"
                  className="hidden h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 sm:flex"
                >
                  <span className="font-heading text-xl font-extrabold text-primary">
                    {day}
                  </span>

                  <span className="text-[10px] font-bold uppercase text-muted">
                    {month}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                    {activityLabel(booking.activity_type)}
                  </p>

                  <h3 className="mt-1.5 break-words text-sm font-bold text-primary">
                    {booking.title}
                  </h3>

                  {showDate && (
                    <p className="mt-2 text-xs text-muted">
                      {dateLabel(booking.starts_at)}
                    </p>
                  )}

                  <p className="mt-2 text-xs leading-6 text-muted">
                    {room
                      ? [
                          room.room_code,
                          room.room_name,
                          room.building,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Informasi ruangan tidak tersedia"}
                  </p>
                </div>

                <div className="shrink-0 sm:text-right">
                  <p className="text-sm font-bold tabular-nums text-primary">
                    {timeLabel(booking.starts_at)}
                    {" - "}
                    {timeLabel(booking.ends_at)}
                  </p>

                  <p className="mt-1 text-[10px] text-muted">
                    Waktu Indonesia Barat
                  </p>

                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                    />
                    Disetujui Admin
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function MahasiswaDashboardPage() {
  const router = useRouter();
  const now = useCurrentTime();
  const loadController = useRef<AbortController | null>(null);

  const today = now === null ? "" : jakartaDate(now);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [studentClass, setStudentClass] =
    useState<StudentClass | null>(null);
  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [upcomingBookings, setUpcomingBookings] =
    useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!today) return;

    loadController.current?.abort();

    const controller = new AbortController();
    loadController.current = controller;

    const { signal } = controller;

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (signal.aborted) return;
      if (authError) throw authError;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } =
        await supabase
          .from("profiles")
          .select(
            "id, full_name, student_number, class_id, role, is_active",
          )
          .eq("id", user.id)
          .maybeSingle();

      if (signal.aborted) return;
      if (profileError) throw profileError;

      if (!profileData || !profileData.is_active) {
        router.replace("/registration-status");
        return;
      }

      if (profileData.role !== "mahasiswa") {
        router.replace("/");
        return;
      }

      let nextClass: StudentClass | null = null;
      let nextToday: Booking[] = [];
      let nextUpcoming: Booking[] = [];
      let nextRooms: Room[] = [];

      if (profileData.class_id) {
        const start = new Date(`${today}T00:00:00+07:00`);
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 1);

        const [classResult, bookingResult] = await Promise.all([
          supabase
            .from("classes")
            .select("class_code, class_name, study_program")
            .eq("id", profileData.class_id)
            .maybeSingle(),

          supabase
            .from("bookings")
            .select(
              "id, title, purpose, activity_type, room_id, starts_at, ends_at",
            )
            .eq("class_id", profileData.class_id)
            .eq("status", "approved")
            .gt("ends_at", start.toISOString())
            .order("starts_at", { ascending: true }),
        ]);

        if (signal.aborted) return;
        if (classResult.error) throw classResult.error;
        if (bookingResult.error) throw bookingResult.error;

        nextClass = classResult.data as StudentClass | null;

        const bookings = (bookingResult.data ?? []) as Booking[];

        nextToday = bookings.filter(
          (booking) =>
            Date.parse(booking.starts_at) < end.getTime() &&
            Date.parse(booking.ends_at) > start.getTime(),
        );

        nextUpcoming = bookings.filter(
          (booking) =>
            Date.parse(booking.starts_at) >= end.getTime(),
        );

        const roomIds = [
          ...new Set(bookings.map((booking) => booking.room_id)),
        ];

        if (roomIds.length > 0) {
          const { data, error: roomError } = await supabase
            .from("rooms")
            .select("id, room_code, room_name, building")
            .in("id", roomIds);

          if (signal.aborted) return;
          if (roomError) throw roomError;

          nextRooms = (data ?? []) as Room[];
        }
      }

      if (signal.aborted) return;

      setProfile(profileData as Profile);
      setStudentClass(nextClass);
      setTodayBookings(nextToday);
      setUpcomingBookings(nextUpcoming);
      setRooms(nextRooms);
    } catch (err) {
      if (signal.aborted) return;

      console.error("Load dashboard:", err);
      setError(getErrorMessage(err, "Gagal memuat dashboard."));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [router, today]);

  useEffect(() => {
    if (!today) return;

    void loadDashboard();

    return () => {
      loadController.current?.abort();
    };
  }, [loadDashboard, today]);

  const failed = Boolean(error);
  const ready = !loading && !failed;

  const nextBooking = [...todayBookings, ...upcomingBookings].find(
    (booking) =>
      now !== null && Date.parse(booking.ends_at) > now,
  );

  const ongoing =
    now !== null &&
    nextBooking !== undefined &&
    Date.parse(nextBooking.starts_at) <= now;

  const nextRoom = rooms.find(
    (room) => room.id === nextBooking?.room_id,
  );

  const quickActions: {
    href: string;
    title: string;
    description: string;
    icon: IconName;
    color: string;
  }[] = [
    {
      href: "/dashboard/mahasiswa/rooms",
      title: "Jelajahi Ruangan",
      description:
        "Kenali ruang kelas, laboratorium, dan fasilitas yang tersedia.",
      icon: "rooms",
      color: "bg-sky-50 text-sky-700",
    },
    {
      href: "/dashboard/mahasiswa/schedule",
      title: "Periksa Jadwal",
      description:
        "Lihat penggunaan ruangan dan pilih waktu yang sesuai.",
      icon: "calendar",
      color: "bg-teal-50 text-teal-700",
    },
    {
      href: "/dashboard/mahasiswa/requests",
      title: "Ajukan Kebutuhan",
      description:
        "Sampaikan rencana kegiatanmu kepada Komting kelas.",
      icon: "request",
      color: "bg-indigo-50 text-indigo-700",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Workspace / Ringkasan
          </p>

          <h1 className="mt-2 font-heading text-2xl font-extrabold text-primary sm:text-3xl">
            Dashboard Mahasiswa
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={loading || !today}
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-primary shadow-sm transition hover:border-primary/30 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon
            name="refresh"
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          {loading ? "Memuat..." : "Muat Ulang"}
        </button>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"
        >
          {error}
        </p>
      )}

      <section className="relative overflow-hidden rounded-[28px] bg-[#173A56] p-6 text-white sm:p-8 lg:p-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(41,169,184,0.35),transparent_65%)]"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-28 h-80 w-80 rounded-full border border-white/10"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-10 h-80 w-80 rounded-full border border-white/10"
        />

        <div className="relative flex flex-col justify-between gap-7 xl:flex-row xl:items-center">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-cyan-100">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-cyan-300"
              />
              Portal Akademik SIRAKA
            </span>

            <h2 className="mt-5 break-words font-heading text-2xl font-extrabold leading-tight sm:text-3xl">
              Selamat datang,
              <span className="mt-1 block text-[#86E0E6]">
                {loading
                  ? "..."
                  : profile?.full_name || "Mahasiswa"}
                .
              </span>
            </h2>

            <p className="mt-4 max-w-md text-xs leading-7 text-slate-200 sm:text-sm">
              Semua kebutuhan ruang dan kegiatan kelasmu dalam
              satu tempat. Mulai dengan melihat jadwal atau
              sampaikan rencana kegiatanmu.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard/mahasiswa/schedule"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#86E0E6] px-4 py-2.5 text-xs font-bold text-[#123549] transition hover:bg-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Lihat Jadwal Ruangan
                <Icon name="arrow" className="h-4 w-4" />
              </Link>

              <Link
                href="/dashboard/mahasiswa/requests"
                className="inline-flex min-h-11 items-center rounded-xl border border-white/25 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Ajukan Kebutuhan
              </Link>
            </div>
          </div>

          <div className="w-fit rounded-2xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-sm xl:max-w-56">
            <Icon
              name="calendar"
              className="h-7 w-7 text-[#86E0E6]"
            />

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-300">
              Hari ini
            </p>

            <p className="mt-2 text-sm font-bold leading-7">
              {now === null ? "Memuat tanggal..." : dateLabel(now)}
            </p>

            <p className="mt-2 text-[10px] text-slate-300">
              Waktu Indonesia Barat
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-200/30">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted">
              Kelas Terdaftar
            </p>

            <span className="rounded-xl bg-sky-50 p-2 text-sky-700">
              <Icon name="rooms" />
            </span>
          </div>

          <h2 className="mt-5 break-words font-heading text-xl font-extrabold text-primary">
            {ready
              ? studentClass?.class_name || "Belum ada kelas"
              : "—"}
          </h2>

          <p className="mt-2 text-xs leading-6 text-muted">
            {ready
              ? [
                  studentClass?.class_code,
                  studentClass?.study_program,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Informasi kelas belum tersedia"
              : "Informasi akademik"}
          </p>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Nomor Induk Mahasiswa
            </p>

            <p className="mt-2 break-all text-sm font-bold text-primary">
              {ready ? profile?.student_number || "—" : "—"}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-200/30">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted">
              Jadwal Hari Ini
            </p>

            <span className="rounded-xl bg-teal-50 p-2 text-teal-700">
              <Icon name="calendar" />
            </span>
          </div>

          <div className="mt-5 flex items-baseline gap-2">
            <p className="font-heading text-5xl font-extrabold tracking-tight text-primary">
              {ready ? todayBookings.length : "—"}
            </p>

            <span className="text-xs text-muted">
              kegiatan
            </span>
          </div>

          <p className="mt-3 text-xs leading-6 text-muted">
            Kegiatan kelas yang sudah disetujui untuk hari ini.
          </p>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <span className="inline-flex rounded-full bg-teal-50 px-3 py-1.5 text-[10px] font-semibold text-teal-700">
              {ready
                ? `${upcomingBookings.length} jadwal mendatang`
                : "Memuat ringkasan"}
            </span>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 md:col-span-2 xl:col-span-1">
  <div className="flex items-center justify-between gap-3">
    <p className="text-xs font-semibold text-muted">
      {ongoing
        ? "Sedang Berlangsung"
        : "Kegiatan Berikutnya"}
    </p>

            <span className="rounded-xl bg-white/80 p-2 text-teal-700">
              <Icon name="calendar" />
            </span>
          </div>

          <h2 className="mt-5 break-words font-heading text-lg font-extrabold text-primary">
            {!ready
              ? "—"
              : nextBooking?.title || "Belum ada kegiatan"}
          </h2>

          <p className="mt-3 text-xs leading-6 text-[#42636C]">
            {ready && nextBooking
              ? dateLabel(nextBooking.starts_at)
              : "Kegiatan kelas berikutnya akan ditampilkan di sini."}
          </p>

          {ready && nextBooking && (
            <>
              <p className="mt-2 text-sm font-bold text-primary">
                {timeLabel(nextBooking.starts_at)}
                {" - "}
                {timeLabel(nextBooking.ends_at)} WIB
              </p>

              <p className="mt-4 border-t border-teal-900/10 pt-4 text-xs leading-6 text-[#42636C]">
                {nextRoom
                  ? `${nextRoom.room_code} · ${nextRoom.room_name}`
                  : "Informasi ruangan tidak tersedia"}
              </p>
            </>
          )}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-6 w-1 rounded-full bg-secondary"
          />

          <div>
            <h2 className="font-heading text-lg font-extrabold text-primary">
              Mau melakukan apa?
            </h2>

            <p className="mt-1 text-xs text-muted">
              Akses layanan yang kamu butuhkan.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex flex-col rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-200/20 transition duration-200 hover:border-secondary/50 hover:shadow-md hover:shadow-slate-200/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${action.color}`}
                >
                  <Icon name={action.icon} className="h-6 w-6" />
                </span>

                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition group-hover:bg-primary group-hover:text-white">
                  <Icon name="arrow" className="h-4 w-4" />
                </span>
              </div>

              <h3 className="mt-5 font-heading text-sm font-extrabold text-primary">
                {action.title}
              </h3>

              <p className="mt-2 flex-1 text-xs leading-7 text-muted">
                {action.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <ScheduleSection
        title="Aktivitas Kelas Hari Ini"
        description="Agenda kelas yang telah disetujui untuk hari ini."
        bookings={todayBookings}
        rooms={rooms}
        loading={loading}
        failed={failed}
      />

      <ScheduleSection
        title="Jadwal Kelas Mendatang"
        description="Persiapkan kegiatan kelas untuk hari berikutnya."
        bookings={upcomingBookings}
        rooms={rooms}
        loading={loading}
        failed={failed}
        showDate
      />

      <section className="flex flex-col justify-between gap-5 rounded-3xl border border-dashed border-slate-300 bg-white/50 p-6 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4">
          <span className="hidden rounded-2xl bg-white p-3 text-primary shadow-sm sm:inline-flex">
            <Icon name="request" className="h-6 w-6" />
          </span>

          <div>
            <h2 className="text-sm font-bold text-primary">
              Rencana kegiatan dimulai dari sini.
            </h2>

            <p className="mt-2 max-w-xl text-xs leading-6 text-muted">
              Butuh ruang untuk diskusi, praktikum, atau kegiatan
              kelas? Sampaikan kebutuhanmu kepada Komting.
              Pengajuan ini belum menjadi booking resmi.
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/mahasiswa/requests"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Buat Pengajuan
          <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}